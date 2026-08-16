-- HandyConnect local CI database hardening smoke tests.
-- Runs only against the ephemeral Supabase database created in GitHub Actions.

\set ON_ERROR_STOP on

-- Core marketplace tables must exist after all migrations apply.
do $$
begin
  if to_regclass('public.jobs') is null then
    raise exception 'Missing public.jobs';
  end if;
  if to_regclass('public.job_assignments') is null then
    raise exception 'Missing public.job_assignments';
  end if;
  if to_regclass('public.notification_outbox') is null then
    raise exception 'Missing public.notification_outbox';
  end if;
end $$;

-- Exactly one assignment per job is a hard marketplace invariant.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.job_assignments'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (job_id)'
  ) then
    raise exception 'Missing UNIQUE(job_id) on job_assignments';
  end if;
end $$;

-- Notification dedupe must be enforced by the database.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notification_outbox'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (dedupe_key)'
  ) then
    raise exception 'Missing UNIQUE(dedupe_key) on notification_outbox';
  end if;
end $$;

-- Matchable jobs must cross the confirmed-service trust boundary.
do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    where t.tgrelid = 'public.jobs'::regclass
      and t.tgname = 'trg_enforce_confirmed_service_before_matching'
      and not t.tgisinternal
      and n.nspname = 'public'
      and p.proname = 'enforce_confirmed_service_before_matching'
  ) then
    raise exception 'Missing confirmed-service enforcement trigger';
  end if;
end $$;

-- Transaction functions used by WhatsApp buttons must exist.
do $$
declare fn text;
begin
  foreach fn in array array[
    'accept_job_transaction',
    'mark_handyman_arrived',
    'confirm_job_start',
    'propose_job_quote',
    'respond_job_quote',
    'complete_job_assignment',
    'confirm_job_completion'
  ] loop
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
    ) then
      raise exception 'Missing transaction function: %', fn;
    end if;
  end loop;
end $$;

-- No migration should leave an invalid matchable job behind.
do $$
begin
  if exists (
    select 1
    from public.jobs
    where status in ('open','matching')
      and (
        confirmed_skill_id is null
        or confirmed_skill_id is distinct from skill_id
        or service_confirmed_at is null
      )
  ) then
    raise exception 'Invalid matchable jobs exist after migration reset';
  end if;
end $$;

select 'local database hardening smoke tests passed' as result;
