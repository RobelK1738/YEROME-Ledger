# PR #1 fourth review response

Reviewed baseline: `2c773c5979fb4e55795fc7f2beb68858eef566c1`.
Branch: `feat/yerome-ledger-v2`. PR remains Draft and unmerged.

## Implemented

- P1: transfer recipient, private source/destination aliases, USD/bank channel,
  separate registration and explicit external-evidence verification. SQL derives
  the recipient from the obligation and rejects cross-person allocations in both
  directions, including raw service inserts. Same-person share plus commission
  may use one transfer within its total. Referral identities are immutable.
- Removed service access to implicit-verification allocation RPCs. New routines
  accept transfer IDs and serialize stable-key retries. Existing duplicate,
  outstanding-balance, correction and transfer-cap checks remain in force.
- P2: historical/future term selection in the API, plus atomic SQL revalidation,
  schedule writes and audit. A request crossing a term boundary fails in full;
  separate requests support historical biweekly and new monthly schedules.
- Historical transfers and payment facts are preserved without invented proof.
  Admin and partner views flag unverified legacy amounts; bank evidence and
  account aliases are absent from owner DTOs.

## Changed files

- `supabase/migrations/20261019073828_v2_verified_transfer_beneficiaries.sql` —
  recipient/evidence model, immutable identity, allocation guards and grants.
- `supabase/migrations/20261019073830_v2_effective_pay_schedules.sql` —
  transactional dated-term schedule validation and audit.
- `server/admin/{transfers,paycheck,settlements,commissions}.js`, `api/index.js` —
  Admin evidence workflow and new allocation/scheduling RPCs.
- `src/pages/v2/{AdminTransfers,AdminPayRuns,OwnerPages}.jsx`,
  `src/lib/data/v2.js` — registration/verification, scoped transfer selection,
  historical scheduling and legacy review notices.
- `server/_lib/v2.js`, `server/me/commissions.js`,
  `src/lib/finance-v2/{projection,posted-settlement,commission-history}.js` —
  allowlisted verification-status totals without confidential transfer fields.
- `src/lib/formatting/dates.js`, `test/admin-review4.test.js`,
  `test/schedule-v2.test.js`, `test/{posted-settlement,commission-history}-v2.test.js`,
  `test/fixtures/{security-v2,review4,review4-before-migration}.sql`,
  `test/run-security-v2.sh` — regression and migration-preservation evidence.
- `docs/{business-rules-v2,migration-runbook,pr1-fourth-review-response}.md` —
  rules, limits, review response and reproducible preview checklist.

## Business invariants checked

- Original reproduction before the fix: SQL raised **Cross-recipient allocation
  accepted**. After the fix the same attempt is rejected with **Transfer
  beneficiary does not match obligation**.
- Same person's $100 share + $100 commission = $200 transfer; an additional cent
  fails. Registration alone cannot count as payment. Wrong recipient evidence,
  cross-recipient raw inserts, changed bank namespace and identity mutation fail.
- February 13/27 are generated from the old biweekly term; July 31/August 31 use
  the new monthly term. A future open-ended term does not displace older dates.
  Boundary/off-cadence requests fail and leave no partial writes; retries preserve
  received paychecks.
- Existing golden finance, combined-tax, apartment, no-reserve, settlement
  correction/reweighting, duplicate payment and commission tests remain passing.

## Tests actually executed

- Before implementation: Node suite 33 passed / 1 failed (new dated-term case);
  disposable SQL failed on the reproduced cross-recipient allocation.
- `npm test`: 35 passed / 0 failed, including real router/auth/client code with
  synthetic HTTP transport. This is not a real hosted Auth test.
- `npm run test:security`: full incremental migrations, prior-version payment
  preservation, service-role operations, role denials and demo seed passed on a
  disposable PostgreSQL cluster. Synthetic JWT claims; no hosted Supabase writes.
- `npm run build`: Vite production build passed.
- `node --check` for changed server/helper/test modules and `git diff --check`.

## Privacy/security verification

Owner/Miki API requests to Admin transfer/read/write routes return 403 in the
transport test. SQL authenticated owner identities cannot read transfer/evidence
rows or execute new service routines; Admin can read evidence. The actual
`service_role` tests caught and corrected missing transfer-lock and audit-insert
grants and the owner lookup privilege used by job operations. Immutable updates remain rejected after granting row-lock permission.
The owner DTO strips synthetic confidential evidence fields and exposes only an
unverified recorded-payment amount for that owner. Hosted Auth, PostgREST and
browser isolation remain unverified.

## Data and migration considerations

No existing migration changed. The local preservation fixture inserts a payment
using the prior schema, migrates, and compares original row contents exactly.
New metadata is null/false, with no automatic historical verification. Global
reference uniqueness is intentionally conservative across bank/provider aliases;
genuine collisions are held for independent review. Multi-recipient batches and
legacy proof corrections are not enabled by this single-recipient model.

## Explicit founder decisions needed

- Select/confirm the Supabase organization for an isolated hosted branch; the
  plugin requires organization selection and an explicit recurring-cost
  confirmation before branch creation. No cost has been accepted or branch made.
- Complete the hosted three-role/security audit and sanitized migration rehearsal
  against that isolated environment, never the production-targeted preview.
- Founder/accounting/legal signoff remains required on receipt-net closed-month
  basis versus biweekly payouts, proof standards, commission timing, moved
  paydays/holiday exceptions, partial months, loss/recovery, charge/commission
  disclosures and custody. No settlement policy is seeded or enabled.

## Next independent implementation step

Publish the feature-branch changes and verify the exact-head Vercel build.
After the isolated environment is authorized, execute the hosted checklist in the
runbook. No merge or production release is authorized by these local results.
