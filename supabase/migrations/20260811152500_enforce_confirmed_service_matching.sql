alter table public.jobs
  add column if not exists confirmed_skill_id bigint references public.skills(id),
  add column if not exists service_confirmed_at timestamptz;

alter table public.jobs
  drop constraint if exists jobs_confirmed_skill_matches;

alter table public.jobs
  add constraint jobs_confirmed_skill_matches
  check (confirmed_skill_id is null or confirmed_skill_id = skill_id);

-- Preserve clearly categorized jobs created before the explicit confirmation
-- fields existed. General Handyman is intentionally not backfilled because it
-- was formerly used as an unverified fallback.
update public.jobs j
set confirmed_skill_id = j.skill_id,
    service_confirmed_at = coalesce(j.updated_at, j.created_at)
from public.skills s
where s.id = j.skill_id
  and s.name <> 'General Handyman'
  and j.service_confirmed_at is null;

-- The matching worker is a second publication boundary. It must never offer
-- or remind on a job whose service was not explicitly confirmed.
do $migration$
declare
  definition text;
  old_predicate constant text := $needle$where j.status in('open','matching')
      and coalesce(j.next_match_at,j.created_at)<=now()$needle$;
  new_predicate constant text := $needle$where j.status in('open','matching')
      and j.service_confirmed_at is not null
      and j.confirmed_skill_id = j.skill_id
      and coalesce(j.next_match_at,j.created_at)<=now()$needle$;
begin
  select pg_get_functiondef('public.dispatch_marketplace_tick(integer)'::regprocedure)
  into definition;
  if position(old_predicate in definition) = 0 then
    raise exception 'dispatch_marketplace_tick eligibility predicate not found';
  end if;
  execute replace(definition, old_predicate, new_predicate);
end;
$migration$;

revoke all on function public.dispatch_marketplace_tick(integer)
  from public, anon, authenticated;
grant execute on function public.dispatch_marketplace_tick(integer)
  to service_role;
