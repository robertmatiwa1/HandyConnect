alter table public.job_assignments add column if not exists scheduled_arrival_at timestamptz, add column if not exists eta_updated_at timestamptz;

create or replace function public.set_assignment_eta(p_job_id uuid,p_handyman_phone text,p_minutes integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_a public.job_assignments%rowtype; v_customer_phone text; v_when timestamptz; v_old timestamptz; begin
 if p_minutes not in (30,60,120,240,480,1440) then return jsonb_build_object('ok',false,'reason','invalid_eta'); end if;
 select a.* into v_a from public.job_assignments a join public.handymen h on h.id=a.handyman_id join public.jobs j on j.id=a.job_id where a.job_id=p_job_id and h.phone=p_handyman_phone and a.cancelled_at is null and j.status='assigned' for update;
 if v_a.id is null then return jsonb_build_object('ok',false,'reason','assignment_not_found'); end if;
 v_old:=v_a.scheduled_arrival_at; v_when:=now()+make_interval(mins=>p_minutes);
 update public.job_assignments set scheduled_arrival_at=v_when,eta_updated_at=now() where id=v_a.id;
 select c.phone into v_customer_phone from public.jobs j join public.customers c on c.id=j.customer_id where j.id=p_job_id;
 insert into public.job_events(job_id,event_type,actor_type,actor_id,metadata) values(p_job_id,case when v_old is null then 'eta_set' else 'eta_updated' end,'handyman',v_a.handyman_id,jsonb_build_object('scheduled_arrival_at',v_when,'previous_arrival_at',v_old));
 if v_customer_phone is not null then
   insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
   values(v_customer_phone,'arrival_eta',case when v_old is null then 'Your handyman has set an arrival time for ' else 'Your handyman has updated the arrival time to ' end || to_char(v_when at time zone 'Africa/Johannesburg','Dy DD Mon, HH24:MI') || '.',jsonb_build_object('job_id',p_job_id,'scheduled_arrival_at',v_when),'eta:'||v_a.id::text||':'||extract(epoch from v_when)::bigint::text)
   on conflict(dedupe_key) do nothing;
 end if;
 return jsonb_build_object('ok',true,'scheduled_arrival_at',v_when,'message','Arrival time saved for '||to_char(v_when at time zone 'Africa/Johannesburg','Dy DD Mon, HH24:MI')||'. The customer has been notified.');
end $$;

create or replace function public.prompt_assignment_eta()
returns trigger language plpgsql security definer set search_path=public as $$ declare v_phone text; begin
 select phone into v_phone from public.handymen where id=new.handyman_id;
 if v_phone is not null then
   insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
   values(v_phone,'set_arrival_eta','When can you get to this customer? Set an arrival estimate so they know when to expect you.',jsonb_build_object('job_id',new.job_id,'ui',jsonb_build_object('type','list','body','When can you arrive?','button','Set arrival time','rows',jsonb_build_array(jsonb_build_object('id','ETA:'||new.job_id::text||':30','title','About 30 minutes'),jsonb_build_object('id','ETA:'||new.job_id::text||':60','title','About 1 hour'),jsonb_build_object('id','ETA:'||new.job_id::text||':120','title','About 2 hours'),jsonb_build_object('id','ETA:'||new.job_id::text||':240','title','About 4 hours'),jsonb_build_object('id','ETA:'||new.job_id::text||':480','title','Later today'),jsonb_build_object('id','ETA:'||new.job_id::text||':1440','title','About 24 hours')))),'eta-prompt:'||new.id::text)
   on conflict(dedupe_key) do nothing;
 end if; return new; end $$;

drop trigger if exists trg_prompt_assignment_eta on public.job_assignments;
create trigger trg_prompt_assignment_eta after insert on public.job_assignments for each row execute function public.prompt_assignment_eta();

create or replace view public.assignment_schedule_ops as
select j.id job_id,j.description,j.status,a.id assignment_id,a.assigned_at,a.scheduled_arrival_at,a.eta_updated_at,a.arrived_at,a.started_at,h.id handyman_id,h.full_name handyman_name,h.phone handyman_phone,c.phone customer_phone
from public.jobs j join public.job_assignments a on a.job_id=j.id and a.cancelled_at is null join public.handymen h on h.id=a.handyman_id join public.customers c on c.id=j.customer_id;

revoke all on function public.set_assignment_eta(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.set_assignment_eta(uuid,text,integer) to service_role;
