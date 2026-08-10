alter table public.conversation_sessions
  drop constraint if exists conversation_sessions_flow_check;

alter table public.conversation_sessions
  add constraint conversation_sessions_flow_check
  check (
    flow = any (
      array[
        'entry'::text,
        'handyman_onboarding'::text,
        'customer_job'::text,
        'customer_onboarding'::text,
        'job_intake'::text,
        'ready'::text
      ]
    )
  );