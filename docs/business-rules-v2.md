# YEROME Ledger business rules

## Projection-first update · October 30, 2026

The current product is a shared estimation and projection tool. Owners see
their jobs, gross income, estimated tax, service charges, projected profit and
50% share; referrers also see commission sources. Admin sees the same inputs
and shares plus actual costs, commission expense, Gang Cut and YEROME profit.
The exact-cent monthly formula below is unchanged.

Admin-entered partnership and compensation inputs are sufficient for planning.
Agreement verification, apartment lease verification, referral verification,
received paychecks and posted settlements do not gate the projection. Missing
apartment amounts use the existing $900 charge/$650 cost defaults. A missing
partnership or active-job compensation prevents a full split; unsupported state
taxes remain unavailable. Pausing sign-in does not erase business projections.

The financial story always assumes every saved, unpaused job has started.
Start dates are informational only and never delay or prorate gross income,
annual tax assumptions, monthly shares, costs, profit, splits or commissions.
Legacy pending jobs are included immediately. Current saved inputs determine
projections; dated compensation/status history does not control this story.

Expected employer income dates use only the first pay date and frequency.
The next 90 days remain visible across a year boundary, using the configured
2026 Texas tax assumptions. Net income uses the owner’s combined annual tax
rate. Next-inflow allocations scale the full monthly formula and conserve cents.
Job setup and editing have no review, effective-date or activation step.
Historical compensation and finance records remain untouched.

Commission projections use $200 per included referred job and the active
recorded referral relationship, regardless of future start dates; they do not require posted accruals or payment evidence.
An unlinked referral-partnership job still includes commission expense in the
Admin projection; the recipient is attributed when Admin records the link.
Referral names retain the existing disclosure setting.

Admin can save a planned fund date and plain-text allocation instructions.
These are shared with that owner; they do not record a payment or change the
calculated split. Cost/partnership overrides update current planning only and
use the existing audit log. No approval workflow or manual allocation builder
is included. Historical finance data and restrictive mutation APIs are retained,
but payment-tracking screens are removed from the product navigation.

The remainder of this document describes the retained calculation foundation
and historical v2 settlement machinery; its verification/payment gates apply
to that historical machinery, not to current projections.


Status: implemented planning rules, 2026-10-18. The founder's v2 prompt and
`YEROME_V2_IMPLEMENTATION_PLAN.md` govern business intent. The workbook link was
not accessible during this implementation; its supplied numeric examples are
fixtures, not independent confirmation of its current cells.

## Parties and scope

An Admin manages US Persons and jobs. Each US Person sees only their own
statement and dated employer paychecks. A US Person with an Admin-recorded
fixed-rate referral may also see an allowlisted commission statement, including
accrued, paid and owed history after a relationship ends. Only a currently
eligible referral contributes to the forward monthly commission estimate.
The identity is derived from a verified Auth user, never a request-supplied
person ID. Miki's own jobs use the direct deal. A referred person's jobs use
the referral deal and generate a separate Miki commission. The fourth workbook
tab is outside this version.

Every active US Person has one apartment agreement independent of job count.
The 10–12 job figure is a goal, not a job cap.

## Monthly planning formula

All source money is converted to integer cents, half up, once. The pure engine
is `src/lib/finance-v2/index.js`, version
`partnership-2026-10-18-v1`. For combined monthly after-tax income `A` and
eligible active jobs `n` belonging to **one** US Person:

| Component | Direct | Miki referral |
| --- | ---: | ---: |
| Agreed fixed charge per person | $900 | $900 |
| Agreed variable charge per job | $950 | $1,150 |
| Actual fixed spending per person, Admin only | $650 | $650 |
| Actual variable spending per job, Admin only | $400 | $400 |
| US Person share | 50% of `A - agreed charges` | 50% of `A - agreed charges` |
| Miki commission | $0 | $200 × n |
| Gang Cut, Admin only | 10% × A | 10% × A |

Round the US Person's 50% share and Gang Cut to the nearest cent, half up.
YEROME's take-home is the exact remaining cents after actual spending, the
person share, Miki commission, and Gang Cut. This preserves `A = actual cost +
person share + Miki commission + Gang Cut + YEROME take-home` exactly.
Negative quoted net and negative YEROME profit remain visible in Admin
planning; an actual payout needs an approved loss policy.

The agreed amounts are contractual operating and service charges, which include
commercial margin. They must not be described as YEROME's actual worker wages,
actual HR payroll or actual third-party rent. Underlying spending and Gang Cut
are Admin only. There is no active safety deposit, recommendation, deduction,
transfer, setting or API property in v2. The migration retains obsolete
historical values in a restricted archival table solely for migration review.

The workbook inputs $3,368.75, $6,303.333333…, $9,160, $14,835.416666…,
$27,904.166666… and $33,125 are tested directly at job counts 1, 2, 3, 5,
10 and 12. The direct sheet's one-job input mismatch is normalized to
$3,368.75. Its tax assumptions do not define 2026 legal tax rates.

## Tax and paycheck meanings

Tax parameters are versioned as `irs-2026-revproc-2025-32-v1` in
`src/lib/calculations/taxConfig2026.js`. The federal model applies the 2026
filing-status standard deduction, progressive brackets, employee Social
Security with the $184,500 wage base, Medicare and Additional Medicare.
Texas has no modeled state income tax. Other states block partner projections
until their tax rules are configured. Federal tax is based on **all projected
jobs for one US Person combined**, with any entered other-income and deduction
adjustments. This is a planning estimate, not a tax return calculation; credits,
employer plans, local tax, legal classification and many other facts are absent.
Have a tax professional review it before reliance.

Each recorded employer paycheck has its own actual gross, withholding and net
deposit. These facts are distinct from annual estimated tax liability and from
the contractual partner share. Two employers may each withhold Social Security;
an estimated excess credit is a tax-return matter, not cash available for a
current-period distribution. The reconciliation gap is informational and is
never an automatic second deduction.

For an hourly job, normalized typical biweekly gross is hourly cents × weekly hours × 2;
annual steady-state gross is hourly cents × weekly hours × 52. Dated actual
hours and paystub gross replace an estimate only for that check. A monthly
planning amount's biweekly equivalent is `monthly × 12 ÷ 26`, with cent
rounding. A salaried job's **employer paycheck estimate** uses its configured
period count (12, 24, 26, 27 or 52); its normalized two-week equivalent still
uses 26. `allocateCents` spreads annual fixed totals across an actual chosen
period count with exact conservation. A scheduled pay date is not proof that
cash was received or a partner distribution was settled. For 2026 reconciliation,
only paid checks with a 2026 pay date count; all pages of dated checks are read.
Gross must equal net deposit plus each recorded withholding and other deduction.
Corrections append a full replacement paystub snapshot and audit event; the
original received check remains immutable.
Weekly, biweekly and monthly expected dates are independently derived from
each job's effective-dated first payday and employer cadence. A missing date
blocks completed-month posting even if no schedule row was generated. A second
full-month job with no checks also blocks posting. The SQL posting transaction
checks this independently of the browser proposal. Payroll holidays, moved
paydays, and explicit no-pay exceptions need a verified employer calendar and
signed payout rule before a month can post. Semi-monthly scheduling and
settlement are disabled because one payday cannot define two monthly anchors;
existing historical semi-monthly terms are retained for review.

## Versions, history and limits

New job pay terms, status events, referral status events and agreement terms
have effective dates and immutable prior versions. Previously settled paycheck
snapshots are protected against update and deletion. A later paystub correction
flags the whole posted month for a formula-derived reconciliation. Every dated
line is reweighted to the corrected receipt nets; partner, commission, Gang,
quoted charge, actual cost and YEROME balances keep original, change and
current values. Further partner payment for any check in that month is blocked
until correction reconciliation. Free-form reallocation is unavailable. A
correction that would put recorded payment above revised partner due is blocked
pending a signed credit or recovery rule. Legacy rows
are **not** automatically classified as a verified direct/referral agreement,
and old paid statuses are not silently converted to v2 settlements.

The monthly partner projection is a **steady-state run rate**, using current
active jobs. The separate tax-year liability estimate prorates current terms
over dated employment when one term version applies. When pay terms change or
a job pauses within 2026, the annual tax and reconciliation gap are marked
unavailable until dated wages are reviewed; a current run-rate share may still
be shown. Earlier received wages and withholding remain visible through a pause
or resume. Actual hours and historical paystubs need a fuller dated forecast. The
commission posting function uses status events at the earned month and accepts
only completed full calendar months with unambiguous full-month active jobs and
a verified agreement/referral. It does not decide partial-month entitlements.

## Decision-gated dated settlement proposal

`src/lib/finance-v2/settlement.js` is a tested proposal for a **closed person
calendar month**. Under a proposed receipt-net basis, every independently
expected payday in that month must have a reconciled receipt. Their actual net deposits form `A`;
one quoted apartment charge and one actual apartment spend are applied per
person, and only full-month active jobs are counted. The same 50/50, $200/job,
and 10% formulas apply. Monthly totals are allocated to dated checks in
proportion to each net deposit with deterministic cent remainders. Each line
and the whole month reconcile exactly. A partial or paused job, a missing
receipt, an unverified contract or a negative quoted net blocks posting.

**This cash basis and allocation are proposals, not approved contractual or
tax facts.** No settlement-policy approval is seeded. The Admin API and SQL
RPC refuse posting, partner payment and correction reconciliation without an enabled,
documented approval for that person. A synthetic approval exists only inside
the disposable database test. Once approved, the ledger stores the agreement
version, receipt correction sequence, calculation version, idempotency key,
partner due, recorded payments, outstanding amount and immutable formula-derived
correction adjustments. It does not initiate a transfer.

New partner and commission payment records point to one immutable external
transfer identity keyed by a normalized bank reference, date and verified
total. One transfer may be allocated to distinct obligations, but each
transfer-obligation pair can be recorded once and total allocations cannot
exceed the transfer amount. Stable request keys make repeated POSTs idempotent.
Old payment rows remain intact and unlinked; their references block new reuse
until independently reconciled. An apparent reference collision or a bank
that reuses identifiers requires separate evidence review, not a silent
duplicate or an invented alternate reference. Recording a payment does not
initiate funds movement.

## Decision register

| Decision | Safe current behavior | Owner action before enabling settlement |
| --- | --- | --- |
| Mid-month referral starts/stops and wage-receipt dependence | Full months only | Confirm eligibility and proration in writing |
| Commission payment timing | Accrue separately; record only actual external payment | Approve due date and payer |
| Negative quoted net or losses | Show loss, block implied payout | Approve floor and offset policy |
| Apartment lease while jobs pause/end | Keep actual lease concept separate from partner charge | Confirm lease/charge dates and agreement |
| Gang Cut custody | Internal allocation only | Define account and legal classification |
| Charge and commission disclosure | Use agreed commercial fee wording | Counsel review of signed agreements |
| Employer W-2 deposits versus partner distributions | Keep separate, no automatic movement | Accounting/legal signoff on structure |
| Dated settlement receipt basis and allocation | Gate all real posting; proposed closed-month net-deposit basis only in tests | Approve or replace the basis, charge allocation, payment timing and signed policy reference |
| Revised share below an already recorded payment | Block formula reconciliation and further payment; surface the unresolved amount | Approve documented credit or recovery process before any such correction is settled |
| Employer payday changes, holiday shifts and semi-monthly anchors | Block ambiguous months and new semi-monthly schedules | Record verified calendar/exception dates and approve treatment before settlement |
| Repeated bank reference or legacy payment match | Block new recognition; preserve old rows | Independently verify transfer identity and approve an audited resolution |
| State tax and future tax years | Texas 2026 only | Provide reviewed versioned parameters |
| Historical three-way and old referral rows | Do not auto-map or pay | Review identity, signed terms and migration evidence |

Tax references: [IRS 2026 inflation adjustments](https://www.irs.gov/irb/2025-45_IRB),
[SSA 2026 contribution base](https://www.ssa.gov/oact/cola/cbb.html), and
[IRS excess Social Security withholding](https://www.irs.gov/taxtopics/tc608).

## Fourth-review payment evidence and dated schedules

An external transfer is a single-recipient USD bank transfer, identified by an
immutable US Person recipient, normalized bank reference, amount, actual date,
source provider/account alias and destination account alias. Account aliases and
proof references are Admin-only; no credentials or full bank account numbers
belong in these fields. Registration alone does not mark anything paid. A separate
immutable Admin verification records a reference to retained external evidence
and confirms the recipient, USD amount, date, reference and accounts. This is a
human evidence attestation, not automated bank reconciliation or bank execution.

SQL derives a partner payment's recipient from the posted settlement and a
commission payment's recipient from the immutable referral identity. One verified
transfer may cover both streams for the **same person**, within its total. It may
never fund another person's obligation. Multi-recipient bank batches are outside
this single-transfer flow; they require documented per-recipient evidence and a
separately approved model. Provider/account aliases are recorded, but reference
uniqueness deliberately remains global: changing an alias cannot evade replay
protection. Genuine namespace collisions need independent review; no override is
enabled.

Pre-existing payments retain their original recorded balances and are explicitly
flagged when recipient/evidence verification is absent. Do not automatically
re-pay, reassign, or mark them verified. Historical records require independent
review and an approved audited correction if necessary.

Schedule requests select the unique term applicable on the first requested pay
date, even if a newer or future term is open-ended. Every generated date must stay
inside that term and its recorded cadence. Crossing a term boundary rejects the
whole request; generate each term separately. SQL revalidates the dates while
holding term locks and atomically records inserted dates and an audit entry.
Existing receipts remain unchanged on retry. Missing/overlapping terms,
semi-monthly anchors and moved-payday exceptions continue to require review.
