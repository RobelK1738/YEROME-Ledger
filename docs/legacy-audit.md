# As-found technical audit

Baseline: `origin/main` at `8b6fcedf81bf22680d5b6e1bfac2485340c43005`,
verified before branching on 2026-10-18. The Google workbook and authenticated
production UI were not accessible for independent inspection. The founder's
supplied fixture values and companion plan were inspected locally. No live
customer records, production settings or secrets were read.

| Severity | Baseline evidence | Impact and v2 action |
| --- | --- | --- |
| Critical | `supabase/migrations/0003_financial_functions.sql:65-76,108-137,245-247` defines `SECURITY DEFINER` financial functions with caller-supplied person IDs and grants `authenticated` execution. | Cross-person financial reads were possible if called directly. New migration revokes execution, removes the obsolete finance RPC and limits owner data to a fresh-authenticated allowlisted API. |
| Critical | `supabase/migrations/0001_init.sql:459-460` permits every authenticated account to select all pay cycles. Its owner table policies also expose complete legacy rows. | New migrations close direct owner reads and use scoped server statements. Tested with distinct simulated identities in disposable PostgreSQL. |
| Critical | `src/lib/calculations/summary.js:33-60,105-116` (baseline) defaults to an old three-way split, applies a 12% haircut before Gang Cut, and clamps payouts. | Replaced with exact-cent direct/referral formulas; negative results remain visible for review. |
| High | `src/lib/calculations/summary.js:92-95,146-167,210-214` (baseline) calculates and returns obsolete reserve values. | Removed active reserve logic/fields/flows. Incremental migration archives historical values in an Admin-only table and drops active columns. |
| High | `src/lib/calculations/tax.js:36-45` (baseline) ignores the configured standard deduction. | One 2026 JS configuration applies deduction and official brackets to combined person wages. |
| High | `supabase/migrations/0009_three_partnerships.sql` retained the wrong three-way package and percentage economics. | Legacy terms are not silently recoded. Each v2 agreement requires Admin verification and a versioned record. |
| High | `supabase/seed.sql` had an obsolete percentage referral, reserve transfers, and costs inconsistent with the founder's apartment model. | Replaced with isolated, unverified v2 demonstration rows; no logins or payments. |

Implementation entry points: `src/lib/finance-v2/index.js` (pure math),
`src/lib/finance-v2/projection.js` (person projection and strict DTOs),
`api/_lib/v2.js` (verified identity and scoped data loading),
`api/me/*` and `api/admin/*` (role-specific endpoints), and the five
`supabase/migrations/20261018*.sql` files (security and versioned records).

Remaining release blockers are listed in `migration-runbook.md`. In
particular, the dated payrun settlement operation and its end-to-end tests are
not complete; the current UI records employer receipts and full-month
commissions, but it does not settle a partner share automatically.
