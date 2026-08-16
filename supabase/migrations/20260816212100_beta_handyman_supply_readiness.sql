create or replace view public.beta_handyman_supply_readiness
with (security_invoker = true)
as
select
  h.id as handyman_id,
  h.full_name,
  h.phone,
  h.status,
  h.registration_status,
  h.profile_completed_at,
  h.verification_status,
  h.availability_status,
  h.available_until,
  h.active_job_id,
  h.reliability_score,
  h.reliability_flag,
  coalesce(sk.skill_count,0) as skill_count,
  coalesce(ar.area_count,0) as area_count,
  coalesce(ar.has_coordinates,false) as has_coordinates,
  coalesce(ar.max_radius_km,0) as travel_radius_km,
  case
    when h.status <> 'active' then 'suspended_or_inactive'
    when h.registration_status <> 'active' then 'registration_incomplete'
    when h.profile_completed_at is null then 'profile_incomplete'
    when h.verification_status <> 'verified' then 'verification_required'
    when coalesce(sk.skill_count,0)=0 then 'skills_missing'
    when coalesce(ar.area_count,0)=0 then 'service_area_missing'
    when not coalesce(ar.has_coordinates,false) then 'location_coordinates_missing'
    when h.reliability_restricted_until is not null and h.reliability_restricted_until > now() then 'reliability_restricted'
    when h.active_job_id is not null then 'busy'
    when h.availability_status <> 'available' or h.available_until is null or h.available_until <= now() then 'offline'
    else 'ready'
  end as readiness_status,
  (h.status='active'
   and h.registration_status='active'
   and h.profile_completed_at is not null
   and h.verification_status='verified'
   and coalesce(sk.skill_count,0)>0
   and coalesce(ar.area_count,0)>0
   and coalesce(ar.has_coordinates,false)
   and (h.reliability_restricted_until is null or h.reliability_restricted_until <= now())
   and h.active_job_id is null
   and h.availability_status='available'
   and h.available_until > now()) as dispatchable
from public.handymen h
left join lateral (
  select count(*)::int skill_count
  from public.handyman_skills hs
  where hs.handyman_id=h.id
) sk on true
left join lateral (
  select count(*)::int area_count,
         bool_or(sa.base_latitude is not null and sa.base_longitude is not null) has_coordinates,
         max(sa.travel_radius_km) max_radius_km
  from public.service_areas sa
  where sa.handyman_id=h.id
) ar on true;

revoke all on public.beta_handyman_supply_readiness from anon, authenticated;
