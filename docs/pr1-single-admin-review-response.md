# PR #1 single Admin security response

Branch: `feat/yerome-ledger-v2`. Scope: local code and disposable tests only.
The PR remains Draft and unmerged. The founder selected **local work only**
after a quoted isolated Supabase preview branch cost, so hosted rollout and
cleanup were not attempted.

## Implemented

- Replaced role-only `public.is_admin()` with a locked private singleton Auth
  UUID pin and a live user, session, role, MFA and revocation check. A second
  Auth user with `role=admin` cannot read Admin RLS tables. A missing pin fails
  all roles closed. Owner access checks active owner status and live session.
- Added Auth lifecycle guards against second Admin creation/promotion,
  repurposing the canonical identity or linking it to an Owner profile.
  Password, role, email, ban and Owner status changes revoke old sessions.
- Required the same live authorization in privileged HTTP routes and the
  read-only owner API. Added server-validated browser routing and an Admin TOTP
  enrollment/challenge page. Protected service key and pin RPC remain server
  only. Owner credential/status APIs cannot target an Admin identity.
- Made Admin bootstrap project-bound, conflict-aware, idempotent, and dependent
  on a fresh strong password for initial pin/explicit rotation. It never
  prints a password or service key. The designated email appears in
  `.env.example`; actual Vercel configuration is still unverified.
- Wrote a conditional rollout/recovery runbook and a **preliminary local**
  deletion manifest outside the PR. The manifest includes the exact observed
  Auth UUIDs but remains blocked on fresh inventory, backup, MFA, hosted
  rehearsal and literal `EXECUTE CLEANUP` approval.

## Changed files

- `supabase/migrations/20261019082613_v2_single_admin_identity.sql` — pin,
  authorization, Auth/Owner guards, session revocations, service-only RPCs,
  and removal of the legacy broad tax-settings read policy.
- `server/_lib/{supabaseAdmin,v2}.js`, `server/auth/session.js`,
  `server/owner-login.js`, `server/owners/{reset-password,set-status}.js`,
  `api/index.js` — common live authorization and owner management boundaries.
- `src/context/AuthContext.jsx`, `src/pages/{AdminMfaPage,LoginPage}.jsx`,
  `src/{App,components/RequireRole}.jsx` — server-authorized portal state and
  MFA sign-in path.
- `scripts/{_env,bootstrap-admin}.mjs`, `.env.example` — safe, project-bound
  bootstrap configuration.
- `test/{admin-security-v2,bootstrap-admin-v2,admin-review4}.test.js`,
  `test/fixtures/{auth-shim,security-v2,review4,admin-security-v2}.sql`,
  `test/run-security-v2.sh` — real code exercised with synthetic transport and
  a disposable PostgreSQL cluster.
- `docs/{single-admin-security-runbook,pr1-single-admin-review-response}.md` —
  rollout boundary, recovery and review evidence.

## Business and security invariants checked

- Synthetic canonical email + UUID + role + verified factor + AAL2: allowed.
  Wrong UUID/email/role, missing pin, AAL1, removed factor, missing or expired
  session, password rotation: denied.
- A second **live** synthetic Auth identity with `role=admin`, inserted only
  in a disposable test transaction, reads zero rows from the tested Admin RLS
  tables. Another Admin cannot be created or promoted after the guard exists.
- Archived Owner cannot access an owner principal or the global tax settings;
  reactivation requires a new session. Browser role comes from the live API.
  The pre-existing direct/referral, apartment, Gang, commission and settlement
  suites continue to pass.

## Tests actually executed

- `npm test` — 38/38 passed after implementation.
- `npm run test:security` — all migrations, synthetic Auth/RLS cases,
  prior-version data preservation and seed passed in disposable PostgreSQL.
- `npm run build` — Vite production build passed (108 modules).
- `git diff --check` and changed JavaScript syntax checks — passed.

These are **local** results. Synthetic JWT claims and Auth table shims do not
establish real hosted Supabase or Vercel authorization.

## Privacy and data considerations

Read-only initial inventory confirmed project `uliolbtonhrmjwaeliyj` as
ACTIVE_HEALTHY, three Auth users (designated Admin plus two Owners), and six
jobs linked to each Owner. `owners.auth_user_id` uses `ON DELETE SET NULL`,
so deleting Auth users should preserve owner rows, but that has not been
rehearsed. No live migration, Auth mutation, deletion, financial posting,
Vercel configuration change or production deployment occurred. Exact Auth
UUIDs are kept in a local manifest outside the PR.

## Founder decisions and next independent step

The founder already chose local work only. The next hosted step requires
separate approval of isolated Supabase preview cost and safe credentials.
Rehearse migrations, real MFA/three-identity PostgREST and API tests, cleanup
and historical preservation there. Then capture a fresh complete deletion
manifest, verify recoverable backup and canonical AAL2 Admin login, and ask
for literal `EXECUTE CLEANUP` approval. The existing settlement/legal gates
also remain open. This PR is **not ready to merge or deploy**.
