alter table public.handymen
  add column if not exists bio text,
  add column if not exists years_experience integer,
  add column if not exists profile_completed_at timestamptz;

alter table public.handymen drop constraint if exists handymen_years_experience_check;
alter table public.handymen add constraint handymen_years_experience_check check(years_experience is null or years_experience between 0 and 60);

create or replace view public.handyman_public_profiles as
select h.id,h.full_name,h.business_name,h.bio,h.years_experience,h.verification_status,h.average_rating,h.completed_jobs,h.reliability_score,h.reliability_flag,
  coalesce((select string_agg(s.name,', ' order by s.name) from handyman_skills hs join skills s on s.id=hs.skill_id where hs.handyman_id=h.id),'') as skills,
  coalesce((select string_agg(distinct concat_ws(', ',sa.suburb,sa.city),'; ' order by concat_ws(', ',sa.suburb,sa.city)) from service_areas sa where sa.handyman_id=h.id),'') as service_areas
from handymen h;

create or replace function public.get_assigned_handyman_profile(p_job_id uuid,p_customer_phone text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_h uuid; v_p record; begin
 select a.handyman_id into v_h from job_assignments a join jobs j on j.id=a.job_id join customers c on c.id=j.customer_id
 where a.job_id=p_job_id and c.phone=p_customer_phone and a.cancelled_at is null order by a.assigned_at desc limit 1;
 if v_h is null then return jsonb_build_object('ok',false,'reason','not_assigned'); end if;
 select * into v_p from handyman_public_profiles where id=v_h;
 return jsonb_build_object('ok',true,'profile',to_jsonb(v_p));
end $$;
revoke all on function public.get_assigned_handyman_profile(uuid,text) from public,anon,authenticated;
grant execute on function public.get_assigned_handyman_profile(uuid,text) to service_role;