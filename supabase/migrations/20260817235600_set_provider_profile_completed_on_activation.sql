create or replace function public.set_provider_profile_completed_on_activation()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
begin
  if new.profile_completed_at is null
     and new.registration_status = 'active'
     and new.terms_accepted_at is not null
     and exists (select 1 from public.handyman_skills hs where hs.handyman_id = new.id)
     and exists (select 1 from public.service_areas sa where sa.handyman_id = new.id)
  then
    new.profile_completed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_provider_profile_completed_on_activation on public.handymen;
create trigger trg_set_provider_profile_completed_on_activation
before update of registration_status, terms_accepted_at on public.handymen
for each row
execute function public.set_provider_profile_completed_on_activation();
