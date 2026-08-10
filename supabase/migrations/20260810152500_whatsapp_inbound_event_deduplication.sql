create table if not exists public.whatsapp_inbound_events (
  message_id text primary key,
  received_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_inbound_events_received_at
  on public.whatsapp_inbound_events(received_at);

revoke all on table public.whatsapp_inbound_events from anon, authenticated;
