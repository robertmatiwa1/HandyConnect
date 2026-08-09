alter table public.job_assignments add column if not exists arrived_at timestamptz, add column if not exists customer_start_confirmed_at timestamptz;

create or replace function public.mark_handyman_arrived(p_job_id uuid,p_handyman_phone text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_a job_assignments%rowtype; v_customer_phone text; begin
 select a.* into v_a from job_assignments a join handymen h on h.id=a.handyman_id where a.job_id=p_job_id and h.phone=p_handyman_phone and a.cancelled_at is null for update;
 if v_a.id is null then return jsonb_build_object('ok',false); end if;
 if v_a.started_at is not null then return jsonb_build_object('ok',true,'already_started',true); end if;
 update job_assignments set arrived_at=coalesce(arrived_at,now()) where id=v_a.id;
 select c.phone into v_customer_phone from jobs j join customers c on c.id=j.customer_id where j.id=p_job_id;
 insert into job_events(job_id,event_type,actor_type,actor_id,metadata) values(p_job_id,'handyman_arrived','handyman',v_a.handyman_id,'{}'::jsonb);
 if v_customer_phone is not null then insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_customer_phone,'handyman_arrived','Your handyman says they have arrived. Please confirm only when they are physically with you and ready to begin.',jsonb_build_object('job_id',p_job_id,'ui',jsonb_build_object('type','buttons','body','Has the handyman arrived and is ready to start?','buttons',jsonb_build_array(jsonb_build_object('id','CONFIRM_START:'||p_job_id::text,'title','Confirm & start'),jsonb_build_object('id','ISSUE:handyman_no_show:'||p_job_id::text,'title','Not here')))),'arrival:'||v_a.id::text) on conflict(dedupe_key) do nothing; end if;
 return jsonb_build_object('ok',true,'message','Arrival recorded. The customer has been asked to confirm before work starts.'); end $$;

create or replace function public.confirm_job_start(p_job_id uuid,p_customer_phone text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_a job_assignments%rowtype; v_handyman_phone text; begin
 select a.* into v_a from job_assignments a join jobs j on j.id=a.job_id join customers c on c.id=j.customer_id where a.job_id=p_job_id and c.phone=p_customer_phone and a.cancelled_at is null for update;
 if v_a.id is null then return jsonb_build_object('ok',false); end if;
 if v_a.arrived_at is null then return jsonb_build_object('ok',false,'reason','arrival_not_recorded'); end if;
 update job_assignments set customer_start_confirmed_at=coalesce(customer_start_confirmed_at,now()),started_at=coalesce(started_at,now()) where id=v_a.id;
 update jobs set status='in_progress',updated_at=now() where id=p_job_id and status='assigned';
 select h.phone into v_handyman_phone from handymen h where h.id=v_a.handyman_id;
 insert into job_events(job_id,event_type,actor_type,metadata) values(p_job_id,'start_confirmed','customer',jsonb_build_object('assignment_id',v_a.id));
 if v_handyman_phone is not null then insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_handyman_phone,'job_started','The customer confirmed your arrival. The job is now officially in progress.',jsonb_build_object('job_id',p_job_id),'start-confirmed:'||v_a.id::text) on conflict(dedupe_key) do nothing; end if;
 return jsonb_build_object('ok',true,'message','Confirmed. The job is now in progress.'); end $$;

revoke all on function public.mark_handyman_arrived(uuid,text) from public,anon,authenticated;
revoke all on function public.confirm_job_start(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_handyman_arrived(uuid,text),public.confirm_job_start(uuid,text) to service_role;