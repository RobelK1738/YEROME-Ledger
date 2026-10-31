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

React/Vite renders the Admin financial overview, Owners, Jobs, Projections &
allocation, and the Owner financial picture, My Jobs, What’s next and optional
Commission projections. Supabase Auth supplies identity. Vercel `/api` handlers
revalidate it and return explicit role-specific DTOs. Owners cannot read other
owners or Admin’s actual spending and internal margins.

The existing exact-cent monthly engine and 2026 Texas tax model remain in
`src/lib/finance-v2/` and `src/lib/calculations/`. `forecast.js` derives expected
income dates from dated compensation terms and job status; it writes no
paycheck records. Net forecasts allocate each owner’s combined annual tax rate
to expected gross income. Suggested fund allocations scale monthly assumptions
to the next inflow and preserve cents. They are projections, not payroll facts.
The forecast stops at December 31, 2026 until another tax year is configured.

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
