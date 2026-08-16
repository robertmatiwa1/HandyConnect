alter table public.beta_stalled_journeys
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

create or replace function public.beta_manual_recovery_nudge(p_session_id uuid)
returns table(queued boolean, outbox_id uuid)
language plpgsql
set search_path=pg_catalog,public
as $$
declare
  j public.beta_stalled_journeys%rowtype;
  msg text;
  oid uuid;
begin
  select * into j from public.beta_stalled_journeys where session_id=p_session_id and resolved_at is null;
  if not found then return query select false,null::uuid; return; end if;
  msg := case
    when j.flow='customer_onboarding' and j.state='customer_name' then 'Hi 👋 You were almost done setting up HandyConnect. Reply with your name to continue.'
    when j.flow='handyman_onboarding' and j.state='capture_location' then 'Hi 👋 You were almost done joining HandyConnect as a handyman. Reply with your suburb or area to continue.'
    when j.flow='job_intake' and j.state='ji_location' then 'Hi 👋 Your HandyConnect job request is still open. Reply with the suburb or area where you need the work done to continue.'
    else 'Hi 👋 Your HandyConnect setup is still open. Reply here to continue from where you stopped.'
  end;
  insert into public.notification_outbox(recipient_phone,kind,body,payload,status,dedupe_key)
  values(j.external_user_id,'beta_recovery_manual_nudge',msg,jsonb_build_object('session_id',j.session_id,'flow',j.flow,'state',j.state,'source','ops_recovery'),'pending',format('beta-recovery-manual:%s:%s:%s',j.session_id,j.flow,j.state))
  on conflict (dedupe_key) do nothing returning id into oid;
  if oid is not null then
    update public.beta_stalled_journeys set reminder_count=reminder_count+1,last_reminded_at=now(),reviewed_at=now(),reviewed_by='ops',updated_at=now() where session_id=p_session_id;
    return query select true,oid;
  end if;
  return query select false,null::uuid;
end $$;

create or replace function public.beta_mark_recovery_reviewed(p_session_id uuid)
returns boolean language plpgsql set search_path=pg_catalog,public as $$ begin update public.beta_stalled_journeys set reviewed_at=now(),reviewed_by='ops',updated_at=now() where session_id=p_session_id and resolved_at is null; return found; end $$;

create or replace function public.beta_dismiss_recovery_stall(p_session_id uuid)
returns boolean language plpgsql set search_path=pg_catalog,public as $$ begin update public.beta_stalled_journeys set resolved_at=now(),resolution='operator_dismissed',reviewed_at=now(),reviewed_by='ops',updated_at=now() where session_id=p_session_id and resolved_at is null; return found; end $$;

revoke all on function public.beta_manual_recovery_nudge(uuid) from public,anon,authenticated;
revoke all on function public.beta_mark_recovery_reviewed(uuid) from public,anon,authenticated;
revoke all on function public.beta_dismiss_recovery_stall(uuid) from public,anon,authenticated;