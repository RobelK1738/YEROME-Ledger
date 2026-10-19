# PR #1 third review response

The founder reviewed `a64f940` and kept PR #1 Draft. This follow-up is on
`feat/yerome-ledger-v2`; the settlement approval table stays empty and no live
records or transfers are changed.

| Finding | Change | Verification |
| --- | --- | --- |
| Unscheduled expected paychecks and whole jobs were omitted | The Admin proposal derives weekly, biweekly or monthly expected dates from one effective-dated full-month pay term for every active job. A new SQL batch trigger independently derives and requires every job/date/paid check in the posting transaction. Missing first payday, mid-month term change, unsupported cadence and zero expected dates block. No implied no-pay exception exists. | Disposable SQL fixture rejects an absent Feb 27 row and an entirely unscheduled second job; date unit tests cover weekly, biweekly, monthly and leap February. |
| One external transfer could be recorded twice | A shared immutable external-transfer registry has one normalized reference and verified total. Partner and commission allocations require transfer linkage, stable request keys and one allocation per transfer/obligation. Cross-obligation allocations are allowed up to the transfer total. Old recording RPCs are revoked from the service role; legacy rows remain and matching references are held for review. | Disposable SQL replays the same request, rejects fresh-key duplicates in both ledgers, checks partial payments and two obligations funded by one transfer, and verifies role grants. |
| Semi-monthly dates drifted | The `+15 days` generator is removed. New semi-monthly terms, automatic dates, and settlement are blocked until the employer's two anchors and holiday rules are recorded. Existing rows stay intact for review. | Unit assertions reject semi-monthly generation; disposable SQL rejects a new semi-monthly term. |

## Release gates still open

- Isolated Supabase preview, sanitized migration rehearsal, distinct real
  Admin/Miki/regular-person Auth and PostgREST negatives, archived-account and
  browser checks. The current Vercel preview shares production-targeted
  Supabase configuration, so no synthetic write is safe there.
- Founder/accounting/legal acceptance of the proposed closed-month receipt-net
  settlement basis, timing, no-pay and holiday exceptions, partial months,
  losses, payment custody, commission disclosures and charge wording. No policy
  approval row is seeded or enabled.
- Explicit verified employer calendars for semi-monthly jobs and moved paydays;
  ambiguous months remain blocked. Reused bank references and legacy payment
  evidence require independent review; no automatic override exists.

Local synthetic role claims and a READY Vercel deployment are separate from a
hosted three-role security audit. Keep the PR Draft and unmerged.
