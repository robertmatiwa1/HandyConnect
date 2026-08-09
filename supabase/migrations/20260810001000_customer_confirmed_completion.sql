alter table public.job_assignments
  add column if not exists completion_requested_at timestamptz,
  add column if not exists customer_completed_at timestamptz;

create or replace function public.complete_job_assignment(p_job_id uuid,p_handyman_phone text)
returns void language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_handyman_id uuid; v_customer_phone text; v_assignment_id uuid; begin
 select id into v_handyman_id from public.handymen where phone=p_handyman_phone and status='active';
 if v_handyman_id is null then raise exception 'handyman not found'; end if;
 update public.job_assignments set completion_requested_at=coalesce(completion_requested_at,now()) where job_id=p_job_id and handyman_id=v_handyman_id and cancelled_at is null and started_at is not null returning id into v_assignment_id;
 if v_assignment_id is null then raise exception 'active started assignment not found'; end if;
 select c.phone into v_customer_phone from public.jobs j join public.customers c on c.id=j.customer_id where j.id=p_job_id and j.status='in_progress';
 if v_customer_phone is null then raise exception 'job is not in progress'; end if;
 insert into public.job_events(job_id,event_type,actor_type,actor_id,metadata) values(p_job_id,'completion_requested','handyman',v_handyman_id,jsonb_build_object('assignment_id',v_assignment_id));
 insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_customer_phone,'completion_requested','Your handyman marked the work as finished. Please confirm only if the agreed work is complete. If there is a problem, report it instead.',jsonb_build_object('job_id',p_job_id,'ui',jsonb_build_object('type','buttons','body','Is the agreed work complete?','buttons',jsonb_build_array(jsonb_build_object('id','CONFIRM_COMPLETE:'||p_job_id::text,'title','Confirm complete'),jsonb_build_object('id','REPORT_JOB:'||p_job_id::text,'title','Report a problem')))),'completion-request:'||v_assignment_id::text) on conflict(dedupe_key) do nothing;
end $$;

create or replace function public.confirm_job_completion(p_job_id uuid,p_customer_phone text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare v_customer_id uuid; v_handyman_id uuid; v_assignment_id uuid; begin
 select j.customer_id,a.handyman_id,a.id into v_customer_id,v_handyman_id,v_assignment_id from public.jobs j join public.customers c on c.id=j.customer_id join public.job_assignments a on a.job_id=j.id where j.id=p_job_id and c.phone=p_customer_phone and j.status='in_progress' and a.cancelled_at is null and a.completion_requested_at is not null for update of j,a;
 if v_assignment_id is null then return jsonb_build_object('ok',false); end if;
 update public.job_assignments set customer_completed_at=coalesce(customer_completed_at,now()),completed_at=coalesce(completed_at,now()) where id=v_assignment_id;
 update public.jobs set status='completed',updated_at=now() where id=p_job_id;
 update public.handymen set completed_jobs=completed_jobs+1,availability_status='available',available_until=now()+interval '8 hours',last_active_at=now() where id=v_handyman_id;
 insert into public.job_events(job_id,event_type,actor_type,actor_id,metadata) values(p_job_id,'completion_confirmed','customer',v_customer_id,jsonb_build_object('assignment_id',v_assignment_id));
 insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key) select h.phone,'job_completed','The customer confirmed the job as complete. Thank you.',jsonb_build_object('job_id',p_job_id),'completion-confirmed:'||v_assignment_id::text from public.handymen h where h.id=v_handyman_id on conflict(dedupe_key) do nothing;
 return jsonb_build_object('ok',true,'message','Job completed. Thank you. Please rate the handyman based on the service you received.'); end $$;

revoke all on function public.confirm_job_completion(uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_job_completion(uuid,text) to service_role;