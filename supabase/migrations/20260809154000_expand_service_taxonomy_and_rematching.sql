insert into public.skills (code,name) values
('appliance_repair','Appliance Repair'),
('locksmith','Locksmith'),
('tiling','Tiling'),
('roofing','Roofing'),
('waterproofing','Waterproofing'),
('paving','Paving'),
('gardening_landscaping','Gardening & Landscaping'),
('pool_maintenance','Pool Maintenance'),
('aircon_hvac','Air Conditioning & HVAC'),
('welding_metalwork','Welding & Metalwork'),
('glazing_windows','Windows & Glass'),
('ceilings_drywall','Ceilings & Drywall'),
('flooring','Flooring'),
('gutters','Gutters'),
('solar_inverter','Solar & Inverter'),
('cctv_security','CCTV & Security'),
('gates_garage_doors','Gates & Garage Doors'),
('pest_control','Pest Control'),
('furniture_assembly','Furniture Assembly'),
('moving_small_jobs','Small Moves & Heavy Lifting')
on conflict (code) do update set name=excluded.name, active=true;

alter table public.jobs add column if not exists match_attempt_count integer not null default 0;
alter table public.jobs add column if not exists last_match_attempt_at timestamptz;
alter table public.jobs add column if not exists customer_notified_at timestamptz;

create index if not exists idx_jobs_matching_waiting on public.jobs(status, city, skill_id, created_at)
where status in ('open','matching');

create or replace function public.offer_waiting_jobs_to_handyman(p_phone text, p_limit integer default 5)
returns table(match_id uuid, job_id uuid, description text, suburb text, city text, skill_name text)
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_handyman_id uuid;
  v_has_pro boolean;
  v_used integer;
  v_remaining integer;
begin
  select h.id into v_handyman_id
  from public.handymen h
  where h.phone=p_phone and h.status='active'
    and h.availability_status='available'
    and (h.available_until is null or h.available_until>now());

  if v_handyman_id is null then return; end if;

  select exists(
    select 1 from public.entitlements e
    where e.handyman_id=v_handyman_id
      and e.entitlement_type='pro_access'
      and e.status='active'
      and e.valid_from<=now()
      and (e.valid_until is null or e.valid_until>now())
  ) into v_has_pro;

  select count(*)::integer into v_used
  from public.job_matches jm
  where jm.handyman_id=v_handyman_id
    and jm.offered_at>=date_trunc('month',now());

  v_remaining:=greatest(0,3-coalesce(v_used,0));
  if not v_has_pro and v_remaining<=0 then return; end if;

  return query
  with eligible as (
    select distinct j.id as job_id,j.description,j.suburb,j.city,s.name as skill_name,
      case when lower(coalesce(sa.suburb,''))=lower(coalesce(j.suburb,'')) and j.suburb is not null then 100 else 70 end as score
    from public.jobs j
    join public.skills s on s.id=j.skill_id
    join public.handyman_skills hs on hs.handyman_id=v_handyman_id and hs.skill_id=j.skill_id
    join public.service_areas sa on sa.handyman_id=v_handyman_id and lower(sa.city)=lower(j.city)
    where j.status in ('open','matching')
      and not exists(select 1 from public.job_matches x where x.job_id=j.id and x.handyman_id=v_handyman_id)
    order by score desc,j.created_at asc
    limit greatest(1,least(case when v_has_pro then coalesce(p_limit,5) else least(coalesce(p_limit,5),v_remaining) end,10))
  ), inserted as (
    insert into public.job_matches(job_id,handyman_id,match_score,status)
    select e.job_id,v_handyman_id,e.score,'offered' from eligible e
    on conflict(job_id,handyman_id) do nothing
    returning id,job_id
  )
  select i.id,e.job_id,e.description,e.suburb,e.city,e.skill_name
  from inserted i join eligible e on e.job_id=i.job_id;
end;
$$;
revoke all on function public.offer_waiting_jobs_to_handyman(text,integer) from public,anon,authenticated;
grant execute on function public.offer_waiting_jobs_to_handyman(text,integer) to service_role;
