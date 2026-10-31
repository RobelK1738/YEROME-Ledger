import { useAsync } from '../../hooks/useAsync.js';
import { getMyStatement } from '../../lib/data/v2.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { Breakdown, NextFund } from '../../components/planning/Statement.jsx';

export default function OwnerHome() {
  const { data: person, loading, error, refresh } = useAsync(getMyStatement, []);
  if (loading) return <PageSkeleton label="Loading your statement…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  return <>
    <PageHeader title="Your statement" subtitle={person.displayName} />
    {!person.projectionAvailable ? <p className="statement-input-note">{!person.stateSupported ? 'Tax assumptions are available for Texas only.' : !person.partnershipConfigured ? 'Admin can choose your income split.' : 'Admin can complete the missing job pay details.'}</p> : null}
    <Breakdown person={person} />
    <NextFund person={person} />
    <p className="statement-method">Saved jobs count as started. Tax uses the configured 2026 Texas model.</p>
  </>;
}
