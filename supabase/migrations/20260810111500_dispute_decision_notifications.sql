create or replace function public.decide_dispute_case(
  p_case_id uuid,
  p_outcome text,
  p_reason text,
  p_actor text,
  p_apply_handyman_consequence boolean default false
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_report uuid;
  v_job uuid;
  v_handyman uuid;
  v_reporter_phone text;
  v_reported_handyman uuid;
  v_reported_customer uuid;
  v_respondent_phone text;
  v_outcome_label text;
  v_reporter_body text;
  v_respondent_body text;
begin
  if p_outcome not in ('report_upheld','report_not_upheld','partially_upheld','inconclusive','resolved_between_parties') then
    raise exception 'invalid_outcome';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'decision_reason_required'; end if;

  select d.report_id,d.job_id,r.reporter_phone,r.reported_handyman_id,r.reported_customer_id
    into v_report,v_job,v_reporter_phone,v_reported_handyman,v_reported_customer
  from dispute_cases d join user_reports r on r.id=d.report_id
  where d.id=p_case_id for update of d;
  if v_report is null then raise exception 'case_not_found'; end if;

  update dispute_cases set status='closed',outcome=p_outcome,decision_reason=trim(p_reason),decided_at=now(),closed_at=now(),decided_by=p_actor,updated_at=now() where id=p_case_id;
  update user_reports set status='resolved',resolved_at=now(),resolution_notes=trim(p_reason),resolved_by=p_actor where id=v_report;
  insert into dispute_case_events(case_id,event_type,actor,note,metadata)
    values(p_case_id,'case_decided',p_actor,trim(p_reason),jsonb_build_object('outcome',p_outcome,'handyman_consequence_requested',p_apply_handyman_consequence));
  insert into job_events(job_id,event_type,actor_type,metadata)
    values(v_job,'dispute_case_decided','admin',jsonb_build_object('case_id',p_case_id,'report_id',v_report,'outcome',p_outcome));

  if p_apply_handyman_consequence and p_outcome in ('report_upheld','partially_upheld') then
    select reported_handyman_id into v_handyman from user_reports where id=v_report;
    if v_handyman is not null then
      insert into reliability_events(job_id,subject_type,subject_id,event_type,actor_type,notes)
        values(v_job,'handyman',v_handyman,'upheld_dispute','admin','Applied from upheld dispute case '||p_case_id::text);
    end if;
  end if;

  v_outcome_label := case p_outcome
    when 'report_upheld' then 'Upheld'
    when 'partially_upheld' then 'Partially upheld'
    when 'report_not_upheld' then 'Not upheld'
    when 'inconclusive' then 'Inconclusive'
    when 'resolved_between_parties' then 'Resolved between parties'
  end;

  v_reporter_body := 'HandyConnect has completed its review of your report. Outcome: '||v_outcome_label||'. The case is now closed. For privacy and safety, internal review notes and the other party''s private information are not shared in WhatsApp.';
  if v_reporter_phone is not null then
    insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
    values(v_reporter_phone,'dispute_decision',v_reporter_body,jsonb_build_object('case_id',p_case_id,'report_id',v_report,'job_id',v_job,'outcome',p_outcome),'dispute-decision:'||p_case_id::text||':reporter')
    on conflict(dedupe_key) do nothing;
  end if;

  if v_reported_handyman is not null then select phone into v_respondent_phone from handymen where id=v_reported_handyman;
  elsif v_reported_customer is not null then select phone into v_respondent_phone from customers where id=v_reported_customer;
  end if;

  if v_respondent_phone is not null and v_respondent_phone is distinct from v_reporter_phone then
    v_respondent_body := 'HandyConnect has completed a review concerning one of your jobs. Outcome: '||v_outcome_label||'. The case is now closed. For privacy and safety, the reporter''s private information and internal review notes are not shared in WhatsApp.';
    insert into notification_outbox(recipient_phone,kind,body,payload,dedupe_key)
    values(v_respondent_phone,'dispute_decision',v_respondent_body,jsonb_build_object('case_id',p_case_id,'report_id',v_report,'job_id',v_job,'outcome',p_outcome),'dispute-decision:'||p_case_id::text||':respondent')
    on conflict(dedupe_key) do nothing;
  end if;
end $$;

revoke all on function public.decide_dispute_case(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.decide_dispute_case(uuid,text,text,text,boolean) to service_role;
