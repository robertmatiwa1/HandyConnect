revoke all on function public.onboard_handyman(text,text,text,text,text[],text,text,text) from public, anon, authenticated;
grant execute on function public.onboard_handyman(text,text,text,text,text[],text,text,text) to service_role;

create table public.conversation_sessions (
  id uuid primary key default gen_random_uuid(), channel text not null check (channel in ('whatsapp','test','admin')),
  external_user_id text not null, flow text not null default 'entry' check (flow in ('entry','handyman_onboarding','customer_job','ready')),
  state text not null default 'choose_role', context jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(channel,external_user_id)
);
create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.conversation_sessions(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')), external_message_id text, message_type text not null default 'text',
  body text, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create unique index uq_conversation_inbound_external_message on public.conversation_messages(external_message_id)
where external_message_id is not null and direction='inbound';
create index idx_conversation_messages_session_created on public.conversation_messages(session_id,created_at);
create trigger trg_conversation_sessions_updated_at before update on public.conversation_sessions for each row execute function private.set_updated_at();
alter table public.conversation_sessions enable row level security;
alter table public.conversation_messages enable row level security;

create or replace function public.find_job_candidates(p_job_id uuid,p_limit integer default 5)
returns table(handyman_id uuid,score numeric,remaining_free_opportunities integer,has_pro_access boolean)
language sql security definer set search_path=pg_catalog,public as $$
with target_job as (
 select id,skill_id,city,suburb from public.jobs where id=p_job_id and status in ('open','matching')
), base as (
 select distinct h.id handyman_id,
 case when lower(coalesce(sa.suburb,''))=lower(coalesce(j.suburb,'')) and j.suburb is not null then 100 else 70 end::numeric score
 from target_job j join public.handyman_skills hs on hs.skill_id=j.skill_id
 join public.handymen h on h.id=hs.handyman_id and h.status='active'
 join public.service_areas sa on sa.handyman_id=h.id and lower(sa.city)=lower(j.city)
), usage as (
 select jm.handyman_id,count(*)::integer used from public.job_matches jm
 where jm.offered_at>=date_trunc('month',now()) group by jm.handyman_id
), access as (
 select b.handyman_id,b.score,
 exists(select 1 from public.entitlements e where e.handyman_id=b.handyman_id and e.entitlement_type='pro_access' and e.status='active'
 and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now())) has_pro_access,
 greatest(0,3-coalesce(u.used,0)) remaining_free_opportunities
 from base b left join usage u on u.handyman_id=b.handyman_id
)
select a.handyman_id,a.score,a.remaining_free_opportunities,a.has_pro_access from access a
where a.has_pro_access or a.remaining_free_opportunities>0
order by a.has_pro_access desc,a.score desc,a.handyman_id limit greatest(1,least(coalesce(p_limit,5),20)); $$;
revoke all on function public.find_job_candidates(uuid,integer) from public,anon,authenticated;
grant execute on function public.find_job_candidates(uuid,integer) to service_role;

create or replace function public.accept_job_match(p_match_id uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_job_id uuid; v_handyman_id uuid; v_assignment_id uuid;
begin
 select jm.job_id,jm.handyman_id into v_job_id,v_handyman_id from public.job_matches jm where jm.id=p_match_id and jm.status='offered' for update;
 if v_job_id is null then raise exception 'job match is not available'; end if;
 perform 1 from public.jobs j where j.id=v_job_id and j.status in ('open','matching') for update;
 if not found then raise exception 'job is no longer available'; end if;
 insert into public.job_assignments(job_id,handyman_id,accepted_match_id) values(v_job_id,v_handyman_id,p_match_id) returning id into v_assignment_id;
 update public.job_matches set status=case when id=p_match_id then 'accepted' else 'lost' end,
 responded_at=case when id=p_match_id then now() else responded_at end where job_id=v_job_id and status='offered';
 update public.jobs set status='assigned',updated_at=now() where id=v_job_id;
 return v_assignment_id;
exception when unique_violation then raise exception 'job has already been assigned'; end; $$;
revoke all on function public.accept_job_match(uuid) from public,anon,authenticated;
grant execute on function public.accept_job_match(uuid) to service_role;
