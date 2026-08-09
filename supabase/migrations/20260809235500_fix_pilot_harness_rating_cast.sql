do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='run_marketplace_pilot_harness';
  if v_def is null then raise exception 'pilot harness function not found'; end if;
  v_def := replace(v_def, 'public.rate_completed_job(v_job_id,v_phone_customer,5,''Pilot harness rating'')', 'public.rate_completed_job(v_job_id,v_phone_customer,5::smallint,''Pilot harness rating'')');
  execute v_def;
end $$;
