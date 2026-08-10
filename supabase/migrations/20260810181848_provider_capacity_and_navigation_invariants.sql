set lock_timeout = '5s';
set statement_timeout = '60s';

-- Additive capacity model. Existing WhatsApp tables and records are preserved.
alter table public.jobs
  add column if not exists service_mode text not null default 'immediate',
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz;

alter table public.jobs drop constraint if exists jobs_service_mode_check;
alter table public.jobs add constraint jobs_service_mode_check
  check (service_mode in ('immediate','scheduled')) not valid;
alter table public.jobs validate constraint jobs_service_mode_check;

alter table public.jobs drop constraint if exists jobs_schedule_shape_check;
alter table public.jobs add constraint jobs_schedule_shape_check
  check (
    (service_mode = 'immediate')
    or (service_mode = 'scheduled' and scheduled_start_at is not null)
  ) not valid;
alter table public.jobs validate constraint jobs_schedule_shape_check;

alter table public.jobs drop constraint if exists jobs_schedule_window_check;
alter table public.jobs add constraint jobs_schedule_window_check
  check (
    scheduled_end_at is null
    or (scheduled_start_at is not null and scheduled_end_at > scheduled_start_at)
  ) not valid;
alter table public.jobs validate constraint jobs_schedule_window_check;

alter table public.handymen
  add column if not exists active_job_id uuid,
  add column if not exists availability_cooldown_until timestamptz,
  add column if not exists resume_after_cooldown boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.handymen'::regclass
      and conname = 'handymen_active_job_id_fkey'
  ) then
    alter table public.handymen
      add constraint handymen_active_job_id_fkey
      foreign key (active_job_id) references public.jobs(id)
      on delete set null not valid;
    alter table public.handymen
      validate constraint handymen_active_job_id_fkey;
  end if;
end
$$;

alter table public.job_assignments
  add column if not exists assignment_kind text not null default 'immediate',
  add column if not exists cancelled_by text,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_notes text;

update public.job_assignments a
set assignment_kind = j.service_mode
from public.jobs j
where j.id = a.job_id
  and a.assignment_kind is distinct from j.service_mode;

alter table public.job_assignments drop constraint if exists job_assignments_kind_check;
alter table public.job_assignments add constraint job_assignments_kind_check
  check (assignment_kind in ('immediate','scheduled')) not valid;
alter table public.job_assignments validate constraint job_assignments_kind_check;

alter table public.job_assignments drop constraint if exists job_assignments_cancelled_by_check;
alter table public.job_assignments add constraint job_assignments_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('customer','handyman','admin','system')) not valid;
alter table public.job_assignments validate constraint job_assignments_cancelled_by_check;

alter table public.job_assignments drop constraint if exists job_assignments_cancellation_reason_check;
alter table public.job_assignments add constraint job_assignments_cancellation_reason_check
  check (
    cancellation_reason is null or cancellation_reason in (
      'customer_cancelled','schedule_conflict','personal_emergency',
      'outside_skill','other','handyman_no_show','customer_no_show',
      'abandoned','admin_release','job_cancelled','job_expired','rematched'
    )
  ) not valid;
alter table public.job_assignments validate constraint job_assignments_cancellation_reason_check;

do $$
begin
  if exists (
    select 1
    from public.job_assignments
    where assignment_kind = 'immediate'
      and cancelled_at is null
      and completed_at is null
    group by handyman_id
    having count(*) > 1
  ) then
    raise exception 'precondition failed: a handyman has multiple active immediate assignments';
  end if;
end
$$;

create unique index if not exists ux_job_assignments_one_active_immediate_per_handyman
  on public.job_assignments(handyman_id)
  where assignment_kind = 'immediate'
    and cancelled_at is null
    and completed_at is null;

create unique index if not exists ux_handymen_active_job_id
  on public.handymen(active_job_id)
  where active_job_id is not null;

create index if not exists idx_handymen_capacity
  on public.handymen(availability_status, active_job_id, availability_cooldown_until);

create index if not exists idx_jobs_service_schedule
  on public.jobs(service_mode, scheduled_start_at, status);

create or replace function private.prevent_manual_availability_override()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.active_job_id is not null then
    if new.availability_status <> 'busy' then
      raise exception using
        errcode = 'P0001',
        message = 'provider_busy',
        detail = 'A handyman with an active immediate job must remain busy.';
    end if;

    if not exists (
      select 1
      from public.job_assignments a
      where a.job_id = new.active_job_id
        and a.handyman_id = new.id
        and a.assignment_kind = 'immediate'
        and a.cancelled_at is null
        and a.completed_at is null
    ) then
      raise exception using
        errcode = '23514',
        message = 'active_job_assignment_mismatch';
    end if;
  else
    if new.availability_status = 'busy' then
      raise exception using
        errcode = '23514',
        message = 'busy_requires_active_job';
    end if;

    if new.availability_status = 'available'
      and new.availability_cooldown_until is not null
      and new.availability_cooldown_until > clock_timestamp()
    then
      raise exception using
        errcode = 'P0001',
        message = 'provider_cooldown',
        detail = 'The cancellation cool-down has not ended.';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_prevent_manual_availability_override on public.handymen;
create trigger trg_prevent_manual_availability_override
before insert or update of availability_status, active_job_id, availability_cooldown_until
on public.handymen
for each row execute function private.prevent_manual_availability_override();

create or replace function private.sync_provider_capacity_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_is_active boolean;
  v_was_active boolean;
  v_cooldown interval;
begin
  v_is_active := new.assignment_kind = 'immediate'
    and new.cancelled_at is null
    and new.completed_at is null;

  if tg_op = 'UPDATE' then
    v_was_active := old.assignment_kind = 'immediate'
      and old.cancelled_at is null
      and old.completed_at is null;
  else
    v_was_active := false;
  end if;

  if v_is_active then
    perform 1 from public.handymen where id = new.handyman_id for update;

    if exists (
      select 1 from public.handymen h
      where h.id = new.handyman_id
        and h.active_job_id is not null
        and h.active_job_id <> new.job_id
    ) then
      raise exception using
        errcode = '23505',
        message = 'provider_already_has_active_job';
    end if;

    update public.handymen
    set active_job_id = new.job_id,
        availability_status = 'busy',
        available_until = null,
        availability_cooldown_until = null,
        resume_after_cooldown = false,
        last_active_at = now(),
        updated_at = now()
    where id = new.handyman_id;
  elsif v_was_active then
    v_cooldown := case
      when new.cancellation_reason = 'handyman_no_show' then interval '4 hours'
      when new.cancelled_by = 'handyman' then interval '30 minutes'
      else interval '0 seconds'
    end;

    update public.handymen
    set active_job_id = null,
        availability_status = case
          when v_cooldown > interval '0 seconds' then 'offline'
          else 'available'
        end,
        available_until = case
          when v_cooldown > interval '0 seconds' then null
          else now() + interval '8 hours'
        end,
        availability_cooldown_until = case
          when v_cooldown > interval '0 seconds' then now() + v_cooldown
          else null
        end,
        resume_after_cooldown = v_cooldown > interval '0 seconds',
        last_active_at = now(),
        updated_at = now()
    where id = old.handyman_id
      and active_job_id = old.job_id;
  end if;

  return new;
end
$$;

drop trigger if exists trg_sync_provider_capacity_from_assignment on public.job_assignments;
create trigger trg_sync_provider_capacity_from_assignment
after insert or update of assignment_kind, handyman_id, job_id, cancelled_at, completed_at,
  cancelled_by, cancellation_reason
on public.job_assignments
for each row execute function private.sync_provider_capacity_from_assignment();

create or replace function private.process_job_release()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'completed' then
    update public.job_assignments
    set completed_at = coalesce(completed_at, now())
    where job_id = new.id
      and cancelled_at is null
      and completed_at is null;
  elsif new.status in ('cancelled','expired') then
    update public.job_assignments
    set cancelled_at = coalesce(cancelled_at, now()),
        cancelled_by = coalesce(cancelled_by, 'system'),
        cancellation_reason = coalesce(
          cancellation_reason,
          case when new.status = 'expired' then 'job_expired' else 'job_cancelled' end
        )
    where job_id = new.id
      and cancelled_at is null
      and completed_at is null;
  elsif new.status = 'matching' and old.status in ('assigned','in_progress') then
    update public.job_assignments
    set cancelled_at = coalesce(cancelled_at, now()),
        cancelled_by = coalesce(cancelled_by, 'system'),
        cancellation_reason = coalesce(cancellation_reason, 'rematched')
    where job_id = new.id
      and cancelled_at is null
      and completed_at is null;
  end if;

  return new;
end
$$;

drop trigger if exists trg_process_job_release on public.jobs;
create trigger trg_process_job_release
after update of status on public.jobs
for each row execute function private.process_job_release();

-- Reconcile any pre-existing active immediate assignment into the capacity lease.
update public.handymen h
set active_job_id = a.job_id,
    availability_status = 'busy',
    available_until = null,
    availability_cooldown_until = null,
    resume_after_cooldown = false,
    updated_at = now()
from public.job_assignments a
join public.jobs j on j.id = a.job_id
where a.handyman_id = h.id
  and a.assignment_kind = 'immediate'
  and a.cancelled_at is null
  and a.completed_at is null
  and j.status in ('assigned','in_progress');

create or replace function private.accept_job_core(
  p_match_id uuid,
  p_expected_handyman_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.job_matches%rowtype;
  v_job public.jobs%rowtype;
  v_handyman public.handymen%rowtype;
  v_assignment_id uuid;
  v_customer public.customers%rowtype;
begin
  select * into v_match
  from public.job_matches
  where id = p_match_id
  for update;

  if v_match.id is null or v_match.handyman_id <> p_expected_handyman_id then
    return jsonb_build_object('ok', false, 'code', 'offer_not_found');
  end if;

  if v_match.status = 'accepted' then
    select id into v_assignment_id
    from public.job_assignments
    where accepted_match_id = v_match.id
      and handyman_id = v_match.handyman_id;
    if v_assignment_id is not null then
      return jsonb_build_object(
        'ok', true,
        'replayed', true,
        'assignment_id', v_assignment_id,
        'job_id', v_match.job_id
      );
    end if;
  end if;

  if v_match.status <> 'offered' then
    return jsonb_build_object('ok', false, 'code', 'job_no_longer_available');
  end if;

  if v_match.offer_expires_at is not null and v_match.offer_expires_at <= now() then
    update public.job_matches
    set status = 'expired', responded_at = coalesce(responded_at, now())
    where id = v_match.id;
    return jsonb_build_object('ok', false, 'code', 'offer_expired');
  end if;

  select * into v_job
  from public.jobs
  where id = v_match.job_id
  for update;

  if v_job.id is null or v_job.status not in ('open','matching') then
    return jsonb_build_object('ok', false, 'code', 'job_no_longer_available');
  end if;

  select * into v_handyman
  from public.handymen
  where id = v_match.handyman_id
  for update;

  if v_handyman.id is null or v_handyman.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'provider_not_active');
  end if;

  if v_handyman.verification_status <> 'verified' then
    return jsonb_build_object('ok', false, 'code', 'provider_not_verified');
  end if;

  if v_handyman.availability_cooldown_until is not null
    and v_handyman.availability_cooldown_until > now()
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'provider_cooldown',
      'available_at', v_handyman.availability_cooldown_until
    );
  end if;

  if v_job.service_mode = 'immediate' and v_handyman.active_job_id is not null then
    return jsonb_build_object(
      'ok', false,
      'code', 'provider_busy',
      'active_job_id', v_handyman.active_job_id
    );
  end if;

  insert into public.job_assignments(
    job_id, handyman_id, accepted_match_id, assignment_kind
  ) values (
    v_job.id, v_handyman.id, v_match.id, v_job.service_mode
  )
  returning id into v_assignment_id;

  update public.job_matches
  set status = case when id = v_match.id then 'accepted' else 'lost' end,
      responded_at = case when id = v_match.id then now() else coalesce(responded_at, now()) end
  where job_id = v_job.id
    and status = 'offered';

  update public.jobs
  set status = 'assigned', updated_at = now()
  where id = v_job.id;

  select * into v_customer
  from public.customers
  where id = v_job.customer_id;

  if v_customer.phone is not null then
    insert into public.notification_outbox(
      recipient_phone, kind, body, payload, dedupe_key
    ) values (
      v_customer.phone,
      'job_assigned',
      format(
        '%s accepted your HandyConnect job.\n\nVerified: Yes ✓\nRating: %s/5\nCompleted jobs: %s\nExperience: %s\nReliability: %s/100\n\nContact: %s\nJob: %s\nLocation: %s, %s.',
        coalesce(v_handyman.full_name, 'Your handyman'),
        coalesce(v_handyman.average_rating, 0),
        coalesce(v_handyman.completed_jobs, 0),
        case when v_handyman.years_experience is null then 'Not stated' else v_handyman.years_experience::text || ' years' end,
        coalesce(v_handyman.reliability_score, 100),
        v_handyman.phone,
        v_job.description,
        coalesce(v_job.suburb, ''),
        coalesce(v_job.city, '')
      ),
      jsonb_build_object(
        'job_id', v_job.id,
        'assignment_id', v_assignment_id,
        'ui', jsonb_build_object(
          'type', 'buttons',
          'body', 'Your handyman is confirmed.',
          'buttons', jsonb_build_array(
            jsonb_build_object('id', 'PROVIDER_PROFILE:' || v_job.id::text, 'title', 'View provider'),
            jsonb_build_object('id', 'JOB_STATUS:' || v_job.id::text, 'title', 'Job status')
          )
        )
      ),
      'assignment-customer:' || v_assignment_id::text
    ) on conflict (dedupe_key) do nothing;
  end if;

  insert into public.notification_outbox(
    recipient_phone, kind, body, payload, dedupe_key
  ) values (
    v_handyman.phone,
    'job_assigned',
    format(
      'Job accepted and saved under Current job. Customer: %s. Contact: %s. Job: %s. Area: %s, %s.',
      coalesce(v_customer.full_name, 'Customer'),
      v_customer.phone,
      v_job.description,
      coalesce(v_job.suburb, ''),
      coalesce(v_job.city, '')
    ),
    jsonb_build_object('job_id', v_job.id, 'assignment_id', v_assignment_id),
    'assignment-handyman:' || v_assignment_id::text
  ) on conflict (dedupe_key) do nothing;

  insert into public.job_events(job_id, event_type, actor_type, actor_id, metadata)
  values (
    v_job.id,
    'assigned',
    'handyman',
    v_handyman.id,
    jsonb_build_object(
      'assignment_id', v_assignment_id,
      'assignment_kind', v_job.service_mode,
      'capacity_status', case when v_job.service_mode = 'immediate' then 'busy' else 'available' end
    )
  );

  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'assignment_id', v_assignment_id,
    'job_id', v_job.id,
    'assignment_kind', v_job.service_mode,
    'provider_status', case when v_job.service_mode = 'immediate' then 'busy' else v_handyman.availability_status end
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'job_no_longer_available');
end
$$;

create or replace function public.accept_job_transaction(
  p_match_id uuid,
  p_handyman_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_handyman_id uuid;
begin
  select id into v_handyman_id
  from public.handymen
  where phone = p_handyman_phone;

  if v_handyman_id is null then
    return jsonb_build_object('ok', false, 'code', 'provider_not_found');
  end if;

  return private.accept_job_core(p_match_id, v_handyman_id);
end
$$;

create or replace function public.accept_job_match(p_match_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_handyman_id uuid;
  v_result jsonb;
begin
  select handyman_id into v_handyman_id
  from public.job_matches
  where id = p_match_id;

  if v_handyman_id is null then
    raise exception 'offer_not_found';
  end if;

  v_result := private.accept_job_core(p_match_id, v_handyman_id);
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception '%', v_result ->> 'code';
  end if;

  return (v_result ->> 'assignment_id')::uuid;
end
$$;

create or replace function public.set_handyman_availability(
  p_phone text,
  p_status text,
  p_hours integer default 8
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_handyman public.handymen%rowtype;
begin
  if p_status not in ('available','offline') then
    raise exception using
      errcode = '22023',
      message = 'invalid_availability_status';
  end if;

  select * into v_handyman
  from public.handymen
  where phone = p_phone
  for update;

  if v_handyman.id is null then
    raise exception using errcode = 'P0002', message = 'provider_not_found';
  end if;

  if v_handyman.active_job_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'provider_busy',
      detail = v_handyman.active_job_id::text;
  end if;

  if p_status = 'available'
    and v_handyman.availability_cooldown_until is not null
    and v_handyman.availability_cooldown_until > now()
  then
    raise exception using
      errcode = 'P0001',
      message = 'provider_cooldown',
      detail = v_handyman.availability_cooldown_until::text;
  end if;

  update public.handymen
  set availability_status = p_status,
      available_until = case
        when p_status = 'available'
          then now() + make_interval(hours => greatest(1, least(coalesce(p_hours, 8), 24)))
        else null
      end,
      resume_after_cooldown = false,
      last_active_at = now(),
      updated_at = now()
  where id = v_handyman.id;

  return v_handyman.id;
end
$$;

create or replace function public.cancel_handyman_assignment(
  p_job_id uuid,
  p_handyman_phone text,
  p_reason text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assignment public.job_assignments%rowtype;
  v_handyman public.handymen%rowtype;
  v_job public.jobs%rowtype;
  v_customer_phone text;
begin
  if p_reason not in ('schedule_conflict','personal_emergency','outside_skill','other') then
    return jsonb_build_object('ok', false, 'code', 'invalid_cancellation_reason');
  end if;

  if p_reason = 'other' and length(trim(coalesce(p_notes, ''))) < 3 then
    return jsonb_build_object('ok', false, 'code', 'cancellation_notes_required');
  end if;

  select * into v_handyman
  from public.handymen
  where phone = p_handyman_phone
  for update;

  if v_handyman.id is null then
    return jsonb_build_object('ok', false, 'code', 'provider_not_found');
  end if;

  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  select * into v_assignment
  from public.job_assignments
  where job_id = p_job_id
    and handyman_id = v_handyman.id
    and cancelled_at is null
    and completed_at is null
  for update;

  if v_assignment.id is null or v_job.status not in ('assigned','in_progress') then
    return jsonb_build_object('ok', false, 'code', 'active_assignment_not_found');
  end if;

  update public.job_assignments
  set cancelled_at = now(),
      cancelled_by = 'handyman',
      cancellation_reason = p_reason,
      cancellation_notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = v_assignment.id;

  update public.job_matches
  set status = 'lost', responded_at = coalesce(responded_at, now())
  where id = v_assignment.accepted_match_id;

  update public.jobs
  set status = 'matching',
      next_match_at = now(),
      updated_at = now()
  where id = p_job_id;

  insert into public.reliability_events(
    job_id, subject_type, subject_id, event_type, actor_type, actor_id, notes
  ) values (
    p_job_id, 'handyman', v_handyman.id, 'cancel_after_assignment',
    'handyman', v_handyman.id, p_reason || coalesce(': ' || nullif(trim(coalesce(p_notes, '')), ''), '')
  );

  insert into public.job_events(job_id, event_type, actor_type, actor_id, metadata)
  values (
    p_job_id,
    'handyman_cancel',
    'handyman',
    v_handyman.id,
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'reason', p_reason,
      'notes', nullif(trim(coalesce(p_notes, '')), ''),
      'cooldown_minutes', 30,
      'reopened', true
    )
  );

  select c.phone into v_customer_phone
  from public.customers c
  where c.id = v_job.customer_id;

  if v_customer_phone is not null then
    insert into public.notification_outbox(
      recipient_phone, kind, body, payload, dedupe_key
    ) values (
      v_customer_phone,
      'handyman_cancelled_job',
      'Your assigned handyman can no longer attend. HandyConnect has reopened your request and is searching for another suitable handyman.',
      jsonb_build_object('job_id', p_job_id),
      'assigned-cancel-customer:' || p_job_id::text || ':' || v_assignment.id::text
    ) on conflict (dedupe_key) do nothing;
  end if;

  return jsonb_build_object(
    'ok', true,
    'job_id', p_job_id,
    'reopened', true,
    'cooldown_until', (
      select availability_cooldown_until from public.handymen where id = v_handyman.id
    ),
    'message', 'Job released. Matching has restarted and your 30-minute acceptance cool-down has begun.'
  );
end
$$;

create or replace function public.resolve_assigned_job_issue(
  p_job_id uuid,
  p_actor_phone text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs%rowtype;
  v_assignment public.job_assignments%rowtype;
  v_customer public.customers%rowtype;
  v_handyman public.handymen%rowtype;
  v_actor_type text;
  v_reopen boolean := false;
  v_message text;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if v_job.id is null then
    return jsonb_build_object('ok', false, 'error', 'job_not_found');
  end if;

  select * into v_assignment
  from public.job_assignments
  where job_id = p_job_id
    and cancelled_at is null
    and completed_at is null
  for update;
  if v_assignment.id is null then
    return jsonb_build_object('ok', false, 'error', 'assignment_not_found');
  end if;

  select * into v_customer from public.customers where id = v_job.customer_id;
  select * into v_handyman from public.handymen where id = v_assignment.handyman_id;

  if v_customer.phone = p_actor_phone then
    v_actor_type := 'customer';
  elsif v_handyman.phone = p_actor_phone then
    v_actor_type := 'handyman';
  else
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  if p_action = 'handyman_cancel' and v_actor_type = 'handyman' then
    return jsonb_build_object('ok', false, 'error', 'cancellation_reason_required');
  elsif p_action = 'customer_cancel' and v_actor_type = 'customer' then
    update public.job_assignments
    set cancelled_at = now(),
        cancelled_by = 'customer',
        cancellation_reason = 'customer_cancelled'
    where id = v_assignment.id;
    update public.jobs set status = 'cancelled', updated_at = now() where id = p_job_id;
    insert into public.reliability_events(job_id, subject_type, subject_id, event_type, actor_type, actor_id)
    values (p_job_id, 'customer', v_customer.id, 'cancel_after_assignment', 'customer', v_customer.id);
    v_message := 'Job cancelled after assignment.';
    insert into public.notification_outbox(recipient_phone, kind, body, payload, dedupe_key)
    values (
      v_handyman.phone,
      'customer_cancelled_job',
      'The customer cancelled this assigned HandyConnect job. You are available for other work again.',
      jsonb_build_object('job_id', p_job_id),
      'assigned-cancel-handyman:' || p_job_id::text
    ) on conflict (dedupe_key) do nothing;
  elsif p_action = 'handyman_no_show' and v_actor_type = 'customer' then
    update public.job_assignments
    set cancelled_at = now(),
        cancelled_by = 'customer',
        cancellation_reason = 'handyman_no_show'
    where id = v_assignment.id;
    update public.jobs set status = 'matching', next_match_at = now(), updated_at = now() where id = p_job_id;
    update public.job_matches
    set status = 'lost', responded_at = coalesce(responded_at, now())
    where id = v_assignment.accepted_match_id;
    insert into public.reliability_events(job_id, subject_type, subject_id, event_type, actor_type, actor_id)
    values (p_job_id, 'handyman', v_handyman.id, 'no_show', 'customer', v_customer.id);
    v_reopen := true;
    v_message := 'Handyman no-show recorded and matching restarted.';
    insert into public.notification_outbox(recipient_phone, kind, body, payload, dedupe_key)
    values (
      v_handyman.phone,
      'no_show_reported',
      'The customer reported that you did not attend an assigned HandyConnect job. New job acceptance is temporarily restricted while this is reviewed.',
      jsonb_build_object('job_id', p_job_id),
      'no-show-handyman:' || p_job_id::text
    ) on conflict (dedupe_key) do nothing;
  elsif p_action = 'customer_no_show' and v_actor_type = 'handyman' then
    update public.job_assignments
    set cancelled_at = now(),
        cancelled_by = 'system',
        cancellation_reason = 'customer_no_show'
    where id = v_assignment.id;
    update public.jobs set status = 'cancelled', updated_at = now() where id = p_job_id;
    insert into public.reliability_events(job_id, subject_type, subject_id, event_type, actor_type, actor_id)
    values (p_job_id, 'customer', v_customer.id, 'no_show', 'handyman', v_handyman.id);
    v_message := 'Customer no-show recorded and job closed.';
    insert into public.notification_outbox(recipient_phone, kind, body, payload, dedupe_key)
    values (
      v_customer.phone,
      'no_show_reported',
      'The assigned handyman reported that you were unavailable for the HandyConnect job. This has been recorded for review.',
      jsonb_build_object('job_id', p_job_id),
      'no-show-customer:' || p_job_id::text
    ) on conflict (dedupe_key) do nothing;
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_action_for_actor');
  end if;

  insert into public.job_events(job_id, event_type, actor_type, actor_id, metadata)
  values (
    p_job_id,
    p_action,
    v_actor_type,
    case when v_actor_type = 'customer' then v_customer.id else v_handyman.id end,
    jsonb_build_object('reopened', v_reopen, 'assignment_id', v_assignment.id)
  );

  return jsonb_build_object(
    'ok', true,
    'job_id', p_job_id,
    'action', p_action,
    'reopened', v_reopen,
    'message', v_message
  );
end
$$;

create or replace function public.confirm_job_completion(
  p_job_id uuid,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_customer_id uuid;
  v_handyman_id uuid;
  v_assignment_id uuid;
begin
  select j.customer_id, a.handyman_id, a.id
  into v_customer_id, v_handyman_id, v_assignment_id
  from public.jobs j
  join public.customers c on c.id = j.customer_id
  join public.job_assignments a on a.job_id = j.id
  where j.id = p_job_id
    and c.phone = p_customer_phone
    and j.status = 'in_progress'
    and a.cancelled_at is null
    and a.completed_at is null
    and a.completion_requested_at is not null
  for update of j, a;

  if v_assignment_id is null then
    return jsonb_build_object('ok', false, 'code', 'completion_not_available');
  end if;

  update public.job_assignments
  set customer_completed_at = coalesce(customer_completed_at, now()),
      completed_at = coalesce(completed_at, now())
  where id = v_assignment_id;

  update public.jobs
  set status = 'completed', updated_at = now()
  where id = p_job_id;

  update public.handymen
  set completed_jobs = completed_jobs + 1,
      last_active_at = now(),
      updated_at = now()
  where id = v_handyman_id;

  insert into public.job_events(job_id, event_type, actor_type, actor_id, metadata)
  values (
    p_job_id,
    'completion_confirmed',
    'customer',
    v_customer_id,
    jsonb_build_object('assignment_id', v_assignment_id)
  );

  insert into public.notification_outbox(recipient_phone, kind, body, payload, dedupe_key)
  select
    h.phone,
    'job_completed',
    'The customer confirmed the job as complete. You are available for new work again.',
    jsonb_build_object('job_id', p_job_id),
    'completion-confirmed:' || v_assignment_id::text
  from public.handymen h
  where h.id = v_handyman_id
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object(
    'ok', true,
    'message', 'Job completed. Thank you. Please rate the handyman based on the service you received.'
  );
end
$$;

create or replace function public.admin_force_release_job(
  p_job_id uuid,
  p_admin_reference text,
  p_reason text,
  p_reopen boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs%rowtype;
  v_assignment public.job_assignments%rowtype;
begin
  if length(trim(coalesce(p_admin_reference, ''))) < 2
    or length(trim(coalesce(p_reason, ''))) < 5
  then
    return jsonb_build_object('ok', false, 'code', 'admin_reference_and_reason_required');
  end if;

  select * into v_job
  from public.jobs
  where id = p_job_id
  for update;

  if v_job.id is null then
    return jsonb_build_object('ok', false, 'code', 'job_not_found');
  end if;

  select * into v_assignment
  from public.job_assignments
  where job_id = p_job_id
    and cancelled_at is null
    and completed_at is null
  for update;

  if v_assignment.id is null then
    return jsonb_build_object('ok', false, 'code', 'active_assignment_not_found');
  end if;

  update public.job_assignments
  set cancelled_at = now(),
      cancelled_by = 'admin',
      cancellation_reason = case when p_reopen then 'abandoned' else 'admin_release' end,
      cancellation_notes = trim(p_reason)
  where id = v_assignment.id;

  update public.job_matches
  set status = 'lost', responded_at = coalesce(responded_at, now())
  where id = v_assignment.accepted_match_id;

  update public.jobs
  set status = case when p_reopen then 'matching' else 'cancelled' end,
      next_match_at = case when p_reopen then now() else null end,
      updated_at = now()
  where id = p_job_id;

  insert into public.job_events(job_id, event_type, actor_type, metadata)
  values (
    p_job_id,
    'admin_force_release',
    'admin',
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'admin_reference', trim(p_admin_reference),
      'reason', trim(p_reason),
      'reopened', p_reopen
    )
  );

  return jsonb_build_object(
    'ok', true,
    'job_id', p_job_id,
    'assignment_id', v_assignment.id,
    'reopened', p_reopen
  );
end
$$;

create or replace function public.restore_provider_cooldowns()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.handymen
  set availability_status = 'available',
      available_until = now() + interval '8 hours',
      availability_cooldown_until = null,
      resume_after_cooldown = false,
      last_active_at = now(),
      updated_at = now()
  where active_job_id is null
    and availability_status = 'offline'
    and resume_after_cooldown = true
    and availability_cooldown_until is not null
    and availability_cooldown_until <= now();
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- Function access is service-only. WhatsApp and admin Edge Functions call these RPCs.
revoke all on function public.accept_job_transaction(uuid,text) from public, anon, authenticated;
revoke all on function public.accept_job_match(uuid) from public, anon, authenticated;
revoke all on function public.set_handyman_availability(text,text,integer) from public, anon, authenticated;
revoke all on function public.cancel_handyman_assignment(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.resolve_assigned_job_issue(uuid,text,text) from public, anon, authenticated;
revoke all on function public.confirm_job_completion(uuid,text) from public, anon, authenticated;
revoke all on function public.admin_force_release_job(uuid,text,text,boolean) from public, anon, authenticated;
revoke all on function public.restore_provider_cooldowns() from public, anon, authenticated;

grant execute on function public.accept_job_transaction(uuid,text) to service_role;
grant execute on function public.accept_job_match(uuid) to service_role;
grant execute on function public.set_handyman_availability(text,text,integer) to service_role;
grant execute on function public.cancel_handyman_assignment(uuid,text,text,text) to service_role;
grant execute on function public.resolve_assigned_job_issue(uuid,text,text) to service_role;
grant execute on function public.confirm_job_completion(uuid,text) to service_role;
grant execute on function public.admin_force_release_job(uuid,text,text,boolean) to service_role;
grant execute on function public.restore_provider_cooldowns() to service_role;

revoke all on function private.accept_job_core(uuid,uuid) from public, anon, authenticated;
revoke all on function private.prevent_manual_availability_override() from public, anon, authenticated;
revoke all on function private.sync_provider_capacity_from_assignment() from public, anon, authenticated;
revoke all on function private.process_job_release() from public, anon, authenticated;

-- Close every application table in the exposed public schema. Production Edge
-- Functions use service_role, so current WhatsApp traffic remains operational.
do $$
declare
  v_table record;
begin
  for v_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and c.relispartition = false
  loop
    execute format(
      'alter table %I.%I enable row level security',
      v_table.schema_name,
      v_table.table_name
    );
  end loop;
end
$$;

-- SECURITY DEFINER functions are not public API endpoints.
do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function.signature);
    execute format('grant execute on function %s to service_role', v_function.signature);
  end loop;
end
$$;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

notify pgrst, 'reload schema';
