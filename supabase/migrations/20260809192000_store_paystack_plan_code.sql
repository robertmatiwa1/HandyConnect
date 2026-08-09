alter table public.plans add column if not exists provider_plan_code text;

update public.plans
set provider_plan_code = 'PLN_kqsoxz1jjjr5sln'
where code = 'pro_monthly';
