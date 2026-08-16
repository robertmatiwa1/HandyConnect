-- Make registration an explicit lifecycle rather than inferring it from row existence.
alter table public.customers
  add column if not exists registration_status text not null default 'onboarding',
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

alter table public.customers
  drop constraint if exists customers_registration_status_check;
alter table public.customers
  add constraint customers_registration_status_check
  check (registration_status in ('onboarding', 'active', 'closed'));

alter table public.handymen
  add column if not exists registration_status text not null default 'active',
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

alter table public.handymen
  drop constraint if exists handymen_registration_status_check;
alter table public.handymen
  add constraint handymen_registration_status_check
  check (registration_status in ('onboarding', 'active', 'closed'));

-- Preserve legacy profiles and jobs. Some production-era schemas had an
-- onboarding_completed_at column on customers, but clean rebuilds may not.
-- Derive activity from the strongest field guaranteed by the foundation schema.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'onboarding_completed_at'
  ) then
    execute $sql$
      update public.customers
      set registration_status = case
        when onboarding_completed_at is not null and full_name is not null then 'active'
        else 'onboarding'
      end
    $sql$;
  else
    update public.customers
    set registration_status = case
      when full_name is not null then 'active'
      else 'onboarding'
    end;
  end if;
end
$$;

update public.handymen
set registration_status = 'active';

create index if not exists idx_customers_registration_status
  on public.customers (registration_status);
create index if not exists idx_handymen_registration_status
  on public.handymen (registration_status, verification_status);

comment on column public.customers.registration_status is
  'Explicit customer registration lifecycle. Row existence alone does not grant customer capabilities.';
comment on column public.handymen.registration_status is
  'Explicit provider registration lifecycle, independent of verification approval.';

create or replace function private.enforce_provider_identity_readiness()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.availability_status = 'available'
    and (
      new.registration_status <> 'active'
      or new.terms_accepted_at is null
      or new.verification_status <> 'verified'
      or new.status <> 'active'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = case
        when new.registration_status <> 'active' or new.terms_accepted_at is null
          then 'provider_registration_incomplete'
        when new.verification_status <> 'verified'
          then 'provider_not_verified'
        else 'provider_not_active'
      end;
  end if;
  return new;
end
$$;

drop trigger if exists trg_provider_identity_readiness on public.handymen;
create trigger trg_provider_identity_readiness
before insert or update of availability_status, registration_status,
  terms_accepted_at, verification_status, status
on public.handymen
for each row execute function private.enforce_provider_identity_readiness();

create or replace function private.enforce_assignment_identity_readiness()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.handymen h
    where h.id = new.handyman_id
      and h.status = 'active'
      and h.registration_status = 'active'
      and h.terms_accepted_at is not null
      and h.verification_status = 'verified'
  ) then
    raise exception using errcode = 'P0001', message = 'provider_identity_not_ready';
  end if;
  return new;
end
$$;

drop trigger if exists trg_assignment_identity_readiness
  on public.job_assignments;
create trigger trg_assignment_identity_readiness
before insert on public.job_assignments
for each row execute function private.enforce_assignment_identity_readiness();

create or replace function private.enforce_customer_identity_readiness()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.customers c
    where c.id = new.customer_id
      and c.registration_status = 'active'
      and c.terms_accepted_at is not null
      and c.full_name is not null
  ) then
    raise exception using errcode = 'P0001', message = 'customer_identity_not_ready';
  end if;
  return new;
end
$$;

drop trigger if exists trg_customer_identity_readiness on public.jobs;
create trigger trg_customer_identity_readiness
before insert on public.jobs
for each row execute function private.enforce_customer_identity_readiness();

revoke all on table public.customers from anon, authenticated;
revoke all on table public.handymen from anon, authenticated;
