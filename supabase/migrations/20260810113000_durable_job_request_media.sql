create table if not exists public.job_attachments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  media_id text not null,
  media_type text not null check (media_type in ('image','document')),
  mime_type text,
  file_name text,
  created_at timestamptz not null default now(),
  unique(job_id, media_id)
);

create index if not exists idx_job_attachments_job_created
  on public.job_attachments(job_id, created_at);

alter table public.job_attachments enable row level security;
revoke all on table public.job_attachments from anon, authenticated;

alter table public.job_attachments
  add column if not exists storage_path text,
  add column if not exists sha256 text,
  add column if not exists byte_size bigint,
  add column if not exists archived_at timestamptz;

create unique index if not exists uq_job_attachments_storage_path
  on public.job_attachments(storage_path)
  where storage_path is not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('job-media','job-media',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;