import { useAsync } from '../../hooks/useAsync.js';
import { getMyCommissions } from '../../lib/data/v2.js';
import { formatMonth, money, plural } from '../../lib/presentation/format.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard, StatGrid } from '../../components/ui/StatCard.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';

const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] || 0), 0);

function ReferralCard({ row }) {
  return (
    <Card icon="user" title={row.referredDisplayName}
      subtitle={row.currentlyEarning ? `${plural(row.eligibleJobCount, 'eligible active job')} · ${money(row.ratePerJobCents)} per job per month` : 'Not earning a commission right now'}
      actions={row.currentlyEarning ? <Badge tone="ok">Earning</Badge> : <Badge tone="muted">Not earning</Badge>}>
      {row.needsContractReview ? <Notice tone="warn">This older percentage arrangement is being reviewed against your agreement.</Notice> : null}
      {row.unverifiedPaidCents > 0 ? <Notice tone="warn">Some past commission payments are being checked against evidence. Recorded balances are kept as they are meanwhile.</Notice> : null}
      <div className="ledger-item__figures">
        <div><span className="figure__label">Monthly estimate</span><span className="figure__value num">{money(row.monthlyEquivalentCents)}</span></div>
        <div><span className="figure__label">Accrued</span><span className="figure__value num">{money(row.accruedCents)}</span></div>
        <div><span className="figure__label">Paid to you</span><span className="figure__value num">{money(row.paidCents)}</span></div>
        <div><span className="figure__label">Owed</span><span className="figure__value num">{money(row.owedCents)}</span></div>
      </div>
      {row.events?.length ? (
        <details className="disclosure">
          <summary>Recorded months ({row.events.length})</summary>
          <div className="table-wrap">
            <table className="mini-table">
              <caption className="sr-only">Monthly commission accruals for {row.referredDisplayName}</caption>
              <thead><tr><th scope="col">Month</th><th scope="col" className="ta-right">Eligible jobs</th><th scope="col" className="ta-right">Accrued</th><th scope="col" className="ta-right">Paid</th><th scope="col" className="ta-right">Owed</th></tr></thead>
              <tbody>
                {row.events.map((event) => (
                  <tr key={event.calendarMonth}>
                    <th scope="row">{formatMonth(event.calendarMonth)}</th>
                    <td className="ta-right num">{event.eligibleJobCount}</td>
                    <td className="ta-right num">{money(event.accruedCents)}</td>
                    <td className="ta-right num">{money(event.paidCents)}</td>
                    <td className="ta-right num">{money(event.owedCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : <p className="footnote">No full month has been accrued yet. Months are added after they end.</p>}
    </Card>
  );
}

export default function OwnerCommissions() {
  const { data, loading, error, refresh } = useAsync(getMyCommissions, []);
  const header = <PageHeader title="Commissions"
    subtitle="Referral commission: $200 per eligible active referred job for each full calendar month. Separate from your own job share." />;
  if (loading) return <>{header}<PageSkeleton header={false} stats={3} rows={3} label="Loading commissions…" /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;
  const referrals = data.referrals || [];
  const monthly = sum(referrals, 'monthlyEquivalentCents');
  return <>
    {header}
    {referrals.length ? <>
      <StatGrid columns={4}>
        <StatCard label="Monthly estimate" value={money(monthly)} basis="estimate" emphasis
          hint={`About ${money(Math.round(monthly * 12 / 26))} every two weeks`} />
        <StatCard label="Accrued to date" value={money(sum(referrals, 'accruedCents'))} basis="recorded" hint="Completed months" />
        <StatCard label="Paid to you" value={money(sum(referrals, 'paidCents'))} basis="payment" />
        <StatCard label="Owed" value={money(sum(referrals, 'owedCents'))} hint="Accrued but not yet paid" />
      </StatGrid>
      <Notice tone="neutral">The monthly estimate is a forecast. A month is accrued only after it ends, and is marked paid once YEROME records the payment to you.</Notice>
      <div className="card-grid">{referrals.map((row) => <ReferralCard key={row.referralId} row={row} />)}</div>
    </> : (
      <Card><EmptyState icon="link" title="No referrals linked"
        message="If you referred someone to YEROME, their verified referral will appear here with your commission." /></Card>
    )}
  </>;
}
