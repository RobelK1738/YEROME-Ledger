-- Disposable demo data only. Run once on a newly migrated local database.
-- These records have no Auth identities and cannot sign in. Never run this
-- seed on a production project or a copy containing real customer records.
begin;

insert into public.owners(id, username, display_name, filing_status, state, status)
values
  ('11111111-1111-1111-1111-111111111111', 'demo_miki', 'Miki (demo)', 'single', 'TX', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'demo_referred', 'Referred person (demo)', 'single', 'TX', 'active');

select public.v2_change_agreement(
  '11111111-1111-1111-1111-111111111111', 'DIRECT_2_WAY', 65000, 90000,
  'DEMO DIRECT AGREEMENT - NOT SIGNED', false, current_date,
  '44444444-4444-4444-4444-444444444444');
select public.v2_change_agreement(
  '22222222-2222-2222-2222-222222222222', 'MIKI_REFERRAL_2_WAY', 65000, 90000,
  'DEMO REFERRAL AGREEMENT - NOT SIGNED', false, current_date,
  '44444444-4444-4444-4444-444444444444');

insert into public.jobs(id,owner_id,employer_name,role_title,annual_salary_cents,
                        pay_frequency,pay_periods_per_year,status,start_date)
values
  ('10000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
   'Demo employer A','Support',3367000,'biweekly',26,'active',current_date),
  ('20000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
   'Demo employer B','Support',4576000,'biweekly',26,'active',current_date),
  ('20000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',
   'Demo employer C','Support',4576000,'biweekly',26,'active',current_date);

insert into public.job_compensation_terms(job_id,effective_from,mode,hourly_rate_cents,
  expected_weekly_hours,pay_frequency,periods_per_year)
values
  ('10000000-0000-0000-0000-000000000001',current_date,'hourly',1850,35,'biweekly',26),
  ('20000000-0000-0000-0000-000000000001',current_date,'hourly',2200,40,'biweekly',26),
  ('20000000-0000-0000-0000-000000000002',current_date,'hourly',2200,40,'biweekly',26);

-- An unverified relationship demonstrates the review state. It is not an
-- accrued or payable commission until the actual written agreement is checked.
insert into public.referrals(referrer_owner_id,referred_owner_id,
  commission_basis_type,commission_rate,flat_amount_cents,active,start_date)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'flat_per_active_job_month',0,20000,false,current_date);

commit;
