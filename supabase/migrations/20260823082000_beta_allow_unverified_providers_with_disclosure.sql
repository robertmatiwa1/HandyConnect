create or replace function private.enforce_provider_identity_readiness()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
begin
  if new.availability_status = 'available'
    and (
      new.registration_status <> 'active'
      or new.terms_accepted_at is null
      or new.profile_completed_at is null
      or new.status <> 'active'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = case
        when new.registration_status <> 'active' or new.terms_accepted_at is null or new.profile_completed_at is null
          then 'provider_registration_incomplete'
        else 'provider_not_active'
      end;
  end if;
  return new;
end
$$;

create or replace function private.enforce_assignment_identity_readiness()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $$
begin
  if not exists (
    select 1 from public.handymen h
    where h.id = new.handyman_id
      and h.status = 'active'
      and h.registration_status = 'active'
      and h.terms_accepted_at is not null
      and h.profile_completed_at is not null
  ) then
    raise exception using errcode = 'P0001', message = 'provider_identity_not_ready';
  end if;
  return new;
end
$$;

create or replace function public.find_job_candidates(p_job_id uuid, p_limit integer default 5)
returns table(handyman_id uuid, score numeric, remaining_free_opportunities integer, has_pro_access boolean)
language sql
security definer
set search_path to 'pg_catalog','public','private'
as $$
with target_job as (
  select id, skill_id, city, suburb, province, latitude, longitude
  from public.jobs where id=p_job_id and status in('open','matching')
), eligible_areas as (
  select h.id handyman_id,
    min(case when j.latitude is not null and j.longitude is not null
      and sa.base_latitude is not null and sa.base_longitude is not null
      then private.distance_km(sa.base_latitude,sa.base_longitude,j.latitude,j.longitude)
      else null end) distance_km
  from target_job j
  join public.handyman_skills hs on hs.skill_id=j.skill_id
  join public.handymen h on h.id=hs.handyman_id
    and h.status='active'
    and h.registration_status='active'
    and h.terms_accepted_at is not null
    and h.profile_completed_at is not null
    and h.availability_status='available'
    and (h.available_until is null or h.available_until>now())
    and (h.reliability_restricted_until is null or h.reliability_restricted_until<=now())
  join public.service_areas sa on sa.handyman_id=h.id
  where (
    j.latitude is not null and j.longitude is not null
    and sa.base_latitude is not null and sa.base_longitude is not null
    and private.distance_km(sa.base_latitude,sa.base_longitude,j.latitude,j.longitude) <= sa.travel_radius_km
  ) or (
    (j.latitude is null or j.longitude is null or sa.base_latitude is null or sa.base_longitude is null)
    and lower(trim(coalesce(sa.city,'')))=lower(trim(coalesce(j.city,'')))
    and lower(trim(coalesce(sa.province,'')))=lower(trim(coalesce(j.province,'')))
  )
  group by h.id
), base as (
  select h.id handyman_id,
    (150 - least(100,coalesce(ea.distance_km,20)*3)
      + least(20,coalesce(h.average_rating,0)*3)
      + least(10,coalesce(h.completed_jobs,0)) + 15
      + case when coalesce(h.reliability_score,100)>=90 then 10
             when coalesce(h.reliability_score,100)>=80 then 5
             when coalesce(h.reliability_score,100)>=50 then 0 else -50 end)::numeric score
  from eligible_areas ea join public.handymen h on h.id=ea.handyman_id
), usage as (
  select jm.handyman_id,count(*)::integer used
  from public.job_matches jm where jm.offered_at>=date_trunc('month',now())
  group by jm.handyman_id
), access as (
  select b.handyman_id,b.score,
    exists(select 1 from public.entitlements e where e.handyman_id=b.handyman_id
      and e.entitlement_type='pro_access' and e.status='active' and e.valid_from<=now()
      and(e.valid_until is null or e.valid_until>now())) has_pro_access,
    greatest(0,3-coalesce(u.used,0)) remaining_free_opportunities
  from base b left join usage u on u.handyman_id=b.handyman_id
)
select a.handyman_id,a.score,a.remaining_free_opportunities,a.has_pro_access
from access a where a.has_pro_access or a.remaining_free_opportunities>0
order by a.has_pro_access desc,a.score desc,a.handyman_id
limit greatest(1,least(coalesce(p_limit,5),20));
$$;

create or replace function private.accept_job_core(p_match_id uuid, p_expected_handyman_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_match public.job_matches%rowtype;
  v_job public.jobs%rowtype;
  v_handyman public.handymen%rowtype;
  v_assignment_id uuid;
  v_customer public.customers%rowtype;
  v_identity_label text;
begin
  select * into v_match from public.job_matches where id = p_match_id for update;
  if v_match.id is null or v_match.handyman_id <> p_expected_handyman_id then return jsonb_build_object('ok', false, 'code', 'offer_not_found'); end if;
  if v_match.status = 'accepted' then
    select id into v_assignment_id from public.job_assignments where accepted_match_id=v_match.id and handyman_id=v_match.handyman_id;
    if v_assignment_id is not null then return jsonb_build_object('ok',true,'replayed',true,'assignment_id',v_assignment_id,'job_id',v_match.job_id); end if;
  end if;
  if v_match.status <> 'offered' then return jsonb_build_object('ok',false,'code','job_no_longer_available'); end if;
  if v_match.offer_expires_at is not null and v_match.offer_expires_at <= now() then
    update public.job_matches set status='expired',responded_at=coalesce(responded_at,now()) where id=v_match.id;
    return jsonb_build_object('ok',false,'code','offer_expired');
  end if;
  select * into v_job from public.jobs where id=v_match.job_id for update;
  if v_job.id is null or v_job.status not in ('open','matching') then return jsonb_build_object('ok',false,'code','job_no_longer_available'); end if;
  select * into v_handyman from public.handymen where id=v_match.handyman_id for update;
  if v_handyman.id is null or v_handyman.status <> 'active' then return jsonb_build_object('ok',false,'code','provider_not_active'); end if;
  if v_handyman.registration_status <> 'active' or v_handyman.terms_accepted_at is null or v_handyman.profile_completed_at is null then return jsonb_build_object('ok',false,'code','provider_registration_incomplete'); end if;
  if v_handyman.availability_cooldown_until is not null and v_handyman.availability_cooldown_until > now() then return jsonb_build_object('ok',false,'code','provider_cooldown','available_at',v_handyman.availability_cooldown_until); end if;
  if v_job.service_mode='immediate' and v_handyman.active_job_id is not null then return jsonb_build_object('ok',false,'code','provider_busy','active_job_id',v_handyman.active_job_id); end if;
  insert into public.job_assignments(job_id,handyman_id,accepted_match_id,assignment_kind) values(v_job.id,v_handyman.id,v_match.id,v_job.service_mode) returning id into v_assignment_id;
  update public.job_matches set status=case when id=v_match.id then 'accepted' else 'lost' end, responded_at=case when id=v_match.id then now() else coalesce(responded_at,now()) end where job_id=v_job.id and status='offered';
  update public.jobs set status='assigned',updated_at=now() where id=v_job.id;
  select * into v_customer from public.customers where id=v_job.customer_id;
  v_identity_label := case when v_handyman.verification_status='verified' then 'ID verified ✓' else 'ID not yet verified' end;
  if v_customer.phone is not null then
    insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
    values(v_customer.phone,'job_assigned',format('%s accepted your HandyConnect job.\n\nIdentity: %s\nRating: %s/5\nCompleted jobs: %s\nExperience: %s\nReliability: %s/100\n\nContact: %s\nJob: %s\nLocation: %s, %s.',coalesce(v_handyman.full_name,'Your handyman'),v_identity_label,coalesce(v_handyman.average_rating,0),coalesce(v_handyman.completed_jobs,0),case when v_handyman.years_experience is null then 'Not stated' else v_handyman.years_experience::text || ' years' end,coalesce(v_handyman.reliability_score,100),v_handyman.phone,v_job.description,coalesce(v_job.suburb,''),coalesce(v_job.city,'')),jsonb_build_object('job_id',v_job.id,'assignment_id',v_assignment_id,'provider_verification_status',v_handyman.verification_status,'ui',jsonb_build_object('type','buttons','body','Your handyman is confirmed.','buttons',jsonb_build_array(jsonb_build_object('id','PROVIDER_PROFILE:'||v_job.id::text,'title','View provider'),jsonb_build_object('id','JOB_STATUS:'||v_job.id::text,'title','Job status')))),'assignment-customer:'||v_assignment_id::text)
    on conflict (dedupe_key) do nothing;
  end if;
  insert into public.notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
  values(v_handyman.phone,'job_assigned',format('Job accepted and saved under Current job. Customer: %s. Contact: %s. Job: %s. Area: %s, %s.',coalesce(v_customer.full_name,'Customer'),v_customer.phone,v_job.description,coalesce(v_job.suburb,''),coalesce(v_job.city,'')),jsonb_build_object('job_id',v_job.id,'assignment_id',v_assignment_id),'assignment-handyman:'||v_assignment_id::text)
  on conflict (dedupe_key) do nothing;
  insert into public.job_events(job_id,event_type,actor_type,actor_id,metadata)
  values(v_job.id,'assigned','handyman',v_handyman.id,jsonb_build_object('assignment_id',v_assignment_id,'assignment_kind',v_job.service_mode,'provider_verification_status',v_handyman.verification_status,'capacity_status',case when v_job.service_mode='immediate' then 'busy' else 'available' end));
  return jsonb_build_object('ok',true,'replayed',false,'assignment_id',v_assignment_id,'job_id',v_job.id,'assignment_kind',v_job.service_mode,'provider_verification_status',v_handyman.verification_status,'provider_status',case when v_job.service_mode='immediate' then 'busy' else v_handyman.availability_status end);
exception when unique_violation then return jsonb_build_object('ok',false,'code','job_no_longer_available');
end
$$;
