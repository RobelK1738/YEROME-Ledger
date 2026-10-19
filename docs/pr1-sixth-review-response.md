# PR #1 sixth review response

The sixth review at `e69f618` found no additional confirmed source-level
privilege bypass. Its remaining blockers are hosted compatibility, isolation,
configuration, cleanup readiness and financial signoff. This response records
new **read-only** evidence. It does not claim those gates are complete.

## Implemented

- Refreshed the private, local Auth deletion manifest with exact users and
  dependent-record counts. It is outside this PR and remains preliminary.
- Updated the single-Admin runbook with the live schema and Vercel configuration
  findings below. No application code or SQL migration changed in this pass.

## Changed files

- `docs/single-admin-security-runbook.md` — current preflight evidence and
  remaining hosted steps.
- `docs/pr1-sixth-review-response.md` — point-by-point sixth review status.

## Business invariants checked

- No new financial calculations or records were changed. The existing
  settlement policy table is **not installed** on the live project; therefore
  no v2 live settlement policy has been enabled by this PR.

## Tests actually executed

- Read-only Supabase project lookup: exact project `uliolbtonhrmjwaeliyj`
  remains `ACTIVE_HEALTHY` on PostgreSQL 17.
- Read-only information-schema query: `auth.users`, `auth.sessions` and
  `auth.mfa_factors` have the referenced columns/types, including nullable
  session `aal`, `factor_id`, `not_after` and `created_at`. No non-internal
  `auth.users` trigger existed at the snapshot. This is **not** a GoTrue
  compatibility or no-lockout test.
- Read-only dependency/count queries: three Auth users, including the
  designated Admin with zero verified MFA factors; two proposed Owner deletion
  candidates link to 2 owner rows, 12 jobs, 48 job paychecks, 50 costs and
  12 cost allocations. Their direct Auth dependencies are 2 identities and
  zero active sessions/factors; Storage objects owned by them: zero. Existing
  Owner/Auth FK uses `ON DELETE SET NULL`. No deletion was rehearsed or done.
- Read-only Vercel metadata: the Supabase URL, publishable key, service-role
  key and `ADMIN_EMAIL` variable each target **both production and preview**
  without branch scoping. An unused `ADMIN_PASSWORD` variable also targets
  both. **No values were decrypted**, so exact `ADMIN_EMAIL` value and matching
  project/key scopes remain unverified. The build at `e69f618` is READY, which
  proves only build completion.
- No code tests were rerun for this documentation-only pass. At `e69f618`,
  `npm test` passed 38/38; disposable PostgreSQL security tests, build, syntax
  and diff checks passed. Those were local, synthetic tests.

## Privacy/security verification

- The live project still lacks the canonical pin and `v2_authorize_session`
  RPC. No real AAL1/AAL2, TOTP, password rotation, ban, factor-removal or
  session-deletion flow has been exercised with the migration installed.
- Preview and production share the same Vercel variable entries, so the
  preview must **not** be used for synthetic security or financial writes.
  The stale `ADMIN_PASSWORD` must be removed as an authorized remote
  configuration action after confirming it is not used elsewhere. Current
  source does not read it.
- Public signup, Supabase rate limits, session configuration and exact
  protected env values were not exposed by the available read-only tools.

## Data and migration considerations

No hosted migration, Auth mutation, backup, cleanup, deployment promotion or
money movement occurred. A safe cleanup still requires a recoverable backup,
isolated synthetic rehearsal, fresh manifest, new private Admin password,
working AAL2 login, and separate literal `EXECUTE CLEANUP` authorization.

## Explicit founder decisions needed

The founder previously selected **local work only** after a Supabase branch
quote. The current quote for the identified YEROME organization remains
**$0.01344 per hour plus additional usage**. Creating that branch or changing
Vercel/Supabase hosted settings would cross the existing boundary; no such
action was taken. The settlement/accounting/legal approvals are also open.

## Next independent implementation step

After explicit authorization to supersede local-only work and accept the
quoted preview cost, create the isolated branch, separate Vercel preview
credentials, rehearse migrations and GoTrue/Auth/PostgREST/three-person flows,
then prepare the final cleanup manifest. Keep PR #1 Draft and unmerged until
those gates and financial signoffs are complete.
