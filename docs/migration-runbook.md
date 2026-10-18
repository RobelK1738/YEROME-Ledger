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
   corrected paystub, adjustment and replay, then removes that database. It does **not** prove hosted Auth,
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
   missing and late paystub, correction, partial partner payment, adjustment,
   loss block, idempotent replay and owner-specific read-only history. Never
   enable this policy in a live project without founder and professional signoff.
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
