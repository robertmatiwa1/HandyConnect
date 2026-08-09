create or replace function public.complete_job_assignment(p_job_id uuid, p_handyman_phone text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare v_handyman_id uuid;
begin
  select id into v_handyman_id from public.handymen where phone=p_handyman_phone and status='active';
  if v_handyman_id is null then raise exception 'handyman not found'; end if;
  update public.job_assignments
    set completed_at=coalesce(completed_at,now())
  where job_id=p_job_id and handyman_id=v_handyman_id and cancelled_at is null;
  if not found then raise exception 'assignment not found'; end if;
  update public.jobs set status='completed',updated_at=now() where id=p_job_id and status in ('assigned','in_progress');
  update public.handymen set completed_jobs=completed_jobs+1,availability_status='available',available_until=now()+interval '8 hours',last_active_at=now()
  where id=v_handyman_id;
end;
$$;
revoke all on function public.complete_job_assignment(uuid,text) from public,anon,authenticated;
grant execute on function public.complete_job_assignment(uuid,text) to service_role;

create or replace function public.rate_completed_job(p_job_id uuid,p_customer_phone text,p_rating smallint,p_comment text default null)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare v_customer_id uuid; v_handyman_id uuid;
begin
  if p_rating<1 or p_rating>5 then raise exception 'rating must be 1 to 5'; end if;
  select id into v_customer_id from public.customers where phone=p_customer_phone;
  if v_customer_id is null then raise exception 'customer not found'; end if;
  select ja.handyman_id into v_handyman_id from public.job_assignments ja join public.jobs j on j.id=ja.job_id
  where ja.job_id=p_job_id and j.customer_id=v_customer_id and j.status='completed';
  if v_handyman_id is null then raise exception 'completed assignment not found'; end if;
  insert into public.reviews(job_id,customer_id,handyman_id,rating,comment)
  values(p_job_id,v_customer_id,v_handyman_id,p_rating,p_comment)
  on conflict(job_id) do update set rating=excluded.rating,comment=excluded.comment;
  update public.handymen h set average_rating=(select coalesce(avg(r.rating),0)::numeric(3,2) from public.reviews r where r.handyman_id=h.id)
  where h.id=v_handyman_id;
end;
$$;
revoke all on function public.rate_completed_job(uuid,text,smallint,text) from public,anon,authenticated;
grant execute on function public.rate_completed_job(uuid,text,smallint,text) to service_role;
