-- Controlled beta funnel telemetry. Analytics must never block marketplace writes.
create table if not exists public.beta_funnel_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  channel text not null default 'whatsapp',
  external_user_id text,
  customer_id uuid references public.customers(id) on delete set null,
  handyman_id uuid references public.handymen(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  event_name text not null,
  flow text,
  state text,
  source text,
  campaign text,
  metadata jsonb not null default '{}'::jsonb,
  constraint beta_funnel_event_name_chk check (event_name in (
    'conversation_started','role_selected','registration_started','registration_completed',
    'job_started','job_submitted','match_offered','job_assigned','job_started_work',
    'job_completed','journey_stalled','journey_resumed'
  ))
);

create index if not exists idx_beta_funnel_events_user_time on public.beta_funnel_events(external_user_id, occurred_at desc);
create index if not exists idx_beta_funnel_events_name_time on public.beta_funnel_events(event_name, occurred_at desc);
create index if not exists idx_beta_funnel_events_source_time on public.beta_funnel_events(source, campaign, occurred_at desc);
create index if not exists idx_beta_funnel_events_job on public.beta_funnel_events(job_id) where job_id is not null;
alter table public.beta_funnel_events enable row level security;
revoke all on table public.beta_funnel_events from anon, authenticated;

create or replace view public.beta_funnel_daily with (security_invoker=true) as
select date_trunc('day', occurred_at) as day,
       coalesce(source,'unknown') as source,
       coalesce(campaign,'unknown') as campaign,
       count(distinct external_user_id) filter (where event_name='conversation_started') as conversations,
       count(distinct external_user_id) filter (where event_name='registration_started') as registrations_started,
       count(distinct external_user_id) filter (where event_name='registration_completed') as registrations_completed,
       count(distinct external_user_id) filter (where event_name='job_started') as jobs_started,
       count(distinct job_id) filter (where event_name='job_submitted') as jobs_submitted,
       count(distinct job_id) filter (where event_name='job_assigned') as jobs_assigned,
       count(distinct job_id) filter (where event_name='job_completed') as jobs_completed
from public.beta_funnel_events
group by 1,2,3;
revoke all on public.beta_funnel_daily from anon, authenticated;

create or replace function public.beta_record_session_funnel()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  begin
    if tg_op='INSERT' then
      insert into public.beta_funnel_events(channel,external_user_id,event_name,flow,state,metadata)
      values(new.channel,new.external_user_id,'conversation_started',new.flow,new.state,jsonb_build_object('origin','conversation_sessions'));
      if new.flow in ('customer_onboarding','handyman_onboarding') then
        insert into public.beta_funnel_events(channel,external_user_id,event_name,flow,state,metadata)
        values(new.channel,new.external_user_id,'registration_started',new.flow,new.state,jsonb_build_object('origin','conversation_sessions','role',case when new.flow='handyman_onboarding' then 'handyman' else 'customer' end));
      elsif new.flow='job_intake' then
        insert into public.beta_funnel_events(channel,external_user_id,event_name,flow,state,metadata)
        values(new.channel,new.external_user_id,'job_started',new.flow,new.state,jsonb_build_object('origin','conversation_sessions'));
      end if;
    else
      if new.flow in ('customer_onboarding','handyman_onboarding') and old.flow is distinct from new.flow then
        insert into public.beta_funnel_events(channel,external_user_id,event_name,flow,state,metadata)
        values(new.channel,new.external_user_id,'registration_started',new.flow,new.state,jsonb_build_object('origin','conversation_sessions','role',case when new.flow='handyman_onboarding' then 'handyman' else 'customer' end));
      end if;
      if new.flow='job_intake' and old.flow is distinct from new.flow then
        insert into public.beta_funnel_events(channel,external_user_id,event_name,flow,state,metadata)
        values(new.channel,new.external_user_id,'job_started',new.flow,new.state,jsonb_build_object('origin','conversation_sessions'));
      end if;
      if new.status='active' and old.status is distinct from 'active' then
        insert into public.beta_funnel_events(channel,external_user_id,event_name,flow,state,metadata)
        values(new.channel,new.external_user_id,'journey_resumed',new.flow,new.state,jsonb_build_object('origin','conversation_sessions'));
      end if;
    end if;
  exception when others then raise warning 'beta funnel session telemetry failed: %',sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_beta_session_funnel on public.conversation_sessions;
create trigger trg_beta_session_funnel after insert or update of flow,state,status on public.conversation_sessions for each row execute function public.beta_record_session_funnel();

create or replace function public.beta_record_role_funnel()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  begin
    if tg_op='INSERT' or old.active_role is distinct from new.active_role then
      insert into public.beta_funnel_events(channel,external_user_id,event_name,metadata)
      values('whatsapp',new.external_user_id,'role_selected',jsonb_build_object('origin','whatsapp_role_preferences','role',new.active_role));
    end if;
  exception when others then raise warning 'beta funnel role telemetry failed: %',sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_beta_role_funnel on public.whatsapp_role_preferences;
create trigger trg_beta_role_funnel after insert or update of active_role on public.whatsapp_role_preferences for each row execute function public.beta_record_role_funnel();

create or replace function public.beta_record_customer_registration()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare was_complete boolean:=false; is_complete boolean:=false;
begin
  begin
    if tg_op='UPDATE' then was_complete:=old.registration_status='active' and old.terms_accepted_at is not null and old.full_name is not null; end if;
    is_complete:=new.registration_status='active' and new.terms_accepted_at is not null and new.full_name is not null;
    if is_complete and not was_complete then
      insert into public.beta_funnel_events(channel,external_user_id,customer_id,event_name,metadata)
      values('whatsapp',new.phone,new.id,'registration_completed',jsonb_build_object('origin','customers','role','customer'));
    end if;
  exception when others then raise warning 'beta funnel customer telemetry failed: %',sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_beta_customer_registration on public.customers;
create trigger trg_beta_customer_registration after insert or update of registration_status,terms_accepted_at,full_name on public.customers for each row execute function public.beta_record_customer_registration();

create or replace function public.beta_record_handyman_registration()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare was_complete boolean:=false; is_complete boolean:=false;
begin
  begin
    if tg_op='UPDATE' then was_complete:=old.registration_status='active' and old.terms_accepted_at is not null and old.full_name is not null; end if;
    is_complete:=new.registration_status='active' and new.terms_accepted_at is not null and new.full_name is not null;
    if is_complete and not was_complete then
      insert into public.beta_funnel_events(channel,external_user_id,handyman_id,event_name,metadata)
      values('whatsapp',new.phone,new.id,'registration_completed',jsonb_build_object('origin','handymen','role','handyman'));
    end if;
  exception when others then raise warning 'beta funnel handyman telemetry failed: %',sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_beta_handyman_registration on public.handymen;
create trigger trg_beta_handyman_registration after insert or update of registration_status,terms_accepted_at,full_name on public.handymen for each row execute function public.beta_record_handyman_registration();

create or replace function public.beta_record_job_funnel()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare phone_value text;
begin
  begin
    select c.phone into phone_value from public.customers c where c.id=new.customer_id;
    if tg_op='INSERT' then
      insert into public.beta_funnel_events(channel,external_user_id,customer_id,job_id,event_name,metadata)
      values('whatsapp',phone_value,new.customer_id,new.id,'job_submitted',jsonb_build_object('origin','jobs','status',new.status));
    end if;
    if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
      insert into public.beta_funnel_events(channel,external_user_id,customer_id,job_id,event_name,metadata)
      values('whatsapp',phone_value,new.customer_id,new.id,'job_completed',jsonb_build_object('origin','jobs'));
    end if;
  exception when others then raise warning 'beta funnel job telemetry failed: %',sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_beta_job_funnel on public.jobs;
create trigger trg_beta_job_funnel after insert or update of status on public.jobs for each row execute function public.beta_record_job_funnel();
