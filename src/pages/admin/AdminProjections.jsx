import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { getAdminOverview } from '../../lib/data/v2.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Field, Select } from '../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Forecast, AllocationPlan, MonthlyBreakdown } from '../../components/planning/ProjectionStory.jsx';
import { AllocationEditor } from '../../components/planning/AllocationEditor.jsx';
import { money, formatDate } from '../../lib/presentation/format.js';

export default function AdminProjections() {
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const header = <PageHeader title="Projections & allocation" subtitle="See upcoming income across owners, then give each owner a clear next-fund plan." />;
  if (loading) return <>{header}<PageSkeleton header={false} /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;
  const people = data.people.filter((p) => p.personStatus !== 'archived');
  if (!people.length) return <>{header}<Card><EmptyState title="Add an owner to start projecting" action={<ButtonLink to="/admin/people/new">Add owner</ButtonLink>} /></Card></>;
  const person = people.find((p) => p.ownerId === params.get('owner')) || people[0];
  const upcoming = people.flatMap((p) => (p.forecast?.upcoming || []).map((row) => ({ ...row, ownerId: p.ownerId, personName: p.displayName })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.personName.localeCompare(b.personName));
  const columns = [
    { key: 'date', header: 'Expected date', mobile: 'title', render: (row) => formatDate(row.date) },
    { key: 'owner', header: 'Owner', mobile: 'meta', render: (row) => row.personName },
    { key: 'source', header: 'Income source', mobile: 'meta', render: (row) => row.employerName },
    { key: 'gross', header: 'Gross estimate', align: 'right', hideOnMobile: true, render: (row) => money(row.grossCents) },
    { key: 'net', header: 'After-tax estimate', align: 'right', mobile: 'amount', render: (row) => money(row.netCents) },
  ];
  return <>{header}
    <Card title="Upcoming income across owners" icon="calendar" padded={false} subtitle="Expected income from job schedules; no manual schedule generation required.">
      <DataTable label="Company income forecast" columns={columns} rows={upcoming} getRowKey={(row) => `${row.ownerId}:${row.jobId}:${row.date}`}
        onRowClick={(row) => setParams({ owner: row.ownerId })} mobilePageSize={10} emptyTitle="Income dates needed" emptyMessage="Add the expected first income date and frequency to a job." />
    </Card>
    <Card title="Plan for an owner">
      <Field label="Owner"><Select value={person.ownerId} options={people.map((p) => ({ value: p.ownerId, label: p.displayName }))} onChange={(e) => setParams({ owner: e.target.value })} /></Field>
      <ButtonLink to={`/admin/people/${person.ownerId}`} variant="ghost">Open {person.displayName}’s full story</ButtonLink>
    </Card>
    <div className="grid-2">
      <Forecast person={person} admin compact />
      <AllocationPlan plan={person.allocationPlan} action={<Button size="sm" variant="primary" onClick={() => setEditing(true)}>Edit plan</Button>} />
    </div>
    <MonthlyBreakdown person={person} admin />
    <AllocationEditor open={editing} person={person} onClose={() => setEditing(false)} onSaved={refresh} />
  </>;
}
