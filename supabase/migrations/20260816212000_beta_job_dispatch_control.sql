create or replace view public.beta_job_dispatch_control as
select
  j.id as job_id,
  j.description,
  j.status,
  j.created_at,
  j.updated_at,
  j.suburb,j.city,j.province,
  j.service_confirmed_at,
  j.confirmed_skill_id,
  j.skill_id,
  j.latitude,j.longitude,
  j.match_attempt_count,
  j.last_match_attempt_at,
  j.next_match_at,
  j.escalation_level,
  c.full_name as customer_name,
  c.phone as customer_phone,
  s.name as skill_name,
  (select count(*) from public.job_matches m where m.job_id=j.id) as match_count,
  (select count(*) from public.job_matches m where m.job_id=j.id and m.status='offered') as open_offers,
  (select count(*) from public.job_matches m where m.job_id=j.id and m.status='accepted') as accepted_offers,
  (select max(m.offered_at) from public.job_matches m where m.job_id=j.id) as last_offer_at,
  (select count(*) from public.job_assignments a where a.job_id=j.id and a.cancelled_at is null) as active_assignments,
  (select max(a.assigned_at) from public.job_assignments a where a.job_id=j.id and a.cancelled_at is null) as assigned_at,
  (select max(a.started_at) from public.job_assignments a where a.job_id=j.id and a.cancelled_at is null) as started_at,
  (select max(a.completed_at) from public.job_assignments a where a.job_id=j.id and a.cancelled_at is null) as completed_at,
  (select count(*) from public.notification_outbox n where n.payload->>'job_id'=j.id::text) as notification_count,
  (select count(*) from public.notification_outbox n where n.payload->>'job_id'=j.id::text and n.status='sent') as notifications_sent,
  (select count(*) from public.notification_outbox n where n.payload->>'job_id'=j.id::text and n.status in ('failed','dead_letter')) as notifications_failed,
  case
    when j.service_confirmed_at is null or j.confirmed_skill_id is null then 'service_not_confirmed'
    when j.latitude is null or j.longitude is null then 'location_not_geocoded'
    when j.status in ('completed','cancelled') then j.status
    when exists(select 1 from public.job_assignments a where a.job_id=j.id and a.cancelled_at is null and a.completed_at is not null) then 'completed'
    when exists(select 1 from public.job_assignments a where a.job_id=j.id and a.cancelled_at is null and a.started_at is not null) then 'in_progress'
    when exists(select 1 from public.job_assignments a where a.job_id=j.id and a.cancelled_at is null) then 'assigned'
    when exists(select 1 from public.job_matches m where m.job_id=j.id and m.status='offered') then 'awaiting_provider_response'
    when j.status in ('open','matching') and coalesce(j.match_attempt_count,0)>0 then 'matching_no_acceptance'
    when j.status in ('open','matching') then 'ready_for_matching'
    else 'intake_or_other'
  end as dispatch_state
from public.jobs j
left join public.customers c on c.id=j.customer_id
left join public.skills s on s.id=j.confirmed_skill_id;
revoke all on public.beta_job_dispatch_control from anon,authenticated;

create or replace view public.beta_job_dispatch_candidates as
select j.id as job_id,
       count(distinct r.handyman_id) filter (
         where r.dispatchable
           and hs.skill_id = coalesce(j.confirmed_skill_id,j.skill_id)
       ) as skill_ready_candidates
from public.jobs j
left join public.handyman_skills hs on hs.skill_id=coalesce(j.confirmed_skill_id,j.skill_id)
left join public.beta_handyman_supply_readiness r on r.handyman_id=hs.handyman_id
group by j.id;
revoke all on public.beta_job_dispatch_candidates from anon,authenticated;

create or replace view public.beta_job_dispatch_control_enriched as
select d.*, coalesce(c.skill_ready_candidates,0) as skill_ready_candidates,
case
 when d.dispatch_state in ('ready_for_matching','matching_no_acceptance','awaiting_provider_response') and coalesce(c.skill_ready_candidates,0)=0 then 'no_dispatchable_provider'
 when d.notifications_failed>0 then 'notification_failure'
 when d.dispatch_state='matching_no_acceptance' then 'no_acceptance'
 else null
end as alert
from public.beta_job_dispatch_control d
left join public.beta_job_dispatch_candidates c on c.job_id=d.job_id;
revoke all on public.beta_job_dispatch_control_enriched from anon,authenticated;
