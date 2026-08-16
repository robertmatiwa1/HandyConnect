create or replace function public.beta_record_job_funnel()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare phone_value text;
begin
  begin
    select c.phone into phone_value from public.customers c where c.id=new.customer_id;
    if tg_op='INSERT' then
      insert into public.beta_funnel_events(channel,external_user_id,customer_id,job_id,event_name,metadata)
      values('whatsapp',phone_value,new.customer_id,new.id,'job_submitted',jsonb_build_object('origin','jobs','status',new.status));
      if new.status in ('assigned','in_progress','completed') then
        insert into public.beta_funnel_events(channel,external_user_id,customer_id,job_id,event_name,metadata)
        values('whatsapp',phone_value,new.customer_id,new.id,'job_assigned',jsonb_build_object('origin','jobs','status',new.status));
      end if;
      if new.status in ('in_progress','completed') then
        insert into public.beta_funnel_events(channel,external_user_id,customer_id,job_id,event_name,metadata)
        values('whatsapp',phone_value,new.customer_id,new.id,'job_started_work',jsonb_build_object('origin','jobs','status',new.status));
      end if;
    else
      if new.status='assigned' and old.status is distinct from 'assigned' then
        insert into public.beta_funnel_events(channel,external_user_id,customer_id,job_id,event_name,metadata)
        values('whatsapp',phone_value,new.customer_id,new.id,'job_assigned',jsonb_build_object('origin','jobs'));
      end if;
      if new.status='in_progress' and old.status is distinct from 'in_progress' then
        if old.status is distinct from 'assigned' then
          insert into public.beta_funnel_events(channel,external_user_id,customer_id,job_id,event_name,metadata)
          values('whatsapp',phone_value,new.customer_id,new.id,'job_assigned',jsonb_build_object('origin','jobs','inferred_from','in_progress'));
        end if;
        insert into public.beta_funnel_events(channel,external_user_id,customer_id,job_id,event_name,metadata)
        values('whatsapp',phone_value,new.customer_id,new.id,'job_started_work',jsonb_build_object('origin','jobs'));
      end if;
    end if;
    if new.status='completed' and (tg_op='INSERT' or old.status is distinct from 'completed') then
      if tg_op='UPDATE' and old.status not in ('assigned','in_progress') then
        insert into public.beta_funnel_events(channel,external_user_id,customer_id,job_id,event_name,metadata)
        values('whatsapp',phone_value,new.customer_id,new.id,'job_assigned',jsonb_build_object('origin','jobs','inferred_from','completed'));
      end if;
      if tg_op='UPDATE' and old.status is distinct from 'in_progress' then
        insert into public.beta_funnel_events(channel,external_user_id,customer_id,job_id,event_name,metadata)
        values('whatsapp',phone_value,new.customer_id,new.id,'job_started_work',jsonb_build_object('origin','jobs','inferred_from','completed'));
      end if;
      insert into public.beta_funnel_events(channel,external_user_id,customer_id,job_id,event_name,metadata)
      values('whatsapp',phone_value,new.customer_id,new.id,'job_completed',jsonb_build_object('origin','jobs'));
    end if;
  exception when others then raise warning 'beta funnel job telemetry failed: %',sqlerrm;
  end;
  return new;
end $$;
