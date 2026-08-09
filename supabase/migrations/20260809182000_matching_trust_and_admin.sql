alter table public.service_areas add column if not exists coverage_type text not null default 'city' check(coverage_type in ('suburb','city','province'));
alter table public.handymen add column if not exists verification_notes text;
alter table public.handymen add column if not exists verified_at timestamptz;

create table if not exists public.user_reports(
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  reporter_phone text not null,
  reported_handyman_id uuid references public.handymen(id) on delete set null,
  reported_customer_id uuid references public.customers(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_user_reports_status_created on public.user_reports(status,created_at desc);
alter table public.user_reports enable row level security;

create or replace function public.find_job_candidates(p_job_id uuid,p_limit integer default 5)
returns table(handyman_id uuid,score numeric,remaining_free_opportunities integer,has_pro_access boolean)
language sql
security definer
set search_path=pg_catalog,public
as $$
with target_job as(
  select id,skill_id,city,suburb,province from public.jobs where id=p_job_id and status in ('open','matching')
), base as(
  select distinct h.id handyman_id,
    (
      case
        when sa.coverage_type='suburb' and lower(coalesce(sa.suburb,''))=lower(coalesce(j.suburb,'')) then 120
        when sa.coverage_type in ('suburb','city') and lower(coalesce(sa.city,''))=lower(coalesce(j.city,'')) then 90
        when sa.coverage_type='province' and lower(coalesce(sa.province,''))=lower(coalesce(j.province,'')) then 60
        else 0
      end
      + least(20,coalesce(h.average_rating,0)*3)
      + least(10,coalesce(h.completed_jobs,0))
      + case when h.verification_status='verified' then 15 else 0 end
    )::numeric score
  from target_job j
  join public.handyman_skills hs on hs.skill_id=j.skill_id
  join public.handymen h on h.id=hs.handyman_id
    and h.status='active'
    and h.availability_status='available'
    and (h.available_until is null or h.available_until>now())
  join public.service_areas sa on sa.handyman_id=h.id
  where
    (sa.coverage_type='suburb' and lower(coalesce(sa.suburb,''))=lower(coalesce(j.suburb,'')))
    or (sa.coverage_type in ('suburb','city') and lower(coalesce(sa.city,''))=lower(coalesce(j.city,'')))
    or (sa.coverage_type='province' and lower(coalesce(sa.province,''))=lower(coalesce(j.province,'')))
), usage as(
  select jm.handyman_id,count(*)::integer used
  from public.job_matches jm
  where jm.offered_at>=date_trunc('month',now())
  group by jm.handyman_id
), access as(
  select b.handyman_id,b.score,
    exists(select 1 from public.entitlements e where e.handyman_id=b.handyman_id and e.entitlement_type='pro_access' and e.status='active' and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now())) has_pro_access,
    greatest(0,3-coalesce(u.used,0)) remaining_free_opportunities
  from base b left join usage u on u.handyman_id=b.handyman_id
)
select a.handyman_id,a.score,a.remaining_free_opportunities,a.has_pro_access
from access a
where a.has_pro_access or a.remaining_free_opportunities>0
order by a.has_pro_access desc,a.score desc,a.handyman_id
limit greatest(1,least(coalesce(p_limit,5),20));
$$;
revoke all on function public.find_job_candidates(uuid,integer) from public,anon,authenticated;
grant execute on function public.find_job_candidates(uuid,integer) to service_role;

create or replace view public.admin_marketplace_health as
select
  (select count(*) from public.customers) customer_count,
  (select count(*) from public.handymen where status='active') active_handymen,
  (select count(*) from public.handymen where status='active' and availability_status='available' and (available_until is null or available_until>now())) available_handymen,
  (select count(*) from public.jobs where status in ('open','matching')) waiting_jobs,
  (select count(*) from public.jobs where status='assigned') assigned_jobs,
  (select count(*) from public.jobs where status='in_progress') in_progress_jobs,
  (select count(*) from public.jobs where status='completed') completed_jobs,
  (select count(*) from public.notification_outbox where status='pending') pending_notifications,
  (select count(*) from public.notification_outbox where status='failed') failed_notifications,
  (select count(*) from public.user_reports where status in ('open','reviewing')) open_reports;

create or replace view public.admin_waiting_jobs as
select j.id,j.description,s.name service,j.suburb,j.city,j.province,j.created_at,j.last_match_attempt_at,j.next_match_at,j.match_attempt_count,j.escalation_level,
  extract(epoch from(now()-j.created_at))/60.0 as waiting_minutes,
  (select count(*) from public.job_matches jm where jm.job_id=j.id and jm.status='offered') open_offers
from public.jobs j join public.skills s on s.id=j.skill_id
where j.status in ('open','matching')
order by j.created_at;

revoke all on public.admin_marketplace_health from public,anon,authenticated;
revoke all on public.admin_waiting_jobs from public,anon,authenticated;
grant select on public.admin_marketplace_health to service_role;
grant select on public.admin_waiting_jobs to service_role;
