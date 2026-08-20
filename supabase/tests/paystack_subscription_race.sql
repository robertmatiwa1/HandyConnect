begin;

-- Regression: Paystack can emit subscription.create milliseconds before charge.success.
-- Simulate that order and verify the later charge reconciles provider_subscription_id.

do $$
declare
  v_handyman uuid;
  v_payment uuid;
  v_email text := 'paystack-race-test@example.invalid';
  v_reference text := 'HC-PRO-RACE-TEST';
  v_subscription_code text := 'SUB_RACE_TEST';
  v_result jsonb;
begin
  insert into public.handymen(phone,email,status,verification_status,full_name)
  values('27999999991',v_email,'active','unverified','Paystack Race Test')
  returning id into v_handyman;

  insert into public.payment_events(provider,provider_event_id,event_type,payload,received_at,processed_at)
  values(
    'paystack',
    'race-subscription-create',
    'subscription.create',
    jsonb_build_object(
      'event','subscription.create',
      'data',jsonb_build_object(
        'subscription_code',v_subscription_code,
        'customer',jsonb_build_object('email',v_email)
      )
    ),
    now(),
    now()
  );

  insert into public.payments(handyman_id,provider,provider_payment_id,purpose,amount_cents,currency,status,idempotency_key)
  values(v_handyman,'paystack',v_reference,'subscription',9900,'ZAR','pending','paystack:'||v_reference)
  returning id into v_payment;

  select public.process_paystack_event(
    'race-charge-success',
    'charge.success',
    jsonb_build_object(
      'event','charge.success',
      'data',jsonb_build_object(
        'reference',v_reference,
        'amount',9900,
        'currency','ZAR',
        'customer',jsonb_build_object('email',v_email),
        'plan',jsonb_build_object('plan_code','PLN_RACE_TEST')
      )
    ),
    'PLN_RACE_TEST'
  ) into v_result;

  if not exists (
    select 1
    from public.subscriptions s
    where s.handyman_id=v_handyman
      and s.provider='paystack'
      and s.plan_code='pro_monthly'
      and s.provider_subscription_id=v_subscription_code
  ) then
    raise exception 'Paystack subscription.create race was not reconciled';
  end if;
end $$;

rollback;
