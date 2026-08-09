create or replace function public.accept_job_match(p_match_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_job_id uuid;
  v_handyman_id uuid;
  v_assignment_id uuid;
  v_customer_id uuid;
  v_customer_name text;
  v_customer_phone text;
  v_handyman_name text;
  v_handyman_phone text;
  v_description text;
  v_suburb text;
  v_city text;
begin
  select jm.job_id,jm.handyman_id into v_job_id,v_handyman_id
  from public.job_matches jm
  where jm.id=p_match_id and jm.status='offered'
  for update;
  if v_job_id is null then raise exception 'job match is not available'; end if;

  select j.customer_id,j.description,j.suburb,j.city into v_customer_id,v_description,v_suburb,v_city
  from public.jobs j where j.id=v_job_id and j.status in ('open','matching') for update;
  if not found then raise exception 'job is no longer available'; end if;

  insert into public.job_assignments(job_id,handyman_id,accepted_match_id)
  values(v_job_id,v_handyman_id,p_match_id)
  returning id into v_assignment_id;

  update public.job_matches
  set status=case when id=p_match_id then 'accepted' else 'lost' end,
      responded_at=case when id=p_match_id then now() else responded_at end
  where job_id=v_job_id and status='offered';

  update public.jobs set status='assigned',updated_at=now() where id=v_job_id;

  select full_name,phone into v_customer_name,v_customer_phone from public.customers where id=v_customer_id;
  select full_name,phone into v_handyman_name,v_handyman_phone from public.handymen where id=v_handyman_id;

  if v_customer_phone is not null then
    insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
    values(
      v_customer_phone,
      'job_assigned',
      format('%s accepted your HandyConnect job. Contact: %s. Job: %s. Location: %s, %s.',coalesce(v_handyman_name,'Your handyman'),v_handyman_phone,v_description,coalesce(v_suburb,''),coalesce(v_city,'')),
      jsonb_build_object('job_id',v_job_id,'assignment_id',v_assignment_id,'handyman_name',v_handyman_name,'handyman_phone',v_handyman_phone),
      'assignment-customer:'||v_assignment_id::text
    ) on conflict(dedupe_key) do nothing;
  end if;

  if v_handyman_phone is not null then
    insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
    values(
      v_handyman_phone,
      'job_assigned',
      format('Job confirmed. Customer: %s. Contact: %s. Job: %s. Location: %s, %s.',coalesce(v_customer_name,'Customer'),v_customer_phone,v_description,coalesce(v_suburb,''),coalesce(v_city,'')),
      jsonb_build_object('job_id',v_job_id,'assignment_id',v_assignment_id,'customer_name',v_customer_name,'customer_phone',v_customer_phone),
      'assignment-handyman:'||v_assignment_id::text
    ) on conflict(dedupe_key) do nothing;
  end if;

  insert into public.job_events(job_id,event_type,actor_type,actor_id,metadata)
  values(v_job_id,'assigned','handyman',v_handyman_id,jsonb_build_object('assignment_id',v_assignment_id));

  return v_assignment_id;
exception when unique_violation then
  raise exception 'job has already been assigned';
end;
$$;

create or replace function public.get_assignment_contact(p_job_id uuid,p_phone text)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_job public.jobs%rowtype;
  v_assignment public.job_assignments%rowtype;
  v_customer public.customers%rowtype;
  v_handyman public.handymen%rowtype;
begin
  select * into v_job from public.jobs where id=p_job_id;
  if v_job.id is null or v_job.status not in ('assigned','in_progress','completed') then return null; end if;
  select * into v_assignment from public.job_assignments where job_id=p_job_id and cancelled_at is null;
  if v_assignment.id is null then return null; end if;
  select * into v_customer from public.customers where id=v_job.customer_id;
  select * into v_handyman from public.handymen where id=v_assignment.handyman_id;
  if p_phone=v_customer.phone then
    return jsonb_build_object('role','customer','job_id',v_job.id,'counterparty_name',v_handyman.full_name,'counterparty_phone',v_handyman.phone,'description',v_job.description,'suburb',v_job.suburb,'city',v_job.city,'status',v_job.status);
  elsif p_phone=v_handyman.phone then
    return jsonb_build_object('role','handyman','job_id',v_job.id,'counterparty_name',v_customer.full_name,'counterparty_phone',v_customer.phone,'description',v_job.description,'suburb',v_job.suburb,'city',v_job.city,'status',v_job.status);
  end if;
  return null;
end;
$$;

revoke all on function public.accept_job_match(uuid) from public,anon,authenticated;
revoke all on function public.get_assignment_contact(uuid,text) from public,anon,authenticated;
grant execute on function public.accept_job_match(uuid) to service_role;
grant execute on function public.get_assignment_contact(uuid,text) to service_role;
