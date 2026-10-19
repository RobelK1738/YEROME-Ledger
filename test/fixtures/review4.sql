-- Runs after the main fixture. Synthetic evidence only; no production approval.
set role service_role;
do $$ declare actor uuid := '40000000-0000-0000-0000-000000000004';
  person uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  transfer uuid; line uuid; referral uuid; accrual uuid; payment uuid;
begin
  select id into line from public.v2_payrun_settlements where owner_id = person order by pay_date limit 1;
  transfer := public.v2_register_transfer(person,'review4-own-plus-commission',20000,
    '2026-03-07','bank-a/source','person-e/account',actor);
  if exists (select 1 from public.v2_transfer_verifications where transfer_id = transfer) then
    raise exception 'Registration fabricated verification'; end if;
  begin
    perform public.v2_record_partner_allocation(line,10000,transfer,'unverified',actor);
    raise exception 'Unverified transfer allocated';
  exception when others then
    if SQLERRM <> 'Transfer must be verified against external evidence before allocation' then raise; end if;
  end;
  begin
    perform public.v2_verify_transfer(transfer,'cccccccc-cccc-cccc-cccc-cccccccccccc',20000,
      '2026-03-07','review4-own-plus-commission','bank-a/source','person-e/account','proof-1',actor);
    raise exception 'Wrong recipient proof accepted';
  exception when others then
    if SQLERRM <> 'Evidence must confirm recipient, amount, date, reference and accounts' then raise; end if;
  end;
  perform public.v2_verify_transfer(transfer,person,20000,'2026-03-07',
    'review4-own-plus-commission','bank-a/source','person-e/account','proof-1',actor);
  begin
    update public.v2_external_transfers set recipient_owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' where id = transfer;
    raise exception 'Transfer recipient changed after verification';
  exception when check_violation then null;
  end;
  -- A referrer has ordinary partner earnings as well as a separate commission.
  insert into public.referrals(referrer_owner_id,referred_owner_id)
    values (person,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') returning id into referral;
  insert into public.v2_commission_accruals(referral_id,calendar_month,eligible_job_count,
    amount_cents,calculation_version,posted_by)
    values (referral,'2026-03-01',1,20000,'synthetic-review4',actor) returning id into accrual;
  payment := public.v2_record_partner_allocation(line,10000,transfer,'review4-share',actor);
  if public.v2_record_partner_allocation(line,10000,transfer,' review4-share ',actor) <> payment then
    raise exception 'Idempotent retry failed'; end if;
  perform public.v2_record_commission_allocation(accrual,10000,transfer,'review4-commission',actor);
  if (select sum(amount_cents) from public.v2_partner_payments where transfer_id = transfer) +
     (select sum(amount_cents) from public.v2_commission_payments where transfer_id = transfer) <> 20000 then
    raise exception 'Same-person earnings streams did not reconcile'; end if;
  if exists (select 1 from public.v2_partner_payments where transfer_id = transfer and not evidence_verified) then
    raise exception 'Verified payment missing evidence marker'; end if;
  begin
    perform public.v2_record_commission_allocation(accrual,1,transfer,'over-capacity',actor);
    raise exception 'Transfer cap bypassed';
  exception when others then
    if SQLERRM <> 'External transfer already fully allocated' then raise; end if;
  end;
  begin
    update public.referrals set referrer_owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' where id = referral;
    raise exception 'Accrual recipient reassigned';
  exception when others then
    if SQLERRM <> 'Referral identities are immutable; create a replacement' then raise; end if;
  end;
  begin
    perform public.v2_register_transfer(person,'review4-own-plus-commission',20000,
      '2026-03-07','different-bank/source','person-e/account',actor);
    raise exception 'Namespace change bypassed reference uniqueness';
  exception when others then
    if SQLERRM <> 'External reference collision needs independent evidence review' then raise; end if;
  end;
  -- Reverse direction: a transfer to Person E cannot pay Miki's commission.
  transfer := public.v2_register_transfer(person,'review4-person-e',20000,
    '2026-03-08','bank-a/source','person-e/account',actor);
  perform public.v2_verify_transfer(transfer,person,20000,'2026-03-08',
    'review4-person-e','bank-a/source','person-e/account','proof-2',actor);
  select a.id into accrual from public.v2_commission_accruals a join public.referrals r on r.id = a.referral_id
    where r.referrer_owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' order by a.calendar_month limit 1;
  begin
    perform public.v2_record_commission_allocation(accrual,100,transfer,'wrong-commission-recipient',actor);
    raise exception 'Cross-recipient commission allocated';
  exception when others then
    if SQLERRM <> 'Transfer beneficiary does not match obligation' then raise; end if;
  end;
  -- Raw service inserts must pass the same beneficiary guard as the RPC.
  begin
    insert into public.v2_commission_payments(accrual_id,amount_cents,paid_at,payment_reference,
      recorded_by,transfer_id,idempotency_key)
      values (accrual,100,'2026-03-08','review4-person-e',actor,transfer,'raw-wrong-recipient');
    raise exception 'Raw insert bypassed beneficiary check';
  exception when others then
    if SQLERRM <> 'Transfer beneficiary does not match obligation' then raise; end if;
  end;
end $$;
reset role;

set role service_role;
-- Historical biweekly -> monthly and future-dated terms. Run through the same
-- transactional schedule writer used by the Admin API, including retry safety.
do $$ declare job uuid; old_term uuid; new_term uuid; check_id uuid; actor uuid := '40000000-0000-0000-0000-000000000004';
begin
  job := public.v2_create_job('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Historical calendar','Test','active',
    '2026-01-01',null,'2026-01-01','hourly',2000,40,null,'biweekly','2026-02-13',26,actor);
  select id into old_term from public.job_compensation_terms where job_id = job;
  -- Fixture models an already completed July change without changing system time.
  update public.job_compensation_terms set effective_to = '2026-06-30' where id = old_term;
  insert into public.job_compensation_terms(job_id,effective_from,mode,hourly_rate_cents,
    expected_weekly_hours,pay_frequency,first_pay_date,periods_per_year,created_by)
    values (job,'2026-07-01','hourly',2200,40,'monthly','2026-07-31',12,actor) returning id into new_term;
  if public.v2_schedule_paychecks(job,old_term,array['2026-02-13','2026-02-27']::date[],actor) <> 2 then
    raise exception 'Historical schedule backfill failed'; end if;
  if public.v2_schedule_paychecks(job,new_term,array['2026-07-31','2026-08-31']::date[],actor) <> 2 then
    raise exception 'New schedule failed'; end if;
  select id into check_id from public.job_paychecks where job_id = job and pay_date = '2026-02-13';
  perform public.v2_record_receipt(check_id,'{"actual_gross_cents":100,"actual_net_received_cents":100,
    "federal_withheld_cents":0,"social_security_withheld_cents":0,"medicare_withheld_cents":0,
    "additional_medicare_withheld_cents":0,"state_withheld_cents":0,"other_deductions_cents":0}',actor);
  perform public.v2_schedule_paychecks(job,old_term,array['2026-02-13','2026-02-27']::date[],actor);
  if (select status from public.job_paychecks where id = check_id) <> 'paid' then
    raise exception 'Schedule retry mutated paid receipt'; end if;
  begin
    perform public.v2_schedule_paychecks(job,new_term,array['2026-02-13']::date[],actor);
    raise exception 'Newest term used for historical check';
  exception when others then
    if SQLERRM <> 'Schedule crosses a payroll term boundary or has ambiguous terms' then raise; end if;
  end;
  begin
    perform public.v2_schedule_paychecks(job,old_term,array['2026-06-19','2026-07-03']::date[],actor);
    raise exception 'Boundary-crossing schedule accepted';
  exception when others then
    if SQLERRM <> 'Schedule crosses a payroll term boundary or has ambiguous terms' then raise; end if;
  end;
  if exists (select 1 from public.job_paychecks where job_id = job and pay_date = '2026-06-19') then
    raise exception 'Boundary rejection left partial writes'; end if;
  begin
    perform public.v2_schedule_paychecks(job,old_term,array['2026-02-14']::date[],actor);
    raise exception 'Off-cadence schedule accepted';
  exception when others then
    if SQLERRM <> 'Payday does not match recorded payroll cadence' then raise; end if;
  end;
  -- Future term is open-ended; it must not displace the currently applicable one.
  perform public.v2_change_job_terms(job,(current_date + interval '1 year')::date,
    'hourly',2300,40,null,'weekly',(current_date + interval '1 year')::date,52,actor);
  perform public.v2_schedule_paychecks(job,new_term,array['2026-09-30']::date[],actor);
end $$;

reset role;
-- New service-only routines cannot be invoked by any browser identity.
do $$ declare routine regprocedure;
begin
  foreach routine in array array[
    'public.v2_register_transfer(uuid,text,bigint,timestamptz,text,text,uuid)'::regprocedure,
    'public.v2_verify_transfer(uuid,uuid,bigint,timestamptz,text,text,text,text,uuid)'::regprocedure,
    'public.v2_record_partner_allocation(uuid,bigint,uuid,text,uuid)'::regprocedure,
    'public.v2_record_commission_allocation(uuid,bigint,uuid,text,uuid)'::regprocedure,
    'public.v2_schedule_paychecks(uuid,uuid,date[],uuid)'::regprocedure
  ] loop
    if has_function_privilege('authenticated',routine,'EXECUTE') or
       has_function_privilege('anon',routine,'EXECUTE') or
       not has_function_privilege('service_role',routine,'EXECUTE') then
      raise exception 'New RPC privilege incorrect: %',routine; end if;
  end loop;
  if has_function_privilege('service_role','public.v2_record_partner_allocation(uuid,bigint,timestamptz,text,bigint,text,uuid)','EXECUTE') or
     has_function_privilege('service_role','public.v2_record_commission_allocation(uuid,bigint,timestamptz,text,bigint,text,uuid)','EXECUTE') then
    raise exception 'Implicit verification RPC remains executable'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub','30000000-0000-0000-0000-000000000003','session_id','33333333-3333-3333-3333-333333333333','iat',extract(epoch from now())::bigint,'aal','aal1','app_metadata',jsonb_build_object('role','owner'))::text,false);
do $$ begin
  if (select count(*) from public.v2_external_transfers) <> 0 or
     (select count(*) from public.v2_transfer_verifications) <> 0 then
    raise exception 'Miki can read confidential transfer evidence'; end if;
  begin
    perform public.v2_register_transfer(null,null,null,null,null,null,null);
    raise exception 'Owner registered transfer';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub','40000000-0000-0000-0000-000000000004','session_id','44444444-0000-0000-0000-000000000004','iat',extract(epoch from now())::bigint,'aal','aal2','app_metadata',jsonb_build_object('role','admin'))::text,false);
do $$ begin
  if not exists (select 1 from public.v2_transfer_verifications where evidence_reference = 'proof-1') then
    raise exception 'Admin cannot inspect transfer verification'; end if;
end $$;
reset role;

-- Migration must not rewrite historical payment facts or invent verification.
do $$ declare saved private.review4_migration_snapshot; payment public.v2_commission_payments;
  transfer public.v2_external_transfers;
begin
  select * into saved from private.review4_migration_snapshot;
  select * into payment from public.v2_commission_payments where id = (saved.payment->>'id')::uuid;
  select * into transfer from public.v2_external_transfers where id = payment.transfer_id;
  if (to_jsonb(payment) - 'evidence_verified') <> saved.payment or payment.evidence_verified or
     (to_jsonb(transfer) - array['recipient_owner_id','source_account_alias','destination_account_alias','channel','currency']) <> saved.transfer or
     transfer.recipient_owner_id is not null or exists (
       select 1 from public.v2_transfer_verifications where transfer_id = transfer.id) then
    raise exception 'Migration changed historical records or fabricated evidence'; end if;
  begin
    perform public.v2_verify_transfer(transfer.id,'99999999-9999-9999-9999-999999999999',20000,
      transfer.paid_at,transfer.reference,'invented','invented','invented','99999999-9999-9999-9999-999999999999');
    raise exception 'Unreviewed historical recipient invented';
  exception when others then
    if SQLERRM <> 'Historical transfer needs independent recipient review' then raise; end if;
  end;
end $$;
