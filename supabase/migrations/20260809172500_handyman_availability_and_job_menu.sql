alter table public.handymen
  add column if not exists availability_status text not null default 'offline'
    check (availability_status in ('available','busy','offline')),
  add column if not exists available_until timestamptz,
  add column if not exists last_active_at timestamptz;

create index if not exists idx_handymen_availability on public.handymen(availability_status, available_until);

create or replace function public.find_job_candidates(p_job_id uuid,p_limit integer default 5)
returns table(handyman_id uuid,score numeric,remaining_free_opportunities integer,has_pro_access boolean)
language sql security definer set search_path=pg_catalog,public as $$
with target_job as (
 select id,skill_id,city,suburb from public.jobs where id=p_job_id and status in ('open','matching')
), base as (
 select distinct h.id handyman_id,
 case when lower(coalesce(sa.suburb,''))=lower(coalesce(j.suburb,'')) and j.suburb is not null then 100 else 70 end::numeric score
 from target_job j join public.handyman_skills hs on hs.skill_id=j.skill_id
 join public.handymen h on h.id=hs.handyman_id
   and h.status='active'
   and h.availability_status='available'
   and (h.available_until is null or h.available_until>now())
 join public.service_areas sa on sa.handyman_id=h.id and lower(sa.city)=lower(j.city)
), usage as (
 select jm.handyman_id,count(*)::integer used from public.job_matches jm
 where jm.offered_at>=date_trunc('month',now()) group by jm.handyman_id
), access as (
 select b.handyman_id,b.score,
 exists(select 1 from public.entitlements e where e.handyman_id=b.handyman_id and e.entitlement_type='pro_access' and e.status='active'
 and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now())) has_pro_access,
 greatest(0,3-coalesce(u.used,0)) remaining_free_opportunities
 from base b left join usage u on u.handyman_id=b.handyman_id
)
select a.handyman_id,a.score,a.remaining_free_opportunities,a.has_pro_access from access a
where a.has_pro_access or a.remaining_free_opportunities>0
order by a.has_pro_access desc,a.score desc,a.handyman_id limit greatest(1,least(coalesce(p_limit,5),20)); $$;
revoke all on function public.find_job_candidates(uuid,integer) from public,anon,authenticated;
grant execute on function public.find_job_candidates(uuid,integer) to service_role;

create or replace function public.set_handyman_availability(p_phone text,p_status text,p_hours integer default 8)
returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;
begin
 if p_status not in ('available','busy','offline') then raise exception 'invalid availability status'; end if;
 update public.handymen
 set availability_status=p_status,
     available_until=case when p_status='available' then now()+make_interval(hours=>greatest(1,least(coalesce(p_hours,8),24))) else null end,
     last_active_at=now(),
     updated_at=now()
 where phone=p_phone returning id into v_id;
 if v_id is null then raise exception 'handyman not found'; end if;
 return v_id;
end; $$;
revoke all on function public.set_handyman_availability(text,text,integer) from public,anon,authenticated;
grant execute on function public.set_handyman_availability(text,text,integer) to service_role;
