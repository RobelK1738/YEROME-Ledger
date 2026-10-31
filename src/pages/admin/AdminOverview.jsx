import { useAsync } from '../../hooks/useAsync.js';
import { getAdminOverview } from '../../lib/data/v2.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Breakdown, NextFund, CommissionDetails } from '../../components/planning/Statement.jsx';
import { plural } from '../../lib/presentation/format.js';

export default function AdminOverview() {
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const header = <PageHeader title="Company statement" subtitle="Income, allocations and what YEROME keeps."
    actions={<ButtonLink to="/admin/people/new" variant="primary" icon="plus">Add owner</ButtonLink>} />;
  if (loading) return <>{header}<PageSkeleton header={false} /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;
  const people = data.people.filter((person) => person.personStatus !== 'archived');
  const jobs = people.reduce((sum, person) => sum + person.activeJobCount, 0);
  const incomplete = people.filter((person) => !person.projectionAvailable).length;
  return <>{header}
    <p className="statement-context">{plural(people.length, 'owner')} · {plural(jobs, 'job')}<span>Select an owner below for their full statement</span></p>
    {incomplete ? <p className="statement-input-note">{plural(incomplete, 'owner')} with incomplete inputs. Unknown totals stay blank until the inputs are complete.</p> : null}
    <Breakdown people={people} admin />
    <NextFund people={people} admin />
    <CommissionDetails sources={data.commissions} />
    <p className="statement-method">Estimates from saved jobs, as if they have started. Tax is calculated separately for each owner using the configured 2026 Texas assumptions.</p>
  </>;
}
