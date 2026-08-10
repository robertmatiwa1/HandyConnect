alter table public.job_assignments add column if not exists late_notified_at timestamptz, add column if not exists replacement_available_at timestamptz;

create or replace function public.refresh_handyman_reliability(p_handyman_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_score integer; v_no_show integer; v_cancel integer; v_flag text; v_until timestamptz;
begin
 select count(*) filter(where event_type in ('handyman_no_show','no_show')), count(*) filter(where event_type in ('handyman_cancel','cancel_after_assignment','late_replacement')) into v_no_show,v_cancel
 from reliability_events where subject_type='handyman' and subject_id=p_handyman_id and created_at>=now()-interval '90 days';
 v_score:=greatest(0,100-(v_no_show*30)-(v_cancel*10));
 v_flag:=case when v_score<50 then 'restricted' when v_score<80 then 'watch' else 'good' end;
 v_until:=case when v_score<50 then now()+interval '7 days' else null end;
 update handymen set reliability_score=v_score,reliability_flag=v_flag,reliability_restricted_until=v_until,updated_at=now() where id=p_handyman_id;
 return jsonb_build_object('handyman_id',p_handyman_id,'score',v_score,'flag',v_flag,'no_shows_90d',v_no_show,'cancellations_90d',v_cancel,'restricted_until',v_until);
end $$;

create or replace function public.reconcile_late_arrivals()
returns integer language plpgsql security definer set search_path=public as $$
declare r record; n integer:=0; begin
 for r in select a.id,a.job_id,a.handyman_id,a.scheduled_arrival_at,c.phone customer_phone,h.phone handyman_phone
 from job_assignments a join jobs j on j.id=a.job_id join customers c on c.id=j.customer_id join handymen h on h.id=a.handyman_id
 where a.cancelled_at is null and a.arrived_at is null and j.status='assigned' and a.scheduled_arrival_at is not null and a.scheduled_arrival_at<=now() and a.late_notified_at is null
 loop
   update job_assignments set late_notified_at=now(),replacement_available_at=now()+interval '30 minutes' where id=r.id;
   insert into job_events(job_id,event_type,actor_type,metadata) values(r.job_id,'arrival_late','system',jsonb_build_object('scheduled_arrival_at',r.scheduled_arrival_at,'replacement_available_at',now()+interval '30 minutes'));
   insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(r.customer_phone,'arrival_late','Your handyman has not marked themselves as arrived by the promised time. If they are still not there after 30 minutes, you can request another handyman.',jsonb_build_object('job_id',r.job_id,'replacement_available_at',now()+interval '30 minutes'),'late-customer:'||r.id::text) on conflict(dedupe_key) do nothing;
   insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(r.handyman_phone,'arrival_late','Your promised arrival time has passed. Please update your ETA now, or the customer may request another handyman after 30 minutes.',jsonb_build_object('job_id',r.job_id),'late-handyman:'||r.id::text) on conflict(dedupe_key) do nothing;
   n:=n+1;
 end loop; return n; end $$;

create or replace function public.request_late_replacement(p_job_id uuid,p_customer_phone text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a job_assignments%rowtype; j jobs%rowtype; c customers%rowtype; h handymen%rowtype; begin
 select * into j from jobs where id=p_job_id for update; if j.id is null or j.status<>'assigned' then return jsonb_build_object('ok',false,'reason','job_not_assigned'); end if;
 select * into c from customers where id=j.customer_id; if c.phone<>p_customer_phone then return jsonb_build_object('ok',false,'reason','not_authorized'); end if;
 select * into a from job_assignments where job_id=p_job_id and cancelled_at is null for update; if a.id is null then return jsonb_build_object('ok',false,'reason','assignment_not_found'); end if;
 if a.arrived_at is not null then return jsonb_build_object('ok',false,'reason','already_arrived'); end if;
 if a.replacement_available_at is null or a.replacement_available_at>now() then return jsonb_build_object('ok',false,'reason','grace_period'); end if;
 select * into h from handymen where id=a.handyman_id;
 update job_assignments set cancelled_at=now() where id=a.id;
 update job_matches set status='lost',responded_at=coalesce(responded_at,now()) where id=a.accepted_match_id;
 update jobs set status='matching',next_match_at=now(),updated_at=now() where id=p_job_id;
 insert into reliability_events(job_id,subject_type,subject_id,event_type,actor_type,actor_id,metadata) values(p_job_id,'handyman',h.id,'late_replacement','customer',c.id,jsonb_build_object('scheduled_arrival_at',a.scheduled_arrival_at));
 perform refresh_handyman_reliability(h.id);
 insert into job_events(job_id,event_type,actor_type,actor_id,metadata) values(p_job_id,'late_replacement_requested','customer',c.id,jsonb_build_object('former_handyman_id',h.id));
 insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(h.phone,'assignment_replaced_for_lateness','The customer requested another handyman because the agreed arrival time passed and the grace period expired. This assignment has been released.',jsonb_build_object('job_id',p_job_id),'late-replaced:'||a.id::text) on conflict(dedupe_key) do nothing;
 return jsonb_build_object('ok',true,'reopened',true,'message','Your request has been reopened and HandyConnect is searching for another suitable handyman.');
end $$;

revoke all on function public.reconcile_late_arrivals() from public,anon,authenticated;
revoke all on function public.request_late_replacement(uuid,text) from public,anon,authenticated;
grant execute on function public.reconcile_late_arrivals(),public.request_late_replacement(uuid,text) to service_role;
select cron.unschedule(jobid) from cron.job where jobname='handyconnect-late-arrival-check';
select cron.schedule('handyconnect-late-arrival-check','*/5 * * * *','select public.reconcile_late_arrivals();');