create or replace function public.dispatch_marketplace_tick(p_job_limit integer default 25)
returns table(jobs_checked integer, offers_created integer, notifications_queued integer)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
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
  where availability_status='available'
    and available_until is not null
    and available_until<=now();

  update public.job_matches
  set status='expired', responded_at=coalesce(responded_at,now())
  where status='offered'
    and offer_expires_at is not null
    and offer_expires_at<=now();

  for v_job in
    select j.*
    from public.jobs j
    where j.status in('open','matching')
      and coalesce(j.next_match_at,j.created_at)<=now()
    order by j.created_at
    limit greatest(1,least(coalesce(p_job_limit,25),100))
    for update skip locked
  loop
    v_jobs := v_jobs + 1;
    v_batch_size := case
      when v_job.escalation_level<=0 then 2
      when v_job.escalation_level=1 then 3
      else 5
    end;

    select c.phone into v_customer_phone
    from public.customers c
    where c.id=v_job.customer_id;

    select s.name into v_skill_name
    from public.skills s
    where s.id=v_job.skill_id;

    v_inserted := 0;
    for v_match in
      with candidates as (
        select c.handyman_id,c.score
        from public.find_job_candidates(v_job.id,v_batch_size*3) c
        where not exists (
          select 1
          from public.job_matches old
          where old.job_id=v_job.id and old.handyman_id=c.handyman_id
        )
        order by c.score desc
        limit v_batch_size
      ), inserted as (
        insert into public.job_matches(job_id,handyman_id,match_score,status,offer_expires_at)
        select v_job.id,c.handyman_id,c.score,'offered',now()+interval '10 minutes'
        from candidates c
        on conflict(job_id,handyman_id) do nothing
        returning id,handyman_id
      )
      select i.id match_id,i.handyman_id,h.phone
      from inserted i
      join public.handymen h on h.id=i.handyman_id
    loop
      v_inserted := v_inserted + 1;
      v_offers := v_offers + 1;
      insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
      values(
        v_match.phone,
        'job_offer',
        format(
          'New %s job: %s\nLocation: %s, %s\nWhen: %s',
          coalesce(v_skill_name,'HandyConnect'),
          v_job.description,
          v_job.suburb,
          v_job.city,
          case
            when v_job.urgency='urgent' then 'As soon as possible'
            when v_job.urgency='today' then 'Today · '||replace(coalesce(v_job.appointment_window,'any time'),'_',' ')
            else 'Flexible'
          end
        ),
        jsonb_build_object(
          'ui',jsonb_build_object(
            'type','buttons',
            'body','Can you take this job?',
            'buttons',jsonb_build_array(
              jsonb_build_object('id','ACCEPT:'||v_match.match_id::text,'title','Accept'),
              jsonb_build_object('id','DECLINE:'||v_match.match_id::text,'title','Decline'),
              jsonb_build_object('id','MY_JOBS','title','My jobs')
            )
          ),
          'job_id',v_job.id,
          'match_id',v_match.match_id
        ),
        'job-offer:'||v_match.match_id::text
      )
      on conflict(dedupe_key) do nothing;
      if found then v_notifs := v_notifs + 1; end if;
    end loop;

    update public.jobs
    set match_attempt_count=match_attempt_count+1,
        escalation_level=escalation_level+1,
        last_match_attempt_at=now(),
        next_match_at=now()+case
          when escalation_level<=0 then interval '5 minutes'
          when escalation_level=1 then interval '10 minutes'
          when escalation_level=2 then interval '20 minutes'
          else interval '30 minutes'
        end,
        status='matching',
        updated_at=now()
    where id=v_job.id;

    insert into public.job_events(job_id,event_type,metadata)
    values(
      v_job.id,
      'matching_attempt',
      jsonb_build_object('new_offers',v_inserted,'level',v_job.escalation_level+1)
    );

    if v_inserted=0
      and v_customer_phone is not null
      and v_job.escalation_level=3
    then
      insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
      values(
        v_customer_phone,
        'matching_update',
        format(
          'We’re still looking for a verified handyman for “%s” in %s. Your request is active—you don’t need to keep checking.',
          v_job.description,
          v_job.suburb
        ),
        jsonb_build_object(
          'job_id',v_job.id,
          'ui',jsonb_build_object(
            'type','buttons',
            'body','Has anything changed?',
            'buttons',jsonb_build_array(
              jsonb_build_object('id','ADD_PHOTO:'||v_job.id::text,'title','Add photo'),
              jsonb_build_object('id','EDIT_JOB:'||v_job.id::text,'title','Edit request'),
              jsonb_build_object('id','CANCEL:'||v_job.id::text,'title','Cancel request')
            )
          )
        ),
        'matching-update:'||v_job.id::text||':useful'
      )
      on conflict(dedupe_key) do nothing;
      if found then v_notifs := v_notifs + 1; end if;
    end if;
  end loop;

  return query select v_jobs,v_offers,v_notifs;
end;
$$;

revoke all on function public.dispatch_marketplace_tick(integer) from public,anon,authenticated;
grant execute on function public.dispatch_marketplace_tick(integer) to service_role;
