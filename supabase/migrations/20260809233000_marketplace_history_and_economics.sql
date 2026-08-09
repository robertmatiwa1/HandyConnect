create or replace view public.admin_marketplace_economics as
with bounds as (
  select date_trunc('month', now()) as month_start
), cohort as (
  select j.id,j.status
  from public.jobs j,bounds b
  where j.created_at>=b.month_start
), offered as (
  select distinct jm.job_id from public.job_matches jm join cohort c on c.id=jm.job_id
), accepted as (
  select distinct ja.job_id from public.job_assignments ja join cohort c on c.id=ja.job_id
), pay as (
  select
    coalesce(sum(p.amount_cents) filter(where p.status='succeeded' and p.purpose='subscription'),0)::bigint subscription_revenue_cents,
    count(*) filter(where p.status='succeeded' and p.purpose='subscription')::bigint successful_subscription_payments
  from public.payments p,bounds b where p.created_at>=b.month_start
), pro as (
  select count(distinct e.handyman_id)::bigint active_pro_handymen
  from public.entitlements e
  where e.entitlement_type='pro_access' and e.status='active' and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now())
)
select
  (select count(*) from cohort)::bigint requested_jobs,
  (select count(*) from offered)::bigint jobs_offered,
  (select count(*) from accepted)::bigint jobs_accepted,
  (select count(*) from cohort where status='completed')::bigint jobs_completed,
  (select count(*) from cohort where status='cancelled')::bigint jobs_cancelled,
  round(100.0*(select count(*) from offered)/nullif((select count(*) from cohort),0),1) offer_rate_pct,
  round(100.0*(select count(*) from accepted)/nullif((select count(*) from offered),0),1) acceptance_rate_pct,
  round(100.0*(select count(*) from cohort where status='completed')/nullif((select count(*) from accepted),0),1) completion_rate_pct,
  pay.subscription_revenue_cents,
  pay.successful_subscription_payments,
  pro.active_pro_handymen
from pay cross join pro;

create or replace view public.admin_handyman_access as
with usage as (
  select jm.handyman_id,count(*)::integer used_opportunities
  from public.job_matches jm
  where jm.offered_at>=date_trunc('month',now())
  group by jm.handyman_id
), pro as (
  select distinct e.handyman_id
  from public.entitlements e
  where e.entitlement_type='pro_access' and e.status='active' and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now())
)
select h.id,h.full_name,h.phone,h.status,h.verification_status,h.average_rating,h.completed_jobs,
  coalesce(u.used_opportunities,0)::integer used_opportunities,
  (p.handyman_id is not null) has_pro_access,
  case when p.handyman_id is not null then null else greatest(0,3-coalesce(u.used_opportunities,0)) end remaining_free_opportunities,
  case when p.handyman_id is not null then 'Pro' else 'Free' end plan_name
from public.handymen h
left join usage u on u.handyman_id=h.id
left join pro p on p.handyman_id=h.id
order by h.created_at desc;

create or replace view public.admin_job_history as
select j.id,j.description,s.name service,j.suburb,j.city,j.province,j.status,j.created_at,j.updated_at,
  c.full_name customer_name,c.phone customer_phone,
  h.full_name handyman_name,h.phone handyman_phone,
  ja.assigned_at,ja.started_at,ja.completed_at,ja.cancelled_at,
  r.rating,r.comment review_comment
from public.jobs j
join public.customers c on c.id=j.customer_id
left join public.skills s on s.id=j.skill_id
left join public.job_assignments ja on ja.job_id=j.id
left join public.handymen h on h.id=ja.handyman_id
left join public.reviews r on r.job_id=j.id
where j.status in ('completed','cancelled','expired')
order by coalesce(ja.completed_at,ja.cancelled_at,j.updated_at) desc;

revoke all on public.admin_marketplace_economics from public,anon,authenticated;
revoke all on public.admin_handyman_access from public,anon,authenticated;
revoke all on public.admin_job_history from public,anon,authenticated;
grant select on public.admin_marketplace_economics to service_role;
grant select on public.admin_handyman_access to service_role;
grant select on public.admin_job_history to service_role;
