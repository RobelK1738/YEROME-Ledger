import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { getMyStatement, getMyCommissions } from '../../lib/data/v2.js';
import { formatCurrency } from '../../lib/formatting/money.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard } from '../../components/ui/StatCard.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Loading } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';

const money = (value) => value == null ? '—' : formatCurrency(value);

export function OwnerHome() {
  const { data, loading, error, refresh } = useAsync(async () => {
    const [statement, commissions] = await Promise.all([getMyStatement(), getMyCommissions()]);
    return { statement, commissions };
  }, []);
  if (loading) return <Loading full label="Loading your statement…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  const s = data.statement;
  const referrals = data.commissions.referrals || [];
  const commissionMonthly = referrals.reduce((sum, row) => sum + row.monthlyEquivalentCents, 0);
  return <>
    <PageHeader title={`Hi, ${s.displayName}`} subtitle="Your jobs, expected share and next employer payday." />
    {!s.projectionAvailable ? <Card title="Financial estimate needs review">
      <p>Your administrator is reviewing the written agreement, apartment charge, referral relationship or job pay terms. Your jobs and recorded pay dates remain visible below.</p>
    </Card> : null}
    <div className="stat-grid stat-grid--hero">
      <StatCard label="Your expected share" value={money(s.myShareBiweeklyEquivalentCents)}
        hint="Typical biweekly equivalent · estimated, not a dated payment" emphasis />
      <StatCard label="Next employer payday" value={s.nextPayDate || 'Not scheduled'}
        hint="Paycheck date, not a partner distribution date" />
      <StatCard label="Active jobs" value={s.activeJobCount} />
    </div>
    {referrals.length ? <Card title="Your two earning streams">
      <p>Your own job share: <strong>{money(s.myShareMonthlyCents)} per month estimated</strong>.</p>
      <p>Referral commission: <strong>{money(commissionMonthly)} per full month estimated</strong>.</p>
      <p>Combined planning equivalent: <strong>{money(s.myShareMonthlyCents == null ? null : s.myShareMonthlyCents + commissionMonthly)} per month</strong>. Actual payment dates are recorded separately.</p>
      <Link to="/owner/commissions">See commissions</Link>
    </Card> : null}
    <Card title="How calculated?" subtitle="You can expand the financial story behind this estimate.">
      <details><summary>Show calculation</summary>
        <dl className="v2-breakdown">
          <dt>Combined annual gross from your active jobs</dt><dd>{money(s.annualGrossEstimateCents)}</dd>
          <dt>Projected 2026 wages using job dates</dt><dd>{money(s.taxYearProjectedWagesCents)}</dd>
          <dt>Estimated annual tax liability</dt><dd>{money(s.annualTaxLiabilityEstimateCents)}</dd>
          <dt>After-tax monthly equivalent</dt><dd>{money(s.monthlyAfterTaxEquivalentCents)}</dd>
          <dt>Agreed operating and service charges per month</dt><dd>{money(s.agreedChargesMonthlyCents)}</dd>
          <dt>Quoted net per month</dt><dd>{money(s.quotedNetMonthlyCents)}</dd>
          <dt>Your 50% contractual share per month</dt><dd>{money(s.myShareMonthlyCents)}</dd>
        </dl>
        <p className="muted">The agreed charges are commercial amounts under the written agreement. They are not statements of YEROME’s underlying third-party spending.</p>
      </details>
    </Card>
    <p className="muted">{s.estimateLimitations}</p>
  </>;
}

export function OwnerJobs() {
  const { data, loading, error, refresh } = useAsync(getMyStatement, []);
  if (loading) return <Loading full label="Loading your jobs…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  return <>
    <PageHeader title="My Jobs" subtitle="Read-only employment and pay terms for your account." />
    {data.myJobs.length ? <div className="v2-person-grid">{data.myJobs.map((job) => <Card key={job.id}
      title={job.employerName} subtitle={`${job.roleTitle || 'Role'} · ${job.status}`}>
      {job.needsTermsReview ? <p>Pay terms need administrator review.</p> : <>
        <p>{job.compensationMode === 'hourly'
          ? `${money(job.hourlyRateCents)} per hour · ${job.expectedWeeklyHours} expected hours per week`
          : `${money(job.annualGrossCents)} annual salary`}</p>
        <p>Typical biweekly gross: <strong>{money(job.typicalBiweeklyGrossCents)}</strong> · estimate</p>
        <p>Payroll frequency: {job.payFrequency} · first configured payday: {job.firstPayDate || 'not scheduled'}</p>
      </>}
    </Card>)}</div> : <Card><p className="muted">No jobs have been added to your account yet.</p></Card>}
  </>;
}

export function OwnerPayments() {
  const { data, loading, error, refresh } = useAsync(getMyStatement, []);
  if (loading) return <Loading full label="Loading payments…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  const checks = [...data.myPaychecks].sort((a, b) => b.payDate.localeCompare(a.payDate));
  return <>
    <PageHeader title="Payments" subtitle="Employer paychecks and actual deposits. A partner distribution is a separate contractual event." />
    <Card title="Your employer paycheck timeline">
      {checks.length ? <ul className="v2-list">{checks.map((check) => <li key={check.id}>
        <strong>Paycheck dated {check.payDate}</strong> · {check.status}
        <p>Recorded employer gross: {money(check.actualGrossCents)} · actual net deposited: {money(check.actualNetReceivedCents)}</p>
        <details><summary>Recorded withholding</summary>
          <p>Federal: {money(check.federalWithheldCents)} · Social Security: {money(check.socialSecurityWithheldCents)} · Medicare: {money(check.medicareWithheldCents)} · state: {money(check.stateWithheldCents)}</p>
        </details>
      </li>)}</ul> : <p className="muted">No pay dates have been recorded yet.</p>}
    </Card>
    <Card title="Tax position" subtitle="This is informational and does not make another deduction from your share.">
      <p>Estimated annual tax liability: {money(data.annualTaxLiabilityEstimateCents)}</p>
      <p>Withheld on recorded paychecks: {money(data.taxReconciliation?.actualWithholdingCents)}</p>
      <p>Social Security withheld on recorded paychecks: {money(data.taxReconciliation?.actualSocialSecurityWithheldCents)}</p>
      <p>Potential Social Security excess above the 2026 annual cap: {money(data.taxReconciliation?.potentialExcessSocialSecurityCents)}</p>
      <p>Annual estimate less withholding recorded so far: {money(data.taxReconciliation?.projectedGapCents)}</p>
      {data.taxReconciliation?.missingWithholdingCount ? <p className="muted">Withholding is incomplete on {data.taxReconciliation.missingWithholdingCount} received paycheck(s). The comparison is unavailable until the paystubs are reviewed.</p> : null}
      <p className="muted">Future paycheck withholding and any estimated tax payments are not included, so this is not a final year-end balance.</p>
      <p className="muted">Any Social Security credit is a tax-return matter; it is not included in current paycheck cash or a partner distribution.</p>
    </Card>
  </>;
}

export function OwnerCommissions() {
  const { data, loading, error, refresh } = useAsync(getMyCommissions, []);
  if (loading) return <Loading full label="Loading commissions…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  const referrals = data.referrals || [];
  const monthly = referrals.reduce((sum, row) => sum + row.monthlyEquivalentCents, 0);
  return <>
    <PageHeader title="Commissions" subtitle="$200 per eligible active referred job per full calendar-month estimate. Separate from your own job share." />
    <div className="stat-grid">
      <StatCard label="Monthly equivalent" value={money(monthly)} hint="Accrual estimate, not money already paid" emphasis />
      <StatCard label="Biweekly equivalent" value={money(Math.round(monthly * 12 / 26))}
        hint="Planning conversion only; actual payment dates are separate" />
    </div>
    <Card title="Referred US Persons">
      {referrals.length ? <ul className="v2-list">{referrals.map((row) => <li key={row.referralId}>
        <strong>{row.referredDisplayName}</strong> · {row.eligibleJobCount} eligible active jobs
        <p>{money(row.ratePerJobCents)} per job/month · {money(row.monthlyEquivalentCents)} monthly equivalent</p>
        <p>Recorded accrued: {money(row.accruedCents)} · paid: {money(row.paidCents)} · owed: {money(row.owedCents)}</p>
        {row.events?.length ? <details><summary>Recorded months</summary><ul className="v2-list">
          {row.events.map((event) => <li key={event.calendarMonth}>{event.calendarMonth} · {event.eligibleJobCount} eligible jobs · accrued {money(event.accruedCents)} · paid {money(event.paidCents)} · owed {money(event.owedCents)}</li>)}
        </ul></details> : <p className="muted">No full-month accrual has been posted yet.</p>}
        {row.needsContractReview ? <p>Legacy percentage arrangement needs agreement review.</p> : null}
      </li>)}</ul> : <p className="muted">No verified referral arrangement is linked to your account.</p>}
    </Card>
  </>;
}
