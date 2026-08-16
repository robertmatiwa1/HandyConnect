create or replace function public.mark_handyman_arrived(p_job_id uuid, p_handyman_phone text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_a job_assignments%rowtype; v_customer_phone text;
begin
 select a.* into v_a from job_assignments a join handymen h on h.id=a.handyman_id where a.job_id=p_job_id and h.phone=p_handyman_phone and a.cancelled_at is null for update;
 if v_a.id is null then return jsonb_build_object('ok',false); end if;
 if v_a.started_at is not null then return jsonb_build_object('ok',true,'already_started',true,'replayed',true); end if;
 if v_a.arrived_at is not null then return jsonb_build_object('ok',true,'message','Arrival was already recorded. The customer has already been asked to confirm before work starts.','replayed',true); end if;
 update job_assignments set arrived_at=now() where id=v_a.id;
 select c.phone into v_customer_phone from jobs j join customers c on c.id=j.customer_id where j.id=p_job_id;
 insert into job_events(job_id,event_type,actor_type,actor_id,metadata) values(p_job_id,'handyman_arrived','handyman',v_a.handyman_id,'{}'::jsonb);
 if v_customer_phone is not null then insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_customer_phone,'handyman_arrived','Your handyman says they have arrived. Please confirm only when they are physically with you and ready to begin.',jsonb_build_object('job_id',p_job_id,'ui',jsonb_build_object('type','buttons','body','Has the handyman arrived and is ready to start?','buttons',jsonb_build_array(jsonb_build_object('id','CONFIRM_START:'||p_job_id::text,'title','Confirm & start'),jsonb_build_object('id','ISSUE:handyman_no_show:'||p_job_id::text,'title','Not here')))),'arrival:'||v_a.id::text) on conflict(dedupe_key) do nothing; end if;
 return jsonb_build_object('ok',true,'message','Arrival recorded. The customer has been asked to confirm before work starts.','replayed',false);
end $function$;

create or replace function public.confirm_job_start(p_job_id uuid, p_customer_phone text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_a job_assignments%rowtype; v_handyman_phone text; v_quote job_quotes%rowtype;
begin
 select a.* into v_a from job_assignments a join jobs j on j.id=a.job_id join customers c on c.id=j.customer_id where a.job_id=p_job_id and c.phone=p_customer_phone and a.cancelled_at is null for update;
 if v_a.id is null then return jsonb_build_object('ok',false); end if;
 if v_a.started_at is not null and v_a.customer_start_confirmed_at is not null then
   select * into v_quote from job_quotes where job_id=p_job_id and status='accepted' order by responded_at desc limit 1;
   return jsonb_build_object('ok',true,'message',case when v_quote.id is null then 'The job is already in progress.' else format('The job is already in progress at the agreed price of R%s.',trim(to_char(v_quote.amount,'FM999999990.00'))) end,'agreed_amount',v_quote.amount,'replayed',true);
 end if;
 if v_a.arrived_at is null then return jsonb_build_object('ok',false,'reason','arrival_not_recorded'); end if;
 select * into v_quote from job_quotes where job_id=p_job_id and status='accepted' order by responded_at desc limit 1;
 if v_quote.id is null then return jsonb_build_object('ok',false,'reason','quote_not_accepted'); end if;
 update job_assignments set customer_start_confirmed_at=coalesce(customer_start_confirmed_at,now()),started_at=coalesce(started_at,now()) where id=v_a.id;
 update jobs set status='in_progress',updated_at=now() where id=p_job_id and status='assigned';
 select h.phone into v_handyman_phone from handymen h where h.id=v_a.handyman_id;
 insert into job_events(job_id,event_type,actor_type,metadata) values(p_job_id,'start_confirmed','customer',jsonb_build_object('assignment_id',v_a.id,'quote_id',v_quote.id,'agreed_amount',v_quote.amount));
 if v_handyman_phone is not null then insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_handyman_phone,'job_started',format('The customer confirmed your arrival. The job is now in progress at the agreed price of R%s.',trim(to_char(v_quote.amount,'FM999999990.00'))),jsonb_build_object('job_id',p_job_id,'agreed_amount',v_quote.amount),'start-confirmed:'||v_a.id::text) on conflict(dedupe_key) do nothing; end if;
 return jsonb_build_object('ok',true,'message',format('Confirmed. The job is now in progress at the agreed price of R%s.',trim(to_char(v_quote.amount,'FM999999990.00'))),'agreed_amount',v_quote.amount,'replayed',false);
end $function$;

create or replace function public.complete_job_assignment(p_job_id uuid, p_handyman_phone text)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare v_handyman_id uuid; v_customer_phone text; v_assignment_id uuid; v_existing timestamptz;
begin
 select id into v_handyman_id from public.handymen where phone=p_handyman_phone and status='active';
 if v_handyman_id is null then raise exception 'handyman not found'; end if;
 select id,completion_requested_at into v_assignment_id,v_existing from public.job_assignments where job_id=p_job_id and handyman_id=v_handyman_id and cancelled_at is null and started_at is not null for update;
 if v_assignment_id is null then raise exception 'active started assignment not found'; end if;
 if v_existing is not null then return; end if;
 update public.job_assignments set completion_requested_at=now() where id=v_assignment_id;
 select c.phone into v_customer_phone from public.jobs j join public.customers c on c.id=j.customer_id where j.id=p_job_id and j.status='in_progress';
 if v_customer_phone is null then raise exception 'job is not in progress'; end if;
 insert into public.job_events(job_id,event_type,actor_type,actor_id,metadata) values(p_job_id,'completion_requested','handyman',v_handyman_id,jsonb_build_object('assignment_id',v_assignment_id));
 insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_customer_phone,'completion_requested','Your handyman marked the work as finished. Please confirm only if the agreed work is complete. If there is a problem, report it instead.',jsonb_build_object('job_id',p_job_id,'ui',jsonb_build_object('type','buttons','body','Is the agreed work complete?','buttons',jsonb_build_array(jsonb_build_object('id','CONFIRM_COMPLETE:'||p_job_id::text,'title','Confirm complete'),jsonb_build_object('id','REPORT_JOB:'||p_job_id::text,'title','Report a problem')))),'completion-request:'||v_assignment_id::text) on conflict(dedupe_key) do nothing;
end $function$;

create or replace function public.propose_job_quote(p_job_id uuid, p_handyman_phone text, p_amount numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_a job_assignments%rowtype; v_customer_id uuid; v_customer_phone text; v_quote_id uuid; v_existing job_quotes%rowtype; v_note text;
begin
 if p_amount is null or p_amount<=0 then return jsonb_build_object('ok',false,'reason','invalid_amount'); end if;
 v_note:=nullif(trim(p_note),'');
 select a.* into v_a from job_assignments a join handymen h on h.id=a.handyman_id where a.job_id=p_job_id and h.phone=p_handyman_phone and a.cancelled_at is null for update;
 if v_a.id is null then return jsonb_build_object('ok',false,'reason','assignment_not_found'); end if;
 if v_a.started_at is not null then return jsonb_build_object('ok',false,'reason','job_already_started'); end if;
 select * into v_existing from job_quotes where job_id=p_job_id and status='proposed' order by proposed_at desc limit 1 for update;
 if v_existing.id is not null and v_existing.amount=p_amount and coalesce(v_existing.note,'')=coalesce(v_note,'') then
   return jsonb_build_object('ok',true,'quote_id',v_existing.id,'amount',v_existing.amount,'message','This quote is already awaiting customer approval.','replayed',true);
 end if;
 select j.customer_id,c.phone into v_customer_id,v_customer_phone from jobs j join customers c on c.id=j.customer_id where j.id=p_job_id;
 update job_quotes set status='superseded',responded_at=coalesce(responded_at,now()) where job_id=p_job_id and status='proposed';
 insert into job_quotes(job_id,assignment_id,handyman_id,customer_id,amount,note) values(p_job_id,v_a.id,v_a.handyman_id,v_customer_id,p_amount,v_note) returning id into v_quote_id;
 insert into job_events(job_id,event_type,actor_type,actor_id,metadata) values(p_job_id,'quote_proposed','handyman',v_a.handyman_id,jsonb_build_object('quote_id',v_quote_id,'amount',p_amount));
 if v_customer_phone is not null then insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_customer_phone,'quote_proposed',format('Your handyman proposed R%s for this job%s.',trim(to_char(p_amount,'FM999999990.00')),case when v_note is not null then E'\nNote: '||v_note else '' end),jsonb_build_object('job_id',p_job_id,'quote_id',v_quote_id,'amount',p_amount,'ui',jsonb_build_object('type','buttons','body','Do you agree to this price?','buttons',jsonb_build_array(jsonb_build_object('id','QUOTE_ACCEPT:'||v_quote_id::text,'title','Accept R'||trim(to_char(p_amount,'FM999990.00'))),jsonb_build_object('id','QUOTE_REJECT:'||v_quote_id::text,'title','Reject')))),'quote-proposed:'||v_quote_id::text) on conflict(dedupe_key) do nothing; end if;
 return jsonb_build_object('ok',true,'quote_id',v_quote_id,'amount',p_amount,'message','Quote sent to the customer for approval.','replayed',false);
end $function$;
