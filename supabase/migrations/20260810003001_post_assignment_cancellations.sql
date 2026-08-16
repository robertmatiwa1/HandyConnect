create table if not exists public.reliability_events(
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  subject_type text not null check(subject_type in ('customer','handyman')),
  subject_id uuid not null,
  event_type text not null check(event_type in ('cancel_after_assignment','no_show')),
  actor_type text not null check(actor_type in ('customer','handyman','admin','system')),
  actor_id uuid,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_reliability_events_subject on public.reliability_events(subject_type,subject_id,created_at desc);
alter table public.reliability_events enable row level security;

create or replace function public.resolve_assigned_job_issue(
  p_job_id uuid,
  p_actor_phone text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_job public.jobs%rowtype;
  v_assignment public.job_assignments%rowtype;
  v_customer public.customers%rowtype;
  v_handyman public.handymen%rowtype;
  v_actor_type text;
  v_reopen boolean:=false;
  v_message text;
begin
  select * into v_job from public.jobs where id=p_job_id for update;
  if v_job.id is null then return jsonb_build_object('ok',false,'error','job_not_found'); end if;
  select * into v_assignment from public.job_assignments where job_id=p_job_id and cancelled_at is null for update;
  if v_assignment.id is null then return jsonb_build_object('ok',false,'error','assignment_not_found'); end if;
  select * into v_customer from public.customers where id=v_job.customer_id;
  select * into v_handyman from public.handymen where id=v_assignment.handyman_id;
  if v_customer.phone=p_actor_phone then v_actor_type:='customer'; elsif v_handyman.phone=p_actor_phone then v_actor_type:='handyman'; else return jsonb_build_object('ok',false,'error','not_authorized'); end if;

  if p_action='customer_cancel' and v_actor_type='customer' then
    update public.job_assignments set cancelled_at=now() where id=v_assignment.id;
    update public.jobs set status='cancelled',updated_at=now() where id=p_job_id;
    insert into public.reliability_events(job_id,subject_type,subject_id,event_type,actor_type,actor_id)
      values(p_job_id,'customer',v_customer.id,'cancel_after_assignment','customer',v_customer.id);
    v_message:='Job cancelled after assignment.';
    insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
      values(v_handyman.phone,'customer_cancelled_job','The customer cancelled this assigned HandyConnect job. You are free to accept other work.',jsonb_build_object('job_id',p_job_id),'assigned-cancel-handyman:'||p_job_id::text)
      on conflict(dedupe_key) do nothing;
  elsif p_action='handyman_cancel' and v_actor_type='handyman' then
    update public.job_assignments set cancelled_at=now() where id=v_assignment.id;
    update public.jobs set status='matching',next_match_at=now(),updated_at=now() where id=p_job_id;
    update public.job_matches set status='lost',responded_at=coalesce(responded_at,now()) where id=v_assignment.accepted_match_id;
    insert into public.reliability_events(job_id,subject_type,subject_id,event_type,actor_type,actor_id)
      values(p_job_id,'handyman',v_handyman.id,'cancel_after_assignment','handyman',v_handyman.id);
    v_reopen:=true; v_message:='Assignment released and matching restarted.';
    insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
      values(v_customer.phone,'handyman_cancelled_job','Your assigned handyman can no longer attend. HandyConnect has reopened your request and is searching for another suitable handyman.',jsonb_build_object('job_id',p_job_id),'assigned-cancel-customer:'||p_job_id::text)
      on conflict(dedupe_key) do nothing;
  elsif p_action='handyman_no_show' and v_actor_type='customer' then
    update public.job_assignments set cancelled_at=now() where id=v_assignment.id;
    update public.jobs set status='matching',next_match_at=now(),updated_at=now() where id=p_job_id;
    update public.job_matches set status='lost',responded_at=coalesce(responded_at,now()) where id=v_assignment.accepted_match_id;
    insert into public.reliability_events(job_id,subject_type,subject_id,event_type,actor_type,actor_id)
      values(p_job_id,'handyman',v_handyman.id,'no_show','customer',v_customer.id);
    v_reopen:=true; v_message:='Handyman no-show recorded and matching restarted.';
    insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
      values(v_handyman.phone,'no_show_reported','The customer reported that you did not attend an assigned HandyConnect job. This has been recorded for review.',jsonb_build_object('job_id',p_job_id),'no-show-handyman:'||p_job_id::text)
      on conflict(dedupe_key) do nothing;
  elsif p_action='customer_no_show' and v_actor_type='handyman' then
    update public.job_assignments set cancelled_at=now() where id=v_assignment.id;
    update public.jobs set status='cancelled',updated_at=now() where id=p_job_id;
    insert into public.reliability_events(job_id,subject_type,subject_id,event_type,actor_type,actor_id)
      values(p_job_id,'customer',v_customer.id,'no_show','handyman',v_handyman.id);
    v_message:='Customer no-show recorded and job closed.';
    insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
      values(v_customer.phone,'no_show_reported','The assigned handyman reported that you were unavailable for the HandyConnect job. This has been recorded for review.',jsonb_build_object('job_id',p_job_id),'no-show-customer:'||p_job_id::text)
      on conflict(dedupe_key) do nothing;
  else
    return jsonb_build_object('ok',false,'error','invalid_action_for_actor');
  end if;

  insert into public.job_events(job_id,event_type,actor_type,actor_id,metadata)
    values(p_job_id,p_action,v_actor_type,case when v_actor_type='customer' then v_customer.id else v_handyman.id end,jsonb_build_object('reopened',v_reopen));
  return jsonb_build_object('ok',true,'job_id',p_job_id,'action',p_action,'reopened',v_reopen,'message',v_message);
end;
$$;
revoke all on function public.resolve_assigned_job_issue(uuid,text,text) from public,anon,authenticated;
grant execute on function public.resolve_assigned_job_issue(uuid,text,text) to service_role;
