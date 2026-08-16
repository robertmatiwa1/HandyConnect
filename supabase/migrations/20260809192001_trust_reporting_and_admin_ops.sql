alter table public.user_reports add column if not exists resolution_notes text;
alter table public.user_reports add column if not exists resolved_by text;

create unique index if not exists uq_open_report_per_job_reporter
on public.user_reports(job_id, reporter_phone)
where status in ('open','reviewing');

create or replace function public.create_job_report(
  p_reporter_phone text,
  p_job_id uuid,
  p_reason text,
  p_details text default null
)
returns table(report_id uuid, reported_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_handyman_id uuid;
  v_job_customer_id uuid;
  v_assigned_handyman_id uuid;
  v_report_id uuid;
begin
  if nullif(trim(p_reporter_phone),'') is null then raise exception 'reporter_phone_required'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'reason_required'; end if;

  select customer_id into v_job_customer_id from jobs where id=p_job_id;
  if v_job_customer_id is null then raise exception 'job_not_found'; end if;
  select handyman_id into v_assigned_handyman_id from job_assignments where job_id=p_job_id;

  select id into v_customer_id from customers where phone=p_reporter_phone;
  select id into v_handyman_id from handymen where phone=p_reporter_phone;

  if v_customer_id = v_job_customer_id then
    insert into user_reports(job_id,reporter_phone,reported_handyman_id,reason,details,status)
    values(p_job_id,p_reporter_phone,v_assigned_handyman_id,trim(p_reason),nullif(trim(coalesce(p_details,'')),''),'open')
    on conflict (job_id,reporter_phone) where status in ('open','reviewing')
    do update set reason=excluded.reason,details=excluded.details
    returning id into v_report_id;
    return query select v_report_id, case when v_assigned_handyman_id is null then 'platform' else 'handyman' end;
  elsif v_handyman_id = v_assigned_handyman_id then
    insert into user_reports(job_id,reporter_phone,reported_customer_id,reason,details,status)
    values(p_job_id,p_reporter_phone,v_job_customer_id,trim(p_reason),nullif(trim(coalesce(p_details,'')),''),'open')
    on conflict (job_id,reporter_phone) where status in ('open','reviewing')
    do update set reason=excluded.reason,details=excluded.details
    returning id into v_report_id;
    return query select v_report_id,'customer'::text;
  else
    raise exception 'reporter_not_party_to_job';
  end if;
end;
$$;

revoke all on function public.create_job_report(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_job_report(text,uuid,text,text) to service_role;

create or replace view public.admin_open_reports as
select r.id,r.created_at,r.status,r.reason,r.details,r.job_id,r.reporter_phone,
       j.description,j.status as job_status,j.suburb,j.city,
       h.full_name as reported_handyman,h.phone as reported_handyman_phone,
       c.full_name as reported_customer,c.phone as reported_customer_phone
from user_reports r
left join jobs j on j.id=r.job_id
left join handymen h on h.id=r.reported_handyman_id
left join customers c on c.id=r.reported_customer_id
where r.status in ('open','reviewing')
order by r.created_at asc;

revoke all on public.admin_open_reports from public, anon, authenticated;
grant select on public.admin_open_reports to service_role;

create or replace function public.resolve_user_report(
  p_report_id uuid,
  p_status text,
  p_resolution_notes text,
  p_resolved_by text
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_status not in ('resolved','dismissed') then raise exception 'invalid_resolution_status'; end if;
  update user_reports
     set status=p_status,resolution_notes=nullif(trim(coalesce(p_resolution_notes,'')),''),resolved_by=nullif(trim(coalesce(p_resolved_by,'')),''),resolved_at=now()
   where id=p_report_id and status in ('open','reviewing');
  return found;
end;
$$;
revoke all on function public.resolve_user_report(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.resolve_user_report(uuid,text,text,text) to service_role;