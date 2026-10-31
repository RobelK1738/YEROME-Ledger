# YEROME Ledger v2

A shared income estimation and projection tool for YEROME Admin and owners.
Both portals tell one story: job income sources, estimated taxes and charges,
profit and splits, referral commission sources, next expected income, and
Admin’s simple instructions for allocating the next fund.

Estimates require job compensation inputs and a partnership model. Agreement
verification, generated paycheck rows, receipts, transfers and settlement
posting do not gate projections. Historical finance records are preserved.

## Read first

- [Business rules and decisions](docs/business-rules-v2.md)
- [As-found audit](docs/legacy-audit.md)
- [Migration and preview runbook](docs/migration-runbook.md)

The detailed founder implementation plan was supplied separately and is not
part of the tracked repository.

## Architecture

React/Vite renders one Owner statement and an Admin company statement with
individual owner statements. Each statement pairs monthly totals with normalized
two-week amounts, followed by a link to the next expected income.
Both roles have a separate Allocations tab for job-by-job paycheck instructions.
Admin can choose an owner and edit their shared notes. Job, referral and assumption
management stay in a secondary menu. Supabase Auth supplies identity. Vercel `/api` handlers
revalidate it and return explicit role-specific DTOs. Owners cannot read other
owners or Admin’s actual spending and internal margins.

Admin sign-in uses the existing Supabase Auth account password. A legacy
`ADMIN_PASSWORD` deployment variable has no effect on sign-in. Use the login
page’s Admin password-recovery link to change that password. Password rejection,
service failures and a server access denial have separate messages; switching
between Owner and Admin clears the password and uses separate autofill sections.

The existing exact-cent monthly engine and 2026 Texas tax model remain in
`src/lib/finance-v2/` and `src/lib/calculations/`. `forecast.js` derives expected
income dates from saved job pay details, start date and job status; it writes no
paycheck records. Every saved, unpaused job contributes immediately as if it has started; start
dates never delay, prorate or suppress estimates. Net forecasts allocate each
owner’s combined annual tax rate to expected gross income. Suggested fund allocations scale monthly assumptions
to the next inflow and preserve cents. They are projections, not payroll facts.
Monthly and two-week totals share one table. Two-week amounts use 26 periods
per year; they are not half-month totals. Exact-cent residuals stay in the final
share, and unknown inputs stay unavailable rather than becoming zero.
Job sources, tax components and cost categories expand inside their totals.
Owner charges and Admin operating costs are separate allowlisted breakdowns.
The US Person's allocation starts with the employer paycheck: reserve remaining
tax, send service charges plus YEROME's share, and keep the remainder. Admin's
allocation starts with that same transfer as YEROME's expected receipt. It then
reserves actual operating costs, referral commissions and Gang allocation;
YEROME retains the remainder. The handoff amount is identical in both views.
Personal taxes and the owner share are not deducted again from YEROME's receipt.
Monthly amounts are spread across paychecks in proportion to expected after-tax
income, matching the existing forecast basis. Actual operating cost items sum
to the cost reserve, and final rounding cents stay in the residual profit.
The default view shows one next paycheck per job; a date selector uses the
existing 90-day forecast. US Person deposit previews credit employer withholding
once. Other payroll deductions reduce take-home; overwithholding creates no
negative reserve or assumed refund. Cash shortfalls suppress take-home or
retained-profit instructions. YEROME receipt previews keep the planned expense
reserves, reduce available profit for a smaller receipt, and leave excess cash
unallocated for review rather than automatically treating it as profit.
Both previews use saved assumptions, not confirmed bank or invoice data. Inputs
are not persisted or marked paid/received; the feature does not execute transfers.
The US Person's preview keeps the gross-pay plan, so changed gross pay needs a
plan revision. Shared Admin notes are labeled as instructions for the US Person.
The next 90 days of expected income use the configured 2026 Texas tax
assumptions, including dates beyond the calendar year.

`v3_projection_plans` stores only current partnership/apartment overrides,
optional planned fund date, and shared Admin instructions. The new migration
must be applied before deploying this branch. The API and existing audit log
handle saves; no workflow engine or payment state was added.

## Develop and verify

```bash
npm ci
npm test
npm run build
npm run test:security
```

The security test requires local PostgreSQL binaries and uses a disposable
database with simulated Auth claims. `npm run dev` serves the Vite frontend;
serverless `/api` handlers require a Vercel-compatible local or preview
runtime. Create local environment values from `.env.example`; keep the
service-role key out of client variables. See the runbook for a safe preview.

Legacy SQLite demo scripts and the old percentage/reserve UI were retired.
`supabase/seed.sql` now contains only unverified, loginless synthetic data for
a newly migrated disposable database.

Job setup is one form. Pay details and the first pay date are stored once on
the job and can be edited normally, including on the same day. There is no
terms review, separate effective date, Planned status or future-job activation step. Existing
saved compensation is read automatically; historical version rows stay intact.

Apply the additive `simple_job_pay_details` migration before deploying the
simplified job form. It adds current planning inputs to jobs and a service-only
save routine; historical compensation records are unchanged.
