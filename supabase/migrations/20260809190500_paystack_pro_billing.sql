alter table public.payments add column if not exists checkout_url text;
alter table public.payments add column if not exists checkout_expires_at timestamptz;
alter table public.payments add column if not exists provider_access_code text;

create index if not exists idx_payments_handyman_status_created
on public.payments(handyman_id,status,created_at desc);

create index if not exists idx_handymen_lower_email
on public.handymen(lower(email)) where email is not null;

create or replace function public.apply_successful_pro_payment(
  p_reference text,
  p_amount_cents integer,
  p_currency text,
  p_customer_email text,
  p_provider_subscription_id text default null
)
returns table(payment_id uuid, subscription_id uuid, valid_until timestamptz)
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_plan public.plans%rowtype;
  v_payment public.payments%rowtype;
  v_handyman_id uuid;
  v_subscription public.subscriptions%rowtype;
  v_period_start timestamptz := now();
  v_period_end timestamptz;
  v_entitlement_id uuid;
begin
  select * into v_plan from public.plans where code='pro_monthly' and active=true;
  if v_plan.code is null then raise exception 'pro plan unavailable'; end if;
  if p_amount_cents <> v_plan.price_cents then raise exception 'amount mismatch'; end if;
  if upper(coalesce(p_currency,'')) <> upper(v_plan.currency::text) then raise exception 'currency mismatch'; end if;

  select * into v_payment
  from public.payments
  where provider='paystack' and provider_payment_id=p_reference
  for update;

  if v_payment.id is null then
    select id into v_handyman_id
    from public.handymen
    where email is not null and lower(email)=lower(p_customer_email) and status='active'
    order by created_at desc limit 1;
    if v_handyman_id is null then raise exception 'handyman not found for billing email'; end if;

    insert into public.payments(handyman_id,provider,provider_payment_id,purpose,amount_cents,currency,status,idempotency_key)
    values(v_handyman_id,'paystack',p_reference,'subscription',p_amount_cents,upper(p_currency),'succeeded','paystack:'||p_reference)
    returning * into v_payment;
  else
    v_handyman_id := v_payment.handyman_id;
    if v_payment.amount_cents <> p_amount_cents or upper(v_payment.currency::text) <> upper(p_currency) then
      raise exception 'payment verification mismatch';
    end if;
    update public.payments set status='succeeded',updated_at=now() where id=v_payment.id returning * into v_payment;
  end if;

  select * into v_subscription
  from public.subscriptions
  where handyman_id=v_handyman_id and plan_code='pro_monthly' and provider='paystack'
    and status in ('active','past_due','cancelled','expired')
  order by created_at desc limit 1
  for update;

  if v_subscription.id is null then
    v_period_end := now()+interval '1 month';
    insert into public.subscriptions(handyman_id,plan_code,status,provider,provider_subscription_id,current_period_start,current_period_end,cancel_at_period_end)
    values(v_handyman_id,'pro_monthly','active','paystack',p_provider_subscription_id,v_period_start,v_period_end,false)
    returning * into v_subscription;
  else
    v_period_start := greatest(coalesce(v_subscription.current_period_end,now()),now());
    v_period_end := v_period_start + interval '1 month';
    update public.subscriptions
    set status='active',
        provider_subscription_id=coalesce(p_provider_subscription_id,provider_subscription_id),
        current_period_start=v_period_start,
        current_period_end=v_period_end,
        cancel_at_period_end=false,
        updated_at=now()
    where id=v_subscription.id
    returning * into v_subscription;
  end if;

  select id into v_entitlement_id
  from public.entitlements
  where handyman_id=v_handyman_id and entitlement_type='pro_access' and status='active'
  order by created_at desc limit 1
  for update;

  if v_entitlement_id is null then
    insert into public.entitlements(handyman_id,entitlement_type,source_type,source_id,quantity,valid_from,valid_until,status)
    values(v_handyman_id,'pro_access','subscription',v_subscription.id,null,now(),v_period_end,'active');
  else
    update public.entitlements
    set source_type='subscription',source_id=v_subscription.id,valid_until=v_period_end,status='active'
    where id=v_entitlement_id;
  end if;

  return query select v_payment.id,v_subscription.id,v_period_end;
end;
$$;

create or replace function public.apply_paystack_subscription_event(
  p_customer_email text,
  p_provider_subscription_id text,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_handyman_id uuid;
  v_subscription_id uuid;
begin
  select id into v_handyman_id from public.handymen
  where email is not null and lower(email)=lower(p_customer_email)
  order by created_at desc limit 1;
  if v_handyman_id is null then return; end if;

  select id into v_subscription_id from public.subscriptions
  where handyman_id=v_handyman_id and plan_code='pro_monthly' and provider='paystack'
  order by created_at desc limit 1;
  if v_subscription_id is null then return; end if;

  if p_event_type='subscription.create' then
    update public.subscriptions set provider_subscription_id=coalesce(p_provider_subscription_id,provider_subscription_id),status='active',updated_at=now()
    where id=v_subscription_id;
  elsif p_event_type='subscription.not_renew' then
    update public.subscriptions set provider_subscription_id=coalesce(p_provider_subscription_id,provider_subscription_id),cancel_at_period_end=true,updated_at=now()
    where id=v_subscription_id;
  elsif p_event_type='subscription.disable' then
    update public.subscriptions set provider_subscription_id=coalesce(p_provider_subscription_id,provider_subscription_id),status='cancelled',cancel_at_period_end=true,updated_at=now()
    where id=v_subscription_id;
  end if;
end;
$$;

revoke all on function public.apply_successful_pro_payment(text,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.apply_paystack_subscription_event(text,text,text) from public,anon,authenticated;
grant execute on function public.apply_successful_pro_payment(text,integer,text,text,text) to service_role;
grant execute on function public.apply_paystack_subscription_event(text,text,text) to service_role;
