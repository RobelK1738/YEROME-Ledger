# YEROME v2 production preflight — 2026-10-21

**Authorization gate:** This is a preparation and local rehearsal record. No
production migration-history repair, v2 migration, Admin pin, Auth-factor
enrollment, account deletion, password change, transfer, or settlement was
performed. The database and Auth activation sequence below requires the
founder's literal `DEPLOY V2` approval. Account cleanup requires a separate
exact manifest and authorization.

## Live scope and incident

- Vercel project `yerome-ledger` in `robel-kebedes-projects`, project ID
  `prj_OLL5cjOIGDiYw6H5GXudEeAHmSGk`, serves
  `https://yerome-ledger.vercel.app`. Deployment
  `dpl_Fidb8WGMtyyBvErGzCo2hQJX28xy` is READY from `main` commit
  `95287feaa074a0c3e5450861a82a76745a173ed2`. The production browser
  bundle points to Supabase project `uliolbtonhrmjwaeliyj`. The service-role
  key and protected `ADMIN_EMAIL` **values** were not read, so their exact
  project/email scope still needs a private check before mutation.
- Supabase project `uliolbtonhrmjwaeliyj` in organization
  `pqrjqbbnntlvcpyhuorm` is `ACTIVE_HEALTHY` (PostgreSQL 17.6.1). The
  password grant returning HTTP 200 followed by `/api/auth/session` HTTP 403
  is consistent with the verified missing `public.v2_authorize_session` RPC.
  The function, `private.admin_identity`, and
  `supabase_migrations.schema_migrations` are all absent in production.
- Read-only production inventory: one Auth user and identity, zero active Auth
  sessions or MFA factors, two Owners, 12 jobs, 48 job paychecks, 50 costs,
  12 cost allocations and 97 audit entries. The one designated Admin is
  email-confirmed, has the `admin` role and is not linked to an Owner. The
  owner reset the password; this rollout must preserve it. The previous
  2026-10-19 audit count was 75, which is why that backup is superseded.

## Refreshed backup and restore proof

- Timestamped backup: `~/Library/Application Support/YEROME Ledger/production-backups/20261021T080932Z/`
  on a FileVault-enabled Mac, outside Git. The directory is mode 0700 and
  backup files are mode 0600. PostgreSQL 17 `pg_dump` captured the whole
  database in custom format (`postgres-full.dump`, 460,264 bytes); PostgreSQL
  17 `pg_dumpall --globals-only` captured roles (`globals.sql`, 7,263 bytes).
  Connection used TLS and the existing `~/.pgpass`; no password was displayed.
- `pg_restore -l` parsed the archive. All three `SHA256SUMS` entries verified;
  the database archive SHA-256 is
  `fb97f0469175ac4cdb5b71d840aaf50339c8c760bdd030d1b05da0415aae5ebd`.
  The backup contains 53 table-data archive entries. It is a logical backup,
  so hosted Auth service settings and external Storage object bytes are not
  included. Storage objects and Vault secrets were both zero at backup time.
- Restored into a private local PostgreSQL 17 cluster with network listening
  disabled. A 51-table Auth/public/Storage row-count and row-digest manifest
  matches production exactly. The stock Homebrew server lacks the managed
  `supabase_vault` extension, so ten managed Vault archive entries were
  excluded from this local restore; no Vault secret rows existed. The archive
  and globals remain intact. Hosted GoTrue compatibility cannot be proven by
  this local restore.

## Legacy baseline and migration rehearsal

- Replaying repository migrations `0001`–`0009` on a second disposable local
  database produced **339/339** matching public schema signatures against the
  current production catalog. Ten core seed numeric/configuration signatures
  matched. Five editable `cost_templates.notes` text values differ from the
  original seed and were preserved in the backup; do not rerun those migrations
  or overwrite the live notes.
- A third local clone tested the supported Supabase CLI 2.121.0 sequence:
  mark exactly `0001`–`0009` **applied** in migration history without running
  their SQL; inspect a `db push --dry-run` listing exactly the 12 v2 files;
  then `db push --skip-vault` applied all 12 in the documented order. Local
  history finished with 21 rows (9 legacy + 12 v2). A separate direct-SQL
  rehearsal of all 12 also passed.
- After migration, common historical row digests matched the raw restore,
  allowing only the intentional `business_settings` gang-cut correction and
  schema changes. Three legacy reserve rows were archived; Gang Cut is 0.1000;
  settlement-policy approvals remain zero; all public tables have RLS enabled;
  browser roles cannot execute the Admin pin or authorization RPCs.
- In a transaction rolled back on the migrated local clone, the designated
  existing Admin UUID pinned once and status matched. A synthetic live AAL1
  session returned `admin_mfa_required`; a forged AAL2 claim over that AAL1
  session returned the same. The pin count was zero after rollback. This is
  **not** a hosted TOTP or login test.

## Controlled maintenance sequence after `DEPLOY V2`

1. Confirm the reviewed patch commit and use its pin-only bootstrap from a
   trusted local checkout; the deployed server is already on v2 and does not
   invoke that script. Privately verify Vercel production `SUPABASE_SERVICE_ROLE_KEY`
   belongs to project `uliolbtonhrmjwaeliyj` and `ADMIN_EMAIL` equals the
   canonical address without printing either value. Confirm Supabase Auth
   signup/MFA settings and the current project ref. Re-inventory Auth UUID,
   factors, sessions, Owner links, financial/audit counts, migration history,
   Storage objects and Vault secrets. If any backup-covered row changed since
   the snapshot, refresh and reverify the backup and replay the delta before
   proceeding. Keep a maintenance record and hold user traffic while schema
   and app are incompatible.
2. Confirm `~/.pgpass` based PostgreSQL 17 connectivity and a **read-only**
   Supabase CLI connection to the exact project using a passwordless URI.
   Do not put a database password in a CLI argument, log, Git file, or chat.
   Stop if the CLI cannot use the protected connection mechanism. Recompare
   the 339 legacy schema signatures and core seed fields. The five editable
   template notes are expected drift; any other new drift requires review.
3. Mark only legacy versions `0001` through `0009` as applied with
   `supabase migration repair --status applied --db-url "$YEROME_DB_URL" 0001 0002 0003 0004 0005 0006 0007 0008 0009`.
   This changes migration **history**, not the legacy application objects.
   Confirm history has exactly those nine versions before `db push`; never use
   `--include-all`, `--include-seed`, or `--include-roles` for this rollout.
4. Run `supabase db push --dry-run --skip-vault --db-url "$YEROME_DB_URL"`.
   Require the ordered list below and no other SQL. Then run
   `supabase db push --skip-vault --db-url "$YEROME_DB_URL"`, recording each
   migration result. Stop on any error; do not blindly retry a partial push.
   Verify exactly 21 history rows, the RPC and private pin table, 3 archived
   reserve rows, 0 settlement approvals, RLS and function grants, and the
   before/after historical row manifest.
5. Inventory the existing designated Admin UUID privately. Set
   `EXPECTED_SUPABASE_PROJECT_REF=uliolbtonhrmjwaeliyj`,
   `EXPECTED_ADMIN_USER_ID` to that verified UUID, `ADMIN_EMAIL` to the
   canonical address and `ADMIN_BOOTSTRAP_AUDIT_REFERENCE` to the maintenance
   ticket. Run `npm run bootstrap:admin` with a server-only service key from a
   protected environment. It pins only this existing user and never creates
   or changes an Auth account or password. Confirm one pin and one Admin-role
   user. Do not supply `ADMIN_BOOTSTRAP_PASSWORD`.
6. Have the founder sign in at the production URL using the already-reset
   password. Before MFA, `/api/auth/session` must return HTTP 200 with
   `{ "role": null, "mfaRequired": true }`, with Admin financial endpoints
   denied. The founder completes TOTP enrollment and challenge in
   `/admin/mfa`; after Supabase upgrades the session to AAL2, the same session
   endpoint must return `{ "role": "admin", "mfaRequired": false }` and the
   Admin portal must load. Never record the password, QR secret, TOTP code or
   access token. [Supabase TOTP documentation](https://supabase.com/docs/guides/auth/auth-mfa/totp)
   describes the AAL1-to-AAL2 enrollment flow.
7. Verify distinct Owner/Admin RLS and PostgREST denials, API role DTOs,
   financial/audit row manifests, and absence of an enabled settlement policy.
   Confirm no real transfer ran. Retain the backup and incident evidence.
   If a gate fails, keep access restricted and use an audited forward repair;
   do not bypass MFA/RLS or erase history. No Auth-account cleanup is included.

The 12 migration files and order are listed in
[`production-rollout-plan-2026-10-19.md`](production-rollout-plan-2026-10-19.md#v2-order-and-maintenance-sequence).
The CLI's `migration repair` and `db push` semantics are documented by
[Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations).

## Remaining gates before authorization

- Review the patch commit and run its pin-only script from the trusted local
  checkout. The production server is already on v2; this script is not a
  deployed API route.
- Private verification of protected Vercel values, hosted Auth signup/MFA
  settings and CLI passwordless connectivity; none was inferred from an env
  variable **name**. The browser's public Supabase URL was verified.
- Final live inventory and backup freshness immediately before maintenance.
  If production Auth, audit or financial rows changed, take and rehearse a
  newer protected backup.
- Hosted GoTrue/TOTP, PostgREST and real Admin browser evidence is possible
  only after the approved migration and the founder's TOTP enrollment. A local
  shim does not establish that hosted behavior.

Deployment authorization request: after reviewing this evidence and the
remaining gates, reply **`DEPLOY V2`** to authorize the controlled database
migration and single Admin activation sequence. This does **not** authorize
account deletion, another password change, settlement or real transfers.
