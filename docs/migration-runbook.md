# V2 migration and preview runbook

## Current gate

This branch is a reviewable implementation checkpoint, **not a production
release**. Do not apply its migrations to the live Supabase project, deploy its
Vercel build, or move customer money until the founder reviews the remaining
decisions and authorizes release. Existing `0001`–`0009` migration files are
unchanged; all changes are new incremental migrations.

## Local verification

1. Use Node 18+ and local PostgreSQL tools (`initdb`, `pg_ctl`, `psql`). Run
   `npm ci`, `npm test`, `npm run build`, then `npm run test:security`.
2. The security script creates a disposable, local Unix-socket database,
   applies every migration, exercises separate simulated Admin/US Person
   identities, rehearses a synthetic approved settlement, partial payment,
   corrected paystub, typed adjustment, tampered per-check allocation, blocked
   overpayment and replay, then removes that database. It does **not** prove hosted Auth,
   PostgREST or Vercel behavior.
3. The optional `supabase/seed.sql` is disposable demo data for a **fresh local
   database only**. It creates no working Auth accounts, and its agreements
   remain unverified. Never run it against live customer data.
4. For a preview, use a separate Supabase project and Vercel preview with
   separate keys. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, and `OWNER_AUTH_DOMAIN`. Keep
   the service key server-only. Do not paste real keys into issues or logs.

## Backfill and rollback review

- Export and securely retain an owner-approved backup of the database before
  applying migrations outside a disposable test. Record schema version and
  row counts for owners, jobs, paychecks, referrals, cost entries and audit.
- Review each old `three_way` person, referral, fixed apartment cost and
  historical payment against the signed agreement. **Do not auto-map** them to
  a v2 agreement, commission or settlement. Give each confirmed agreement a
  version and effective date. Verify apartment amounts and Texas tax status.
- The migration moves historical obsolete reserve fields and labeled transfer
  instructions to `legacy_reserve_archive`, restricted to Admin. Active columns
  are dropped and those transfer instructions deactivated. Audit the archive
  count before any later retention decision; no obsolete amount is exposed in
  a v2 DTO or active calculation.
- The review migrations append receipt corrections and dated job/referral status
  histories. Existing terms are seeded with **current-day status only**; no
  unknown prior pauses or referral eligibility are fabricated. Reconcile old
  activity with source documents before any historical posting. The settlement
  approval table is empty after migration, so real posting stays disabled.
- The second-review migration verifies each posted check's deterministic
  weighted cents in SQL, revokes the old free-form adjustment RPC, and admits
  only correction-linked, formula-derived adjustments for new rows. It leaves
  prior adjustment rows intact and flags them for manual review. Rehearse both
  a fresh database and a sanitized copy with any historical adjustment rows.
- The third-review migration derives expected dates from one full-month pay
  term per job at posting time. Missing unscheduled dates or a whole job with
  no checks block the month. Terms with no first payday or a semi-monthly
  cadence remain unresolved; no historical dates are backfilled. New
  semi-monthly terms are disabled until two anchors and employer date rules
  exist. A holiday shift or no-pay period requires an audited exception design
  and signed policy before posting.
- New payment rows use an immutable external-transfer registry. Partner and
  commission allocations share a normalized transfer reference and verified
  total, with one allocation per obligation and stable request keys. Existing
  payment rows remain unlinked; do not auto-merge them into transfers. Reconcile
  each legacy reference against bank evidence in a sanitized copy before
  production migration. Duplicate or coincidentally reused references block
  automatically pending independent evidence review.
- A paystub correction can change every check's allocation in its posted
  month. All further partner payments in that month stop until reconciliation.
  If a revised contractual due would be less than an amount already paid,
  reconciliation stops. Do not invent a negative payment or silently offset
  another month; record a signed credit or recovery decision first.
- If a pre-production application test fails, stop serving the preview and
  restore its pre-migration database snapshot. Do not manually reverse only
  part of the interdependent v2 migrations. For production, write and test a
  rollback plan against a representative sanitized copy before approval.

## Reproducible preview checklist

1. Sign in as Admin; create Miki as a direct US Person, attach the signed
   agreement reference, and add $18.50/hour × 35 hours/week. Confirm typical
   biweekly gross $1,295 and one $900 agreed apartment charge.
2. Add a second $22/hour × 40 hours/week job. Confirm $1,760 typical
   biweekly gross and a changed combined annual tax estimate.
3. Create a referred US Person with a verified written referral agreement;
   record Miki as referrer. Check 1, 2, 3, 5, 10 and 12-job direct/referral
   golden figures using the supplied monthly after-tax fixture inputs.
4. Sign in as each distinct US Person. Check that the regular account sees
   only its own jobs/paychecks/agreed charges, and the referrer sees a separate
   $200 per eligible job monthly commission stream with permitted names only.
   Crafted direct table requests and another person's API IDs must yield no
   private rows. No owner response may contain actual spend, Gang Cut or margin.
5. Generate 26 and 27 actual pay dates, enter a real-looking **synthetic**
   paystub, and confirm gross/withholding/net are separate from the projected
   contractual share. Never infer cash receipt from a scheduled date.
6. Post a completed full-month referral accrual, then record a synthetic
   external payment. Verify accrued, paid and owed cents. Attempt an
   overpayment and a historical mutation; both must fail.
7. In the isolated preview only, explicitly enable a **synthetic** settlement
   policy after documenting the proposed receipt basis. Test a completed month,
   missing and late paystub, correction, partial partner payment, typed
   reconciliation across two checks, overpaid-balance block, loss block,
   idempotent replay and owner-specific read-only history. Never
   enable this policy in a live project without founder and professional signoff.
   Omit a biweekly date without creating a schedule row, then omit all dates
   for another full-month job; both must block. Retry the same partner and
   commission transfer POST after a reload and with a different request key;
   each must retain one paid amount. Allocate one transfer to two obligations
   and verify their sum never exceeds its bank total.
8. Validate keyboard/mobile navigation, loading/empty/error states, and all
   three role experiences. Retain screenshots and response samples with
   synthetic data for review.

## Open engineering gates

- Founder, accounting and legal signoff on the proposed receipt-net settlement
  basis, proportional allocation, charge timing, losses and payment custody is
  required before enabling any real policy row or partner posting. No approval
  row is installed by these migrations.
- Rehearse the migration and three-role Auth/PostgREST/browser flow on a
  separate hosted preview with distinct real test identities. Disposable local
  PostgreSQL role tests cannot prove hosted Supabase behavior.
- The current Vercel project shares Supabase variables between production and
  preview. Configure a branch-specific preview database and credentials before
  any hosted synthetic write. Do not inspect or log production secret values.
- Obtain verified two-anchor semi-monthly calendars and holiday/no-pay rules
  before restoring automatic schedules or allowing those months to settle.
- Extend the basic dated start/end tax-year projection to account for actual
  hours, prior pay, pauses, changing terms and independent employers. Confirm
  official tax fixtures for all filing statuses
  and the configured state before legal reliance.
- Add versioned edits for all per-job service cost categories and historical
  lease dates. Current editable apartment terms are versioned; per-job amounts
  use the v2 package constants.
- Extend annual tax projection through historical term segments and actual
  hours; current implementation suppresses annual liability after a term
  change rather than asserting a false annual wage figure.
- Obtain founder and accounting/legal decisions in `business-rules-v2.md`.

## Fourth-review migrations and evidence workflow

Apply `20261019073828_v2_verified_transfer_beneficiaries.sql` and
`20261019073830_v2_effective_pay_schedules.sql` only in an approved isolated
preview first. No production migration has been run by this handoff.

- Take the authorized database backup first. Record counts and exact row exports
  for transfers, partner/commission payments, referrals, paychecks and terms.
- Recipient/account/channel/currency fields are **not backfilled** on old
  transfers. New-row checks are NOT VALID to preserve old facts. The new payment
  `evidence_verified` field is false on old payments. Existing amount, paid date,
  reference, idempotency key and linkage remain unchanged.
- Old implicit-transfer allocation RPCs lose service access. New RPCs take a
  verified transfer ID. Deploy API/UI and these schema changes together; do not
  fall back to old payment routes if the schema is missing.
- Transfer locking requires service UPDATE privilege, but the immutable trigger
  rejects actual updates/deletes. Audit inserts receive an explicit service
  grant. New routines are SECURITY INVOKER, with empty search paths and no
  browser EXECUTE grants. Owners cannot read transfer or evidence tables.
- Never manufacture verification for old records. Export the review queue and
  reconcile it to retained external proof with the owner/accountant. Changes
  require a separately approved append-only correction; this release does not
  provide a reassignment or evidence override. Do not automatically send funds.
- Roll back the application by disabling affected payment/scheduling actions;
  retain these protections and audit records. Do not drop evidence or restore
  permissive RPC grants to recover old behavior. Use a forward correction after
  review if schema repair is needed.

Preview verification after organization/cost approval:

1. Run all migrations on sanitized representative data and compare the saved
   historical rows, allowing only explicitly added nullable/false metadata.
2. Sign in with distinct real Admin, Miki and regular US Person accounts. Verify
   Admin alone can register/review proof; owner HTTP calls return 403 and direct
   PostgREST calls cannot read or mutate transfer/evidence/payment rows.
3. Register a synthetic $200 transfer to Miki. Before evidence verification,
   allocation must fail. Verify synthetic proof, allocate $100 to his own share
   and $100 to his commission; totals reconcile. A different person's settlement
   must reject that same transfer, even with unused capacity or a fresh key.
4. Confirm proof/reference/account aliases never appear in partner requests,
   state or rendered UI. Legacy unverified balances show a review notice.
5. Use old biweekly February terms and monthly terms effective July. Backfill
   February 13/27 separately from July 31/August 31. Reject a June 19 + July 3
   request atomically. Schedule retries must not change recorded receipts.
6. Exercise archived accounts, duplicate submissions, crafted IDs, namespaced
   reference collisions and existing immutable corrections. Record browser and
   direct API evidence separately from local fixture results.

The disposable test runner also inserts previous-version synthetic payment data
before the fourth-review migration and asserts its preservation afterward. This
is local PostgreSQL evidence, not a hosted migration rehearsal.
