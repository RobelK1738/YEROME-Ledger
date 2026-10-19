# Single Admin security and Auth cleanup gate

Status: local implementation only. PR #1 remains Draft. The founder declined the
quoted isolated Supabase branch and asked for local work only. No hosted
migration, project setting, Auth mutation, user deletion, or production release
has occurred in this work package.

## Canonical authorization

- `private.admin_identity` is a one-row, RLS-protected UUID pin. The migration
  deliberately does not seed a live UUID. The only accepted Admin email is
  `robiemelaku@gmail.com`; the server must also have the protected
  `ADMIN_EMAIL` variable set to this exact value.
- `public.is_admin()` and owner access helpers check `private.authorize_session`.
  It looks up the current Auth user and session, confirms the signed JWT's
  role against live Auth metadata, checks the pin, account status and session
  revocation, and requires a verified factor plus AAL2 for Admin privileges.
  Owner access requires an active owner record. A missing pin denies all roles.
- Service-role HTTP routes verify the bearer with Supabase Auth and call the
  service-only `v2_authorize_session` RPC before reading or writing data. The
  Admin MFA enrollment status endpoint returns no financial information.
  Browser role routing uses that endpoint, never editable user metadata.
- Auth triggers reject another Admin role or changing the pinned principal;
  password, role, ban and email updates invalidate older sessions. Owner status
  changes invalidate older sessions. Missing/deleted sessions and removed MFA
  factors are denied at query time. A session older than 12 hours is denied by
  the app and database even if a refresh token still exists.
- Privileged pin and status RPCs are granted only to `service_role`; the pin
  table is never exposed through the browser. The service key must stay in
  server-only environment variables. No Admin UUID or password is embedded in
  application code. Login errors are generic.

## Isolated rehearsal before any live rollout

1. Obtain approval for the quoted isolated Supabase environment and configure
   **separate** preview Vercel URL and keys. Record the exact project ref before
   invoking bootstrap. The production-targeted Vercel preview is unsuitable
   for synthetic writes.
2. Rehearse every incremental migration on a sanitized representative backup.
   Confirm the hosted `auth.sessions` and `auth.mfa_factors` columns used by the
   new migration, function ownership/grants, existing Auth triggers, and
   migration ordering. Compare business row counts and representative ledger
   rows before and after. Stop on any mismatch.
3. Provision a synthetic Admin and two Owner identities. Test AAL1 enrollment,
   TOTP challenge, AAL2 Admin access, refresh and sign-out. With a separate
   role-bearing user, test direct PostgREST reads of each Admin table/RPC and
   all privileged HTTP routes. Test owner A versus owner B, archived owner,
   password rotation, factor removal and session deletion. Inspect browser
   responses for internal cost, Gang, transfer evidence and other-owner data.
4. Rehearse Auth cleanup on synthetic identities with a fresh snapshot and
   compare owner/job/paycheck/referral/settlement/audit rows exactly afterward.
   Check both application APIs and direct PostgREST using a removed identity's
   still-unexpired access token.

Local `npm run test:security` uses a disposable PostgreSQL Auth shim and
synthetic JWT claims. It proves migration logic and RLS behavior in that shim;
it does not prove the hosted Auth lifecycle, PostgREST or Vercel configuration.

## Production activation sequence, only after separate authorization

1. Confirm project ID `uliolbtonhrmjwaeliyj`, current environment, recent
   recoverable Auth/database backup, public signup disabled, supported Auth
   rate limits, and server-side `ADMIN_EMAIL`. Verify Vercel preview and
   production variables separately without printing secret values. Choose
   supported Auth session time-box/inactivity settings no longer than the
   app's 12-hour cap; verify refresh-token reuse protection and log retention.
2. Record the current Auth UUID/email/role inventory and business FK/Storage
   impact. Apply the migration while the app is in a controlled maintenance
   window. Until pinning, all app roles fail closed. Do not switch application
   code onto an unpinned database.
3. Supply a **new**, strong password through an ephemeral protected bootstrap
   environment variable; treat any previously shared password as exposed.
   Set `EXPECTED_SUPABASE_PROJECT_REF`, `ADMIN_EMAIL`, and a nonsecret audit
   reference. Run `npm run bootstrap:admin` once, then remove the temporary
   password variable from the process environment. Repeating bootstrap with
   the same pin must not create another account or change its password.
4. Sign in as the designated Admin. Complete TOTP enrollment and challenge,
   then verify a fresh AAL2 session reaches the Admin portal. Preserve the
   authenticator recovery material in the founder's approved secure custody.
   Test AAL1 rejection before removing any existing Owner accounts.
5. Refresh the deletion manifest, verify account UUIDs and dependency counts,
   and obtain the founder's literal **`EXECUTE CLEANUP`** approval for that
   exact manifest. Use the supported Supabase Admin Auth deletion API one user
   at a time, never raw `DELETE FROM auth.users`. Stop immediately if any
   business row changes unexpectedly. Revoke sessions using supported Auth
   mechanisms; the live-session database check also denies stale access tokens
   once their session or account is gone.
6. Independently verify one Auth user remains, with the designated email,
   pinned UUID, `admin` role and verified MFA; no other Admin privilege exists.
   Compare historical business rows and check that the removed IDs cannot use
   the backend or PostgREST. File an audit report without credentials.

## Recovery and rollback

- A lost factor or credential is a founder-controlled incident. Verify identity
  and backup out of band; record a change ticket and use Supabase's supported
  account recovery process to preserve the pinned UUID. Rotate the password,
  revoke sessions, enroll a new factor, and verify AAL2 before reopening access.
  There is no backup Admin or HTTP pin override.
- If the canonical Auth identity itself must be replaced, stop the application.
  A separately authorized DBA migration and audit must revoke the old sessions,
  inspect historical references, change the single pin transactionally, and
  test all roles before service resumes. Never repin through Owner APIs.
- On a failed rehearsal, restore the isolated snapshot. On a live failure, keep
  access closed, preserve backup and audit evidence, and use an approved forward
  repair; do not drop the identity guard to restore access casually.

## Read-only sixth-review preflight (2026-10-19)

- The exact project `uliolbtonhrmjwaeliyj` remains ACTIVE_HEALTHY. Its live
  `auth.users`, `auth.sessions` and `auth.mfa_factors` contain the columns and
  data types used by the proposed migration. No pre-existing custom trigger
  was found on `auth.users`. This establishes schema shape only; it does not
  prove GoTrue can perform login, password rotation, ban and TOTP writes after
  the new trigger is installed.
- The live database still lacks `private.admin_identity`,
  `v2_authorize_session` and the v2 settlement policy table. The observed Auth
  inventory remains three users; the designated Admin has zero verified MFA
  factors. The two Owner identities link to 12 jobs, 48 job paychecks, 50 costs
  and 12 cost allocations. Both candidate users have one Auth identity and no
  active session; no Storage objects are owned by them. Exact IDs and the
  full snapshot are in the local manifest outside this PR.
- Vercel lists one `VITE_SUPABASE_URL`, publishable key, service-role key and
  `ADMIN_EMAIL` variable each targeting **both production and preview**, with
  no branch-specific scope. It also lists a legacy `ADMIN_PASSWORD` variable
  in both targets, although current source does not read it. No sensitive
  values were decrypted. Thus the exact Admin email value and matching
  Supabase key/project scopes are not verified; the preview is not isolated.

## Outstanding hosted gates

No isolated branch was created because the founder selected local work only.
The live project has not received this migration. The protected `ADMIN_EMAIL`
variable **exists** in Vercel, but its value remains unverified. Actual MFA
enrollment/login, trigger compatibility with GoTrue, direct PostgREST denials,
public signup/rate-limit/session configuration, backup readiness and Vercel
preview isolation remain unverified. Remove the unused `ADMIN_PASSWORD` from
Vercel and configure separate preview Supabase credentials only as part of an
authorized configuration change. No Auth cleanup is authorized or complete.
