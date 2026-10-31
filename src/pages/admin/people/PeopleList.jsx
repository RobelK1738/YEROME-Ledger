import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../../hooks/useAsync.js';
import { getAdminOverview } from '../../../lib/data/v2.js';
import { reviewReasons } from '../../../lib/presentation/people.js';
import { PARTNERSHIP_LABELS } from '../../../lib/presentation/labels.js';
import { formatDate, matchesQuery, money, plural } from '../../../lib/presentation/format.js';
import { PageHeader } from '../../../components/ui/PageHeader.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { PageSkeleton } from '../../../components/ui/Loading.jsx';
import { ErrorState } from '../../../components/ui/ErrorState.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { Badge, StatusBadge } from '../../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../../components/ui/Button.jsx';
import { FilterBar, FilterSelect, SearchInput } from '../../../components/ui/Toolbar.jsx';
import { PeopleTabs } from './PeopleTabs.jsx';

const STATUS_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Access paused' },
  { value: 'review', label: 'Missing inputs' },
  { value: 'archived', label: 'Archived' },
];

function matchesStatus(person, status, referrals) {
  if (status === 'archived') return person.personStatus === 'archived';
  if (person.personStatus === 'archived') return false;
  if (status === 'review') return reviewReasons(person, referrals).length > 0;
  return !status || person.personStatus === status;
}

export default function PeopleList() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');

  const legacyAdd = searchParams.get('add');
  if (legacyAdd === 'person') return <Navigate to="/admin/people/new" replace />;
  if (legacyAdd === 'job') return <Navigate to="/admin/jobs/new" replace />;

  const header = <PageHeader title="Owners"
    subtitle="Open an owner to see their statement, jobs and allocation instructions."
    actions={<ButtonLink to="/admin/people/new" variant="primary" icon="plus">Add owner</ButtonLink>} />;
  if (loading) return <>{header}<PeopleTabs /><PageSkeleton header={false} stats={0} label="Loading owners…" /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;

  const referrals = data.commissions || [];
  const people = data?.people || [];
  const rows = people.filter((person) => matchesStatus(person, status, referrals) &&
    matchesQuery(query, person.displayName));
  const current = people.filter((person) => person.personStatus !== 'archived');

  const columns = [
    { key: 'name', header: 'Owner', mobile: 'title', render: (person) => (
      <div className="cell-stack">
        <span className="cell-title">{person.displayName}</span>
        <span className="cell-sub">{PARTNERSHIP_LABELS[person.partnership] || 'Partnership not set'}</span>
      </div>
    ), renderMobile: (person) => person.displayName },
    { key: 'status', header: 'Status', mobile: 'badge', render: (person) => <StatusBadge kind="person" status={person.personStatus} /> },
    { key: 'jobs', header: 'Jobs', mobile: 'meta', render: (person) =>
      `${person.activeJobCount} included${person.myJobs.length > person.activeJobCount ? ` of ${person.myJobs.length}` : ''}`,
    renderMobile: (person) => plural(person.activeJobCount, 'job in projection') },
    { key: 'share', header: 'Owner share / month', align: 'right', mobile: 'amount', render: (person) =>
      person.projectionAvailable ? <span className="num">{money(person.myShareMonthlyCents)}</span>
        : <Badge tone="warn" dot={false}>Missing inputs</Badge>,
    renderMobile: (person) => (person.projectionAvailable ? money(person.myShareMonthlyCents) : 'Missing inputs') },
    { key: 'next', header: 'Next expected income', hideOnMobile: true, render: (person) => formatDate(person.nextPayDate) },
  ];

  return <>
    {header}
    <PeopleTabs />
    {!people.length ? (
      <Card>
        <EmptyState icon="users" title="No owners yet"
          message="Add the first owner to create their sign-in and planning inputs. Add jobs to begin projecting."
          action={<ButtonLink to="/admin/people/new" variant="primary" icon="plus">Add owner</ButtonLink>} />
      </Card>
    ) : <>
      <FilterBar summary={`${plural(rows.length, 'person', 'people')} shown · ${current.length} current`}>
        <SearchInput value={query} onChange={setQuery} label="Search owners" placeholder="Search by name" />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_FILTERS} allLabel="All current" />
      </FilterBar>
      <Card padded={false}>
        <DataTable
          label="Owners"
          columns={columns}
          rows={rows}
          getRowKey={(person) => person.ownerId}
          onRowClick={(person) => navigate(`/admin/people/${person.ownerId}`)}
          emptyIcon="search"
          emptyTitle="No matching owners"
          emptyMessage="Try a different name or status filter."
          emptyAction={<Button onClick={() => { setQuery(''); setStatus(''); }}>Clear filters</Button>}
        />
      </Card>
    </>}
  </>;
}
