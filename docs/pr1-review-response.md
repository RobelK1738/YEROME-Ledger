# PR #1 review response (2026-10-18)

PR #1 remains Draft. This document maps the founder's review of `fa73c13` to
the follow-up implementation and the evidence still needed before release.
No live records, secrets, production deployment, or real money were used.

| Review finding | Follow-up implementation | Verification |
| --- | --- | --- |
| 1. No dated settlement | Added a proposal from a completed person's calendar month of actual employer receipts, verified agreement and eligible job history; exact-cent per-check allocations; immutable batch, line, correction adjustment and partner payment ledgers; idempotent service-only RPCs and Admin/owner history views. No policy approval row is seeded, so real posting is disabled pending signed founder, accounting and legal decisions. | Pure settlement fixtures and synthetic approved policy in disposable PostgreSQL test missing/late receipt, replay, partial/overpayment, correction, adjustment, loss block and privacy. Hosted preview remains required. |
| 2. Tax reconciliation year/truncation | Paginated paycheck loading and included only paid checks whose pay date falls in the configured 2026 tax year. | 2025/2026/2027 and >500-row tests. |
| 3. Impossible or uncorrectable receipt | Require gross to equal net plus every withholding and other deduction line, then post through an audited RPC. Corrections append immutable snapshots and reason. | Unit and disposable SQL tests reject imbalance and prove correction history. |
| 4. Historical commission status | Added effective-dated job and referral status events; full-month commission checks the earned month rather than current status. Unknown legacy history is not invented. | Disposable SQL ended-after-month and midmonth-pause fixtures. |
| 5. Referral dates | Projection, referrer view, commission posting and settlement check start/end dates, status history and verified agreement. | Disposable future and expired referral assertions. |
| 6. Failed preview / hosted roles | Consolidated API routes into one Vercel function to fit the Hobby function limit reported by the failed deployment. | **Pending after push:** successful Vercel preview, distinct hosted Admin/Miki/regular-person Auth and PostgREST tests against an isolated Supabase project. Local role simulation is not hosted evidence. |
| 7. Salary cadence | Salary employer check uses annual gross divided by configured periods per year; normalized two-week equivalent remains annual gross divided by 26 and is separately labeled. | 27, 52 and 12 period tests. |
| 8. Pause/resume and referral replacement | Added atomic, audited prospective job status and referral end/replace RPCs and Admin controls. Referral end is effective today; scheduled future end is withheld until an active-slot lifecycle is designed. | Disposable status/replace tests and future-end guard. |
| 9. Changed terms projected all year | Annual tax liability and reconciliation gap are marked unavailable where multiple effective compensation terms overlap the year. Historical received cash and withholding remain visible. | Unit test covers term change. Full segmented historic tax projection remains a separate engineering task. |

## Release gates

- Rehearse new migrations and all three role flows on a separate hosted Supabase
  project with synthetic identities and data. Confirm Vercel preview routes and
  GitHub checks.
- Record the proposed settlement basis, proration, losses, commission timing,
  legal charge descriptions and payment custody decisions in signed agreements
  before adding any enabled settlement policy or moving money.
- Review the annual tax limitation and per-job cost configuration limitations
  in `business-rules-v2.md` and `migration-runbook.md` before considering this
  implementation a production release.
