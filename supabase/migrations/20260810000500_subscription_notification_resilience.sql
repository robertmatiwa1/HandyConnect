alter table public.notification_outbox
  drop constraint if exists notification_outbox_status_check;
alter table public.notification_outbox
  add constraint notification_outbox_status_check check (status in ('pending','processing','sent','failed','dead_letter'));
alter table public.notification_outbox add column if not exists processing_started_at timestamptz;
alter table public.notification_outbox add column if not exists dead_lettered_at timestamptz;

create index if not exists idx_notification_outbox_recovery
on public.notification_outbox(status,processing_started_at)
where status='processing';

create or replace function public.claim_notification_batch(p_limit integer default 50)
returns table(id uuid,recipient_phone text,kind text,body text,payload jsonb)
language sql security definer set search_path=pg_catalog,public as $$
  with recovered as (
    update public.notification_outbox
    set status='pending',processing_started_at=null,next_attempt_at=now(),last_error=coalesce(last_error,'worker lease expired')
    where status='processing' and processing_started_at < now()-interval '10 minutes'
    returning id
  ), picked as (
    select n.id from public.notification_outbox n
    where n.status='pending' and n.next_attempt_at<=now()
    order by n.created_at
    limit greatest(1,least(coalesce(p_limit,50),100))
    for update skip locked
  ), upd as (
    update public.notification_outbox n
    set status='processing',attempts=attempts+1,processing_started_at=now()
    from picked p where n.id=p.id
    returning n.id,n.recipient_phone,n.kind,n.body,n.payload
  ) select * from upd;
$$;

create or replace function public.finish_notification(p_id uuid,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_success then
    update public.notification_outbox set status='sent',sent_at=now(),last_error=null,processing_started_at=null where id=p_id;
  else
    update public.notification_outbox
    set status=case when attempts>=5 then 'dead_letter' else 'pending' end,
        next_attempt_at=now()+make_interval(mins=>least(60,greatest(1,(power(2,greatest(attempts-1,0))::integer)*2))),
        last_error=left(coalesce(p_error,'send failed'),1000),
        processing_started_at=null,
        dead_lettered_at=case when attempts>=5 then now() else dead_lettered_at end
    where id=p_id;
  end if;
end;
$$;

create or replace function public.reconcile_subscription_lifecycle()
returns table(expired_subscriptions integer,expired_entitlements integer,notifications_queued integer)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_subs integer:=0; v_ents integer:=0; v_notifs integer:=0;
begin
  with due as (
    update public.subscriptions s set status='expired',updated_at=now()
    where s.plan_code='pro_monthly' and s.status in ('active','past_due','cancelled')
      and s.current_period_end is not null and s.current_period_end<=now()
    returning s.id,s.handyman_id
  ) select count(*) into v_subs from due;

  with expired as (
    update public.entitlements e set status='expired'
    where e.entitlement_type='pro_access' and e.status='active'
      and e.valid_until is not null and e.valid_until<=now()
    returning e.id
  ) select count(*) into v_ents from expired;

  with ins as (
    insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
    select h.phone,'pro_expired','Your HandyConnect Pro access has ended. You are now on the Free plan and can upgrade to Pro again at any time.',
      jsonb_build_object('subscription_id',s.id),'pro-expired:'||s.id::text
    from public.subscriptions s join public.handymen h on h.id=s.handyman_id
    where s.plan_code='pro_monthly' and s.status='expired' and s.current_period_end<=now()
    on conflict(dedupe_key) do nothing returning id
  ) select count(*) into v_notifs from ins;
  return query select v_subs,v_ents,v_notifs;
end;
$$;

create or replace function public.apply_paystack_subscription_event(p_customer_email text,p_provider_subscription_id text,p_event_type text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_handyman_id uuid; v_subscription_id uuid; v_phone text; v_period_end timestamptz;
begin
  select id,phone into v_handyman_id,v_phone from public.handymen where email is not null and lower(email)=lower(p_customer_email) order by created_at desc limit 1;
  if v_handyman_id is null then return; end if;
  select id,current_period_end into v_subscription_id,v_period_end from public.subscriptions
    where handyman_id=v_handyman_id and plan_code='pro_monthly' and provider='paystack' order by created_at desc limit 1;
  if v_subscription_id is null then return; end if;
  if p_event_type='subscription.create' then
    update public.subscriptions set provider_subscription_id=coalesce(p_provider_subscription_id,provider_subscription_id),status='active',cancel_at_period_end=false,updated_at=now() where id=v_subscription_id;
  elsif p_event_type='subscription.not_renew' then
    update public.subscriptions set provider_subscription_id=coalesce(p_provider_subscription_id,provider_subscription_id),cancel_at_period_end=true,updated_at=now() where id=v_subscription_id;
    insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
    values(v_phone,'pro_cancellation_scheduled','Your HandyConnect Pro subscription will not renew. Your Pro access remains active until the end of the current paid period.',jsonb_build_object('subscription_id',v_subscription_id,'valid_until',v_period_end),'pro-not-renew:'||v_subscription_id::text)
    on conflict(dedupe_key) do nothing;
  elsif p_event_type='subscription.disable' then
    update public.subscriptions set provider_subscription_id=coalesce(p_provider_subscription_id,provider_subscription_id),status='cancelled',cancel_at_period_end=true,updated_at=now() where id=v_subscription_id;
    insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
    values(v_phone,'pro_cancelled','Your HandyConnect Pro subscription has been cancelled. Any already-paid Pro access remains available until the paid period ends.',jsonb_build_object('subscription_id',v_subscription_id,'valid_until',v_period_end),'pro-cancelled:'||v_subscription_id::text)
    on conflict(dedupe_key) do nothing;
  end if;
end;
$$;

revoke all on function public.reconcile_subscription_lifecycle() from public,anon,authenticated;
grant execute on function public.reconcile_subscription_lifecycle() to service_role;
revoke all on function public.claim_notification_batch(integer) from public,anon,authenticated;
revoke all on function public.finish_notification(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;
grant execute on function public.finish_notification(uuid,boolean,text) to service_role;

select cron.unschedule(jobid) from cron.job where jobname='handyconnect-subscription-reconcile';
select cron.schedule('handyconnect-subscription-reconcile','*/5 * * * *','select public.reconcile_subscription_lifecycle();');
