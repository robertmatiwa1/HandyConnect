create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.jobs add column if not exists next_match_at timestamptz;
alter table public.jobs add column if not exists escalation_level integer not null default 0;
alter table public.job_matches add column if not exists offer_expires_at timestamptz;

update public.jobs
set next_match_at = coalesce(next_match_at, now())
where status in ('open','matching');

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'system',
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_events_job_created on public.job_events(job_id,created_at desc);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_phone text not null,
  kind text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  dedupe_key text unique,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_outbox_pending
on public.notification_outbox(status,next_attempt_at,created_at)
where status in ('pending','processing');

alter table public.job_events enable row level security;
alter table public.notification_outbox enable row level security;

create or replace function public.dispatch_marketplace_tick(p_job_limit integer default 25)
returns table(jobs_checked integer, offers_created integer, notifications_queued integer)
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_job record;
  v_match record;
  v_customer_phone text;
  v_skill_name text;
  v_batch_size integer;
  v_offers integer := 0;
  v_notifs integer := 0;
  v_jobs integer := 0;
  v_inserted integer;
begin
  update public.handymen
  set availability_status='offline', available_until=null, updated_at=now()
  where availability_status='available' and available_until is not null and available_until <= now();

  update public.job_matches
  set status='expired', responded_at=coalesce(responded_at,now())
  where status='offered' and offer_expires_at is not null and offer_expires_at <= now();

  for v_job in
    select j.*
    from public.jobs j
    where j.status in ('open','matching')
      and coalesce(j.next_match_at,j.created_at) <= now()
    order by j.created_at
    limit greatest(1,least(coalesce(p_job_limit,25),100))
    for update skip locked
  loop
    v_jobs := v_jobs + 1;
    v_batch_size := case when v_job.escalation_level <= 0 then 2 when v_job.escalation_level = 1 then 3 else 5 end;

    select c.phone into v_customer_phone from public.customers c where c.id=v_job.customer_id;
    select s.name into v_skill_name from public.skills s where s.id=v_job.skill_id;

    v_inserted := 0;
    for v_match in
      with candidates as (
        select c.handyman_id,c.score
        from public.find_job_candidates(v_job.id, v_batch_size * 3) c
        where not exists (
          select 1 from public.job_matches old
          where old.job_id=v_job.id and old.handyman_id=c.handyman_id
        )
        order by c.score desc
        limit v_batch_size
      ), ins as (
        insert into public.job_matches(job_id,handyman_id,match_score,status,offer_expires_at)
        select v_job.id,c.handyman_id,c.score,'offered',now()+interval '10 minutes'
        from candidates c
        on conflict(job_id,handyman_id) do nothing
        returning id,handyman_id
      )
      select i.id as match_id,i.handyman_id,h.phone,h.full_name
      from ins i join public.handymen h on h.id=i.handyman_id
    loop
      v_inserted := v_inserted + 1;
      v_offers := v_offers + 1;
      insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
      values(
        v_match.phone,
        'job_offer',
        format('New %s job: %s\nLocation: %s, %s',coalesce(v_skill_name,'HandyConnect'),v_job.description,v_job.suburb,v_job.city),
        jsonb_build_object('ui',jsonb_build_object('type','buttons','body','Are you available for this job?','buttons',jsonb_build_array(
          jsonb_build_object('id','ACCEPT:'||v_match.match_id::text,'title','Accept'),
          jsonb_build_object('id','DECLINE:'||v_match.match_id::text,'title','Decline'),
          jsonb_build_object('id','MY_JOBS','title','My jobs')
        )),'job_id',v_job.id,'match_id',v_match.match_id),
        'job-offer:'||v_match.match_id::text
      ) on conflict(dedupe_key) do nothing;
      if found then v_notifs := v_notifs + 1; end if;
    end loop;

    update public.jobs
    set match_attempt_count=match_attempt_count+1,
        escalation_level=escalation_level+1,
        last_match_attempt_at=now(),
        next_match_at=now() + case
          when escalation_level <= 0 then interval '5 minutes'
          when escalation_level = 1 then interval '10 minutes'
          when escalation_level = 2 then interval '20 minutes'
          else interval '30 minutes'
        end,
        status='matching',
        updated_at=now()
    where id=v_job.id;

    insert into public.job_events(job_id,event_type,metadata)
    values(v_job.id,'matching_attempt',jsonb_build_object('new_offers',v_inserted,'level',v_job.escalation_level+1));

    if v_inserted=0 and v_customer_phone is not null and v_job.escalation_level in (1,3) then
      insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
      values(
        v_customer_phone,
        'matching_update',
        case when v_job.escalation_level=1
          then 'We are still looking for a suitable handyman for your request. Your job remains active and the search is continuing.'
          else 'Your request is still active. We have not found a suitable available handyman yet, but we will keep searching automatically.' end,
        jsonb_build_object('job_id',v_job.id),
        'matching-update:'||v_job.id::text||':'||(v_job.escalation_level+1)::text
      ) on conflict(dedupe_key) do nothing;
      if found then v_notifs := v_notifs + 1; end if;
    end if;
  end loop;

  return query select v_jobs,v_offers,v_notifs;
end;
$$;

create or replace function public.claim_notification_batch(p_limit integer default 50)
returns table(id uuid,recipient_phone text,kind text,body text,payload jsonb)
language sql
security definer
set search_path=pg_catalog,public
as $$
  with picked as (
    select n.id from public.notification_outbox n
    where n.status='pending' and n.next_attempt_at<=now()
    order by n.created_at
    limit greatest(1,least(coalesce(p_limit,50),100))
    for update skip locked
  ), upd as (
    update public.notification_outbox n
    set status='processing',attempts=attempts+1
    from picked p where n.id=p.id
    returning n.id,n.recipient_phone,n.kind,n.body,n.payload
  )
  select * from upd;
$$;

create or replace function public.finish_notification(p_id uuid,p_success boolean,p_error text default null)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if p_success then
    update public.notification_outbox set status='sent',sent_at=now(),last_error=null where id=p_id;
  else
    update public.notification_outbox
    set status=case when attempts>=3 then 'failed' else 'pending' end,
        next_attempt_at=now()+make_interval(mins=>least(30,greatest(1,attempts*5))),
        last_error=left(coalesce(p_error,'send failed'),1000)
    where id=p_id;
  end if;
end;
$$;

revoke all on function public.dispatch_marketplace_tick(integer) from public,anon,authenticated;
revoke all on function public.claim_notification_batch(integer) from public,anon,authenticated;
revoke all on function public.finish_notification(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.dispatch_marketplace_tick(integer) to service_role;
grant execute on function public.claim_notification_batch(integer) to service_role;
grant execute on function public.finish_notification(uuid,boolean,text) to service_role;
