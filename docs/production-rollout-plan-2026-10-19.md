# YEROME v2 production rollout: verified baseline and gated sequence

**YAGNI override:** Admin sign-in uses email and password only. Disregard previous TOTP/AAL2 rollout steps. The changed single-Admin migration requires a fresh restored-data rehearsal before production deployment.

**Current checkpoint (2026-10-21):** The v2 application is already deployed,
but the production database is still at the legacy schema. The refreshed
backup, restore, migration rehearsal, and remaining deployment gates are in
[`production-rollout-preflight-2026-10-21.md`](production-rollout-preflight-2026-10-21.md).
The 2026-10-19 inventory below is retained as historical evidence; use the
newer preflight for current counts and the activation sequence. No production
database or Auth change is authorized before literal `DEPLOY V2` approval.

Status: **backup and local migration rehearsal complete; deployment approval
pending**. No production migration, Auth mutation, deployment, merge, or cleanup
has occurred. The founder's latest production-first instruction
supersedes the older isolated-preview requirement, while retaining a verified
backup, local restore rehearsal, and literal `DEPLOY V2` approval before any
production migration or PR merge. Auth-user deletion separately requires an
exact manifest and literal `EXECUTE CLEANUP` approval.

The 2026-10-19 backup and rehearsal evidence, including the managed Vault
restore limitation and the remaining configuration gates, is in
`docs/production-rehearsal-2026-10-19.md`. The baseline below records the
earlier preflight state; its former password blocker has been resolved through
the owner's private `~/.pgpass` configuration.

## Read-only production baseline (2026-10-19)

- GitHub repository `RobelK1738/YEROME-Ledger`, Draft PR #1, branch
  `feat/yerome-ledger-v2`, preflight head
  `69fa87db7e8b219fbc4bf7ae4b7ce7c03bcbd53a`;
  `main` `8b6fcedf81bf22680d5b6e1bfac2485340c43005`. The local remote's
  historical URL redirects to the named repository. Before this report was
  written, only the pre-existing untracked
  `YEROME_V2_IMPLEMENTATION_PLAN.md` was present locally.
- Supabase project `uliolbtonhrmjwaeliyj` is `ACTIVE_HEALTHY`, PostgreSQL
  17.6.1. The direct host resolves and accepts a network connection, but
  `psql -w` stops at `no password supplied`; no database credential or standard
  PostgreSQL connection profile is available in this workspace. The shell's
  default `pg_dump` is v14 and unsuitable for this server; an installed v17.11
  client is available at `/opt/homebrew/opt/postgresql@17/bin/pg_dump`. Do not
  infer that an API service-role key is a database password.
- Counts: 3 Auth users, 2 Owners, 12 jobs, 48 job paychecks, 50 costs,
  12 cost allocations, 75 audit entries, 0 referrals, 0 Storage buckets/objects.
  No Owner-to-Auth, job-to-Owner, or paycheck-to-job orphan was found. One
  designated Admin-role user exists; no second Admin-role user and no verified
  MFA factor. No v2 agreement, settlement, or Admin-pin table exists.
- `supabase_migrations.schema_migrations` is absent and the connected migration
  listing is empty. This is not evidence that legacy DDL needs rerunning.
- A disposable local database with the Auth shim and repository migrations
  `0001`–`0009` was compared with production using read-only catalog queries.
  All **339** public-schema table/column/constraint/index/trigger/RLS-policy/
  function signatures and source-body hashes matched. All **10** tax, template,
  and business-setting seed-row signatures matched, excluding generated IDs and
  timestamps. Hosted grants differ from the local shim's defaults: production
  currently allows `anon` EXECUTE on 9 public `SECURITY DEFINER` functions.
  The first v2 migration is intended to revoke this legacy exposure. Review
  grants separately on hosted Supabase after migration.
- Vercel production remains READY from `main` at `8b6fced`. Production and
  preview share the same five variable names; their protected values remain
  unverified. An unused `ADMIN_PASSWORD` variable remains, while
  `OWNER_AUTH_DOMAIN` is absent and server code would use `owners.local`.
  The public Auth settings endpoint reports signup disabled and email
  auto-confirm enabled. Hosted MFA/GoTrue behavior and the service-role key's
  project scope have not been validated.

## Backup and local recovery gate

1. Receive the production database password through a protected local
   PostgreSQL connection profile or process environment, never a shell
   argument, Git file, chat message, or command output. Verify host, project
   identity, database, PostgreSQL version, and TLS using separate libpq
   parameters. The exact direct host is
   `db.uliolbtonhrmjwaeliyj.supabase.co`; if its route fails, obtain the
   project's actual Session Pooler host/port/user from Supabase Connect.
2. Use the installed PostgreSQL 17 client to capture a timestamped logical
   dump outside the repository with restrictive
   permissions. Include public/application and relevant managed Auth/Storage
   schemas, data, functions, grants, policies, triggers, indexes, extensions,
   and role/configuration inventory. Record checksum, tool version, scope,
   destination, row counts, and the empty migration-history state. Storage
   currently has no objects, but recheck immediately before the dump.
3. Restore to an isolated **local** environment; never test restore against
   production. Compare all key row counts, Auth UUID relationships, and
   representative financial-row hashes without exposing their values. Verify
   that constraints, RLS, functions, and Auth tables are present. Document
   any managed Supabase roles, extensions, encryption keys, Auth service
   settings, or Storage binaries that a logical dump cannot restore alone.
   A successful local data restore does not prove hosted GoTrue compatibility.
4. Retain a tested recovery procedure and protected backup before any remote
   mutation. If the full dump or restore test fails, stop. Vercel rollback
   alone does not reverse database or Auth changes.

## Legacy migration baseline

Do not rerun `0001`–`0009`: their application objects and seed values are
already present and exact to the compared repository definitions. After a
verified backup and local restore, confirm those signatures again against the
same snapshot. Prepare a migration-history baseline with supported Supabase
tooling; execute the production history change only after `DEPLOY V2` approval.
Record each validated legacy version as already applied, then verify the
history before running any v2 file. Do not invent a history record for a
version that fails validation. Preserve all existing Owner, Auth UUID, job,
paycheck, cost, and audit rows.

The tracking procedure was exercised on a disposable PostgreSQL 17 database
using Supabase CLI 2.121.0. `migration repair --status applied 0001 ... 0009`
created exactly nine history rows (`0001` through `0009`), without rerunning
the migration SQL. A subsequent `db push --dry-run` listed exactly the twelve
v2 files below and no legacy files. This verifies CLI version handling and
ordering locally; it is not permission to repair production history yet.

## V2 order and maintenance sequence

Apply the following files **only after** the backup/restore rehearsal, review
of the final diff/configuration, and literal `DEPLOY V2` approval:

1. `20261018175226_harden_financial_access_v2.sql`
2. `20261018175452_v2_agreements_hourly_and_payruns.sql`
3. `20261018175809_v2_job_operations.sql`
4. `20261018180528_v2_commission_ledger.sql`
5. `20261018183000_owner_api_only_v2.sql`
6. `20261018190000_v2_review_integrity.sql`
7. `20261018191000_v2_settlement_gate.sql`
8. `20261018200000_v2_review2_settlement_integrity.sql`
9. `20261019020000_v2_schedule_and_transfer_integrity.sql`
10. `20261019073828_v2_verified_transfer_beneficiaries.sql`
11. `20261019073830_v2_effective_pay_schedules.sql`
12. `20261019082613_v2_single_admin_identity.sql`

First replay this order against the restored local copy, compare all historical
row counts/hashes, and inspect migration output. The second file archives
legacy reserve data, deactivates matching transfer instructions, drops active
reserve columns, and fixes Gang Cut to 10%; verify archive totals and original
row preservation. Status-event backfills describe only current-day known state;
do not fabricate historical pauses or referral eligibility. The settlement
policy approval table must remain empty, and no real transfer or settlement
posting is authorized.

For production, use the controlled maintenance sequence in the 2026-10-21
preflight. The application is already on v2; the first migration restricts
legacy RPCs, and the final security migration fails closed until the one
existing Admin UUID is pinned. The Admin password was already reset by the
owner and must not be changed again by bootstrap. Pin that UUID without
creating an account, then verify password-only Admin sign-in and protected operations. Auth cleanup remains separately gated.

## Outstanding gates

- Full PostgreSQL 17 logical backup and globals inventory are protected outside
  Git and checksum-verified. The local restore recovered and matched every row
  in 50 Auth/public/Storage tables; the 10 managed Vault archive entries could
  not be replayed into stock Homebrew PostgreSQL because `supabase_vault` is
  unavailable locally. Vault secrets and Storage objects were both empty.
- All 12 v2 migrations passed against the restored local production data, but
  a native Supabase-image restore remains unverified; the owner must review this
  documented exception before approving production migration.
- No hosted Auth-trigger, MFA, PostgREST, or three-role end-to-end evidence.
- Protected Vercel env values and service-role key scope not yet verified;
  remove unused `ADMIN_PASSWORD` only in the authorized configuration phase.
- No `DEPLOY V2` or `EXECUTE CLEANUP` approval has been given.
