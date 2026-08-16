alter table public.service_scope_regression_samples enable row level security;
revoke all on table public.service_scope_regression_samples from anon, authenticated;

alter function public.enforce_confirmed_service_before_matching() set search_path = pg_catalog, public;

create index if not exists idx_dispute_cases_job_id on public.dispute_cases(job_id);
create index if not exists idx_job_attachments_customer_id on public.job_attachments(customer_id);
create index if not exists idx_job_quotes_assignment_id on public.job_quotes(assignment_id);
create index if not exists idx_job_quotes_customer_id on public.job_quotes(customer_id);
create index if not exists idx_job_quotes_handyman_id on public.job_quotes(handyman_id);
create index if not exists idx_jobs_confirmed_skill_id on public.jobs(confirmed_skill_id);
create index if not exists idx_notification_retry_audit_notification_id on public.notification_retry_audit(notification_id);
create index if not exists idx_reliability_events_job_id on public.reliability_events(job_id);
create index if not exists idx_user_reports_reported_customer_id on public.user_reports(reported_customer_id);
create index if not exists idx_user_reports_reported_handyman_id on public.user_reports(reported_handyman_id);
