# PR #1 second review response

The founder reviewed commit `16a232d` and kept PR #1 Draft. This follow-up
remains on `feat/yerome-ledger-v2`; no production data or payment is changed.

| Finding | Response | Evidence |
| --- | --- | --- |
| 1. Paused jobs erase earlier wages | A 2026 pause or uncertain current paused state suppresses annual liability and gap. Recorded receipts and withholding remain visible; a resumed job with a 2026 pause also stays under review. | Active → paused → resumed unit fixture with prior paid receipt. |
| 2. Ended referrals hide balances | The referrer's route loads all of their fixed-rate relationships and historical accruals/payments. Only currently eligible relationships get a positive forward estimate. Admin can select an ended referral for a prior earned month. | Historical $400 accrued/$100 paid/$300 owed unit fixture and disposable SQL replacement plus retrospective posting. |
| 3. Arbitrary adjustments/overpaid balance | New adjustments require a typed reconciliation ID. The old free-form RPC is no longer executable by the service role. The correction RPC derives every delta from immutable receipts and the original agreement snapshot; it blocks a revised due below recorded payments. The unresolved amount requires a signed credit or recovery process. | Disposable privilege, correction replay, formula and overpaid-balance assertions. |
| 4. Stale Admin totals | A shared ledger reader calculates original, changes and current cents for receipt net, agreed charge, actual cost, partner due, commission, Gang and YEROME residual. Admin displays all; owner DTO exposes only the owner's due, paid and owed. | Unit conservation fixture and disposable two-check correction fixture. |
| 5. Per-check allocation trust | A database trigger independently checks net-weighted largest-remainder allocations for every posted check. Correction reconciliation recalculates all dated lines from the changed weights. | Tampered-but-month-balanced snapshot rejected; two-check independent cent fixture. |
| 6. Hosted security | **Pending:** isolated Supabase preview, migrations, three real Auth identities, PostgREST/API/browser negatives and sanitized evidence. The existing Vercel preview still shares production-targeted Supabase variables and must not be used for synthetic writes. | Local database simulation and Vercel build are separate evidence only. |
| 7. Contractual biweekly settlement | The closed-month receipt-net basis remains a proposal, with no enabled policy row. A normalized biweekly equivalent does not create a dated payable. | Founder/accounting/legal decisions remain required before any real policy approval or transfer. |

Supabase branching requires a quoted cost and explicit owner agreement before
creating the isolated hosted branch. The disposable PostgreSQL rehearsal proves
that the migrations can apply and the listed synthetic assertions pass; it is
not a hosted Auth or browser audit.
