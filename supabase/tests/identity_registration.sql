begin;

do $$
declare
  v_customer_columns integer;
  v_provider_columns integer;
begin
  select count(*) into v_customer_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'customers'
    and column_name in ('registration_status', 'terms_accepted_at', 'terms_version');

  select count(*) into v_provider_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'handymen'
    and column_name in ('registration_status', 'terms_accepted_at', 'terms_version');

  if v_customer_columns <> 3 then
    raise exception 'customer registration lifecycle columns are incomplete';
  end if;
  if v_provider_columns <> 3 then
    raise exception 'provider registration lifecycle columns are incomplete';
  end if;
end $$;

insert into public.customers (phone, registration_status)
values ('test:customer:identity-schema', 'onboarding');

do $$
begin
  if exists (
    select 1 from public.customers
    where phone = 'test:customer:identity-schema'
      and registration_status = 'active'
  ) then
    raise exception 'an onboarding customer was incorrectly activated';
  end if;

  begin
    insert into public.jobs (customer_id, description, city)
    select id, 'Synthetic identity test', 'Cape Town'
    from public.customers
    where phone = 'test:customer:identity-schema';
    raise exception 'an unregistered customer created a job';
  exception
    when raise_exception then
      if sqlerrm <> 'customer_identity_not_ready' then
        raise;
      end if;
  end;
end $$;

rollback;
