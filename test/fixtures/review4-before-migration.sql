-- Synthetic prior-version records, inserted before the fourth-review migration.
insert into public.owners(id,username,display_name) values
 ('99999999-9999-9999-9999-999999999999','legacyproof','Historical referrer'),
 ('88888888-8888-8888-8888-888888888888','legacyreferred','Historical referred');
do $$ declare referral uuid; accrual uuid; payment uuid;
begin
  insert into public.referrals(referrer_owner_id,referred_owner_id)
    values ('99999999-9999-9999-9999-999999999999','88888888-8888-8888-8888-888888888888') returning id into referral;
  insert into public.v2_commission_accruals(referral_id,calendar_month,eligible_job_count,
    amount_cents,calculation_version,posted_by)
    values (referral,'2026-02-01',1,20000,'synthetic-legacy','99999999-9999-9999-9999-999999999999') returning id into accrual;
  payment := public.v2_record_commission_allocation(accrual,10000,'2026-03-01','legacy-reference',20000,
    'legacy-payment-key','99999999-9999-9999-9999-999999999999');
end $$;
create table private.review4_migration_snapshot as select to_jsonb(p) as payment, to_jsonb(t) as transfer
  from public.v2_commission_payments p join public.v2_external_transfers t on t.id = p.transfer_id
  where p.idempotency_key = 'legacy-payment-key';
