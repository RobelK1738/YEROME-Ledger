# YEROME v2 production preflight — 2026-10-21

**Hosted Auth settings for password-only sign-in (required):** In Supabase Authentication → Multi-Factor, set TOTP (App Authenticator) to **Disabled** and turn **OFF** “Limit duration of AAL1 sessions.” The latter was previously ON and would terminate a normal password-only Admin session after 15 minutes unless MFA was completed. Leave SMS MFA disabled. The application still caps and validates live sessions through the database. Verify both switches in the dashboard before an approved migration, and do not weaken the Admin UUID pin or RLS.

**YAGNI update (2026-10-21):** Admin MFA is removed by founder decision. The previous 12-migration rehearsal below tested the MFA-enforcing version and **does not certify the revised password-only SQL**. Rerun the tests, restored-production migration rehearsal, single-Admin/Owner isolation checks, and backup freshness verification on the latest branch head before any production migration. Historical MFA references below are superseded by this notice and the updated activation sequence.

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
- The founder explicitly authorized `robiemelaku@gmail.com`. The existing
  sensitive Vercel `ADMIN_EMAIL` entry was updated to that value without
  changing its Production/Preview targets or creating a branch override.
  The new Preview build `dpl_7ekEEi2ho9ga2Vv1b9j41BUDg3Ph` on commit
  `9bca70e` returned `PREVIEW_CONFIG_DIAGNOSTIC=PASS`. It checked the exact
  project URL and Admin address and made one read-only Auth user-list call,
  finding the expected sole Admin identity. The probe emitted only its fixed
  result code; it was then removed. Clean Preview deployment
  `dpl_A3tDTg97u6dxpVxpQTHCBhDWfZgh` on `0320ddf` is READY. The existing
  Production deployment has **not** been rebuilt, so its protected runtime
  values remain unverified and may reflect the prior snapshot.
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
  disabled. A 50-table Auth/public/Storage row-count and row-digest manifest
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

## Read-only refresh (2026-10-21, 08:43 UTC)

- The live 50-table row-count/content-digest manifest still matches the
  refreshed backup exactly. A prior report counted the psql `SET` status line
  as a 51st table; no row or table was missing. Backup checksums still pass.
  Current counts remain one Auth user and identity, zero sessions/factors, two
  Owners, 12 jobs, 48 paychecks, 50 costs, 12 allocations and 97 audit rows.
- The 339 public schema signatures and ten core seed signatures still match
  the legacy baseline. The current Auth schema also matches all 523 semantic
  signatures of the restored snapshot. Raw Auth catalog signatures initially
  differed in 18 places because dump/restore compacts dropped-column ordinal
  positions and identically truncated constraint names sort in different
  orders; normalized definitions match. No migration-relevant Auth drift was
  found. Since both schema and table content match the rehearsed snapshot,
  the 12-migration local rehearsal remains representative.
- Supabase CLI 2.121.0 connected to the exact production PostgreSQL endpoint
  through `~/.pgpass` using a passwordless URI and a transaction-level
  read-only option. `migration list` showed 21 local files and no remote
  history. A following SQL check confirmed the history table was still absent.
- The deployed browser bundle uses the exact project URL and an enabled
  publishable key listed by the Supabase project. The **local** bootstrap
  configuration also connected read-only with its service key and
  returned the same sole designated Admin UUID as PostgreSQL. Vercel lists
  production server keys and `ADMIN_EMAIL` as **sensitive** variables but does
  not return their values, even with the plugin's decrypt request. Their
  deployed values cannot be equated to the local values from this read-only
  evidence. [Vercel documents sensitive variables as non-readable after
  creation](https://vercel.com/docs/environment-variables/sensitive-environment-variables).
  The unused `ADMIN_PASSWORD` variable remains configured.
- Supabase's public Auth settings endpoint reports signup disabled and email
  auto-confirm enabled. The founder separately verified the production project
  in the Supabase dashboard: TOTP enabled, maximum ten factors per user, SMS
  MFA disabled, and the AAL1 duration limit enabled with a 15-minute window.
  This is founder-reported dashboard evidence; no screenshot was attached for
  independent inspection. Actual Admin enrollment and AAL2 verification are
  still required after rollout. The zero factor count is current account
  state, not a hosted TOTP configuration failure.

## Existing runtime evidence and Preview diagnostic

- The latest READY production deployment was created at 08:03:47 UTC. Six
  `security.authorization_denied` audit rows for the designated Admin were
  recorded in the production database from 08:04:06 to 08:04:33 UTC. In
  `server/_lib/supabaseAdmin.js`, that event is written only after the server
  has accepted the user's bearer token through `auth.getUser`, parsed its
  claims, and attempted the v2 authorization RPC. The same server-side client
  writes the audit row. Together with the owner's observed password-grant
  HTTP 200 and session HTTP 403, this is strong **functional** evidence that
  the deployed service credential reaches this Supabase project. It does not
  establish the opaque key's exact value or the deployed `ADMIN_EMAIL` value:
  the missing RPC causes denial before Admin-email equality can be observed.
- The founder authorized a one-time, build-only diagnostic scoped to
  `VERCEL_ENV=preview` and branch `fix/production-v2-migration-rollout`.
  Three diagnostic builds ran on that branch: `aa4cb64` returned the coarse
  `FAIL_CONFIG` code; `cf81e2e` narrowed it to `FAIL_ADMIN_EMAIL`; and
  `6693258` established `FAIL_ADMIN_EMAIL_MISMATCH`, rather than a missing
  variable. The expected project URL passed. Every build failed closed
  before the Auth user-list call, so **zero** Auth user-list requests were
  made and the service key's Preview scope remains unverified. Logs exposed
  fixed codes only. There was no HTTP diagnostic route, database write, Auth
  change, MFA setting change or Production build. The temporary script,
  test and build hook were removed in the following commit. Current Vercel
  metadata lists the same sensitive variable entry for Preview and
  Production with no branch override, but the values are non-readable and
  the existing Production deployment's runtime snapshot is distinct from a
  new Preview build. Its protected `ADMIN_EMAIL` value is **not verified**.
- After the founder supplied the exact address, the same Vercel entry was
  updated. A new temporary Preview diagnostic on commit `9bca70e` returned
  `PASS`: exact project URL and email matched, and the one authorized Auth
  Admin user-list request found exactly one Admin-role user with that email.
  No records, identifiers, tokens, credentials or error bodies were logged.
  Commit `0320ddf` removed the hook, script and test; its clean Preview build
  is READY. Vercel confirms the latest Production deployment is still
  `dpl_Fidb8WGMtyyBvErGzCo2hQJX28xy` from `main` `95287fe`.

## Final refreshed backup and local readiness (2026-10-21, 13:07-13:17 UTC)

- PostgreSQL 17.11 connected to the exact production host through the
  existing `~/.pgpass` with TLS and a read-only session. Live inventory still
  shows one canonical Admin Auth user and identity, zero sessions/factors,
  two Owners, 12 jobs, 48 job paychecks, 50 costs, 12 allocations, 97 audit
  rows, zero Storage objects/Vault secrets, no migration history and no v2
  authorization RPC. The existing Admin password and UUID were not changed.
- New logical backup outside Git:
  `~/Library/Application Support/YEROME Ledger/production-backups/20261021T130757Z/`.
  FileVault is On; the directory is `0700` and the dump, globals and checksum
  files are `0600`. PostgreSQL 17 custom archive and globals inventory passed
  `pg_restore -l` and SHA-256 verification. Archive SHA-256:
  `f3ca9dbde88d5196f1304bc35fba0f6cfe91f31428b86b88d7220a846ff10fff`.
  This is a same-device logical backup, not an independent off-device copy.
- The archive restored into a private local PostgreSQL 17.11 cluster with
  network listening disabled. Only ten managed Vault TOC entries were omitted
  because stock PostgreSQL lacks `supabase_vault`; the source archive retains
  them, and production Vault secret rows are zero. All **50** Auth/public/
  Storage table count-and-content digests match a fresh read-only live
  manifest. All **339** public schema, **523** semantic Auth schema and **10**
  core seed signatures match. The live 50-table manifest is identical to the
  preceding verified production snapshot. Hosted Auth configuration and
  Storage object bytes are outside a logical dump; Storage objects are zero.
- On this fresh restore, Supabase CLI 2.121.0 marked legacy `0001`-`0009`
  applied **locally**, dry-ran exactly the ordered 12 v2 files, then applied
  all 12 locally with `--skip-vault`. Local history ended at 21 rows. All 50
  common historical table digests remained equal after migration; three
  legacy reserve rows were archived, Gang Cut is exactly 10%, and the Admin
  pin, settlement approvals and transfer postings are empty. No public table
  lacks RLS, no `anon` role can execute a public security-definer function,
  and no active reserve columns remain. The single-Admin pin and AAL1 gate
  passed in a rolled-back **local** transaction; hosted MFA still awaits the
  founder's enrollment.
- The same CLI's read-only connection to the exact production host listed
  21 local migration files and **zero** remote history entries. It did not
  repair history or apply SQL in production.
- A final read-only live manifest at 13:17:08 UTC still matched all 50
  backed-up table digests. Migration history, the Admin pin and the v2
  authorization RPC were still absent in production.
- `npm test` passed 50/50; `npm run test:security` passed the disposable
  PostgreSQL migration, role, RLS and seed assertions; `npm run build` passed.
  No production SQL or Auth mutation occurred. The new backup's live manifest
  should be rechecked at the actual maintenance start; refresh it again if
  any backup-covered row changes before `DEPLOY V2` execution.

## Controlled maintenance sequence after `DEPLOY V2`

1. Confirm the reviewed patch commit and use its pin-only bootstrap from a
   trusted local checkout; the deployed server is already on v2 and does not
   invoke that script. The Preview probe verified the shared Vercel variable
   entry, but the existing Production deployment predates the correction.
   After an approved Production redeploy, verify its runtime authorization
   through the existing authenticated `/api/auth/session` route; do not read
   or log protected variables or add a diagnostic route. Confirm Supabase
   Auth signup/MFA settings and the current project ref. Re-inventory Auth UUID,
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
6. The revised migration changes `public.v2_authorize_session` from six parameters to five. The existing Production `main` build still calls the six-parameter form and is **incompatible**. After a fresh reviewed rehearsal and explicit founder authorization covering the **PR #3 merge**, apply the revised v2 migrations and pin the existing Admin UUID in maintenance mode; merge the reviewed password-only PR #3 into `main` and deploy the merged commit to Vercel Production with the corrected environment snapshot. **Do not redeploy the old `main` commit or expose the incompatible app during the transition.** Verify Production READY against the exact merged SHA and record the deployment ID. Never reuse the temporary Preview probe.
7. Have the founder sign in at the Production URL using the existing password. A normal live password-authenticated Admin session must receive HTTP 200 with `{ "role": "admin" }` from `/api/auth/session` and access the Admin dashboard **without MFA**. Confirm a second Admin, an unpinned UUID, expired/revoked sessions and Owners are denied. Do not record a password, bearer token or secret. Successful authorization on a new Production deployment also confirms its corrected `ADMIN_EMAIL` and service-key scope without exposing their values.
8. Verify distinct Owner/Admin RLS and PostgREST denials, API role DTOs,
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
- The corrected shared Vercel entry and Preview build passed the exact
  project/Admin identity check with one read-only Auth request. The existing
  Production deployment predates the correction. Its intended configuration
  must be confirmed through the existing authenticated session flow after an
  **approved** Production redeploy. No protected value can be read back.
- The founder verified production TOTP settings in the Supabase dashboard.
  Actual enrollment and AAL2 remain post-migration steps; no factor exists
  yet. No dashboard screenshot was attached for independent inspection.
- The PostgreSQL 17 passwordless connection, 50-table refreshed backup and
  restore, 339/523/10 signature comparisons, nine-version legacy baseline,
  12-migration local replay, and automated test/security/build suites passed.
  Recheck the live row manifest and migration history at maintenance start;
  if any backup-covered row changes, refresh and rehearse again.
- Hosted GoTrue/TOTP, PostgREST and real Admin browser evidence is possible
  only after the approved migration and the founder's TOTP enrollment. A local
  shim does not establish that hosted behavior.

**Revised deployment authorization checkpoint:** The earlier MFA-enabled local rehearsal is **obsolete** because the SQL, RPC signature, backend and frontend have changed. Codex must rerun automated tests, restored-production migration replay, live-session/Owner/RLS checks and verify the hosted no-MFA/AAL1 settings. Only then request the founder's explicit `DEPLOY V2` authorization for: nine validated legacy history entries, twelve **revised** v2 migrations, pinning the existing Admin UUID, **merging PR #3** (which now contains the password-only app), and deploying the resulting `main` commit with corrected Vercel variables. Maintain the window until real password-only Admin login succeeds. Recheck backup freshness immediately before writes and preserve the documented same-device backup/managed-Vault recovery limitations. No password rotation, account deletion, settlement authorization or money movement is included.
