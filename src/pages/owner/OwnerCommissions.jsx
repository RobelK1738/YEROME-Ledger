import { useAsync } from '../../hooks/useAsync.js';
import { getMyStatement } from '../../lib/data/v2.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard, StatGrid } from '../../components/ui/StatCard.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { CommissionSources, AllocationPlan } from '../../components/planning/ProjectionStory.jsx';
import { money, formatDate } from '../../lib/presentation/format.js';

export default function OwnerCommissions() {
  const { data, loading, error, refresh } = useAsync(getMyStatement, []);
  const header = <PageHeader title="Commission projections" subtitle="See which referrals generate income, alongside your own jobs and Admin’s next-fund plan." />;
  if (loading) return <>{header}<PageSkeleton header={false} /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;
  const sources = data.commissionSources || [];
  return <>{header}
    <StatGrid columns={3}>
      <StatCard label="Commission / month" value={money(data.commissionIncomeMonthlyCents)} basis="estimate" emphasis />
      <StatCard label="Commission-generating jobs" value={sources.reduce((sum, row) => sum + row.eligibleJobCount, 0)} />
      <StatCard label="Next fund date set by Admin" value={data.allocationPlan?.nextFundDate ? formatDate(data.allocationPlan.nextFundDate) : 'Not set'} />
    </StatGrid>
    <CommissionSources sources={sources} />
    <AllocationPlan plan={data.allocationPlan} />
  </>;
}
