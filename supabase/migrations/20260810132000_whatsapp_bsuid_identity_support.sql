create table if not exists public.whatsapp_identities (
  id uuid primary key default gen_random_uuid(),
  bsuid text not null unique,
  phone text,
  username text,
  profile_name text,
  parent_bsuid text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  phone_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists whatsapp_identities_phone_unique on public.whatsapp_identities(phone) where phone is not null;
create index if not exists whatsapp_identities_last_seen_idx on public.whatsapp_identities(last_seen_at desc);
alter table public.customers add column if not exists whatsapp_bsuid text;
alter table public.customers add column if not exists whatsapp_username text;
alter table public.handymen add column if not exists whatsapp_bsuid text;
alter table public.handymen add column if not exists whatsapp_username text;
create unique index if not exists customers_whatsapp_bsuid_unique on public.customers(whatsapp_bsuid) where whatsapp_bsuid is not null;
create unique index if not exists handymen_whatsapp_bsuid_unique on public.handymen(whatsapp_bsuid) where whatsapp_bsuid is not null;
alter table public.notification_outbox add column if not exists recipient_bsuid text;
alter table public.notification_outbox alter column recipient_phone drop not null;
alter table public.notification_outbox drop constraint if exists notification_outbox_recipient_check;
alter table public.notification_outbox add constraint notification_outbox_recipient_check check (recipient_phone is not null or recipient_bsuid is not null);
drop function if exists public.claim_notification_batch(integer);
create function public.claim_notification_batch(p_limit integer default 50)
returns table(id uuid, recipient_phone text, recipient_bsuid text, kind text, body text, payload jsonb)
language sql security definer set search_path='pg_catalog','public' as $$
  with recovered as (
    update public.notification_outbox set status='pending',processing_started_at=null,next_attempt_at=now(),last_error=coalesce(last_error,'worker lease expired')
    where status='processing' and processing_started_at < now()-interval '10 minutes' returning id
  ), picked as (
    select n.id from public.notification_outbox n where n.status='pending' and n.next_attempt_at<=now()
    order by n.created_at limit greatest(1,least(coalesce(p_limit,50),100)) for update skip locked
  ), upd as (
    update public.notification_outbox n set status='processing',attempts=attempts+1,processing_started_at=now()
    from picked p where n.id=p.id returning n.id,n.recipient_phone,n.recipient_bsuid,n.kind,n.body,n.payload
  ) select * from upd;
$$;
revoke all on function public.claim_notification_batch(integer) from public;
grant execute on function public.claim_notification_batch(integer) to service_role;
