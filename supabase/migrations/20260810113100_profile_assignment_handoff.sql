create or replace function public.accept_job_match(p_match_id uuid)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_job_id uuid;v_handyman_id uuid;v_assignment_id uuid;v_customer_id uuid;v_customer_name text;v_customer_phone text;v_handyman_name text;v_handyman_phone text;v_description text;v_suburb text;v_city text;v_rating numeric;v_completed integer;v_verified text;v_reliability integer;v_years integer;
begin
 select jm.job_id,jm.handyman_id into v_job_id,v_handyman_id from public.job_matches jm where jm.id=p_match_id and jm.status='offered' for update;
 if v_job_id is null then raise exception 'job match is not available'; end if;
 select j.customer_id,j.description,j.suburb,j.city into v_customer_id,v_description,v_suburb,v_city from public.jobs j where j.id=v_job_id and j.status in('open','matching') for update;
 if not found then raise exception 'job is no longer available'; end if;
 insert into public.job_assignments(job_id,handyman_id,accepted_match_id) values(v_job_id,v_handyman_id,p_match_id) returning id into v_assignment_id;
 update public.job_matches set status=case when id=p_match_id then 'accepted' else 'lost' end,responded_at=case when id=p_match_id then now() else responded_at end where job_id=v_job_id and status='offered';
 update public.jobs set status='assigned',updated_at=now() where id=v_job_id;
 select full_name,phone into v_customer_name,v_customer_phone from public.customers where id=v_customer_id;
 select full_name,phone,average_rating,completed_jobs,verification_status,reliability_score,years_experience into v_handyman_name,v_handyman_phone,v_rating,v_completed,v_verified,v_reliability,v_years from public.handymen where id=v_handyman_id;
 if v_customer_phone is not null then
  insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(
   v_customer_phone,'job_assigned',format('%s accepted your HandyConnect job.\n\nVerified: %s\nRating: %s/5\nCompleted jobs: %s\nExperience: %s\nReliability: %s/100\n\nContact: %s\nJob: %s\nLocation: %s, %s.',coalesce(v_handyman_name,'Your handyman'),case when v_verified='verified' then 'Yes ✓' else 'No' end,coalesce(v_rating,0),coalesce(v_completed,0),case when v_years is null then 'Not stated' else v_years::text||' years' end,coalesce(v_reliability,100),v_handyman_phone,v_description,coalesce(v_suburb,''),coalesce(v_city,'')),
   jsonb_build_object('job_id',v_job_id,'assignment_id',v_assignment_id,'ui',jsonb_build_object('type','buttons','body','View the assigned handyman profile or check your job.','buttons',jsonb_build_array(jsonb_build_object('id','PROVIDER_PROFILE:'||v_job_id::text,'title','View provider'),jsonb_build_object('id','JOB_STATUS:'||v_job_id::text,'title','Job status')))),
   'assignment-customer:'||v_assignment_id::text) on conflict(dedupe_key) do nothing;
 end if;
 if v_handyman_phone is not null then
  insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_handyman_phone,'job_assigned',format('Job confirmed. Customer: %s. Contact: %s. Job: %s. Location: %s, %s.',coalesce(v_customer_name,'Customer'),v_customer_phone,v_description,coalesce(v_suburb,''),coalesce(v_city,'')),jsonb_build_object('job_id',v_job_id,'assignment_id',v_assignment_id,'customer_name',v_customer_name,'customer_phone',v_customer_phone),'assignment-handyman:'||v_assignment_id::text) on conflict(dedupe_key) do nothing;
 end if;
 insert into public.job_events(job_id,event_type,actor_type,actor_id,metadata) values(v_job_id,'assigned','handyman',v_handyman_id,jsonb_build_object('assignment_id',v_assignment_id));
 return v_assignment_id;
exception when unique_violation then raise exception 'job has already been assigned';end $$;

insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
select h.phone,'profile_completion','Complete your HandyConnect provider profile so customers can see your experience and what you offer.',jsonb_build_object('ui',jsonb_build_object('type','buttons','body','Complete your provider profile','buttons',jsonb_build_array(jsonb_build_object('id','PROFILE_EDIT','title','Edit profile')))),'profile-completion:'||h.id::text
from public.handymen h where h.status='active' on conflict(dedupe_key) do nothing;