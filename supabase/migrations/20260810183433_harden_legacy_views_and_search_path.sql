alter view public.assignment_schedule_ops set (security_invoker = true);
alter view public.handyman_reliability_ops set (security_invoker = true);
alter view public.notification_delivery_ops set (security_invoker = true);
alter view public.job_evidence_ops set (security_invoker = true);
alter view public.customer_job_status set (security_invoker = true);
alter view public.dispute_case_ops set (security_invoker = true);
alter view public.handyman_public_profiles set (security_invoker = true);
alter view public.handyman_job_status set (security_invoker = true);

revoke all on public.assignment_schedule_ops from public, anon, authenticated;
revoke all on public.handyman_reliability_ops from public, anon, authenticated;
revoke all on public.notification_delivery_ops from public, anon, authenticated;
revoke all on public.job_evidence_ops from public, anon, authenticated;
revoke all on public.customer_job_status from public, anon, authenticated;
revoke all on public.dispute_case_ops from public, anon, authenticated;
revoke all on public.handyman_public_profiles from public, anon, authenticated;
revoke all on public.handyman_job_status from public, anon, authenticated;

grant select on public.assignment_schedule_ops to service_role;
grant select on public.handyman_reliability_ops to service_role;
grant select on public.notification_delivery_ops to service_role;
grant select on public.job_evidence_ops to service_role;
grant select on public.customer_job_status to service_role;
grant select on public.dispute_case_ops to service_role;
grant select on public.handyman_public_profiles to service_role;
grant select on public.handyman_job_status to service_role;

alter function public.block_job_evidence_mutation()
  set search_path = pg_catalog, public;

revoke all on function public.block_job_evidence_mutation()
  from public, anon, authenticated;
grant execute on function public.block_job_evidence_mutation()
  to service_role;

notify pgrst, 'reload schema';
