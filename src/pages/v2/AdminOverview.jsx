import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { getAdminOverview } from '../../lib/data/v2.js';
import { formatCurrency } from '../../lib/formatting/money.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard } from '../../components/ui/StatCard.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Loading } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';

export default function AdminOverview() {
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  if (loading) return <Loading full label="Loading overview…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  const people = (data?.people || []).filter((person) => person.personStatus !== 'archived');
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const scheduled = people.flatMap((person) => person.myPaychecks
    .filter((check) => check.status === 'scheduled' && check.payDate >= today && check.payDate <= twoWeeks)
    .map((check) => ({ ...check, person: person.displayName })))
    .sort((a, b) => a.payDate.localeCompare(b.payDate)).slice(0, 10);
  return <>
    <PageHeader title="Overview" subtitle="The current payment picture, with estimates labeled by period."
      actions={<div className="row"><Link className="btn btn--primary" to="/admin/people?add=person">Add US Person</Link>
        <Link className="btn btn--secondary" to="/admin/people?add=job">Add Job</Link></div>} />
    <div className="stat-grid">
      <StatCard label="Active US Persons" value={people.filter((person) => person.activeJobCount > 0).length} />
      <StatCard label="Active jobs" value={people.reduce((sum, person) => sum + person.activeJobCount, 0)} />
      <StatCard label="YEROME take-home" value={formatCurrency(data.totalMonthlyProfitCents)}
        hint="Estimated per month · verified agreements only" emphasis />
      <StatCard label="Needs review" value={data.unverifiedCount} hint="Agreement, apartment or job terms" />
    </div>
    {data.unverifiedCount > 0 ? <Card title="Attention needed">
      <p>{data.unverifiedCount} US Person profile(s) need an agreement, apartment or compensation review before a share is shown.</p>
      <Link to="/admin/people">Review US Persons</Link>
    </Card> : null}
    <Card title="Next two weeks" subtitle="Scheduled employer paychecks. This is timing, not a settled partner distribution.">
      {scheduled.length ? <ul className="v2-list">{scheduled.map((check) =>
        <li key={check.id}><strong>{check.payDate}</strong> · {check.person} · {check.status}</li>)}</ul>
        : <p className="muted">No future paycheck dates have been scheduled.</p>}
      <Link to="/admin/pay-runs">Open Pay Runs</Link>
    </Card>
  </>;
}
