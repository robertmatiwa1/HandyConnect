create or replace function public.verify_marketplace_dispatch_token(p_token text)
returns boolean
language sql
security definer
set search_path=pg_catalog,public,private
as $$
  select exists(
    select 1 from private.runtime_secrets
    where name='marketplace_dispatch_token'
      and value is not null
      and length(p_token)>0
      and value=p_token
  );
$$;
revoke all on function public.verify_marketplace_dispatch_token(text) from public,anon,authenticated;
grant execute on function public.verify_marketplace_dispatch_token(text) to service_role;

create or replace function public.invoke_notification_dispatcher()
returns bigint
language plpgsql
security definer
set search_path=pg_catalog,public,private,net
as $$
declare v_token text; v_request_id bigint;
begin
  select value into v_token from private.runtime_secrets where name='marketplace_dispatch_token';
  if v_token is null then raise exception 'marketplace dispatcher token is missing'; end if;
  select net.http_post(
    url := 'https://tjhuwtclvlxouwvktzem.supabase.co/functions/v1/notification-dispatcher',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object('content-type','application/json','x-dispatch-token',v_token),
    timeout_milliseconds := 15000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.invoke_notification_dispatcher() from public,anon,authenticated;

-- Old rows used a retired 'failed' state and cannot be safely replayed now without
-- risking duplicate/stale customer messages. Preserve them for Ops investigation.
update public.notification_outbox
set status='dead_letter',dead_lettered_at=coalesce(dead_lettered_at,now()),
    last_error=coalesce(last_error,'Legacy failed notification parked during dispatcher activation')
where status='failed';

select cron.unschedule(jobid) from cron.job where jobname='handyconnect-notification-dispatcher';
select cron.schedule('handyconnect-notification-dispatcher','* * * * *','select public.invoke_notification_dispatcher();');
