import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../../hooks/useAsync.js';
import { useMutation } from '../../../hooks/useMutation.js';
import { getAdminOverview, setPersonStatus } from '../../../lib/data/v2.js';
import { findPerson, payTermsText } from '../../../lib/presentation/people.js';
import { PARTNERSHIP_LABELS, PAY_FREQUENCY_LABELS } from '../../../lib/presentation/labels.js';
import { formatDate, money } from '../../../lib/presentation/format.js';
import { PageHeader } from '../../../components/ui/PageHeader.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { PageSkeleton } from '../../../components/ui/Loading.jsx';
import { ErrorState } from '../../../components/ui/ErrorState.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { Badge, StatusBadge } from '../../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../../components/ui/Button.jsx';
import { Tabs, TabPanel } from '../../../components/ui/Tabs.jsx';
import { useConfirm } from '../../../components/ui/Feedback.jsx';
import { JobActions } from '../jobs/JobActions.jsx';
import { AssumptionsDrawer } from './AssumptionsDrawer.jsx';
import { AllocationEditor } from '../../../components/planning/AllocationEditor.jsx';
import { ProjectionStory, CommissionSources } from '../../../components/planning/ProjectionStory.jsx';

const TABS = [
  { id: 'summary', label: 'Financial story', icon: 'overview' },
  { id: 'jobs', label: 'Jobs & inputs', icon: 'briefcase' },
  { id: 'referrals', label: 'Referrals', icon: 'link' },
];

function Jobs({ person, refresh }) {
  const columns = [
    { key: 'employer', header: 'Employer & role', mobile: 'title', render: (job) => (
      <div className="cell-stack"><span className="cell-title">{job.employerName}</span><span className="cell-sub">{job.roleTitle || 'Role not set'}</span></div>
    ), renderMobile: (job) => job.employerName },
    { key: 'status', header: 'Status', mobile: 'badge', render: (job) => <StatusBadge status={job.status} /> },
    { key: 'pay', header: 'Pay terms', mobile: 'meta', render: (job) => payTermsText(job) || <Badge tone="warn" dot={false}>Terms need review</Badge>,
      renderMobile: (job) => payTermsText(job) || 'Terms need review' },
    { key: 'frequency', header: 'Paid', mobile: 'meta', secondary: true, render: (job) => PAY_FREQUENCY_LABELS[job.payFrequency] || '—' },
    { key: 'gross', header: 'Annual gross (est.)', align: 'right', mobile: 'amount', render: (job) => <span className="num">{money(job.annualGrossCents)}</span>,
      renderMobile: (job) => money(job.annualGrossCents) },
    { key: 'since', header: 'Terms since', hideOnMobile: true, secondary: true, render: (job) => formatDate(job.currentTermsEffectiveFrom) },
    { key: 'actions', header: '', mobile: 'actions', render: (job) => <JobActions job={{ ...job, personName: person.displayName }} onChanged={refresh} from={`/admin/people/${person.ownerId}?tab=jobs`} compact /> },
  ];
  return (
    <Card title="Jobs" icon="briefcase" padded={false} subtitle="Pay-term changes and status changes keep dated history."
      actions={<ButtonLink to={`/admin/jobs/new?owner=${person.ownerId}`} state={{ from: `/admin/people/${person.ownerId}?tab=jobs` }} size="sm" variant="primary" icon="plus">Add job</ButtonLink>}>
      <DataTable label={`${person.displayName} jobs`} columns={columns} rows={person.myJobs}
        emptyIcon="briefcase" emptyTitle="No jobs yet" emptyMessage="Add this person’s first job to start estimating."
        emptyAction={<ButtonLink to={`/admin/jobs/new?owner=${person.ownerId}`} variant="primary" icon="plus">Add job</ButtonLink>} />
    </Card>
  );
}

function Referrals({ person, referrals }) {
  const related = referrals.filter((row) => row.referrerOwnerId === person.ownerId || row.referredOwnerId === person.ownerId);
  return (
    <Card title="Referrals" icon="link" padded={false} subtitle="Relationships where this person referred someone or was referred."
      actions={<ButtonLink size="sm" variant="secondary" to={`/admin/people/referrals?new=1&referred=${person.ownerId}`} icon="plus">Record referral</ButtonLink>}>
      {related.length ? (
        <ul className="agenda">
          {related.map((row) => (
            <li className="agenda__item" key={row.id}>
              <span className="agenda__icon agenda__icon--info" aria-hidden="true">{row.referrerOwnerId === person.ownerId ? '→' : '←'}</span>
              <div className="agenda__body">
                <p className="agenda__title">{row.referrerName} referred {row.referredName}</p>
                <p className="agenda__meta">{row.activeJobCount} eligible jobs · {money(row.monthlyCents)} / month</p>
              </div>
              {row.needsContractReview ? <Badge tone="danger">Contract review</Badge>
                : row.relationshipCurrent ? <Badge tone="ok">Current</Badge> : <Badge tone="muted">Not current</Badge>}
            </li>
          ))}
        </ul>
      ) : <EmptyState compact icon="link" title="No referrals" message="This person has no referral relationships on record." />}
      <div className="card__footer"><Link to="/admin/people/referrals">Manage all referrals</Link></div>
    </Card>
  );
}

export default function PersonDetail() {
  const { ownerId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const confirm = useConfirm();
  const { run, busy } = useMutation();
  const tab = TABS.some((item) => item.id === searchParams.get('tab')) ? searchParams.get('tab') : 'summary';
  const back = { to: '/admin/people', label: 'Owners' };
  if (loading) return <PageSkeleton label="Loading owner projection…" />;
  if (error) return <><PageHeader back={back} title="Owner" /><ErrorState error={error} onRetry={refresh} /></>;
  const person = findPerson(data?.people, ownerId);
  if (!person) return <><PageHeader back={back} title="Owner not found" /><Card><EmptyState title="This profile does not exist" action={<ButtonLink to="/admin/people">Back to owners</ButtonLink>} /></Card></>;
  const sources = (data.commissions || []).filter((row) => row.referrerOwnerId === ownerId);
  const referrals = (data.commissions || []).map((row) => ({ ...row, id: row.referralId, relationshipCurrent: row.eligible }));
  async function changeStatus(status) {
    if (!await confirm({ title: status === 'inactive' ? `Pause sign-in for ${person.displayName}?` : status === 'archived' ? `Archive ${person.displayName}?` : `Reactivate ${person.displayName}?`,
      confirmLabel: status === 'active' ? 'Reactivate' : status === 'archived' ? 'Archive' : 'Pause access',
      message: status === 'archived' ? 'This owner will leave current totals. Their data and history are preserved.' : 'This changes sign-in access. Jobs and projection inputs are preserved.' })) return;
    await run(() => setPersonStatus(ownerId, status), { success: 'Owner status updated.', onSuccess: refresh });
  }
  return <>
    <PageHeader back={back} title={`${person.displayName}’s financial story`}
      meta={<div className="badge-row"><StatusBadge kind="person" status={person.personStatus} /><Badge tone="brand" dot={false}>{PARTNERSHIP_LABELS[person.partnership] || 'Choose a partnership'}</Badge></div>}
      actions={<><Button variant="secondary" onClick={() => setAssumptionsOpen(true)}>Edit planning assumptions</Button><ButtonLink to={`/admin/jobs/new?owner=${ownerId}`} variant="primary" icon="plus">Add job</ButtonLink></>} />
    <Tabs label="Owner sections" idPrefix="person" value={tab} tabs={TABS} onChange={(id) => setSearchParams(id === 'summary' ? {} : { tab: id })} />
    <TabPanel id={tab} idPrefix="person">
      {tab === 'summary' ? <><ProjectionStory person={person} admin allocationAction={<Button variant="primary" size="sm" onClick={() => setAllocationOpen(true)}>Edit next-fund plan</Button>} />
        {sources.length ? <CommissionSources sources={sources} admin /> : null}</> : null}
      {tab === 'jobs' ? <Jobs person={person} refresh={refresh} /> : null}
      {tab === 'referrals' ? <Referrals person={person} referrals={referrals} /> : null}
    </TabPanel>
    <details className="disclosure"><summary>Account access</summary><div className="btn-group">
      <Button variant="secondary" disabled={busy} onClick={() => changeStatus(person.personStatus === 'active' ? 'inactive' : 'active')}>{person.personStatus === 'active' ? 'Pause sign-in' : 'Reactivate'}</Button>
      {person.personStatus !== 'archived' ? <Button variant="ghost-danger" disabled={busy} onClick={() => changeStatus('archived')}>Archive owner</Button> : null}
    </div></details>
    <AssumptionsDrawer open={assumptionsOpen} person={person} onClose={() => setAssumptionsOpen(false)} onSaved={refresh} />
    <AllocationEditor open={allocationOpen} person={person} onClose={() => setAllocationOpen(false)} onSaved={refresh} />
  </>;
}
