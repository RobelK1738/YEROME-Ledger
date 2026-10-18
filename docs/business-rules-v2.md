# YEROME Ledger v2 business rules

Status: implemented planning rules, 2026-10-18. The founder's v2 prompt and
`YEROME_V2_IMPLEMENTATION_PLAN.md` govern business intent. The workbook link was
not accessible during this implementation; its supplied numeric examples are
fixtures, not independent confirmation of its current cells.

## Parties and scope

An Admin manages US Persons and jobs. Each US Person sees only their own
statement and dated employer paychecks. A US Person with an Admin-recorded,
active, fixed-rate referral may also see an allowlisted commission statement.
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

For an hourly job, typical biweekly gross is hourly cents × weekly hours × 2;
annual steady-state gross is hourly cents × weekly hours × 52. Dated actual
hours and paystub gross replace an estimate only for that check. A monthly
planning amount's biweekly equivalent is `monthly × 12 ÷ 26`, with cent
rounding. `allocateCents` spreads annual fixed totals across an actual chosen
24, 26, 27 or 52 periods with exact conservation. A scheduled pay date is not
proof that cash was received or a partner distribution was settled.

## Versions, history and limits

New job pay terms and agreement terms have effective dates and immutable prior
versions. Previously settled paycheck snapshots are protected against update
and deletion; corrections require a separate adjustment record. Legacy rows
are **not** automatically classified as a verified direct/referral agreement,
and old paid statuses are not silently converted to v2 settlements.

The monthly partner projection is a **steady-state run rate**, using current
active jobs. The separate tax-year liability estimate prorates the current job
rate over the dated active portion of 2026. It is not yet reconciled to actual
hours, historical paystubs, job pauses or changing job terms within the year;
those need a more complete dated forecast. The UI labels the two bases
separately. The commission posting function only accepts
completed full calendar months with unambiguous full-month active jobs. It
does not decide partial-month entitlements.

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
| State tax and future tax years | Texas 2026 only | Provide reviewed versioned parameters |
| Historical three-way and old referral rows | Do not auto-map or pay | Review identity, signed terms and migration evidence |

Tax references: [IRS 2026 inflation adjustments](https://www.irs.gov/irb/2025-45_IRB),
[SSA 2026 contribution base](https://www.ssa.gov/oact/cola/cbb.html), and
[IRS excess Social Security withholding](https://www.irs.gov/taxtopics/tc608).
