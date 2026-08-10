create table if not exists public.notification_retry_audit(
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notification_outbox(id) on delete cascade,
  previous_status text not null,
  previous_attempts integer not null,
  reason text,
  retried_by text not null default 'ops_dashboard',
  created_at timestamptz not null default now()
);

create or replace function public.retry_dead_letter_notification(p_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.notification_outbox%rowtype;
begin
  select * into v from public.notification_outbox where id=p_id for update;
  if v.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if v.status<>'dead_letter' then return jsonb_build_object('ok',false,'reason','not_dead_letter','status',v.status); end if;
  insert into public.notification_retry_audit(notification_id,previous_status,previous_attempts,reason)
  values(v.id,v.status,v.attempts,left(coalesce(p_reason,''),500));
  update public.notification_outbox set status='pending',attempts=0,next_attempt_at=now(),last_error=null,processing_started_at=null,dead_lettered_at=null,sent_at=null where id=p_id;
  return jsonb_build_object('ok',true,'notification_id',p_id);
end $$;
revoke all on function public.retry_dead_letter_notification(uuid,text) from public,anon,authenticated;
grant execute on function public.retry_dead_letter_notification(uuid,text) to service_role;