create table if not exists public.pilot_test_runs(
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('passed','failed')),
  result jsonb not null,
  ran_at timestamptz not null default now()
);
alter table public.pilot_test_runs enable row level security;
revoke all on public.pilot_test_runs from public,anon,authenticated;
grant select,insert on public.pilot_test_runs to service_role;

create or replace function public.run_marketplace_pilot_harness()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_customer_id uuid;
  v_handyman_id uuid;
  v_skill_id bigint;
  v_job_id uuid;
  v_match_id uuid;
  v_assignment_id uuid;
  v_phone_customer text := '2799' || substr(replace(gen_random_uuid()::text,'-',''),1,9);
  v_phone_handyman text := '2788' || substr(replace(gen_random_uuid()::text,'-',''),1,9);
  v_candidate_count integer;
  v_blocked_count integer;
  v_pro_count integer;
  v_rating numeric;
  v_job_status text;
  v_result jsonb;
  v_status text := 'passed';
  v_step text := 'setup';
begin
  select id into v_skill_id from public.skills where active=true order by id limit 1;
  if v_skill_id is null then raise exception 'no active skill available'; end if;

  insert into public.customers(phone,full_name) values(v_phone_customer,'Pilot Customer') returning id into v_customer_id;
  insert into public.handymen(phone,full_name,status,verification_status,availability_status,available_until,verified_at)
  values(v_phone_handyman,'Pilot Handyman','active','verified','available',now()+interval '2 hours',now()) returning id into v_handyman_id;
  insert into public.handyman_skills(handyman_id,skill_id,years_experience) values(v_handyman_id,v_skill_id,5);
  insert into public.service_areas(handyman_id,suburb,city,province,coverage_type) values(v_handyman_id,'Pinelands','Cape Town','Western Cape','suburb');

  v_step := 'create_job';
  insert into public.jobs(customer_id,skill_id,description,suburb,city,province,status)
  values(v_customer_id,v_skill_id,'Pilot test repair','Pinelands','Cape Town','Western Cape','matching') returning id into v_job_id;

  v_step := 'candidate_match';
  select count(*) into v_candidate_count from public.find_job_candidates(v_job_id,5) where handyman_id=v_handyman_id;
  if v_candidate_count<>1 then raise exception 'verified available handyman was not matched'; end if;

  insert into public.job_matches(job_id,handyman_id,match_score,status,offer_expires_at)
  values(v_job_id,v_handyman_id,100,'offered',now()+interval '10 minutes') returning id into v_match_id;

  v_step := 'accept';
  v_assignment_id := public.accept_job_match(v_match_id);
  if v_assignment_id is null then raise exception 'assignment was not created'; end if;

  v_step := 'start';
  update public.job_assignments set started_at=now() where id=v_assignment_id;
  update public.jobs set status='in_progress',updated_at=now() where id=v_job_id and status='assigned';
  select status into v_job_status from public.jobs where id=v_job_id;
  if v_job_status<>'in_progress' then raise exception 'job did not start'; end if;

  v_step := 'complete';
  perform public.complete_job_assignment(v_job_id,v_phone_handyman);
  select status into v_job_status from public.jobs where id=v_job_id;
  if v_job_status<>'completed' then raise exception 'job did not complete'; end if;

  v_step := 'rate';
  perform public.rate_completed_job(v_job_id,v_phone_customer,5,'Pilot harness rating');
  select average_rating into v_rating from public.handymen where id=v_handyman_id;
  if v_rating<>5 then raise exception 'rating was not applied'; end if;

  v_step := 'free_limit';
  insert into public.jobs(customer_id,skill_id,description,suburb,city,province,status)
  select v_customer_id,v_skill_id,'Pilot usage '||g,'Pinelands','Cape Town','Western Cape','cancelled' from generate_series(1,2) g;
  insert into public.job_matches(job_id,handyman_id,match_score,status,offered_at)
  select j.id,v_handyman_id,80,'declined',now() from public.jobs j where j.customer_id=v_customer_id and j.description like 'Pilot usage %';
  insert into public.jobs(customer_id,skill_id,description,suburb,city,province,status)
  values(v_customer_id,v_skill_id,'Pilot blocked job','Pinelands','Cape Town','Western Cape','matching') returning id into v_job_id;
  select count(*) into v_blocked_count from public.find_job_candidates(v_job_id,5) where handyman_id=v_handyman_id;
  if v_blocked_count<>0 then raise exception 'free opportunity limit was not enforced'; end if;

  v_step := 'pro_override';
  insert into public.entitlements(handyman_id,entitlement_type,source_type,status,valid_from,valid_until)
  values(v_handyman_id,'pro_access','pilot','active',now(),now()+interval '1 month');
  select count(*) into v_pro_count from public.find_job_candidates(v_job_id,5) where handyman_id=v_handyman_id and has_pro_access=true;
  if v_pro_count<>1 then raise exception 'Pro access did not override free limit'; end if;

  v_result := jsonb_build_object(
    'ok',true,
    'tests',jsonb_build_object(
      'verified_matching',true,
      'offer_acceptance',true,
      'start_transition',true,
      'completion',true,
      'rating',true,
      'free_3_opportunity_limit',true,
      'pro_override',true
    ),
    'candidate_count',v_candidate_count,
    'free_limit_candidate_count',v_blocked_count,
    'pro_candidate_count',v_pro_count,
    'rating',v_rating
  );

  delete from public.reviews where customer_id=v_customer_id or handyman_id=v_handyman_id;
  delete from public.job_assignments where handyman_id=v_handyman_id;
  delete from public.job_matches where handyman_id=v_handyman_id;
  delete from public.jobs where customer_id=v_customer_id;
  delete from public.entitlements where handyman_id=v_handyman_id;
  delete from public.service_areas where handyman_id=v_handyman_id;
  delete from public.handyman_skills where handyman_id=v_handyman_id;
  delete from public.handymen where id=v_handyman_id;
  delete from public.customers where id=v_customer_id;
  insert into public.pilot_test_runs(status,result) values('passed',v_result);
  return v_result;
exception when others then
  v_status := 'failed';
  v_result := jsonb_build_object('ok',false,'failed_step',v_step,'error',sqlerrm);
  if v_customer_id is not null then
    delete from public.reviews where customer_id=v_customer_id;
    delete from public.jobs where customer_id=v_customer_id;
    delete from public.customers where id=v_customer_id;
  end if;
  if v_handyman_id is not null then
    delete from public.reviews where handyman_id=v_handyman_id;
    delete from public.job_assignments where handyman_id=v_handyman_id;
    delete from public.job_matches where handyman_id=v_handyman_id;
    delete from public.entitlements where handyman_id=v_handyman_id;
    delete from public.service_areas where handyman_id=v_handyman_id;
    delete from public.handyman_skills where handyman_id=v_handyman_id;
    delete from public.handymen where id=v_handyman_id;
  end if;
  insert into public.pilot_test_runs(status,result) values(v_status,v_result);
  return v_result;
end;
$$;
revoke all on function public.run_marketplace_pilot_harness() from public,anon,authenticated;
grant execute on function public.run_marketplace_pilot_harness() to service_role;
