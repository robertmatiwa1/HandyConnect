do $do$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='run_marketplace_pilot_harness';
  if v_def is null then raise exception 'pilot harness function not found'; end if;
  v_def := replace(
    v_def,
    $old$values(v_handyman_id,'pro_access','pilot','active',now(),now()+interval '1 month')$old$,
    $new$values(v_handyman_id,'pro_access','admin','active',now(),now()+interval '1 month')$new$
  );
  execute v_def;
end
$do$;
