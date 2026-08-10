create table if not exists public.whatsapp_role_preferences (
  external_user_id text primary key,
  active_role text check (active_role in ('customer','handyman')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_whatsapp_role_preferences_role on public.whatsapp_role_preferences(active_role);
