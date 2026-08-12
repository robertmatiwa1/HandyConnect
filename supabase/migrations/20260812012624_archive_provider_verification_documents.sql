-- Provider identity documents contain highly sensitive personal information.
-- Keep the files in a private bucket and expose only metadata through the
-- service-role-backed operations API.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'provider-verification',
  'provider-verification',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.handyman_verification_documents
  add column if not exists storage_path text,
  add column if not exists sha256 text,
  add column if not exists byte_size bigint,
  add column if not exists archived_at timestamptz;

alter table public.handyman_verification_documents
  drop constraint if exists handyman_verification_documents_byte_size_check;

alter table public.handyman_verification_documents
  add constraint handyman_verification_documents_byte_size_check
  check (byte_size is null or (byte_size > 0 and byte_size <= 8388608));

create unique index if not exists
  uq_handyman_verification_documents_storage_path
  on public.handyman_verification_documents (storage_path)
  where storage_path is not null;

create index if not exists
  idx_handyman_verification_documents_unarchived
  on public.handyman_verification_documents (submitted_at)
  where storage_path is null and status = 'pending';

revoke all on table public.handyman_verification_documents
  from public, anon, authenticated;

-- No storage.objects policies are intentionally created. The private bucket
-- is accessed only by trusted Edge Functions using the service role.
