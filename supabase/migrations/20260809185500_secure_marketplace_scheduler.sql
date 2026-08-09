create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.runtime_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);
revoke all on private.runtime_secrets from public, anon, authenticated;

insert into private.runtime_secrets(name,value)
values ('marketplace_dispatch_token',encode(gen_random_bytes(32),'hex'))
on conflict (name) do nothing;

create or replace function public.validate_dispatch_token(p_token text)
returns boolean
language sql
security definer
set search_path=pg_catalog,public,private
as $$
  select exists(
    select 1
    from private.runtime_secrets s
    where s.name='marketplace_dispatch_token'
      and p_token is not null
      and length(p_token) >= 32
      and s.value = p_token
  );
$$;
revoke all on function public.validate_dispatch_token(text) from public,anon,authenticated;
grant execute on function public.validate_dispatch_token(text) to service_role;

create or replace function public.invoke_marketplace_dispatcher()
returns bigint
language plpgsql
security definer
set search_path=pg_catalog,public,private,net
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  select value into v_token
  from private.runtime_secrets
  where name='marketplace_dispatch_token';

  if v_token is null then
    raise exception 'marketplace dispatcher token is missing';
  end if;

  select net.http_post(
    url := 'https://tjhuwtclvlxouwvktzem.supabase.co/functions/v1/marketplace-dispatcher',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-dispatch-token',v_token
    ),
    timeout_milliseconds := 15000
  ) into v_request_id;

  return v_request_id;
end;
$$;
revoke all on function public.invoke_marketplace_dispatcher() from public,anon,authenticated;
grant execute on function public.invoke_marketplace_dispatcher() to service_role;

do $$
begin
  if exists(select 1 from cron.job where jobname='handyconnect-marketplace-dispatcher') then
    perform cron.unschedule('handyconnect-marketplace-dispatcher');
  end if;
end $$;

select cron.schedule(
  'handyconnect-marketplace-dispatcher',
  '*/5 * * * *',
  $cron$select public.invoke_marketplace_dispatcher();$cron$
);
