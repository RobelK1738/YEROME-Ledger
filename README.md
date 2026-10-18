# YEROME Ledger v2

Review-stage finance and operations app for YEROME Admin and read-only US
Persons. The v2 branch implements exact-cent direct/referral planning,
combined-person 2026 tax estimates, hourly job terms, dated employer receipt
tracking, full-month referral accruals and scoped statements. It is **not yet
approved for production or real partner settlement**.

## Read first

- [Business rules and decisions](docs/business-rules-v2.md)
- [As-found audit](docs/legacy-audit.md)
- [Migration and preview runbook](docs/migration-runbook.md)

The detailed founder implementation plan was supplied separately and is not
part of the tracked repository.

## Architecture

React/Vite renders Admin Overview, US Persons, Pay Runs, Configuration/Audit,
and US Person Home, My Jobs, Payments, with Commissions for an authorized
referrer. Supabase Auth supplies identity. Vercel `/api` handlers revalidate it
and return explicit role-specific DTOs. PostgreSQL RLS closes direct partner
access to legacy finance tables. Privileged mutations run on the server with
the service-role key. The pure business engine and tax model are in
`src/lib/finance-v2/` and `src/lib/calculations/`.

The tax model currently supports 2026 Texas planning only. Partner shares are
steady-state monthly estimates; paystub net deposits and referral payments are
separate recorded facts. A scheduled payday is not a settlement.

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
