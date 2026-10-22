import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { getMyCommissions, getMyStatement } from '../../lib/data/v2.js';
import { formatDate, money, plural, relativeDays } from '../../lib/presentation/format.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard, StatGrid } from '../../components/ui/StatCard.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DescriptionList } from '../../components/ui/DescriptionList.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { BasisTag } from '../../components/ui/Badge.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';

const KINDS = [
  { icon: 'trending', title: 'Estimate', text: 'What we expect from your current jobs and agreement. Planning only — it is not a payment.' },
  { icon: 'receipt', title: 'Employer paycheck', text: 'What your employer actually paid, recorded from the paystub and deposit.' },
  { icon: 'banknote', title: 'Partner distribution', text: 'Your contractual share for a completed pay period, recorded once it is paid to you.' },
];

export default function OwnerHome() {
  const statement = useAsync(getMyStatement, []);
  const commissions = useAsync(getMyCommissions, []);

  if (statement.loading) return <PageSkeleton stats={3} rows={4} label="Loading your statement…" />;
  if (statement.error) return <ErrorState error={statement.error} onRetry={statement.refresh} />;

  const s = statement.data;
  const firstName = (s.displayName || '').trim().split(/\s+/)[0];
  const referrals = commissions.data?.referrals || [];
  const commissionMonthly = referrals.reduce((sum, row) => sum + row.monthlyEquivalentCents, 0);
  const hasJobs = s.myJobs.length > 0;
  const nextIn = s.nextPayDate ? relativeDays(s.nextPayDate, s.asOf?.slice(0, 10) || undefined) : null;
  const header = <PageHeader title={firstName ? `Hi, ${firstName}` : 'Welcome'} documentTitle="Home"
    subtitle="Your expected share, next employer payday and jobs at a glance." />;
  const kindsCard = (
    <Card title="Estimates and actuals" icon="info" subtitle="Three kinds of figures appear in your portal.">
      <ul className="kind-list">
        {KINDS.map((kind) => (
          <li key={kind.title} className="kind-list__item">
            <span className="kind-list__icon" aria-hidden="true"><Icon name={kind.icon} size={18} /></span>
            <div><p className="kind-list__title">{kind.title}</p><p className="kind-list__text">{kind.text}</p></div>
          </li>
        ))}
      </ul>
    </Card>
  );

  if (!hasJobs && !s.myPaychecks.length && !(s.partnerSettlements || []).length && !referrals.length) {
    return <>
      {header}
      <Notice tone="info" title="Your account is set up">
        YEROME will add your job details. Once a job is added you’ll see your expected share, pay dates and payments here.
      </Notice>
      {kindsCard}
    </>;
  }

  return <>
    {header}

    {!hasJobs ? (
      <Notice tone="info" title="Your account is set up">
        YEROME will add your job details. Once a job is added you’ll see your expected share, pay dates and payments here.
      </Notice>
    ) : !s.projectionAvailable ? (
      <Notice tone="warn" title="Your estimate is being reviewed">
        YEROME is reviewing your agreement, apartment charge, referral or job pay terms. Your jobs and recorded pay dates are still shown below.
      </Notice>
    ) : null}

    <section className="hero-card" aria-labelledby="share-heading">
      <div className="hero-card__main">
        <div className="hero-card__label">
          <h2 id="share-heading">Your expected share</h2>
          <BasisTag kind="estimate" />
        </div>
        <p className="hero-card__value num">{money(s.myShareBiweeklyEquivalentCents)}<span className="hero-card__unit"> every two weeks</span></p>
        <p className="hero-card__sub">
          About <strong className="num">{money(s.myShareMonthlyCents)}</strong> per month. This is a planning estimate, not a dated payment —
          actual distributions appear on <Link to="/owner/payments?view=distributions">Payments</Link>.
        </p>
      </div>
      <div className="hero-card__side">
        <div className="hero-card__fact">
          <span className="hero-card__fact-label"><Icon name="calendar" size={16} /> Next employer payday</span>
          <span className="hero-card__fact-value">{s.nextPayDate ? formatDate(s.nextPayDate) : 'Not scheduled'}</span>
          <span className="hero-card__fact-hint">{nextIn ? `${nextIn} · ` : ''}your employer’s pay date, not a distribution date</span>
        </div>
        <div className="hero-card__fact">
          <span className="hero-card__fact-label"><Icon name="briefcase" size={16} /> Active jobs</span>
          <span className="hero-card__fact-value">{s.activeJobCount}</span>
          <Link className="hero-card__fact-hint" to="/owner/jobs">View my jobs</Link>
        </div>
      </div>
    </section>

    {referrals.length ? (
      <Card title="Your two earning streams" icon="coins" subtitle="Monthly planning estimates. Actual payments are recorded separately."
        actions={<ButtonLink to="/owner/commissions" size="sm" variant="secondary">See commissions</ButtonLink>}>
        <DescriptionList items={[
          { label: 'Your own job share', value: money(s.myShareMonthlyCents), basis: 'estimate' },
          { label: 'Referral commission', hint: plural(referrals.length, 'referral'), value: money(commissionMonthly), basis: 'estimate' },
          { label: 'Combined per month', value: money(s.myShareMonthlyCents == null ? null : s.myShareMonthlyCents + commissionMonthly), total: true },
        ]} />
      </Card>
    ) : null}

    <div className="grid-2">
      <Card title="How your share is calculated" icon="scale" subtitle="Monthly figures from your current jobs and written agreement.">
        <DescriptionList items={[
          { label: 'Combined annual gross from active jobs', value: money(s.annualGrossEstimateCents) },
          { label: 'Estimated annual tax', hint: `${s.taxYear} federal; Texas has no state income tax`, value: money(s.annualTaxLiabilityEstimateCents) },
          { label: 'After-tax income per month', value: money(s.monthlyAfterTaxEquivalentCents), emphasis: true },
          { label: 'Less agreed charges per month', hint: 'Operating, service and apartment charges', value: s.agreedChargesMonthlyCents == null ? '—' : `− ${money(s.agreedChargesMonthlyCents)}` },
          { label: 'Quoted net per month', value: money(s.quotedNetMonthlyCents) },
          { label: 'Your 50% contractual share', value: money(s.myShareMonthlyCents), total: true, basis: 'contractual' },
        ]} />
        <p className="footnote">Agreed charges are the commercial amounts in your written agreement. They are not statements of YEROME’s underlying spending.</p>
      </Card>
      {kindsCard}
    </div>

    <StatGrid columns={3}>
      <StatCard label="Projected wages this year" value={money(s.taxYearProjectedWagesCents)} basis="estimate" hint="Using job start and status dates" />
      <StatCard label="Paychecks recorded" value={s.myPaychecks.filter((check) => check.status === 'paid').length} basis="recorded"
        to="/owner/payments" linkLabel="View payments" />
      <StatCard label="Distributions posted" value={(s.partnerSettlements || []).length} basis="contractual"
        to="/owner/payments?view=distributions" linkLabel="View distributions" />
    </StatGrid>

    <p className="footnote">{s.estimateLimitations}</p>
  </>;
}
