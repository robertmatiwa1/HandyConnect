update public.conversation_sessions
set flow = 'job_intake',
    state = 'ji_location',
    context = jsonb_strip_nulls(
      jsonb_build_object(
        'description', context->>'job_description',
        'service_key', case
          when context->>'skill_code' = 'appliance_repair' then 'appliance'
          else context->>'skill_code'
        end,
        'service_name', context->>'skill_name',
        'service_confirmed', true,
        'photo', null
      )
    ),
    updated_at = now()
where flow = 'customer_job'
  and state = 'capture_job_location'
  and coalesce(context->>'job_description','') <> ''
  and coalesce(context->>'skill_name','') <> '';
