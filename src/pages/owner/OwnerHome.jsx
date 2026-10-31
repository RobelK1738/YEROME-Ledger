import { useAsync } from '../../hooks/useAsync.js';
import { getMyStatement } from '../../lib/data/v2.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { Breakdown, NextFund } from '../../components/planning/Statement.jsx';
import { plural } from '../../lib/presentation/format.js';

export default function OwnerHome() {
  const { data: person, loading, error, refresh } = useAsync(getMyStatement, []);
  if (loading) return <PageSkeleton label="Loading your statement…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  const jobs = person.activeJobCount;
  const referrals = (person.commissionSources || []).filter((row) => row.currentlyEarning).length;
  return <>
    <PageHeader title="Your statement" subtitle={person.displayName} />
    <p className="statement-context">{plural(jobs, 'job')}{referrals ? ` · ${plural(referrals, 'commission source')}` : ''}<span>Based on your saved pay details</span></p>
    {!person.projectionAvailable ? <p className="statement-input-note">{!person.stateSupported ? 'Tax assumptions are available for Texas only.' : 'Some job pay details are missing. Admin can complete them.'}</p> : null}
    <Breakdown person={person} />
    <NextFund person={person} />
    <p className="statement-method">All amounts are estimates. Jobs count immediately; start dates are for reference. Tax reserve uses the configured 2026 Texas assumptions.</p>
  </>;
}
