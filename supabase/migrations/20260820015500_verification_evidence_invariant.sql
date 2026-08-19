-- First-principles verification invariant:
-- provider verification is derived from approved evidence, never from a naked flag.

-- Repair legacy rows that claim verification without approved evidence.
update public.handymen h
set verification_status = 'unverified',
    verified_at = null,
    verification_notes = 'Legacy verified state removed: no approved verification document on record',
    availability_status = 'offline',
    available_until = null,
    updated_at = now()
where h.verification_status = 'verified'
  and not exists (
    select 1
    from public.handyman_verification_documents d
    where d.handyman_id = h.id
      and d.status = 'approved'
  );

create or replace function public.enforce_handyman_verified_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.verification_status = 'verified' then
    if not exists (
      select 1
      from public.handyman_verification_documents d
      where d.handyman_id = new.id
        and d.status = 'approved'
    ) then
      raise exception 'approved_verification_document_required'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_handyman_verified_requires_evidence on public.handymen;
create trigger trg_handyman_verified_requires_evidence
before insert or update of verification_status on public.handymen
for each row
execute function public.enforce_handyman_verified_evidence();

create or replace function public.sync_handyman_verification_from_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_handyman_id uuid;
  v_status text;
  v_notes text;
begin
  if tg_op = 'DELETE' then
    v_handyman_id := old.handyman_id;
    v_status := old.status;
    v_notes := old.review_notes;
  else
    v_handyman_id := new.handyman_id;
    v_status := new.status;
    v_notes := new.review_notes;
  end if;

  if tg_op <> 'DELETE' and v_status = 'approved' then
    update public.handymen
    set verification_status = 'verified',
        verified_at = coalesce(verified_at, now()),
        verification_notes = coalesce(v_notes, verification_notes),
        updated_at = now()
    where id = v_handyman_id;

    insert into public.entitlements(
      handyman_id,
      entitlement_type,
      source_type,
      source_id,
      status
    ) values (
      v_handyman_id,
      'verified_badge',
      'admin',
      new.id,
      'active'
    )
    on conflict do nothing;
  elsif (tg_op = 'DELETE' and v_status = 'approved')
     or (tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved') then
    if not exists (
      select 1
      from public.handyman_verification_documents d
      where d.handyman_id = v_handyman_id
        and d.status = 'approved'
    ) then
      update public.handymen
      set verification_status = 'unverified',
          verified_at = null,
          verification_notes = 'Approved verification evidence removed or revoked',
          availability_status = 'offline',
          available_until = null,
          updated_at = now()
      where id = v_handyman_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_handyman_verification_from_evidence on public.handyman_verification_documents;
create trigger trg_sync_handyman_verification_from_evidence
after insert or update of status or delete on public.handyman_verification_documents
for each row
execute function public.sync_handyman_verification_from_evidence();
