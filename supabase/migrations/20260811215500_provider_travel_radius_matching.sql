-- Match providers by base location and travel radius instead of exact suburb/city equality.
-- Existing providers default to 20 km. Text-location fallback is retained only when
-- a locality has not yet been geocoded, so existing jobs do not silently disappear.

create table if not exists private.locality_centroids (
  country_code char(2) not null default 'ZA',
  province_key text not null,
  city_key text not null,
  suburb_key text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  primary key (country_code, province_key, city_key, suburb_key)
);

revoke all on private.locality_centroids from public, anon, authenticated;

insert into private.locality_centroids(country_code, province_key, city_key, suburb_key, latitude, longitude)
values
  ('ZA','western cape','cape town','bellville',-33.9046,18.6295),
  ('ZA','western cape','cape town','pinelands',-33.9422,18.5076),
  ('ZA','western cape','cape town','langa',-33.9455,18.5305),
  ('ZA','western cape','cape town','nyanga',-33.9960,18.5844),
  ('ZA','western cape','cape town','philippi',-34.0086,18.6030),
  ('ZA','western cape','cape town','phillipi',-34.0086,18.6030)
on conflict (country_code, province_key, city_key, suburb_key) do update
set latitude = excluded.latitude, longitude = excluded.longitude;

alter table public.service_areas
  add column if not exists base_latitude double precision,
  add column if not exists base_longitude double precision,
  add column if not exists travel_radius_km integer not null default 20;

alter table public.jobs
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- Matching already honors temporary reliability restrictions. Ensure the field
-- exists before the candidate function is compiled during a clean rebuild.
alter table public.handymen
  add column if not exists reliability_restricted_until timestamptz;

create index if not exists idx_handymen_reliability_restricted_until
  on public.handymen(reliability_restricted_until)
  where reliability_restricted_until is not null;

alter table public.service_areas drop constraint if exists service_areas_base_latitude_check;
alter table public.service_areas add constraint service_areas_base_latitude_check
  check (base_latitude is null or base_latitude between -90 and 90);
alter table public.service_areas drop constraint if exists service_areas_base_longitude_check;
alter table public.service_areas add constraint service_areas_base_longitude_check
  check (base_longitude is null or base_longitude between -180 and 180);
alter table public.service_areas drop constraint if exists service_areas_travel_radius_km_check;
alter table public.service_areas add constraint service_areas_travel_radius_km_check
  check (travel_radius_km in (10,20,30,50));
alter table public.jobs drop constraint if exists jobs_latitude_check;
alter table public.jobs add constraint jobs_latitude_check
  check (latitude is null or latitude between -90 and 90);
alter table public.jobs drop constraint if exists jobs_longitude_check;
alter table public.jobs add constraint jobs_longitude_check
  check (longitude is null or longitude between -180 and 180);

create or replace function private.distance_km(
  p_lat1 double precision, p_lon1 double precision,
  p_lat2 double precision, p_lon2 double precision
) returns double precision
language sql immutable strict parallel safe
set search_path = pg_catalog
as $$
  select 6371.0088 * 2 * asin(sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
    cos(radians(p_lat1)) * cos(radians(p_lat2)) *
    power(sin(radians(p_lon2 - p_lon1) / 2), 2)
  ));
$$;

create or replace function private.resolve_service_area_coordinates()
returns trigger language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.base_latitude is null or new.base_longitude is null then
    select c.latitude, c.longitude into new.base_latitude, new.base_longitude
    from private.locality_centroids c
    where c.country_code = new.country_code
      and c.province_key = lower(trim(coalesce(new.province,'')))
      and c.city_key = lower(trim(coalesce(new.city,'')))
      and c.suburb_key = lower(trim(coalesce(new.suburb,'')));
  end if;
  return new;
end;
$$;

create or replace function private.resolve_job_coordinates()
returns trigger language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.latitude is null or new.longitude is null then
    select c.latitude, c.longitude into new.latitude, new.longitude
    from private.locality_centroids c
    where c.country_code = 'ZA'
      and c.province_key = lower(trim(coalesce(new.province,'')))
      and c.city_key = lower(trim(coalesce(new.city,'')))
      and c.suburb_key = lower(trim(coalesce(new.suburb,'')));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resolve_service_area_coordinates on public.service_areas;
create trigger trg_resolve_service_area_coordinates
before insert or update of suburb, city, province, country_code on public.service_areas
for each row execute function private.resolve_service_area_coordinates();

drop trigger if exists trg_resolve_job_coordinates on public.jobs;
create trigger trg_resolve_job_coordinates
before insert or update of suburb, city, province on public.jobs
for each row execute function private.resolve_job_coordinates();

update public.service_areas sa
set base_latitude = c.latitude, base_longitude = c.longitude
from private.locality_centroids c
where c.country_code = sa.country_code
  and c.province_key = lower(trim(coalesce(sa.province,'')))
  and c.city_key = lower(trim(coalesce(sa.city,'')))
  and c.suburb_key = lower(trim(coalesce(sa.suburb,'')))
  and (sa.base_latitude is null or sa.base_longitude is null);

update public.jobs j
set latitude = c.latitude, longitude = c.longitude
from private.locality_centroids c
where c.country_code = 'ZA'
  and c.province_key = lower(trim(coalesce(j.province,'')))
  and c.city_key = lower(trim(coalesce(j.city,'')))
  and c.suburb_key = lower(trim(coalesce(j.suburb,'')))
  and (j.latitude is null or j.longitude is null);

create index if not exists idx_service_areas_base_coordinates
  on public.service_areas(base_latitude, base_longitude)
  where base_latitude is not null and base_longitude is not null;
create index if not exists idx_jobs_coordinates
  on public.jobs(latitude, longitude)
  where latitude is not null and longitude is not null;

create or replace function public.find_job_candidates(p_job_id uuid, p_limit integer default 5)
returns table(handyman_id uuid, score numeric, remaining_free_opportunities integer, has_pro_access boolean)
language sql security definer set search_path=pg_catalog,public,private
as $$
with target_job as (
  select id, skill_id, city, suburb, province, latitude, longitude
  from public.jobs
  where id=p_job_id and status in('open','matching')
), eligible_areas as (
  select h.id handyman_id,
    min(case when j.latitude is not null and j.longitude is not null
      and sa.base_latitude is not null and sa.base_longitude is not null
      then private.distance_km(sa.base_latitude,sa.base_longitude,j.latitude,j.longitude)
      else null end) distance_km
  from target_job j
  join public.handyman_skills hs on hs.skill_id=j.skill_id
  join public.handymen h on h.id=hs.handyman_id
    and h.status='active' and h.verification_status='verified'
    and h.availability_status='available'
    and (h.available_until is null or h.available_until>now())
    and (h.reliability_restricted_until is null or h.reliability_restricted_until<=now())
  join public.service_areas sa on sa.handyman_id=h.id
  where (
    j.latitude is not null and j.longitude is not null
    and sa.base_latitude is not null and sa.base_longitude is not null
    and private.distance_km(sa.base_latitude,sa.base_longitude,j.latitude,j.longitude) <= sa.travel_radius_km
  ) or (
    (j.latitude is null or j.longitude is null or sa.base_latitude is null or sa.base_longitude is null)
    and lower(trim(coalesce(sa.city,'')))=lower(trim(coalesce(j.city,'')))
    and lower(trim(coalesce(sa.province,'')))=lower(trim(coalesce(j.province,'')))
  )
  group by h.id
), base as (
  select h.id handyman_id,
    (150 - least(100,coalesce(ea.distance_km,20)*3)
      + least(20,coalesce(h.average_rating,0)*3)
      + least(10,coalesce(h.completed_jobs,0)) + 15
      + case when coalesce(h.reliability_score,100)>=90 then 10
             when coalesce(h.reliability_score,100)>=80 then 5
             when coalesce(h.reliability_score,100)>=50 then 0 else -50 end)::numeric score
  from eligible_areas ea join public.handymen h on h.id=ea.handyman_id
), usage as (
  select jm.handyman_id,count(*)::integer used
  from public.job_matches jm where jm.offered_at>=date_trunc('month',now())
  group by jm.handyman_id
), access as (
  select b.handyman_id,b.score,
    exists(select 1 from public.entitlements e where e.handyman_id=b.handyman_id
      and e.entitlement_type='pro_access' and e.status='active' and e.valid_from<=now()
      and(e.valid_until is null or e.valid_until>now())) has_pro_access,
    greatest(0,3-coalesce(u.used,0)) remaining_free_opportunities
  from base b left join usage u on u.handyman_id=b.handyman_id
)
select a.handyman_id,a.score,a.remaining_free_opportunities,a.has_pro_access
from access a where a.has_pro_access or a.remaining_free_opportunities>0
order by a.has_pro_access desc,a.score desc,a.handyman_id
limit greatest(1,least(coalesce(p_limit,5),20));
$$;

revoke all on function public.find_job_candidates(uuid,integer) from public,anon,authenticated;
grant execute on function public.find_job_candidates(uuid,integer) to service_role;

create or replace function public.set_handyman_travel_radius(p_phone text, p_radius_km integer)
returns integer language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_handyman_id uuid; v_updated integer;
begin
  if p_radius_km not in (10,20,30,50) then raise exception 'invalid_travel_radius'; end if;
  select id into v_handyman_id from public.handymen where phone=p_phone and status='active';
  if v_handyman_id is null then raise exception 'handyman_not_found'; end if;
  update public.service_areas set travel_radius_km=p_radius_km where handyman_id=v_handyman_id;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
revoke all on function public.set_handyman_travel_radius(text,integer) from public,anon,authenticated;
grant execute on function public.set_handyman_travel_radius(text,integer) to service_role;
