# YEROME v2 production backup and local migration rehearsal

Status: **conditional deployment checkpoint**. This report records read-only
production access and local work on 2026-10-19. It does not authorize a
production migration, Auth change, account deletion, PR merge, or deployment.

## Implemented

- Used the existing private `~/.pgpass` with PostgreSQL 17 and TLS. The file was
  not opened, copied, or printed. Direct connection to the exact project host
  succeeded as `postgres` in database `postgres`.
- Created a timestamped logical database archive and global role inventory at
  `~/Library/Application Support/YEROME Ledger/production-backups/20261019T190900Z/`,
  outside Git. FileVault was On; the directory is `0700` and backup files are
  `0600`. The custom-format archive includes 53 `TABLE DATA` entries and the
  managed Auth, Storage, public, and other database schemas. The globals file
  includes roles and memberships. No credentials are recorded in this report.
- Verified SHA-256 checksums and `pg_restore -l`. Archive SHA-256:
  `b047e6e57727d8d88a49fd3c59fc7612f5ffde9aad9af7c42fbc1b499e934a2d`;
  globals SHA-256:
  `0e8414e0c0ebe6320892b2188095c1d82f3b29b196e34e5279ce1930d552226e`.
- Restored into a private local PostgreSQL 17.11 cluster listening only on a
  Unix socket. The complete archive could not load into stock Homebrew
  PostgreSQL because its `supabase_vault` extension is unavailable. A separate
  restore excluding its 10 managed archive entries completed without error.
  Production had zero Vault secrets and zero Storage objects at the backup
  check. This is an application-data restore proof, not a native Supabase
  platform or GoTrue recovery proof.
- The restored database and production matched on row counts and full-row
  SHA-based digests for all 50 `auth`, `public`, and `storage` tables after both
  sessions used UTC. That includes 3 Auth users, 3 Auth identities, 2 Owners,
  12 jobs, 48 job paychecks, 50 costs, 12 cost allocations, and 75 audit rows.
  Restored roles matched all 30 production role names and attributes, excluding
  the extra local bootstrap superuser; all 24 role memberships matched.
- Replayed all 12 v2 migrations in documented order, each inside a local
  transaction. All 12 succeeded with no SQL incompatibility or migration edit.

## Changed files

- `docs/production-rollout-plan-2026-10-19.md` — advance the backup gate and
  record the local Vault restore limit.
- `docs/production-rehearsal-2026-10-19.md` — preserve the evidence and decision
  boundary for PR #1. No SQL, application code, or production record changed.

## Business invariants checked

- All 50 pre-existing Auth/public/Storage tables retained their row counts and
  common historical fields after v2 migration. The only intended legacy value
  change was `business_settings.gang_cut_rate` to exactly `0.10`; its
  `updated_at` changed with the row. The migration also drops reserve columns
  after archiving them. The old and new business-settings row identity matched.
- Legacy reserve archive: 3 expected source rows, 3 archived rows, with exact
  source keys and JSON values (2 Owner rows, 1 business-settings row). Zero
  legacy reserve columns remain in the migrated local schema.
- Historical Auth users, Owners, jobs, job paychecks, costs, and audit counts
  stayed at 3, 2, 12, 48, 50, and 75. Owner/Auth, job/Owner, and
  paycheck/job orphan counts were all zero.
- No Admin identity was pinned, no settlement policy was approved, and no
  settlement was posted in the local rehearsal. Legacy partnership rows were
  not auto-mapped to verified v2 agreements.

## Tests actually executed

- `pg_dump -Fc`, `pg_dumpall --globals-only`, `pg_restore -l`, and
  `shasum -a 256 -c` — passed; the source backup remains unchanged.
- Local `pg_restore` excluding only managed Vault entries — passed; 50/50
  Auth/public/Storage table row-count and digest comparisons passed.
- `psql -1 -v ON_ERROR_STOP=1 -f` for each of the 12 v2 files — 12/12 passed.
- `npm test` — 38 passed, 0 failed.
- `PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" npm run test:security` —
  disposable PostgreSQL migration, role, security, and seed assertions passed.
- `npm run build` — passed; Vite transformed 108 modules.
- `git diff --check` — passed.

## Privacy/security verification

- The migrated local database had zero public tables without RLS and zero
  `anon`-executable public `SECURITY DEFINER` functions. The Auth identity guard
  trigger existed; the canonical Admin pin table remained empty as designed.
- The Vercel plugin listed the five configured production/preview variable
  names, but returned `decrypted:false` even with decryption requested. The
  protected values and service-role key's project scope therefore remain
  unverified. The unused `ADMIN_PASSWORD` variable is still present.
- PR #1 remained Draft and unmerged at feature SHA
  `4d703d8e0875c2d6c7ebe33a65bb1a0f6f07ddb5` during this rehearsal.
  GitHub reported its Vercel status successful.

## Data and migration considerations

- Production still has no `supabase_migrations.schema_migrations` table. The
  prior read-only reconciliation found all 339 public schema signatures and
  10 seed-config signatures equal to repository migrations `0001`–`0009`.
  The backup replica has the same legacy schema and data. Do not rerun those
  files. After `DEPLOY V2` approval, repair only their history as already
  applied, verify exactly nine history rows, then run the twelve v2 files.
- The backup is on the same FileVault-protected Mac, with private permissions;
  it is not an independent off-device disaster-recovery copy. A stock local
  PostgreSQL server cannot reproduce the managed Vault extension. The archive
  retains those entries, and there were no Vault secret rows to lose in the
  application-data rehearsal. Supabase's own Auth runtime, encryption root,
  Storage binaries, and hosted settings need separate recovery validation.
- A Vercel code rollback would not reverse a database migration or Auth
  mutation. Use the maintenance sequence in the rollout plan and retain this
  backup until the approved rollout and post-deployment verification finish.

## Explicit founder decisions needed

- Review the managed Vault restore limitation and same-device backup custody
  before authorizing migration. A native Supabase restore would require a
  compatible local image or isolated hosted environment; neither was used.
- Confirm the protected Vercel production variables and service-role key point
  to project `uliolbtonhrmjwaeliyj` through an authorized dashboard check.
- Give the literal `DEPLOY V2` approval only after accepting these documented
  limits. Auth cleanup still requires a separate exact manifest and literal
  `EXECUTE CLEANUP` approval.

## Next independent implementation step

Keep production unchanged. At an approved maintenance checkpoint, baseline
legacy migration history, apply the twelve v2 files, pin and MFA-verify the
single existing Admin through the authorized flow, run hosted role checks, and
only then merge PR #1 and verify the production deployment. Stop and report
any failed gate before reopening traffic.
