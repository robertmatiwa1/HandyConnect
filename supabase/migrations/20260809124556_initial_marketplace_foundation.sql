create schema if not exists private;
revoke all on schema private from public;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, public
as $$ begin new.updated_at = now(); return new; end; $$;

create table public.handymen (
  id uuid primary key default gen_random_uuid(), phone text not null unique, full_name text not null,
  business_name text, email text,
  status text not null default 'active' check (status in ('active','suspended','inactive')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected')),
  average_rating numeric(3,2) not null default 0 check (average_rating between 0 and 5),
  completed_jobs integer not null default 0 check (completed_jobs >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), phone text not null unique, full_name text, email text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.skills (
  id bigint generated always as identity primary key, code text not null unique, name text not null unique,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table public.handyman_skills (
  handyman_id uuid not null references public.handymen(id) on delete cascade,
  skill_id bigint not null references public.skills(id) on delete restrict,
  years_experience integer check (years_experience is null or years_experience >= 0),
  primary key (handyman_id, skill_id)
);
create table public.service_areas (
  id uuid primary key default gen_random_uuid(), handyman_id uuid not null references public.handymen(id) on delete cascade,
  suburb text, city text not null, province text, country_code char(2) not null default 'ZA', created_at timestamptz not null default now(),
  unique (handyman_id, suburb, city, province, country_code)
);
create table public.plans (
  code text primary key, name text not null, billing_model text not null check (billing_model in ('free','subscription','credits')),
  price_cents integer not null default 0 check (price_cents >= 0), currency char(3) not null default 'ZAR',
  lead_limit integer check (lead_limit is null or lead_limit >= 0), billing_interval text check (billing_interval in ('month','once') or billing_interval is null),
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), handyman_id uuid not null references public.handymen(id) on delete cascade,
  plan_code text not null references public.plans(code) on delete restrict,
  status text not null check (status in ('trialing','active','past_due','cancelled','expired')),
  provider text, provider_subscription_id text, current_period_start timestamptz, current_period_end timestamptz,
  cancel_at_period_end boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider, provider_subscription_id)
);
create table public.entitlements (
  id uuid primary key default gen_random_uuid(), handyman_id uuid not null references public.handymen(id) on delete cascade,
  entitlement_type text not null check (entitlement_type in ('free_leads','pro_access','verified_badge','lead_credits')),
  source_type text not null check (source_type in ('registration','subscription','payment','admin','promotion')),
  source_id uuid, quantity integer check (quantity is null or quantity >= 0), valid_from timestamptz not null default now(), valid_until timestamptz,
  status text not null default 'active' check (status in ('active','consumed','expired','revoked')), created_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), handyman_id uuid not null references public.handymen(id) on delete restrict,
  provider text not null, provider_payment_id text,
  purpose text not null check (purpose in ('subscription','verification','lead_credits','featured_listing')),
  amount_cents integer not null check (amount_cents > 0), currency char(3) not null default 'ZAR',
  status text not null default 'initiated' check (status in ('initiated','pending','succeeded','failed','refunded','partially_refunded')),
  idempotency_key text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);
create table public.payment_events (
  id uuid primary key default gen_random_uuid(), payment_id uuid references public.payments(id) on delete set null,
  provider text not null, provider_event_id text not null, event_type text not null, payload jsonb not null,
  received_at timestamptz not null default now(), processed_at timestamptz, processing_error text,
  unique(provider, provider_event_id)
);
create table public.jobs (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete restrict,
  skill_id bigint references public.skills(id) on delete restrict, description text not null, suburb text, city text not null, province text,
  urgency text not null default 'normal' check (urgency in ('normal','urgent','emergency')),
  budget_cents integer check (budget_cents is null or budget_cents >= 0),
  status text not null default 'open' check (status in ('open','matching','assigned','in_progress','completed','cancelled','expired')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.job_matches (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.jobs(id) on delete cascade,
  handyman_id uuid not null references public.handymen(id) on delete cascade, match_score numeric(8,4),
  status text not null default 'offered' check (status in ('offered','accepted','declined','expired','lost')),
  offered_at timestamptz not null default now(), responded_at timestamptz, unique(job_id, handyman_id)
);
create table public.job_assignments (
  id uuid primary key default gen_random_uuid(), job_id uuid not null unique references public.jobs(id) on delete cascade,
  handyman_id uuid not null references public.handymen(id) on delete restrict,
  accepted_match_id uuid references public.job_matches(id) on delete set null,
  assigned_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz, cancelled_at timestamptz
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), job_id uuid not null unique references public.jobs(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  handyman_id uuid not null references public.handymen(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5), comment text, created_at timestamptz not null default now()
);

create index idx_handyman_skills_skill_id on public.handyman_skills(skill_id);
create index idx_service_areas_location on public.service_areas(city, suburb);
create index idx_subscriptions_handyman_status on public.subscriptions(handyman_id, status);
create index idx_entitlements_handyman_status on public.entitlements(handyman_id, status, valid_until);
create index idx_payments_handyman_status on public.payments(handyman_id, status);
create index idx_jobs_status_skill_location on public.jobs(status, skill_id, city);
create index idx_job_matches_job_status on public.job_matches(job_id, status);
create index idx_job_matches_handyman_status on public.job_matches(handyman_id, status);

create trigger trg_handymen_updated_at before update on public.handymen for each row execute function private.set_updated_at();
create trigger trg_customers_updated_at before update on public.customers for each row execute function private.set_updated_at();
create trigger trg_plans_updated_at before update on public.plans for each row execute function private.set_updated_at();
create trigger trg_subscriptions_updated_at before update on public.subscriptions for each row execute function private.set_updated_at();
create trigger trg_payments_updated_at before update on public.payments for each row execute function private.set_updated_at();
create trigger trg_jobs_updated_at before update on public.jobs for each row execute function private.set_updated_at();

alter table public.handymen enable row level security;
alter table public.customers enable row level security;
alter table public.skills enable row level security;
alter table public.handyman_skills enable row level security;
alter table public.service_areas enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.jobs enable row level security;
alter table public.job_matches enable row level security;
alter table public.job_assignments enable row level security;
alter table public.reviews enable row level security;

insert into public.plans (code,name,billing_model,price_cents,currency,lead_limit,billing_interval) values
('free','Free','free',0,'ZAR',3,null), ('pro_monthly','Pro Monthly','subscription',9900,'ZAR',null,'month');
insert into public.skills (code,name) values
('plumbing','Plumbing'),('electrical','Electrical'),('carpentry','Carpentry'),('painting','Painting'),('general_handyman','General Handyman');
