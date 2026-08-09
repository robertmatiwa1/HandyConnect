create table if not exists public.handyman_verification_documents(
  id uuid primary key default gen_random_uuid(),
  handyman_id uuid not null references public.handymen(id) on delete cascade,
  document_type text not null check(document_type in ('identity','proof_of_address','qualification','other')),
  media_id text not null,
  file_name text,
  mime_type text,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  review_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(handyman_id,document_type,media_id)
);
create index if not exists idx_handyman_verification_documents_review on public.handyman_verification_documents(status,submitted_at);
alter table public.handyman_verification_documents enable row level security;

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
    (case
      when sa.coverage_type='suburb' and lower(coalesce(sa.suburb,''))=lower(coalesce(j.suburb,'')) then 120
      when sa.coverage_type in ('suburb','city') and lower(coalesce(sa.city,''))=lower(coalesce(j.city,'')) then 90
      when sa.coverage_type='province' and lower(coalesce(sa.province,''))=lower(coalesce(j.province,'')) then 60
      else 0 end
      + least(20,coalesce(h.average_rating,0)*3)
      + least(10,coalesce(h.completed_jobs,0))
      + 15)::numeric score
  from target_job j
  join public.handyman_skills hs on hs.skill_id=j.skill_id
  join public.handymen h on h.id=hs.handyman_id
    and h.status='active'
    and h.verification_status='verified'
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
