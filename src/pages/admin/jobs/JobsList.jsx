import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../../hooks/useAsync.js';
import { getAdminOverview } from '../../../lib/data/v2.js';
import { flattenJobs, payTermsText } from '../../../lib/presentation/people.js';
import { COMPENSATION_LABELS, JOB_STATUS, PAY_FREQUENCY_LABELS } from '../../../lib/presentation/labels.js';
import { formatDate, matchesQuery, money, plural } from '../../../lib/presentation/format.js';
import { PageHeader } from '../../../components/ui/PageHeader.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { PageSkeleton } from '../../../components/ui/Loading.jsx';
import { ErrorState } from '../../../components/ui/ErrorState.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { Badge, BasisTag, StatusBadge } from '../../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../../components/ui/Button.jsx';
import { FilterBar, FilterSelect, SearchInput } from '../../../components/ui/Toolbar.jsx';
import { JobActions } from './JobActions.jsx';

export default function JobsList() {
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const [filters, setFilters] = useState({ query: '', status: '', mode: '', ownerId: '' });
  const setFilter = (key) => (value) => setFilters((state) => ({ ...state, [key]: value }));

  const header = <PageHeader title="Jobs"
    subtitle="Every job across US Persons, with current pay terms and status. Changes keep dated history."
    actions={<ButtonLink to="/admin/jobs/new" state={{ from: '/admin/jobs' }} variant="primary" icon="plus">Add job</ButtonLink>} />;
  if (loading) return <>{header}<PageSkeleton header={false} stats={0} label="Loading jobs…" /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;

  const people = (data?.people || []).filter((person) => person.personStatus !== 'archived');
  const jobs = flattenJobs(people);
  const rows = jobs.filter((job) =>
    (!filters.status || job.status === filters.status) &&
    (!filters.mode || (filters.mode === 'review' ? job.needsTermsReview : job.compensationMode === filters.mode)) &&
    (!filters.ownerId || job.ownerId === filters.ownerId) &&
    matchesQuery(filters.query, job.employerName, job.roleTitle, job.personName));
  const active = rows.filter((job) => job.status === 'active');
  const activeGross = active.reduce((sum, job) => sum + (job.annualGrossCents || 0), 0);
  const filtered = Object.values(filters).some(Boolean);

  const columns = [
    { key: 'employer', header: 'Employer & role', mobile: 'title', render: (job) => (
      <div className="cell-stack"><span className="cell-title">{job.employerName}</span><span className="cell-sub">{job.roleTitle || 'Role not set'}</span></div>
    ), renderMobile: (job) => job.employerName },
    { key: 'person', header: 'US Person', mobile: 'meta', render: (job) => <Link to={`/admin/people/${job.ownerId}`}>{job.personName}</Link>,
      renderMobile: (job) => job.personName },
    { key: 'status', header: 'Status', mobile: 'badge', render: (job) => <StatusBadge status={job.status} /> },
    { key: 'pay', header: 'Pay terms', mobile: 'meta', render: (job) => (payTermsText(job) ? (
      <div className="cell-stack"><span>{payTermsText(job)}</span><span className="cell-sub">{PAY_FREQUENCY_LABELS[job.payFrequency] || '—'}</span></div>
    ) : <Badge tone="warn" dot={false}>Terms need review</Badge>),
      renderMobile: (job) => payTermsText(job) || 'Terms need review' },
    { key: 'gross', header: 'Annual gross (est.)', align: 'right', mobile: 'amount', render: (job) => <span className="num">{money(job.annualGrossCents)}</span>,
      renderMobile: (job) => money(job.annualGrossCents) },
    { key: 'dates', header: 'Started', hideOnMobile: true, secondary: true, render: (job) => (
      <div className="cell-stack"><span className="nowrap">{formatDate(job.startDate)}</span><span className="cell-sub nowrap">Terms from {formatDate(job.currentTermsEffectiveFrom)}</span></div>
    ) },
    { key: 'actions', header: '', mobile: 'actions', render: (job) => <JobActions job={job} onChanged={refresh} from="/admin/jobs" compact /> },
  ];

  return <>
    {header}
    {!people.length ? (
      <Card><EmptyState icon="users" title="Add a US Person first"
        message="Jobs belong to a US Person. Create the person, then add their jobs here."
        action={<ButtonLink to="/admin/people/new" variant="primary" icon="plus">Add US Person</ButtonLink>} /></Card>
    ) : !jobs.length ? (
      <Card><EmptyState icon="briefcase" title="No jobs yet"
        message="Add a job with its employer, pay terms and pay calendar. One US Person can hold several jobs."
        action={<ButtonLink to="/admin/jobs/new" state={{ from: '/admin/jobs' }} variant="primary" icon="plus">Add job</ButtonLink>} /></Card>
    ) : <>
      <FilterBar summary={<>
        {plural(rows.length, 'job')} shown · {active.length} active · {money(activeGross)} combined annual gross for active jobs <BasisTag kind="estimate" />
      </>}>
        <SearchInput value={filters.query} onChange={setFilter('query')} label="Search jobs" placeholder="Employer, role or person" />
        <FilterSelect label="Status" value={filters.status} onChange={setFilter('status')}
          options={Object.entries(JOB_STATUS).map(([value, meta]) => ({ value, label: meta.label }))} />
        <FilterSelect label="Pay type" value={filters.mode} onChange={setFilter('mode')}
          options={[...Object.entries(COMPENSATION_LABELS).map(([value, label]) => ({ value, label })), { value: 'review', label: 'Terms need review' }]} />
        <FilterSelect label="US Person" value={filters.ownerId} onChange={setFilter('ownerId')}
          options={people.map((person) => ({ value: person.ownerId, label: person.displayName }))} allLabel="Everyone" />
      </FilterBar>
      <Card padded={false}>
        <DataTable label="Jobs" columns={columns} rows={rows}
          emptyIcon="search" emptyTitle="No matching jobs" emptyMessage="Adjust the search or filters."
          emptyAction={filtered ? <Button onClick={() => setFilters({ query: '', status: '', mode: '', ownerId: '' })}>Clear filters</Button> : null} />
      </Card>
    </>}
  </>;
}
