create unique index uq_active_free_registration_entitlement
on public.entitlements(handyman_id, entitlement_type, source_type)
where entitlement_type='free_leads' and source_type='registration' and status='active';

create or replace function public.onboard_handyman(
  p_phone text, p_full_name text, p_business_name text default null, p_email text default null,
  p_skill_codes text[] default '{}', p_city text default null, p_suburb text default null, p_province text default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_handyman_id uuid; v_skill_code text; v_skill_id bigint;
begin
  if nullif(btrim(p_phone),'') is null then raise exception 'phone is required'; end if;
  if nullif(btrim(p_full_name),'') is null then raise exception 'full_name is required'; end if;
  if nullif(btrim(p_city),'') is null then raise exception 'city is required'; end if;
  insert into public.handymen(phone,full_name,business_name,email)
  values (btrim(p_phone),btrim(p_full_name),nullif(btrim(p_business_name),''),nullif(btrim(p_email),''))
  on conflict (phone) do update set full_name=excluded.full_name,
    business_name=coalesce(excluded.business_name,public.handymen.business_name),
    email=coalesce(excluded.email,public.handymen.email), updated_at=now()
  returning id into v_handyman_id;
  foreach v_skill_code in array coalesce(p_skill_codes,'{}') loop
    select id into v_skill_id from public.skills where code=v_skill_code and active=true;
    if v_skill_id is null then raise exception 'unknown or inactive skill code: %',v_skill_code; end if;
    insert into public.handyman_skills(handyman_id,skill_id) values(v_handyman_id,v_skill_id)
    on conflict (handyman_id,skill_id) do nothing;
  end loop;
  insert into public.service_areas(handyman_id,suburb,city,province,country_code)
  values(v_handyman_id,nullif(btrim(p_suburb),''),btrim(p_city),nullif(btrim(p_province),''),'ZA')
  on conflict (handyman_id,suburb,city,province,country_code) do nothing;
  insert into public.entitlements(handyman_id,entitlement_type,source_type,quantity,status)
  values(v_handyman_id,'free_leads','registration',3,'active') on conflict do nothing;
  return v_handyman_id;
end; $$;
