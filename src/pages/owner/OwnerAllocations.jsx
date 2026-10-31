import { useAsync } from '../../hooks/useAsync.js';
import { getMyStatement } from '../../lib/data/v2.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { PaycheckAllocations, AllocationNotes } from '../../components/planning/PaycheckAllocations.jsx';

export default function OwnerAllocations() {
  const { data: person, loading, error, refresh } = useAsync(getMyStatement, []);
  if (loading) return <PageSkeleton label="Loading paycheck allocations…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  return <><PageHeader title="Paycheck allocation" subtitle={person.displayName} />
    <AllocationNotes person={person} />
    <PaycheckAllocations person={person} />
  </>;
}
