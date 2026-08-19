create table if not exists public.beta_stalled_journeys (
  session_id uuid primary key references public.conversation_sessions(id) on delete cascade,
  external_user_id text not null,
  flow text not null,
  state text not null,
  stalled_since timestamptz not null,
  detected_at timestamptz not null default now(),
  last_reminded_at timestamptz,
  reminder_count integer not null default 0 check (reminder_count >= 0),
  resolved_at timestamptz,
  resolution text,
  updated_at timestamptz not null default now()
);

alter table public.beta_stalled_journeys enable row level security;

revoke all on table public.beta_stalled_journeys from anon, authenticated;
