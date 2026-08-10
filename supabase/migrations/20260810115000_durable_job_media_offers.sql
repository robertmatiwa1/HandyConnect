-- Durable job media is archived into the private job-media bucket by job-intake-router.
-- These functions ensure both availability-triggered and scheduled re-matching offers
-- are delivered through the notification outbox, whose dispatcher creates a fresh
-- short-lived signed URL for the archived attachment from job_attachments.storage_path.

create or replace function public.offer_waiting_jobs_to_handyman(p_phone text, p_limit integer default 5)
returns table(match_id uuid, job_id uuid, description text, suburb text, city text, skill_name text)
language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_handyman_id uuid; v_has_pro boolean; v_used integer; v_remaining integer; v_row record; begin
 select h.id into v_handyman_id from public.handymen h where h.phone=p_phone and h.status='active' and h.availability_status='available' and (h.available_until is null or h.available_until>now());
 if v_handyman_id is null then return; end if;
 select exists(select 1 from public.entitlements e where e.handyman_id=v_handyman_id and e.entitlement_type='pro_access' and e.status='active' and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now())) into v_has_pro;
 select count(*)::integer into v_used from public.job_matches jm where jm.handyman_id=v_handyman_id and jm.offered_at>=date_trunc('month',now());
 v_remaining:=greatest(0,3-coalesce(v_used,0)); if not v_has_pro and v_remaining<=0 then return; end if;
 for v_row in
  with eligible as (
   select distinct j.id job_id,j.description,j.suburb,j.city,j.urgency,j.appointment_window,j.materials_status,s.name skill_name,
    case when lower(coalesce(sa.suburb,''))=lower(coalesce(j.suburb,'')) and j.suburb is not null then 100 else 70 end score
   from public.jobs j join public.skills s on s.id=j.skill_id join public.handyman_skills hs on hs.handyman_id=v_handyman_id and hs.skill_id=j.skill_id join public.service_areas sa on sa.handyman_id=v_handyman_id and lower(sa.city)=lower(j.city)
   where j.status in('open','matching') and not exists(select 1 from public.job_matches x where x.job_id=j.id and x.handyman_id=v_handyman_id)
   order by score desc,j.created_at asc limit greatest(1,least(case when v_has_pro then coalesce(p_limit,5) else least(coalesce(p_limit,5),v_remaining) end,10))
  ), inserted as (
   insert into public.job_matches(job_id,handyman_id,match_score,status,offer_expires_at)
   select e.job_id,v_handyman_id,e.score,'offered',now()+interval '10 minutes' from eligible e on conflict(job_id,handyman_id) do nothing returning id,job_id
  ) select i.id match_id,e.* from inserted i join eligible e on e.job_id=i.job_id
 loop
  insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
  values(p_phone,'job_offer',format('New %s job: %s\nLocation: %s, %s\nUrgency: %s\nPreferred time: %s\nMaterials: %s',v_row.skill_name,v_row.description,v_row.suburb,v_row.city,coalesce(v_row.urgency,'flexible'),coalesce(v_row.appointment_window,'any_time'),coalesce(v_row.materials_status,'unsure')),
   jsonb_build_object('job_id',v_row.job_id,'match_id',v_row.match_id,'ui',jsonb_build_object('type','buttons','body','Are you available for this job?','buttons',jsonb_build_array(jsonb_build_object('id','ACCEPT:'||v_row.match_id::text,'title','Accept'),jsonb_build_object('id','DECLINE:'||v_row.match_id::text,'title','Decline'),jsonb_build_object('id','MY_JOBS','title','My jobs')))),
   'job-offer:'||v_row.match_id::text) on conflict(dedupe_key) do nothing;
 end loop;
 return;
end $$;

create or replace function public.dispatch_marketplace_tick(p_job_limit integer default 25)
returns table(jobs_checked integer,offers_created integer,notifications_queued integer)
language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_job record; v_match record; v_customer_phone text; v_skill_name text; v_batch_size integer; v_offers integer:=0; v_notifs integer:=0; v_jobs integer:=0; v_inserted integer; begin
 update public.handymen set availability_status='offline',available_until=null,updated_at=now() where availability_status='available' and available_until is not null and available_until<=now();
 update public.job_matches set status='expired',responded_at=coalesce(responded_at,now()) where status='offered' and offer_expires_at is not null and offer_expires_at<=now();
 for v_job in select j.* from public.jobs j where j.status in('open','matching') and coalesce(j.next_match_at,j.created_at)<=now() order by j.created_at limit greatest(1,least(coalesce(p_job_limit,25),100)) for update skip locked loop
  v_jobs:=v_jobs+1; v_batch_size:=case when v_job.escalation_level<=0 then 2 when v_job.escalation_level=1 then 3 else 5 end;
  select c.phone into v_customer_phone from public.customers c where c.id=v_job.customer_id; select s.name into v_skill_name from public.skills s where s.id=v_job.skill_id; v_inserted:=0;
  for v_match in with candidates as (select c.handyman_id,c.score from public.find_job_candidates(v_job.id,v_batch_size*3)c where not exists(select 1 from public.job_matches old where old.job_id=v_job.id and old.handyman_id=c.handyman_id) order by c.score desc limit v_batch_size),ins as (insert into public.job_matches(job_id,handyman_id,match_score,status,offer_expires_at) select v_job.id,c.handyman_id,c.score,'offered',now()+interval '10 minutes' from candidates c on conflict(job_id,handyman_id) do nothing returning id,handyman_id) select i.id match_id,i.handyman_id,h.phone from ins i join public.handymen h on h.id=i.handyman_id loop
   v_inserted:=v_inserted+1; v_offers:=v_offers+1;
   insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
   values(v_match.phone,'job_offer',format('New %s job: %s\nLocation: %s, %s\nUrgency: %s\nPreferred time: %s\nMaterials: %s',coalesce(v_skill_name,'HandyConnect'),v_job.description,v_job.suburb,v_job.city,coalesce(v_job.urgency,'flexible'),coalesce(v_job.appointment_window,'any_time'),coalesce(v_job.materials_status,'unsure')),
    jsonb_build_object('ui',jsonb_build_object('type','buttons','body','Are you available for this job?','buttons',jsonb_build_array(jsonb_build_object('id','ACCEPT:'||v_match.match_id::text,'title','Accept'),jsonb_build_object('id','DECLINE:'||v_match.match_id::text,'title','Decline'),jsonb_build_object('id','MY_JOBS','title','My jobs'))),'job_id',v_job.id,'match_id',v_match.match_id),
    'job-offer:'||v_match.match_id::text) on conflict(dedupe_key) do nothing; if found then v_notifs:=v_notifs+1; end if;
  end loop;
  update public.jobs set match_attempt_count=match_attempt_count+1,escalation_level=escalation_level+1,last_match_attempt_at=now(),next_match_at=now()+case when escalation_level<=0 then interval '5 minutes' when escalation_level=1 then interval '10 minutes' when escalation_level=2 then interval '20 minutes' else interval '30 minutes' end,status='matching',updated_at=now() where id=v_job.id;
  insert into public.job_events(job_id,event_type,metadata) values(v_job.id,'matching_attempt',jsonb_build_object('new_offers',v_inserted,'level',v_job.escalation_level+1));
  if v_inserted=0 and v_customer_phone is not null and v_job.escalation_level in(1,3) then insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_customer_phone,'matching_update',case when v_job.escalation_level=1 then 'We are still looking for a suitable handyman for your request. Your job remains active and the search is continuing.' else 'Your request is still active. We have not found a suitable available handyman yet, but we will keep searching automatically.' end,jsonb_build_object('job_id',v_job.id),'matching-update:'||v_job.id::text||':'||(v_job.escalation_level+1)::text) on conflict(dedupe_key) do nothing; if found then v_notifs:=v_notifs+1; end if; end if;
 end loop; return query select v_jobs,v_offers,v_notifs; end $$;