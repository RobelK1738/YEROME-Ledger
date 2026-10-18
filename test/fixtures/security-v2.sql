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
  if has_function_privilege('authenticated', 'public.v2_post_settlement_batch(uuid,jsonb,text,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.v2_record_partner_payment(uuid,bigint,timestamptz,text,text,uuid)', 'EXECUTE') then
    raise exception 'Owner role can post settlement or payment';
  end if;
end $$;

-- Synthetic approved policy exists only in this disposable test database.
-- It validates the gated posting machinery without authorizing real money.
do $$ declare v_owner uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_actor uuid := '40000000-0000-0000-0000-000000000004';
  v_job uuid; v_check uuid; v_missing uuid; v_policy uuid; v_agreement uuid;
  v_batch uuid; v_line uuid; v_correction uuid; v_snapshot jsonb; v_payment uuid;
begin
  insert into public.owners(id,username,display_name) values (v_owner,'synthetic','Synthetic Settlement');
  v_agreement := public.v2_change_agreement(v_owner,'DIRECT_2_WAY',65000,90000,
    'synthetic-signed-contract',true,'2026-02-01',v_actor);
  v_job := public.v2_create_job(v_owner,'Synthetic Employer','Support','active',
    '2026-02-01',null,'2026-02-01','hourly',1850,35,null,'biweekly',
    '2026-02-13',26,v_actor);
  insert into public.job_paychecks(job_id,pay_date,status)
    values (v_job,'2026-02-13','scheduled') returning id into v_check;
  perform public.v2_record_receipt(v_check,
    '{"actual_gross_cents":350000,"actual_net_received_cents":300000,
      "federal_withheld_cents":50000,"social_security_withheld_cents":0,
      "medicare_withheld_cents":0,"additional_medicare_withheld_cents":0,
      "state_withheld_cents":0,"other_deductions_cents":0}'::jsonb,v_actor);
  insert into public.v2_settlement_policy_approvals(owner_id,policy_version,
    agreement_reference,legal_review_reference,effective_from,enabled,approved_at,approved_by)
    values (v_owner,'receipt-net-closed-month-proposal-v1',
      'synthetic-signed-contract','synthetic-legal-test','2026-02-01',true,now(),v_actor)
    returning id into v_policy;
  v_snapshot := jsonb_build_object(
    'calculationVersion','receipt-net-closed-month-proposal-v1',
    'ownerId',v_owner,'calendarMonth','2026-02-01',
    'agreementVersionId',v_agreement,'partnership','DIRECT_2_WAY',
    'activeJobCount',1,'afterTaxCents',300000,'quotedCostCents',185000,
    'actualCostCents',105000,'partnerDueCents',57500,'commissionCents',0,
    'gangCutCents',30000,'yeromeResidualCents',107500,
    'lines',jsonb_build_array(jsonb_build_object('paycheckId',v_check,
      'payDate','2026-02-13','receiptCorrectionSequence',0,
      'sourceGrossCents',350000,'sourceNetCents',300000,
      'quotedCostCents',185000,'actualCostCents',105000,
      'partnerDueCents',57500,'commissionCents',0,
      'gangCutCents',30000,'yeromeResidualCents',107500)));
  begin
    perform public.v2_create_job(v_owner,'Partial Month Employer','Support','active',
      '2026-02-15',null,'2026-02-15','hourly',1850,35,null,'biweekly',
      '2026-02-27',26,v_actor);
    perform public.v2_post_settlement_batch(v_policy,v_snapshot,'partial-job',v_actor);
    raise exception 'Partial-month job was omitted from settlement';
  exception when others then
    if SQLERRM <> 'Full-month job status needs review' then raise; end if;
  end;
  begin
    perform public.v2_post_settlement_batch(v_policy,v_snapshot - 'afterTaxCents',
      'missing-total',v_actor);
    raise exception 'Missing settlement total was accepted';
  exception when others then
    if SQLERRM <> 'Settlement formula or loss policy unresolved' then raise; end if;
  end;
  insert into public.job_paychecks(job_id,pay_date,status)
    values (v_job,'2026-02-27','scheduled') returning id into v_missing;
  begin
    perform public.v2_post_settlement_batch(v_policy,v_snapshot,'synthetic-month',v_actor);
    raise exception 'Missing paystub allowed settlement';
  exception when others then
    if SQLERRM = 'Missing paystub allowed settlement' then raise; end if;
  end;
  delete from public.job_paychecks where id = v_missing;
  v_batch := public.v2_post_settlement_batch(v_policy,v_snapshot,'synthetic-month',v_actor);
  if public.v2_post_settlement_batch(v_policy,v_snapshot,'synthetic-month',v_actor) <> v_batch then
    raise exception 'Settlement replay did not return original batch'; end if;
  if (select count(*) from public.v2_payrun_settlements where batch_id = v_batch) <> 1 then
    raise exception 'Settlement replay duplicated line'; end if;
  begin
    perform public.v2_post_settlement_batch(v_policy,v_snapshot || '{"partnerDueCents":1}'::jsonb,
      'synthetic-month',v_actor);
    raise exception 'Mismatched replay accepted';
  exception when others then
    if SQLERRM = 'Mismatched replay accepted' then raise; end if;
  end;
  select id into v_line from public.v2_payrun_settlements where batch_id = v_batch;
  v_payment := public.v2_record_partner_payment(v_line,10000,'2026-03-01T12:00:00Z',
    'synthetic-payment','synthetic-payment-key',v_actor);
  if public.v2_record_partner_payment(v_line,10000,'2026-03-01T12:00:00Z',
      'synthetic-payment','synthetic-payment-key',v_actor) <> v_payment then
    raise exception 'Payment replay duplicated payment'; end if;
  begin
    perform public.v2_record_partner_payment(v_line,50000,'2026-03-02T12:00:00Z',
      'overpay','overpay-key',v_actor);
    raise exception 'Partner overpayment accepted';
  exception when others then
    if SQLERRM = 'Partner overpayment accepted' then raise; end if;
  end;
  perform public.v2_record_receipt(v_check,
    '{"actual_gross_cents":350000,"actual_net_received_cents":299000,
      "federal_withheld_cents":51000,"social_security_withheld_cents":0,
      "medicare_withheld_cents":0,"additional_medicare_withheld_cents":0,
      "state_withheld_cents":0,"other_deductions_cents":0}'::jsonb,
    v_actor,'Corrected bank/paystub match');
  select id into v_correction from public.v2_paycheck_corrections
    where job_paycheck_id = v_check and sequence = 1;
  begin
    perform public.v2_record_partner_payment(v_line,47000,'2026-03-03T12:00:00Z',
      'before-adjustment','before-adjustment-key',v_actor);
    raise exception 'Payment allowed before correction adjustment';
  exception when others then
    if SQLERRM = 'Payment allowed before correction adjustment' then raise; end if;
  end;
  perform public.v2_record_settlement_adjustment(v_line,-1000,0,-500,0,-100,-400,
    v_correction,'Corrected February paystub','synthetic-adjustment',v_actor);
  begin
    perform public.v2_record_settlement_adjustment(v_line,-1000,0,-500,0,-100,-400,
      v_correction,'Different reason','synthetic-adjustment',v_actor);
    raise exception 'Mismatched adjustment replay was accepted';
  exception when others then
    if SQLERRM <> 'Adjustment replay mismatch' then raise; end if;
  end;
  perform public.v2_record_partner_payment(v_line,47000,'2026-03-03T12:00:00Z',
    'final-synthetic','final-payment-key',v_actor);
  if (select partner_due_cents +
      (select sum(partner_due_delta_cents) from public.v2_settlement_adjustments where settlement_id = v_line) -
      (select sum(amount_cents) from public.v2_partner_payments where settlement_id = v_line)
      from public.v2_payrun_settlements where id = v_line) <> 0 then
    raise exception 'Corrected settlement did not reconcile to paid amount'; end if;
end $$;

do $$ declare first_agreement uuid; second_agreement uuid; begin
  first_agreement := public.v2_change_agreement(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','DIRECT_2_WAY',65000,90000,
    'signed-agreement-a',true,current_date - 1,'40000000-0000-0000-0000-000000000004');
  second_agreement := public.v2_change_agreement(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','DIRECT_2_WAY',70000,95000,
    'signed-amendment-a',true,current_date + 1,'40000000-0000-0000-0000-000000000004');
  if (select count(*) from public.v2_agreement_versions
      where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 2 then
    raise exception 'Agreement history missing';
  end if;
  if (select effective_to from public.v2_agreement_versions where id = first_agreement) <> current_date then
    raise exception 'Previous agreement not closed prospectively';
  end if;
  begin
    perform public.v2_change_agreement(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','DIRECT_2_WAY',1,1,
      'backdated',true,current_date - 1,'40000000-0000-0000-0000-000000000004');
    raise exception 'Backdated agreement change accepted';
  exception when others then
    if SQLERRM = 'Backdated agreement change accepted' then raise; end if;
  end;
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
  insert into public.v2_job_status_events(job_id,status,effective_from) values
    ('bbbbbbbb-0000-0000-0000-000000000002','active','2026-01-01'),
    ('bbbbbbbb-0000-0000-0000-000000000003','active','2026-01-01');
  select id into referral from public.referrals
    where referred_owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  insert into public.v2_referral_status_events(referral_id,active,effective_from)
    values (referral,true,'2026-01-01');
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
  -- Current job status may change after the earned month. A midmonth pause
  -- disqualifies that job from strict full-month posting.
  insert into public.v2_job_status_events(job_id,status,effective_from) values
    ('bbbbbbbb-0000-0000-0000-000000000002','ended','2026-04-01'),
    ('bbbbbbbb-0000-0000-0000-000000000003','paused','2026-03-15');
  update public.jobs set status = 'ended',end_date = '2026-04-01'
    where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  update public.jobs set status = 'paused'
    where id = 'bbbbbbbb-0000-0000-0000-000000000003';
  accrual := public.v2_post_full_month_commission(referral,'2026-03-01',
    '40000000-0000-0000-0000-000000000004');
  if (select eligible_job_count from public.v2_commission_accruals where id = accrual) <> 1 then
    raise exception 'Historical commission ignored ended-after-month or midmonth pause';
  end if;
  update public.referrals set start_date = '2026-04-01' where id = referral;
  begin
    perform public.v2_post_full_month_commission(referral,'2026-01-01',
      '40000000-0000-0000-0000-000000000004');
    raise exception 'Future referral earned premature commission';
  exception when others then
    if SQLERRM = 'Future referral earned premature commission' then raise; end if;
  end;
  update public.referrals set start_date = '2026-01-01',end_date = '2026-02-28' where id = referral;
  begin
    perform public.v2_post_full_month_commission(referral,'2026-04-01',
      '40000000-0000-0000-0000-000000000004');
    raise exception 'Expired referral earned commission';
  exception when others then
    if SQLERRM = 'Expired referral earned commission' then raise; end if;
  end;
  update public.referrals set end_date = null where id = referral;
  begin
    perform public.v2_end_referral(referral,current_date + 1,
      '40000000-0000-0000-0000-000000000004');
    raise exception 'Future referral end left active uniqueness blocked';
  exception when others then
    if SQLERRM <> 'Invalid prospective referral end' then raise; end if;
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
     (select count(*) from public.job_compensation_terms) <> 0 or
     (select count(*) from public.v2_payrun_settlements) <> 0 or
     (select count(*) from public.v2_partner_payments) <> 0 or
     (select count(*) from public.v2_settlement_policy_approvals) <> 0 or
     (select count(*) from public.v2_paycheck_corrections) <> 0 then
    raise exception 'Owner A raw private row exposed';
  end if;
  begin
    perform public.v2_post_settlement_batch(null,'{}'::jsonb,'forbidden',
      '10000000-0000-0000-0000-000000000001');
    raise exception 'Owner A posted settlement';
  exception when insufficient_privilege then null;
  end;
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
  if r.eligible_job_count <> 0 or r.monthly_commission_cents <> 0
     or r.annual_commission_cents <> 0 or r.requires_review then
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
  if (select count(*) from public.jobs) <> 4 then raise exception 'Admin job access failed'; end if;
  select * into r from public.owner_earned_commissions('cccccccc-cccc-cccc-cccc-cccccccccccc', 2026);
  if r.referred_display_name <> 'Person B' then raise exception 'Admin referral access failed'; end if;
  begin
    insert into public.job_paychecks(job_id,pay_date,status) values
      ('aaaaaaaa-0000-0000-0000-000000000001','2026-09-01','scheduled');
    raise exception 'Authenticated Admin bypassed audited paycheck route';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ declare new_job uuid; new_check uuid; scheduled_check uuid; begin
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
  perform public.v2_change_job_terms(new_job, current_date + 1, 'hourly', 2200, 40,
    null, 'biweekly', '2026-03-13', 26, '40000000-0000-0000-0000-000000000004');
  if (select count(*) from public.job_compensation_terms where job_id = new_job) <> 2 then
    raise exception 'Versioned job terms missing';
  end if;
  if (select effective_to from public.job_compensation_terms
      where job_id = new_job and effective_from = '2026-02-01') <> current_date then
    raise exception 'Old terms effective date mutated incorrectly';
  end if;
  begin
    perform public.v2_change_job_terms(new_job, current_date - 1, 'hourly', 100, 40,
      null, 'biweekly', null, 26, '40000000-0000-0000-0000-000000000004');
    raise exception 'Backdated job change accepted';
  exception when others then
    if SQLERRM = 'Backdated job change accepted' then raise; end if;
  end;
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
  insert into public.job_paychecks(job_id,pay_date,status,actual_gross_cents,
    actual_net_received_cents,federal_withheld_cents,social_security_withheld_cents,
    medicare_withheld_cents,additional_medicare_withheld_cents,state_withheld_cents,
    other_deductions_cents)
    values (new_job,'2026-03-13','paid',129500,110000,19500,0,0,0,0,0)
    returning id into new_check;
  begin
    update public.job_paychecks set actual_net_received_cents = 100 where id = new_check;
    raise exception 'Received paycheck was mutable before settlement';
  exception when check_violation then null;
  end;
  insert into public.job_paychecks(job_id,pay_date,status)
    values (new_job,'2026-03-27','scheduled') returning id into scheduled_check;
  begin
    perform public.v2_record_receipt(scheduled_check,
      '{"actual_gross_cents":129500,"actual_net_received_cents":110001,
        "federal_withheld_cents":19500,"social_security_withheld_cents":0,
        "medicare_withheld_cents":0,"additional_medicare_withheld_cents":0,
        "state_withheld_cents":0,"other_deductions_cents":0}'::jsonb,
      '40000000-0000-0000-0000-000000000004');
    raise exception 'Unbalanced receipt posted';
  exception when others then
    if SQLERRM = 'Unbalanced receipt posted' then raise; end if;
  end;
  perform public.v2_record_receipt(scheduled_check,
    '{"actual_gross_cents":129500,"actual_net_received_cents":110000,
      "federal_withheld_cents":19500,"social_security_withheld_cents":0,
      "medicare_withheld_cents":0,"additional_medicare_withheld_cents":0,
      "state_withheld_cents":0,"other_deductions_cents":0}'::jsonb,
    '40000000-0000-0000-0000-000000000004');
  if public.v2_record_receipt(scheduled_check,
    '{"actual_gross_cents":129500,"actual_net_received_cents":109000,
      "federal_withheld_cents":20500,"social_security_withheld_cents":0,
      "medicare_withheld_cents":0,"additional_medicare_withheld_cents":0,
      "state_withheld_cents":0,"other_deductions_cents":0}'::jsonb,
    '40000000-0000-0000-0000-000000000004','Paystub typo corrected') <> 1 then
    raise exception 'Correction sequence wrong';
  end if;
  if (select count(*) from public.v2_paycheck_corrections where job_paycheck_id = scheduled_check) <> 1
     or (select count(*) from public.audit_log where action = 'v2.paycheck.corrected'
         and entity_id = scheduled_check) <> 1 then
    raise exception 'Correction or audit missing';
  end if;
  begin
    perform public.v2_record_receipt(scheduled_check,
      '{"actual_gross_cents":129500,"actual_net_received_cents":110000,
        "federal_withheld_cents":19500,"social_security_withheld_cents":0,
        "medicare_withheld_cents":0,"additional_medicare_withheld_cents":0,
        "state_withheld_cents":0,"other_deductions_cents":0}'::jsonb,
      '40000000-0000-0000-0000-000000000004');
    raise exception 'Receipt replay accepted';
  exception when others then
    if SQLERRM = 'Receipt replay accepted' then raise; end if;
  end;
  begin
    update public.job_paychecks set actual_gross_cents = 1 where id = scheduled_check;
    raise exception 'Recorded receipt was mutable';
  exception when check_violation then null;
  end;
  insert into public.v2_payrun_settlements(job_paycheck_id,owner_id,calculation_version,snapshot_json,settled_by)
    values (new_check,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','test-v2','{}'::jsonb,
      '40000000-0000-0000-0000-000000000004');
  begin
    update public.job_paychecks set status = 'skipped' where id = new_check;
    raise exception 'Settled paycheck was mutable';
  exception when check_violation then null;
  end;
end $$;

do $$ declare v_old uuid; v_new uuid; v_job uuid;
  v_actor uuid := '40000000-0000-0000-0000-000000000004';
begin
  select id into v_job from public.jobs where employer_name = 'Synthetic Employer';
  perform public.v2_change_job_status(v_job,'paused',current_date,v_actor);
  perform public.v2_change_job_status(v_job,'active',current_date,v_actor);
  if (select count(*) from public.v2_job_status_events where job_id = v_job) <> 3
     or (select status from public.jobs where id = v_job) <> 'active' then
    raise exception 'Same-day pause/resume history missing'; end if;
  begin
    perform public.v2_change_job_status(v_job,'paused',current_date - 1,v_actor);
    raise exception 'Backdated pause accepted';
  exception when others then
    if SQLERRM = 'Backdated pause accepted' then raise; end if;
  end;
  select id into v_old from public.referrals
    where referred_owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and active limit 1;
  v_new := public.v2_replace_referral(v_old,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',current_date,false,v_actor);
  if (select active from public.referrals where id = v_old)
     or not (select active from public.referrals where id = v_new)
     or (select count(*) from public.v2_referral_status_events where referral_id = v_old) < 2 then
    raise exception 'Atomic referral replacement or history failed'; end if;
end $$;
