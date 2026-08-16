do $$
declare
  view_name text;
  views text[] := array[
    'assignment_schedule_ops',
    'handyman_reliability_ops',
    'notification_delivery_ops',
    'job_evidence_ops',
    'customer_job_status',
    'dispute_case_ops',
    'handyman_public_profiles',
    'handyman_job_status'
  ];
begin
  foreach view_name in array views loop
    if to_regclass(format('public.%I', view_name)) is not null then
      execute format('alter view public.%I set (security_invoker = true)', view_name);
      execute format('revoke all on public.%I from public, anon, authenticated', view_name);
      execute format('grant select on public.%I to service_role', view_name);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regprocedure('public.block_job_evidence_mutation()') is not null then
    alter function public.block_job_evidence_mutation()
      set search_path = pg_catalog, public;
    revoke all on function public.block_job_evidence_mutation()
      from public, anon, authenticated;
    grant execute on function public.block_job_evidence_mutation()
      to service_role;
  end if;
end $$;

notify pgrst, 'reload schema';
