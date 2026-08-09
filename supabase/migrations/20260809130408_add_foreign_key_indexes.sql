create index if not exists idx_job_assignments_accepted_match_id on public.job_assignments(accepted_match_id);
create index if not exists idx_job_assignments_handyman_id on public.job_assignments(handyman_id);
create index if not exists idx_jobs_customer_id on public.jobs(customer_id);
create index if not exists idx_jobs_skill_id on public.jobs(skill_id);
create index if not exists idx_payment_events_payment_id on public.payment_events(payment_id);
create index if not exists idx_reviews_customer_id on public.reviews(customer_id);
create index if not exists idx_reviews_handyman_id on public.reviews(handyman_id);
create index if not exists idx_subscriptions_plan_code on public.subscriptions(plan_code);
