create table if not exists public.job_quotes(
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.jobs(id) on delete cascade,
 assignment_id uuid not null references public.job_assignments(id) on delete cascade,
 handyman_id uuid not null references public.handymen(id),
 customer_id uuid not null references public.customers(id),
 amount numeric(12,2) not null check(amount>0),
 note text,
 status text not null default 'proposed' check(status in('proposed','accepted','rejected','superseded')),
 proposed_at timestamptz not null default now(),
 responded_at timestamptz,
 unique(id,job_id)
);
create index if not exists idx_job_quotes_job on public.job_quotes(job_id,proposed_at desc);
alter table public.job_quotes enable row level security;

create or replace function public.propose_job_quote(p_job_id uuid,p_handyman_phone text,p_amount numeric,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_a job_assignments%rowtype; v_customer_id uuid; v_customer_phone text; v_quote_id uuid; begin
 if p_amount is null or p_amount<=0 then return jsonb_build_object('ok',false,'reason','invalid_amount'); end if;
 select a.* into v_a from job_assignments a join handymen h on h.id=a.handyman_id where a.job_id=p_job_id and h.phone=p_handyman_phone and a.cancelled_at is null for update;
 if v_a.id is null then return jsonb_build_object('ok',false,'reason','assignment_not_found'); end if;
 if v_a.started_at is not null then return jsonb_build_object('ok',false,'reason','job_already_started'); end if;
 select j.customer_id,c.phone into v_customer_id,v_customer_phone from jobs j join customers c on c.id=j.customer_id where j.id=p_job_id;
 update job_quotes set status='superseded',responded_at=coalesce(responded_at,now()) where job_id=p_job_id and status='proposed';
 insert into job_quotes(job_id,assignment_id,handyman_id,customer_id,amount,note) values(p_job_id,v_a.id,v_a.handyman_id,v_customer_id,p_amount,nullif(trim(p_note),'')) returning id into v_quote_id;
 insert into job_events(job_id,event_type,actor_type,actor_id,metadata) values(p_job_id,'quote_proposed','handyman',v_a.handyman_id,jsonb_build_object('quote_id',v_quote_id,'amount',p_amount));
 if v_customer_phone is not null then insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_customer_phone,'quote_proposed',format('Your handyman proposed R%s for this job%s.',trim(to_char(p_amount,'FM999999990.00')),case when nullif(trim(p_note),'') is not null then E'\nNote: '||trim(p_note) else '' end),jsonb_build_object('job_id',p_job_id,'quote_id',v_quote_id,'amount',p_amount,'ui',jsonb_build_object('type','buttons','body','Do you agree to this price?','buttons',jsonb_build_array(jsonb_build_object('id','QUOTE_ACCEPT:'||v_quote_id::text,'title','Accept R'||trim(to_char(p_amount,'FM999990.00'))),jsonb_build_object('id','QUOTE_REJECT:'||v_quote_id::text,'title','Reject')))),'quote-proposed:'||v_quote_id::text) on conflict(dedupe_key) do nothing; end if;
 return jsonb_build_object('ok',true,'quote_id',v_quote_id,'amount',p_amount,'message','Quote sent to the customer for approval.'); end $$;

create or replace function public.respond_job_quote(p_quote_id uuid,p_customer_phone text,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_q job_quotes%rowtype; v_handyman_phone text; begin
 select q.* into v_q from job_quotes q join customers c on c.id=q.customer_id where q.id=p_quote_id and c.phone=p_customer_phone and q.status='proposed' for update;
 if v_q.id is null then return jsonb_build_object('ok',false); end if;
 update job_quotes set status=case when p_accept then 'accepted' else 'rejected' end,responded_at=now() where id=v_q.id;
 select phone into v_handyman_phone from handymen where id=v_q.handyman_id;
 insert into job_events(job_id,event_type,actor_type,actor_id,metadata) values(v_q.job_id,case when p_accept then 'quote_accepted' else 'quote_rejected' end,'customer',v_q.customer_id,jsonb_build_object('quote_id',v_q.id,'amount',v_q.amount));
 if v_handyman_phone is not null then insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_handyman_phone,case when p_accept then 'quote_accepted' else 'quote_rejected' end,case when p_accept then format('Customer accepted your R%s quote. When you arrive, mark arrival and wait for the customer to confirm the job start.',trim(to_char(v_q.amount,'FM999999990.00'))) else format('Customer rejected your R%s quote. You can discuss the price and send a new quote.',trim(to_char(v_q.amount,'FM999999990.00'))) end,jsonb_build_object('job_id',v_q.job_id,'quote_id',v_q.id),'quote-response:'||v_q.id::text) on conflict(dedupe_key) do nothing; end if;
 return jsonb_build_object('ok',true,'accepted',p_accept,'job_id',v_q.job_id,'amount',v_q.amount); end $$;

create or replace function public.confirm_job_start(p_job_id uuid,p_customer_phone text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_a job_assignments%rowtype; v_handyman_phone text; v_quote job_quotes%rowtype; begin
 select a.* into v_a from job_assignments a join jobs j on j.id=a.job_id join customers c on c.id=j.customer_id where a.job_id=p_job_id and c.phone=p_customer_phone and a.cancelled_at is null for update;
 if v_a.id is null then return jsonb_build_object('ok',false); end if;
 if v_a.arrived_at is null then return jsonb_build_object('ok',false,'reason','arrival_not_recorded'); end if;
 select * into v_quote from job_quotes where job_id=p_job_id and status='accepted' order by responded_at desc limit 1;
 if v_quote.id is null then return jsonb_build_object('ok',false,'reason','quote_not_accepted'); end if;
 update job_assignments set customer_start_confirmed_at=coalesce(customer_start_confirmed_at,now()),started_at=coalesce(started_at,now()) where id=v_a.id;
 update jobs set status='in_progress',updated_at=now() where id=p_job_id and status='assigned';
 select h.phone into v_handyman_phone from handymen h where h.id=v_a.handyman_id;
 insert into job_events(job_id,event_type,actor_type,metadata) values(p_job_id,'start_confirmed','customer',jsonb_build_object('assignment_id',v_a.id,'quote_id',v_quote.id,'agreed_amount',v_quote.amount));
 if v_handyman_phone is not null then insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key) values(v_handyman_phone,'job_started',format('The customer confirmed your arrival. The job is now in progress at the agreed price of R%s.',trim(to_char(v_quote.amount,'FM999999990.00'))),jsonb_build_object('job_id',p_job_id,'agreed_amount',v_quote.amount),'start-confirmed:'||v_a.id::text) on conflict(dedupe_key) do nothing; end if;
 return jsonb_build_object('ok',true,'message',format('Confirmed. The job is now in progress at the agreed price of R%s.',trim(to_char(v_quote.amount,'FM999999990.00'))),'agreed_amount',v_quote.amount); end $$;

revoke all on function public.propose_job_quote(uuid,text,numeric,text),public.respond_job_quote(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.propose_job_quote(uuid,text,numeric,text),public.respond_job_quote(uuid,text,boolean) to service_role;