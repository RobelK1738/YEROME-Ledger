# Projection-first change review

The app now centers on income sources, monthly taxes/charges/profit/splits,
referral commission projections, expected income and shared Admin instructions.
The existing monthly formulas and Owner/Admin privacy boundaries remain.

Hard YAGNI: no manual allocation builder, payment statuses, approval workflow,
new tax engine or new dependencies. The only new stored data is a current
planning row per owner: partnership/apartment overrides, optional planned fund
date and plain-text instructions. Historical finance records are preserved.

Validation on the final source:

- All 70 Node tests pass, including derived forecasts, future terms, exact-cent
  allocation, owner privacy and Admin-only instruction saves.
- The Vite production build and Git whitespace checks pass.
- All SQL migrations, the new plan permission/save assertions and the demo seed
  pass against disposable PostgreSQL via PGlite.
- The native full security suite could not run: initdb/pg_ctl/psql are absent.
  Broader legacy SQL assertions were not validated in PGlite; that runtime was
  used only for migration and focused planning checks.
- Browser visual QA could not run: the cloud browser cannot reach the local
  development server. No live account was used to test mutations.

The additive projection_allocation_plans migration is applied to the identified
YEROME-Ledger Supabase project. Its local filename matches the server-recorded
version 20261031032557. Live checks confirm RLS is enabled, anon/authenticated
cannot directly read/write/call save, and service_role can call the save routine.
The advisor's no-policy informational finding is intentional for this API-only
storage: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
No production application code has been deployed.
