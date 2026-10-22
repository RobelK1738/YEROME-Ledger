# Admin password recovery release and incident runbook

This PR changes application code only. It does **not** change the hosted Supabase
Auth configuration, send an email, revoke a live session, merge, or deploy. The
production project is `uliolbtonhrmjwaeliyj`; verify that exact project in the
dashboard before the approved release. Do not paste a recovery URL, fragment,
access token, refresh token, one-time code, or password into a ticket, PR, logs,
terminal command line, or browser console.

## Hosted configuration to apply with release approval

1. In **Supabase Dashboard → Authentication → URL Configuration**, set **Site URL**
   to `https://yerome-ledger.vercel.app`. Add the exact **Redirect URL**
   `https://yerome-ledger.vercel.app/reset-password`. Keep any local development
   URLs only if they are still needed; never use localhost as production Site URL.
2. In **Authentication → Email Templates → Reset password**, use the content in
   [`supabase/email-templates/admin-recovery.html`](../supabase/email-templates/admin-recovery.html).
   The link must be `{{ .ConfirmationURL }}` so Supabase verifies its one-use
   token and honors `redirectTo`. Remove hardcoded localhost links, raw token
   URLs, and provider email click tracking. This file is a reviewed template;
   committing it does not update the hosted template.
3. The app requests new recovery mail with
   `supabase.auth.resetPasswordForEmail(designatedAdminEmail, {
   redirectTo: 'https://yerome-ledger.vercel.app/reset-password' })`.
   Supabase Dashboard-generated mail without `redirectTo` falls back to the
   Site URL; the app moves a recovery fragment received at `/` to
   `/reset-password` before rendering. Prefer the in-app request form.
4. Verify the production Vercel deployment serves `/reset-password` with
   `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. Inspect only the
   **host and pathname** of a newly received link, never its query or fragment.
   The email link should first use the project Auth verification host; after
   verification it should land on the production reset route. A link issued
   before these changes can still target localhost and must be discarded.

[Supabase's redirect documentation](https://supabase.com/docs/guides/auth/redirect-urls)
defines Site URL as the default and requires `redirectTo` to be allowlisted.
[The email template documentation](https://supabase.com/docs/guides/auth/auth-email-templates)
defines `{{ .ConfirmationURL }}` and the hosted dashboard editor.

## Revoke the exposed recovery session and request a fresh email

1. Treat the previously exposed recovery URL and any session it created as
   compromised. Do not open or forward that link again. Record the incident
   reference and verify the exact Admin Auth identity out of band. Preserve the
   Auth user, its UUID, and all ledger data.
2. If the designated Admin has a **trusted, currently signed-in browser
   session**, use its **Sign out** button. This app calls Supabase Auth's default
   global sign-out, which revokes that user's refresh tokens across sessions.
   Confirm success and sign out any other local browser profiles. If no trusted
   Admin session is available, stop and arrange a supported Supabase Auth
   server-side global sign-out with the project owner. The supported Admin API
   is `auth.admin.signOut(adminAccessJwt, 'global')`, run from a trusted
   server-only process after verifying the JWT belongs to the canonical Admin
   UUID; never expose that JWT or a service key to the browser or PR. Do not
   delete or recreate the Auth user or edit Auth tables directly. Verify
   revocation using Auth's session inventory or the approved security audit
   procedure. See the [Admin sign-out API](https://supabase.com/docs/reference/javascript/auth-admin-signout).
3. After the approved application release and hosted configuration are both in
   place, open `https://yerome-ledger.vercel.app/reset-password` in a private,
   trusted browser and request a **new** email for the designated Admin address.
   Use only the newest email. If it lands anywhere else, stop and recheck the
   Site URL, allowlist, template, and request origin. Do not reuse old mail.
4. Follow the new link once, set a unique strong password, then sign in again
   with the new password. The reset page itself performs a global sign-out
   after `updateUser`; if that cannot be confirmed it shows a revocation warning.
   Verify that revoked or expired recovery sessions have no Admin financial access
   and that a fresh password-only login works for the pinned Admin. Keep the one-Admin pin and RLS protections in place.

Global sign-out revokes refresh tokens, while already issued access JWTs can
remain valid until their expiry. The v2 Admin API and RLS session checks are an
additional guard **only after their production migrations are verified live**.
See [Supabase's sign-out documentation](https://supabase.com/docs/guides/auth/signout).

## Review checks

- `npm test`, `npm run build`, and `npm run test:security` pass locally.
- An expired, used, or non-recovery link displays an error without a password
  form. A valid designated-Admin recovery link allows `updateUser` and then
  signs out globally. Owner links cannot unlock the Admin form.
- No Auth user deletion, RLS change, or financial data migration was included in
  the original recovery PR. Hosted Auth settings, a fresh real email, and production
  browser/login checks remain separate release steps requiring approval.
