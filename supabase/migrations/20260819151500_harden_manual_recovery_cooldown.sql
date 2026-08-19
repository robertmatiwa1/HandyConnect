create or replace function public.guard_notification_recovery_cooldown()
returns trigger
language plpgsql
as $function$
begin
  if new.recipient_phone is null then return new; end if;

  if new.kind = any (array[
    'beta_recovery_nudge',
    'beta_recovery_manual_nudge',
    'ops_recovery_nudge',
    'pilot_nudge',
    'onboarding_recovery',
    'flow_fix_recovery'
  ]) then
    if exists (
      select 1
      from public.notification_outbox n
      where n.recipient_phone = new.recipient_phone
        and n.kind = any (array[
          'beta_recovery_nudge',
          'beta_recovery_manual_nudge',
          'ops_recovery_nudge',
          'pilot_nudge',
          'onboarding_recovery',
          'flow_fix_recovery'
        ])
        and n.created_at >= now() - interval '24 hours'
        and n.status not in ('failed','dead_letter')
    ) then
      return null;
    end if;
  elsif new.kind = 'ops_verification_nudge' then
    if exists (
      select 1
      from public.notification_outbox n
      where n.recipient_phone = new.recipient_phone
        and n.kind = 'ops_verification_nudge'
        and n.created_at >= now() - interval '24 hours'
        and n.status not in ('failed','dead_letter')
    ) then
      return null;
    end if;
  end if;

  return new;
end
$function$;
