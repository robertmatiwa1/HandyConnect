alter table public.jobs drop constraint if exists jobs_urgency_check;

alter table public.jobs
  add constraint jobs_urgency_check
  check (urgency in ('normal','urgent','emergency','today','flexible'));
