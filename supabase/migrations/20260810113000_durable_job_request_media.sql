alter table public.job_attachments add column if not exists storage_path text, add column if not exists sha256 text, add column if not exists byte_size bigint, add column if not exists archived_at timestamptz;
create unique index if not exists uq_job_attachments_storage_path on public.job_attachments(storage_path) where storage_path is not null;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('job-media','job-media',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;