-- Keep immediate availability-triggered offers aligned with the authoritative
-- candidate matcher. This preserves verification, explicit service confirmation,
-- travel radius, reliability, and Free/Pro access rules in one place.

create or replace function public.offer_waiting_jobs_to_handyman(
  p_phone text,
  p_limit integer default 5
)
returns table(
  match_id uuid,
  job_id uuid,
  description text,
  suburb text,
  city text,
  skill_name text
)
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
declare
  v_handyman_id uuid;
  v_has_pro boolean;
  v_used integer;
  v_remaining integer;
  v_row record;
begin
  select h.id into v_handyman_id
  from public.handymen h
  where h.phone = p_phone
    and h.status = 'active'
    and h.availability_status = 'available'
    and (h.available_until is null or h.available_until > now());

  if v_handyman_id is null then return; end if;

  select exists(
    select 1 from public.entitlements e
    where e.handyman_id = v_handyman_id
      and e.entitlement_type = 'pro_access'
      and e.status = 'active'
      and e.valid_from <= now()
      and (e.valid_until is null or e.valid_until > now())
  ) into v_has_pro;

  select count(*)::integer into v_used
  from public.job_matches jm
  where jm.handyman_id = v_handyman_id
    and jm.offered_at >= date_trunc('month', now());

  v_remaining := greatest(0, 3 - coalesce(v_used, 0));
  if not v_has_pro and v_remaining <= 0 then return; end if;

  for v_row in
    with eligible as (
      select
        j.id as job_id,
        j.description,
        j.suburb,
        j.city,
        j.urgency,
        j.appointment_window,
        j.materials_status,
        s.name as skill_name,
        candidate.score,
        j.created_at
      from public.jobs j
      join public.skills s on s.id = j.skill_id
      join lateral public.find_job_candidates(j.id, 20) candidate
        on candidate.handyman_id = v_handyman_id
      where j.status in ('open', 'matching')
        and j.service_confirmed_at is not null
        and j.confirmed_skill_id = j.skill_id
        and not exists (
          select 1 from public.job_matches existing
          where existing.job_id = j.id
            and existing.handyman_id = v_handyman_id
        )
      order by candidate.score desc, j.created_at asc
      limit greatest(
        1,
        least(
          case
            when v_has_pro then coalesce(p_limit, 5)
            else least(coalesce(p_limit, 5), v_remaining)
          end,
          10
        )
      )
    ),
    inserted as (
      insert into public.job_matches(
        job_id, handyman_id, match_score, status, offer_expires_at
      )
      select
        e.job_id, v_handyman_id, e.score, 'offered',
        now() + interval '10 minutes'
      from eligible e
      on conflict(job_id, handyman_id) do nothing
      returning id, job_id
    )
    select
      i.id as match_id,
      e.job_id,
      e.description,
      e.suburb,
      e.city,
      e.urgency,
      e.appointment_window,
      e.materials_status,
      e.skill_name
    from inserted i
    join eligible e on e.job_id = i.job_id
  loop
    insert into public.notification_outbox(
      recipient_phone, kind, body, payload, dedupe_key
    )
    values(
      p_phone,
      'job_offer',
      format(
        'New %s job: %s\nLocation: %s, %s\nUrgency: %s\nPreferred time: %s\nMaterials: %s',
        v_row.skill_name,
        v_row.description,
        v_row.suburb,
        v_row.city,
        coalesce(v_row.urgency, 'flexible'),
        coalesce(v_row.appointment_window, 'any_time'),
        coalesce(v_row.materials_status, 'unsure')
      ),
      jsonb_build_object(
        'job_id', v_row.job_id,
        'match_id', v_row.match_id,
        'ui', jsonb_build_object(
          'type', 'buttons',
          'body', 'Are you available for this job?',
          'buttons', jsonb_build_array(
            jsonb_build_object(
              'id', 'ACCEPT:' || v_row.match_id::text,
              'title', 'Accept'
            ),
            jsonb_build_object(
              'id', 'DECLINE:' || v_row.match_id::text,
              'title', 'Decline'
            ),
            jsonb_build_object(
              'id', 'MY_JOBS',
              'title', 'My jobs'
            )
          )
        )
      ),
      'job-offer:' || v_row.match_id::text
    )
    on conflict(dedupe_key) do nothing;
  end loop;

  return;
end
$function$;

revoke all on function public.offer_waiting_jobs_to_handyman(text, integer)
  from public, anon, authenticated;
grant execute on function public.offer_waiting_jobs_to_handyman(text, integer)
  to service_role;
