do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'handyconnect-provider-cooldown-restore'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end
$$;

select cron.schedule(
  'handyconnect-provider-cooldown-restore',
  '* * * * *',
  $command$select public.restore_provider_cooldowns();$command$
);
