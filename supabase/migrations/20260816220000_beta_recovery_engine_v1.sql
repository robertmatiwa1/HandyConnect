create or replace function public.beta_detect_stalled_journeys(p_threshold interval default interval '30 minutes')
returns table(newly_detected integer, resolved integer)
language plpgsql
set search_path=pg_catalog,public
as $$
declare
  v_new integer := 0;
  v_resolved integer := 0;
begin
  insert into public.beta_stalled_journeys(session_id,external_user_id,flow,state,stalled_since,detected_at,updated_at)
  select s.id,s.external_user_id,s.flow,s.state,s.updated_at,now(),now()
  from public.conversation_sessions s
  where s.status='active'
    and s.flow in ('customer_onboarding','handyman_onboarding','job_intake')
    and s.updated_at <= now() - p_threshold
  on conflict (session_id) do update
    set external_user_id=excluded.external_user_id,
        flow=excluded.flow,
        state=excluded.state,
        stalled_since=excluded.stalled_since,
        resolved_at=null,
        resolution=null,
        updated_at=now()
    where public.beta_stalled_journeys.resolved_at is not null
       or public.beta_stalled_journeys.flow is distinct from excluded.flow
       or public.beta_stalled_journeys.state is distinct from excluded.state;
  get diagnostics v_new = row_count;

  with progressed as (
    update public.beta_stalled_journeys j
    set resolved_at=now(), resolution='journey_progressed', updated_at=now()
    from public.conversation_sessions s
    where j.session_id=s.id and j.resolved_at is null
      and (s.status <> 'active'
        or s.flow not in ('customer_onboarding','handyman_onboarding','job_intake')
        or s.updated_at > j.stalled_since)
    returning j.external_user_id,j.flow,j.state,j.session_id
  ), resumed as (
    insert into public.beta_funnel_events(channel,external_user_id,event_name,flow,state,metadata)
    select 'whatsapp',p.external_user_id,'journey_resumed',p.flow,p.state,
           jsonb_build_object('origin','beta_stalled_journeys','session_id',p.session_id)
    from progressed p
    returning 1
  )
  select count(*) into v_resolved from progressed;

  insert into public.beta_funnel_events(channel,external_user_id,event_name,flow,state,metadata)
  select 'whatsapp',j.external_user_id,'journey_stalled',j.flow,j.state,
         jsonb_build_object('origin','beta_stalled_journeys','stalled_since',j.stalled_since,'session_id',j.session_id)
  from public.beta_stalled_journeys j
  where j.resolved_at is null
    and j.detected_at >= now() - interval '15 seconds'
    and not exists (
      select 1 from public.beta_funnel_events e
      where e.event_name='journey_stalled' and e.external_user_id=j.external_user_id
        and e.flow=j.flow and e.state=j.state
        and e.occurred_at >= j.stalled_since
    );

  return query select v_new,v_resolved;
end $$;

create or replace function public.beta_queue_recovery_nudges(
  p_min_age interval default interval '30 minutes',
  p_max_age interval default interval '24 hours'
)
returns integer
language plpgsql
set search_path=pg_catalog,public
as $$
declare
  v_count integer := 0;
begin
  perform * from public.beta_detect_stalled_journeys(p_min_age);

  with eligible as (
    select j.session_id,j.external_user_id,j.flow,j.state,j.stalled_since,
      case
        when j.flow='handyman_onboarding' and j.state='capture_location' then
          'Your HandyConnect provider registration is saved. Reply with the suburb/city where you work (for example: Claremont Cape Town) to continue.'
        when j.flow='handyman_onboarding' and j.state='confirm_terms' then
          'You’re almost done joining HandyConnect. Your provider details are saved. Reply here to continue and accept the Terms.'
        when j.flow='customer_onboarding' and j.state='customer_name' then
          'Your HandyConnect request is still saved. Reply with the name you want us to use for the request and we’ll continue from there.'
        when j.flow='job_intake' and j.state ilike '%location%' then
          'Your HandyConnect job request is still saved. Reply with the job suburb and city (for example: Langa Cape Town) and we’ll continue from there.'
        when j.flow='job_intake' then
          'You started a HandyConnect job request but didn’t finish. Your progress is saved — reply here to continue where you left off.'
        when j.flow='customer_onboarding' then
          'You started setting up HandyConnect but didn’t finish. Your progress is saved — reply here to continue where you left off.'
        else
          'You’re almost done setting up your HandyConnect provider profile. Your progress is saved — reply here to continue where you left off.'
      end as body
    from public.beta_stalled_journeys j
    where j.resolved_at is null
      and j.reminder_count=0
      and j.last_reminded_at is null
      and j.stalled_since <= now()-p_min_age
      and j.stalled_since >= now()-p_max_age
      and j.external_user_id ~ '^27[0-9]{9}$'
  ), queued as (
    insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
    select e.external_user_id,'beta_recovery_nudge',e.body,
           jsonb_build_object('session_id',e.session_id,'flow',e.flow,'state',e.state,'stalled_since',e.stalled_since),
           'beta-recovery:'||e.session_id::text||':'||e.flow||':'||e.state
    from eligible e
    on conflict (dedupe_key) do nothing
    returning dedupe_key
  ), touched as (
    update public.beta_stalled_journeys j
    set last_reminded_at=now(), reminder_count=reminder_count+1, updated_at=now()
    where exists (
      select 1 from queued q
      where q.dedupe_key='beta-recovery:'||j.session_id::text||':'||j.flow||':'||j.state
    )
    returning 1
  )
  select count(*) into v_count from touched;

  return v_count;
end $$;

revoke all on function public.beta_detect_stalled_journeys(interval) from public,anon,authenticated;
revoke all on function public.beta_queue_recovery_nudges(interval,interval) from public,anon,authenticated;

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='handyconnect-beta-recovery-v1';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule('handyconnect-beta-recovery-v1','*/10 * * * *','select public.beta_queue_recovery_nudges();');
end $$;