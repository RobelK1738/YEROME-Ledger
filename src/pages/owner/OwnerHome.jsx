import { useAsync } from '../../hooks/useAsync.js';
import { getMyStatement } from '../../lib/data/v2.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard, StatGrid } from '../../components/ui/StatCard.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { ProjectionStory, CommissionSources } from '../../components/planning/ProjectionStory.jsx';
import { money, formatDate } from '../../lib/presentation/format.js';

export default function OwnerHome() {
  const { data: p, loading, error, refresh } = useAsync(getMyStatement, []);
  if (loading) return <PageSkeleton label="Loading your projection…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  const commission = p.commissionIncomeMonthlyCents || 0;
  return <>
    <PageHeader title={`${p.displayName}’s financial picture`} subtitle="Your jobs, projected income and split, with a clear plan for what comes next." />
    <StatGrid columns={4}>
      <StatCard label="Jobs in projection" value={p.activeJobCount} icon="briefcase" />
      <StatCard label="Your projected income / month" value={money(p.myShareMonthlyCents == null ? null : p.myShareMonthlyCents + commission)} basis="estimate" emphasis hint="Job share + referral commissions" />
      <StatCard label="Commission income / month" value={money(commission)} basis="estimate" />
      <StatCard label="Next expected job income" value={p.forecast?.nextDate ? formatDate(p.forecast.nextDate) : 'Date needed'} hint={p.forecast?.nextNetCents != null ? `${money(p.forecast.nextNetCents)} after estimated taxes` : 'Based on submitted job schedules'} />
    </StatGrid>
    <ProjectionStory person={p} />
    {p.commissionSources?.length ? <CommissionSources sources={p.commissionSources} /> : null}
  </>;
}
