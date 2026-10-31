import { useAsync } from '../../hooks/useAsync.js';
import { getMyStatement } from '../../lib/data/v2.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { Forecast, AllocationPlan } from '../../components/planning/ProjectionStory.jsx';

export default function OwnerPlan() {
  const { data, loading, error, refresh } = useAsync(getMyStatement, []);
  return <>
    <PageHeader title="What’s next" subtitle="Expected income and Admin’s instructions for allocating your next fund." />
    {loading ? <PageSkeleton header={false} /> : error ? <ErrorState error={error} onRetry={refresh} /> : <>
      <AllocationPlan plan={data.allocationPlan} />
      <Forecast person={data} />
    </>}
  </>;
}
