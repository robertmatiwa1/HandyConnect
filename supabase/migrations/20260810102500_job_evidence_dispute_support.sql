create table if not exists public.job_evidence(
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  report_id uuid references public.user_reports(id) on delete set null,
  uploader_phone text not null,
  uploader_role text not null check(uploader_role in ('customer','handyman')),
  evidence_type text not null check(evidence_type in ('before_photo','after_photo','receipt','quote_support','dispute','other')),
  media_id text not null,
  media_type text not null check(media_type in ('image','document')),
  mime_type text,
  file_name text,
  caption text,
  created_at timestamptz not null default now(),
  unique(job_id,uploader_phone,media_id)
);
create index if not exists idx_job_evidence_job_created on public.job_evidence(job_id,created_at desc);
create index if not exists idx_job_evidence_report on public.job_evidence(report_id) where report_id is not null;
alter table public.job_evidence enable row level security;

create or replace function public.block_job_evidence_mutation()
returns trigger language plpgsql as $$ begin raise exception 'job_evidence_is_immutable'; end $$;
drop trigger if exists trg_job_evidence_immutable on public.job_evidence;
create trigger trg_job_evidence_immutable before update or delete on public.job_evidence for each row execute function public.block_job_evidence_mutation();

create or replace function public.record_job_evidence(
  p_job_id uuid,p_report_id uuid,p_uploader_phone text,p_evidence_type text,p_media_id text,p_media_type text,p_mime_type text default null,p_file_name text default null,p_caption text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_customer uuid; v_handyman uuid; v_role text; v_id uuid; begin
  select c.id into v_customer from jobs j join customers c on c.id=j.customer_id where j.id=p_job_id and c.phone=p_uploader_phone;
  if v_customer is not null then v_role:='customer'; else
    select h.id into v_handyman from job_assignments a join handymen h on h.id=a.handyman_id where a.job_id=p_job_id and h.phone=p_uploader_phone order by a.assigned_at desc limit 1;
    if v_handyman is null then raise exception 'uploader_not_party_to_job'; end if; v_role:='handyman';
  end if;
  if p_report_id is not null and not exists(select 1 from user_reports r where r.id=p_report_id and r.job_id=p_job_id) then raise exception 'report_not_for_job'; end if;
  insert into job_evidence(job_id,report_id,uploader_phone,uploader_role,evidence_type,media_id,media_type,mime_type,file_name,caption)
  values(p_job_id,p_report_id,p_uploader_phone,v_role,p_evidence_type,p_media_id,p_media_type,p_mime_type,p_file_name,nullif(trim(coalesce(p_caption,'')),'')) returning id into v_id;
  insert into job_events(job_id,event_type,actor_type,metadata) values(p_job_id,'evidence_submitted',v_role,jsonb_build_object('evidence_id',v_id,'evidence_type',p_evidence_type,'report_id',p_report_id));
  return v_id;
end $$;
revoke all on function public.record_job_evidence(uuid,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_job_evidence(uuid,uuid,text,text,text,text,text,text,text) to service_role;

create or replace view public.job_evidence_ops as
select e.id,e.job_id,e.report_id,e.uploader_phone,e.uploader_role,e.evidence_type,e.media_type,e.mime_type,e.file_name,e.caption,e.created_at,
 j.description as job_description,j.status as job_status,r.reason as report_reason,r.status as report_status
from job_evidence e join jobs j on j.id=e.job_id left join user_reports r on r.id=e.report_id;