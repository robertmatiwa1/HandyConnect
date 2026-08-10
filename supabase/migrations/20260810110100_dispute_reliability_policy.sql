create or replace function public.refresh_handyman_reliability(p_handyman_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_score integer;v_no_show integer;v_cancel integer;v_upheld integer;v_flag text;v_until timestamptz;begin
 select count(*) filter(where event_type in ('handyman_no_show','no_show')),count(*) filter(where event_type in ('handyman_cancel','cancel_after_assignment','late_replacement')),count(*) filter(where event_type='upheld_dispute') into v_no_show,v_cancel,v_upheld from reliability_events where subject_type='handyman' and subject_id=p_handyman_id and created_at>=now()-interval '90 days';
 v_score:=greatest(0,100-(v_no_show*30)-(v_cancel*10)-(v_upheld*15));
 v_flag:=case when v_score<50 then 'restricted' when v_score<80 then 'watch' else 'good' end;
 v_until:=case when v_score<50 then now()+interval '7 days' else null end;
 update handymen set reliability_score=v_score,reliability_flag=v_flag,reliability_restricted_until=v_until,updated_at=now() where id=p_handyman_id;
 return jsonb_build_object('handyman_id',p_handyman_id,'score',v_score,'flag',v_flag,'no_shows_90d',v_no_show,'cancellations_90d',v_cancel,'upheld_disputes_90d',v_upheld,'restricted_until',v_until);end $$;