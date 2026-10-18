-- Run only against a disposable cluster after all migrations.
insert into auth.users (id) values
 ('10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002'),
 ('30000000-0000-0000-0000-000000000003'),
 ('40000000-0000-0000-0000-000000000004');
insert into public.owners (id, auth_user_id, username, display_name) values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000001', 'a', 'Person A'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '20000000-0000-0000-0000-000000000002', 'b', 'Person B'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc', '30000000-0000-0000-0000-000000000003', 'm', 'Miki');
insert into public.jobs (id, owner_id, employer_name, annual_salary_cents) values
 ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Employer A', 5000000),
 ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Employer B', 8000000),
 ('bbbbbbbb-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Employer C', 3000000);
insert into public.pay_cycles (id, period_start, period_end, pay_date) values
 ('aaaaaaaa-1111-1111-1111-111111111111', '2026-01-01', '2026-01-14', '2026-01-16'),
 ('bbbbbbbb-1111-1111-1111-111111111111', '2026-01-01', '2026-01-14', '2026-01-16');
insert into public.paycheck_entries (pay_cycle_id, job_id) values
 ('aaaaaaaa-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001'),
 ('bbbbbbbb-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002');
insert into public.referrals (referrer_owner_id, referred_owner_id) values
 ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
update public.referrals set start_date = '2026-01-01'
  where referred_owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

create function public.v2_default_execute_probe() returns integer
language sql as $$ select 1 $$;
do $$ begin
  if has_function_privilege('authenticated', 'public.v2_default_execute_probe()', 'EXECUTE')
     or has_function_privilege('anon', 'public.v2_default_execute_probe()', 'EXECUTE') then
    raise exception 'Future public functions default to browser execution';
  end if;
end $$;
drop function public.v2_default_execute_probe();

do $$ begin
  if has_function_privilege('authenticated', 'public.owner_active_wages_cents(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.owner_quoted_costs_annual_cents(uuid)', 'EXECUTE')
     or to_regprocedure('public.owner_financials(uuid,integer)') is not null then
    raise exception 'Unsafe finance functions are executable by authenticated';
  end if;
  if has_function_privilege('anon', 'public.owner_earned_commissions(uuid,integer)', 'EXECUTE') then
    raise exception 'Commission RPC is executable by anon';
  end if;
  if has_function_privilege('authenticated', 'public.v2_create_job(uuid,text,text,text,date,date,date,text,bigint,numeric,bigint,text,date,integer,uuid)', 'EXECUTE') then
    raise exception 'Owner role can call service-only job mutation';
  end if;
end $$;

do $$ declare first_agreement uuid; second_agreement uuid; begin
  first_agreement := public.v2_change_agreement(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','DIRECT_2_WAY',65000,90000,
    'signed-agreement-a',true,'2026-01-01','40000000-0000-0000-0000-000000000004');
  second_agreement := public.v2_change_agreement(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','DIRECT_2_WAY',70000,95000,
    'signed-amendment-a',true,'2026-02-01','40000000-0000-0000-0000-000000000004');
  if (select count(*) from public.v2_agreement_versions
      where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 2 then
    raise exception 'Agreement history missing';
  end if;
  if (select effective_to from public.v2_agreement_versions where id = first_agreement) <> '2026-01-31' then
    raise exception 'Previous agreement not closed prospectively';
  end if;
  begin
    update public.v2_agreement_versions set quoted_apartment_monthly_cents = 1
      where id = first_agreement;
    raise exception 'Historical agreement mutated';
  exception when check_violation then null;
  end;
end $$;

do $$ declare accrual uuid; referral uuid; begin
  update public.jobs set start_date = '2026-01-01'
    where owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  select id into referral from public.referrals
    where referred_owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  begin
    perform public.v2_post_full_month_commission(referral,'2026-02-01',
      '40000000-0000-0000-0000-000000000004');
    raise exception 'Commission posted without verified agreement';
  exception when others then
    if SQLERRM = 'Commission posted without verified agreement' then raise; end if;
  end;
  perform public.v2_change_agreement(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','MIKI_REFERRAL_2_WAY',65000,90000,
    'signed-referral-agreement-b',true,'2026-01-01',
    '40000000-0000-0000-0000-000000000004');
  accrual := public.v2_post_full_month_commission(referral,'2026-02-01',
    '40000000-0000-0000-0000-000000000004');
  if (select amount_cents from public.v2_commission_accruals where id = accrual) <> 40000 then
    raise exception 'Fixed commission accrual wrong';
  end if;
  perform public.v2_record_commission_payment(accrual,10000,'2026-03-05T12:00:00Z',
    'external-payment-test','40000000-0000-0000-0000-000000000004');
  if (select amount_cents - (select sum(amount_cents) from public.v2_commission_payments
      where accrual_id = accrual) from public.v2_commission_accruals where id = accrual) <> 30000 then
    raise exception 'Commission owed wrong';
  end if;
  begin
    perform public.v2_record_commission_payment(accrual,40000,'2026-03-06T12:00:00Z',
      'excess','40000000-0000-0000-0000-000000000004');
    raise exception 'Overpayment permitted';
  exception when others then
    if SQLERRM = 'Overpayment permitted' then raise; end if;
  end;
  begin
    update public.v2_commission_accruals set amount_cents = 0 where id = accrual;
    raise exception 'Accrual mutated';
  exception when check_violation then null;
  end;
end $$;

set role authenticated;
set request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","app_metadata":{"role":"owner"}}';
do $$ declare count_rows int; begin
  select count(*) into count_rows from public.jobs;
  if count_rows <> 0 then raise exception 'Owner A raw job row exposed: %', count_rows; end if;
  select count(*) into count_rows from public.pay_cycles;
  if count_rows <> 0 then raise exception 'Owner A raw pay-cycle row exposed: %', count_rows; end if;
  if (select count(*) from public.owners) <> 0 or
     (select count(*) from public.job_paychecks) <> 0 or
     (select count(*) from public.job_compensation_terms) <> 0 then
    raise exception 'Owner A raw private row exposed';
  end if;
  select count(*) into count_rows from public.paycheck_entries;
  if count_rows <> 0 then raise exception 'Legacy entry payload exposed'; end if;
  select count(*) into count_rows from public.referrals;
  if count_rows <> 0 then raise exception 'Referral row exposed'; end if;
  select count(*) into count_rows from public.cost_internal_details;
  if count_rows <> 0 then raise exception 'Internal cost exposed'; end if;
  begin
    perform public.owner_active_wages_cents('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    raise exception 'Owner A invoked unguarded finance function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.owner_earned_commissions('cccccccc-cccc-cccc-cccc-cccccccccccc', 2026);
    raise exception 'Owner A queried Miki commissions';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.jobs (owner_id, employer_name) values
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Forbidden');
    raise exception 'Owner A wrote Owner B job';
  exception when insufficient_privilege then null;
  end;
end $$;

set request.jwt.claims = '{"sub":"30000000-0000-0000-0000-000000000003","app_metadata":{"role":"owner"}}';
do $$ declare r record; begin
  select * into r from public.owner_earned_commissions(null, 2026);
  if r.eligible_job_count <> 2 or r.monthly_commission_cents <> 40000
     or r.annual_commission_cents <> 480000 or r.requires_review then
    raise exception 'Miki commission projection wrong';
  end if;
  if r.referred_owner_id is not null or r.referred_display_name <> 'Referred US Person' then
    raise exception 'Unapproved referred identity exposed';
  end if;
  if (select count(*) from public.jobs) <> 0 then
    raise exception 'Miki read referred jobs';
  end if;
end $$;

set request.jwt.claims = '{"sub":"40000000-0000-0000-0000-000000000004","app_metadata":{"role":"admin"}}';
do $$ declare r record; begin
  if (select count(*) from public.jobs) <> 3 then raise exception 'Admin job access failed'; end if;
  select * into r from public.owner_earned_commissions('cccccccc-cccc-cccc-cccc-cccccccccccc', 2026);
  if r.referred_display_name <> 'Person B' then raise exception 'Admin referral access failed'; end if;
end $$;
reset role;

do $$ declare new_job uuid; new_check uuid; begin
  new_job := public.v2_create_job(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Hourly employer', 'Support', 'active',
    '2026-02-01', null, '2026-02-01', 'hourly', 1850, 35,
    null, 'biweekly', '2026-02-13', 26,
    '40000000-0000-0000-0000-000000000004');
  if (select annual_salary_cents from public.jobs where id = new_job) <> 3367000 then
    raise exception 'Hourly annual gross wrong';
  end if;
  if (select count(*) from public.job_compensation_terms where job_id = new_job) <> 1 then
    raise exception 'Atomic term creation failed';
  end if;
  perform public.v2_change_job_terms(new_job, '2026-03-01', 'hourly', 2200, 40,
    null, 'biweekly', '2026-03-13', 26, '40000000-0000-0000-0000-000000000004');
  if (select count(*) from public.job_compensation_terms where job_id = new_job) <> 2 then
    raise exception 'Versioned job terms missing';
  end if;
  if (select effective_to from public.job_compensation_terms
      where job_id = new_job and effective_from = '2026-02-01') <> '2026-02-28' then
    raise exception 'Old terms effective date mutated incorrectly';
  end if;
  begin
    update public.job_compensation_terms set hourly_rate_cents = 1 where job_id = new_job;
    raise exception 'Historical terms were mutable';
  exception when check_violation then null;
  end;
  begin
    delete from public.jobs where id = new_job;
    raise exception 'Job with terms was deleted';
  exception when check_violation then null;
  end;
  insert into public.job_paychecks(job_id,pay_date,status)
    values (new_job,'2026-03-13','paid') returning id into new_check;
  insert into public.v2_payrun_settlements(job_paycheck_id,owner_id,calculation_version,snapshot_json,settled_by)
    values (new_check,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','test-v2','{}'::jsonb,
      '40000000-0000-0000-0000-000000000004');
  begin
    update public.job_paychecks set status = 'skipped' where id = new_check;
    raise exception 'Settled paycheck was mutable';
  exception when check_violation then null;
  end;
end $$;
