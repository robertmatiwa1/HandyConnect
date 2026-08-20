create or replace function public.process_paystack_event(p_event_id text, p_event_type text, p_payload jsonb, p_configured_plan_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_event_id uuid;
  v_processed_at timestamptz;
  v_reference text;
  v_amount integer;
  v_currency text;
  v_email text;
  v_event_plan text;
  v_subscription_code text;
  v_payment_id uuid;
  v_valid_until timestamptz;
  v_handyman_id uuid;
  v_phone text;
  v_prior_subscription_code text;
begin
  select id, processed_at
    into v_event_id, v_processed_at
  from public.payment_events
  where provider='paystack' and provider_event_id=p_event_id
  for update;

  if v_event_id is not null and v_processed_at is not null then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;

  if v_event_id is null then
    insert into public.payment_events(provider,provider_event_id,event_type,payload)
    values('paystack',p_event_id,p_event_type,p_payload)
    returning id into v_event_id;
  end if;

  if p_event_type='charge.success' then
    v_reference:=coalesce(p_payload#>>'{data,reference}','');
    v_amount:=coalesce(nullif(p_payload#>>'{data,amount}','')::integer,0);
    v_currency:=coalesce(p_payload#>>'{data,currency}','');
    v_email:=coalesce(p_payload#>>'{data,customer,email}',p_payload#>>'{data,metadata,email}','');
    v_event_plan:=coalesce(p_payload#>>'{data,plan,plan_code}',p_payload#>>'{data,plan}','');

    if (v_reference like 'HC-PRO-%' or (coalesce(p_configured_plan_code,'')<>'' and v_event_plan=p_configured_plan_code))
       and v_reference<>'' and v_amount>0 and v_email<>'' then
      select x.payment_id,x.valid_until
        into v_payment_id,v_valid_until
      from public.apply_successful_pro_payment(v_reference,v_amount,v_currency,v_email,null) x;

      update public.payment_events set payment_id=v_payment_id where id=v_event_id;

      select p.handyman_id into v_handyman_id from public.payments p where p.id=v_payment_id;
      select h.phone into v_phone from public.handymen h where h.id=v_handyman_id;

      select pe.payload#>>'{data,subscription_code}'
        into v_prior_subscription_code
      from public.payment_events pe
      where pe.provider='paystack'
        and pe.event_type='subscription.create'
        and lower(coalesce(pe.payload#>>'{data,customer,email}',''))=lower(v_email)
        and coalesce(pe.payload#>>'{data,subscription_code}','')<>''
      order by pe.received_at desc
      limit 1;

      if coalesce(v_prior_subscription_code,'')<>'' then
        perform public.apply_paystack_subscription_event(v_email,v_prior_subscription_code,'subscription.create');
      end if;

      if v_phone is not null then
        insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
        values(
          v_phone,
          'payment_success',
          'Payment received. Your HandyConnect Pro access is active'||case when v_valid_until is not null then ' until '||to_char(v_valid_until at time zone 'Africa/Johannesburg','DD Mon YYYY') else '' end||'.',
          '{}'::jsonb,
          'payment-success:'||v_payment_id::text
        )
        on conflict(dedupe_key) do nothing;
      end if;
    end if;
  elsif p_event_type in ('subscription.create','subscription.not_renew','subscription.disable') then
    v_email:=coalesce(p_payload#>>'{data,customer,email}','');
    v_subscription_code:=coalesce(p_payload#>>'{data,subscription_code}',p_payload#>>'{data,subscription,subscription_code}','');
    if v_email<>'' then
      perform public.apply_paystack_subscription_event(v_email,nullif(v_subscription_code,''),p_event_type);
    end if;
  elsif p_event_type='invoice.payment_failed' then
    v_email:=coalesce(p_payload#>>'{data,customer,email}','');
    if v_email<>'' then
      select id,phone into v_handyman_id,v_phone
      from public.handymen
      where email is not null and lower(email)=lower(v_email)
      order by created_at desc
      limit 1;

      if v_handyman_id is not null then
        update public.subscriptions
        set status='past_due',updated_at=now()
        where handyman_id=v_handyman_id and provider='paystack' and plan_code='pro_monthly' and status='active';

        insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
        values(
          v_phone,
          'payment_failed',
          'Your HandyConnect Pro renewal payment failed. Your current access remains available until the paid period ends; please update your payment method before then.',
          '{}'::jsonb,
          'payment-failed:'||p_event_id
        )
        on conflict(dedupe_key) do nothing;
      end if;
    end if;
  end if;

  update public.payment_events
  set processed_at=now(),processing_error=null
  where id=v_event_id;

  return jsonb_build_object('ok',true,'event_id',v_event_id);
end;
$function$;

with latest_codes as (
  select distinct on (lower(coalesce(payload#>>'{data,customer,email}','')))
    lower(coalesce(payload#>>'{data,customer,email}','')) as email,
    payload#>>'{data,subscription_code}' as subscription_code
  from public.payment_events
  where provider='paystack'
    and event_type='subscription.create'
    and coalesce(payload#>>'{data,customer,email}','')<>''
    and coalesce(payload#>>'{data,subscription_code}','')<>''
  order by lower(coalesce(payload#>>'{data,customer,email}','')), received_at desc
)
update public.subscriptions s
set provider_subscription_id=lc.subscription_code,
    updated_at=now()
from public.handymen h
join latest_codes lc on lc.email=lower(h.email)
where s.handyman_id=h.id
  and s.provider='paystack'
  and s.plan_code='pro_monthly'
  and coalesce(s.provider_subscription_id,'')='';
