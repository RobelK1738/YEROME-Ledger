import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../../hooks/useAsync.js';
import { useMutation } from '../../../hooks/useMutation.js';
import { getAdminCommissions, getAdminOverview, setPersonStatus } from '../../../lib/data/v2.js';
import { findPerson, payTermsText, paycheckDisplayStatus, reviewReasons } from '../../../lib/presentation/people.js';
import { PARTNERSHIP_LABELS, PAY_FREQUENCY_LABELS } from '../../../lib/presentation/labels.js';
import { formatDate, money, plural, todayISO } from '../../../lib/presentation/format.js';
import { PageHeader } from '../../../components/ui/PageHeader.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { StatCard, StatGrid } from '../../../components/ui/StatCard.jsx';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { DescriptionList } from '../../../components/ui/DescriptionList.jsx';
import { PageSkeleton } from '../../../components/ui/Loading.jsx';
import { ErrorState } from '../../../components/ui/ErrorState.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { Badge, StatusBadge } from '../../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../../components/ui/Button.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';
import { Tabs, TabPanel } from '../../../components/ui/Tabs.jsx';
import { useConfirm } from '../../../components/ui/Feedback.jsx';
import { JobActions } from '../jobs/JobActions.jsx';
import { AgreementDrawer } from './AgreementDrawer.jsx';

const TABS = [
  { id: 'summary', label: 'Summary', icon: 'overview' },
  { id: 'jobs', label: 'Jobs', icon: 'briefcase' },
  { id: 'agreement', label: 'Agreement & costs', icon: 'file' },
  { id: 'referrals', label: 'Referrals', icon: 'link' },
  { id: 'paychecks', label: 'Paychecks', icon: 'receipt' },
];

function Summary({ person, reasons, onReviewAgreement }) {
  const tax = person.taxReconciliation;
  return <>
    {reasons.length ? (
      <Notice tone="warn" title="Estimate withheld until reviewed"
        action={<div className="btn-group">
          {reasons.some((r) => r.key === 'agreement' || r.key === 'apartment') ? <Button size="sm" onClick={onReviewAgreement}>Review agreement</Button> : null}
          {reasons.some((r) => r.key === 'referral') ? <ButtonLink size="sm" to={`/admin/people/referrals?new=1&referred=${person.ownerId}`}>Record referral</ButtonLink> : null}
        </div>}>
        <ul className="plain-list">{reasons.map((reason) => <li key={reason.key}>{reason.label}</li>)}</ul>
      </Notice>
    ) : null}
    <StatGrid>
      <StatCard label="Partner share · monthly" basis="estimate" emphasis
        value={person.projectionAvailable ? money(person.myShareMonthlyCents) : '—'}
        hint={person.projectionAvailable ? `${money(person.myShareBiweeklyEquivalentCents)} biweekly equivalent` : 'Shown once inputs are verified'} />
      <StatCard label="YEROME net · monthly" basis="internal"
        value={person.projectionAvailable ? money(person.yeromeTakeHomeMonthlyCents) : '—'} hint="Estimated run rate" />
      <StatCard label="Active jobs" value={person.activeJobCount} hint={plural(person.myJobs.length, 'job') + ' on record'} />
      <StatCard label="Next employer payday" value={person.nextPayDate ? formatDate(person.nextPayDate) : 'None scheduled'}
        hint="Paycheck date, not a partner distribution" />
    </StatGrid>
    <div className="grid-2">
      <Card title="Monthly estimate" icon="trending" subtitle="Run rate from current job terms and the verified agreement.">
        {person.projectionAvailable ? (
          <DescriptionList items={[
            { label: 'After-tax income from active jobs', value: money(person.monthlyAfterTaxEquivalentCents), basis: 'estimate' },
            { label: 'Agreed charges', hint: 'Apartment plus per-job operating and service charges', value: money(person.agreedChargesMonthlyCents), basis: 'contractual' },
            { label: 'Quoted net', value: money(person.quotedNetMonthlyCents) },
            { label: 'Partner share (50%)', value: money(person.personShareMonthlyCents), emphasis: true },
            { label: 'Actual YEROME operating spend', value: money(person.actualCostMonthlyCents), basis: 'internal' },
            { label: 'Gang Cut (10% of after-tax)', value: money(person.gangCutMonthlyCents), basis: 'internal' },
            { label: 'Referral commission', value: money(person.commissionMonthlyCents), basis: 'internal' },
            { label: 'YEROME net', value: money(person.yeromeTakeHomeMonthlyCents), total: true },
          ]} />
        ) : <EmptyState compact icon="trending" title="No estimate yet" message="Resolve the review items above to see the monthly breakdown." />}
      </Card>
      <Card title="2026 tax position" icon="scale" subtitle="Planning figures only. Withholding comes from recorded paystubs.">
        <DescriptionList items={[
          { label: 'Combined annual gross, active jobs', value: money(person.annualGrossEstimateCents), basis: 'estimate' },
          { label: 'Projected 2026 wages using job dates', value: money(person.taxYearProjectedWagesCents), basis: 'estimate' },
          { label: 'Estimated annual tax liability', value: money(person.annualTaxLiabilityEstimateCents), basis: 'estimate' },
          { label: 'Withheld on recorded paychecks', value: money(tax?.actualWithholdingCents), basis: 'recorded' },
        ]} />
        {person.annualTaxNeedsReview ? <Notice tone="info">Annual tax is unavailable after a pay-term change or job pause until dated wages are reviewed.</Notice> : null}
      </Card>
    </div>
    {person.estimateLimitations ? <p className="footnote">{person.estimateLimitations}</p> : null}
  </>;
}

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

function Agreement({ person, onEdit }) {
  return (
    <Card title="Agreement & apartment" icon="file" subtitle="Each save creates a new dated version; earlier versions stay in history."
      actions={<Button size="sm" variant="primary" icon="edit" onClick={onEdit}>Record new version</Button>}>
      <DescriptionList items={[
        { label: 'Partnership', value: PARTNERSHIP_LABELS[person.partnership] || 'Not set' },
        { label: 'Signed agreement', value: person.agreementVerifiedAt
          ? <Badge tone="ok">Verified {formatDate(person.agreementVerifiedAt.slice(0, 10))}</Badge>
          : <Badge tone="warn">Not verified</Badge> },
        { label: 'Current version effective from', value: formatDate(person.currentAgreementEffectiveFrom) },
        { label: 'Agreed apartment charge', value: <>{money(person.apartmentQuotedMonthlyCents)} <span className="muted">/ month</span></>, basis: 'contractual' },
        { label: 'Actual apartment spending', value: <>{money(person.apartmentActualMonthlyCents)} <span className="muted">/ month</span></>, basis: 'internal' },
        { label: 'Agreed charges, all jobs', value: <>{money(person.agreedChargesMonthlyCents)} <span className="muted">/ month</span></>, basis: 'contractual' },
      ]} />
      <p className="footnote">Agreed charges are commercial amounts under the written agreement. They are not statements of YEROME’s underlying third-party spending.</p>
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
                <p className="agenda__meta">Started {formatDate(row.startDate)}{row.endDate ? ` · ends ${formatDate(row.endDate)}` : ''}</p>
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

function Paychecks({ person }) {
  const today = todayISO();
  const jobName = (id) => person.myJobs.find((job) => job.id === id)?.employerName || 'Job';
  const columns = [
    { key: 'date', header: 'Payday', mobile: 'title', render: (check) => formatDate(check.payDate) },
    { key: 'job', header: 'Employer', mobile: 'meta', render: (check) => jobName(check.jobId) },
    { key: 'status', header: 'Status', mobile: 'badge', render: (check) => <StatusBadge kind="paycheck" status={paycheckDisplayStatus(check, today)} /> },
    { key: 'gross', header: 'Gross recorded', align: 'right', hideOnMobile: true, render: (check) => <span className="num">{money(check.actualGrossCents)}</span> },
    { key: 'net', header: 'Net deposit recorded', align: 'right', mobile: 'amount', render: (check) => <span className="num">{money(check.actualNetReceivedCents)}</span>,
      renderMobile: (check) => money(check.actualNetReceivedCents) },
  ];
  const rows = [...person.myPaychecks].sort((a, b) => b.payDate.localeCompare(a.payDate));
  return (
    <Card title="Paychecks" icon="receipt" padded={false} subtitle="Scheduled employer paydays and recorded receipts."
      actions={<ButtonLink size="sm" variant="secondary" to={`/admin/pay-runs/paychecks?person=${person.ownerId}`}>Open in Pay Runs</ButtonLink>}>
      <DataTable label="Paychecks" columns={columns} rows={rows} mobilePageSize={15}
        emptyIcon="calendar" emptyTitle="No paychecks yet"
        emptyMessage="Schedule employer pay dates from Pay Runs once the job has pay terms."
        emptyAction={<ButtonLink to="/admin/pay-runs/schedule" size="sm">Schedule pay dates</ButtonLink>} />
    </Card>
  );
}

export default function PersonDetail() {
  const { ownerId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const { data: referralData, refresh: refreshReferrals } = useAsync(getAdminCommissions, []);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const confirm = useConfirm();
  const { run, busy } = useMutation();
  const tab = TABS.some((item) => item.id === searchParams.get('tab')) ? searchParams.get('tab') : 'summary';
  const back = { to: '/admin/people', label: 'US Persons' };

  if (loading) return <PageSkeleton label="Loading US Person…" />;
  if (error) return <><PageHeader back={back} title="US Person" /><ErrorState error={error} onRetry={refresh} /></>;
  const person = findPerson(data?.people, ownerId);
  if (!person) {
    return <>
      <PageHeader back={back} title="US Person not found" />
      <Card><EmptyState icon="user" title="This profile does not exist" message="It may have been removed, or the link is incorrect."
        action={<ButtonLink to="/admin/people">Back to US Persons</ButtonLink>} /></Card>
    </>;
  }
  const referrals = referralData?.referrals || [];
  const reasons = reviewReasons(person, referrals);
  const reload = () => Promise.all([refresh(), refreshReferrals()]);

  async function changeStatus(status) {
    const copy = {
      inactive: { title: `Pause sign-in for ${person.displayName}?`, confirmLabel: 'Pause access',
        message: <p>They will not be able to sign in until reactivated. Jobs, records and history stay intact.</p>,
        success: 'Sign-in access paused.' },
      archived: { title: `Archive ${person.displayName}?`, confirmLabel: 'Archive', tone: 'danger',
        message: <p>Their sign-in is disabled and they leave current lists and totals. All history is preserved.</p>,
        success: 'US Person archived.' },
      active: { success: 'US Person reactivated.' },
    }[status];
    if (copy.title && !await confirm(copy)) return;
    await run(() => setPersonStatus(person.ownerId, status), { success: copy.success, onSuccess: reload });
  }

  return <>
    <PageHeader back={back} title={person.displayName}
      meta={<div className="badge-row">
        <StatusBadge kind="person" status={person.personStatus} />
        <Badge tone="brand" dot={false}>{PARTNERSHIP_LABELS[person.partnership] || 'Partnership not set'}</Badge>
        {person.agreementVerifiedAt ? <Badge tone="ok">Agreement verified</Badge> : <Badge tone="warn">Agreement not verified</Badge>}
      </div>}
      actions={<>
        {person.personStatus === 'active' ? (
          <Button variant="ghost" icon="pause" disabled={busy} onClick={() => changeStatus('inactive')}>Pause access</Button>
        ) : (
          <Button variant="secondary" icon="play" loading={busy} onClick={() => changeStatus('active')}>Reactivate</Button>
        )}
        {person.personStatus !== 'archived' ? (
          <Button variant="ghost-danger" icon="archive" disabled={busy} onClick={() => changeStatus('archived')}>Archive</Button>
        ) : null}
        <Button variant="secondary" icon="file" onClick={() => setAgreementOpen(true)}>Review agreement</Button>
        <ButtonLink to={`/admin/jobs/new?owner=${person.ownerId}`} state={{ from: `/admin/people/${person.ownerId}?tab=jobs` }} variant="primary" icon="plus">Add job</ButtonLink>
      </>} />

    <Tabs label="Profile sections" idPrefix="person" value={tab}
      tabs={TABS.map((item) => ({ ...item, count: item.id === 'jobs' ? person.myJobs.length : undefined }))}
      onChange={(id) => setSearchParams(id === 'summary' ? {} : { tab: id })} />
    <TabPanel id={tab} idPrefix="person">
      {tab === 'summary' ? <Summary person={person} reasons={reasons} onReviewAgreement={() => setAgreementOpen(true)} /> : null}
      {tab === 'jobs' ? <Jobs person={person} refresh={reload} /> : null}
      {tab === 'agreement' ? <Agreement person={person} onEdit={() => setAgreementOpen(true)} /> : null}
      {tab === 'referrals' ? <Referrals person={person} referrals={referrals} /> : null}
      {tab === 'paychecks' ? <Paychecks person={person} /> : null}
    </TabPanel>

    <AgreementDrawer open={agreementOpen} person={person} onClose={() => setAgreementOpen(false)} onSaved={reload} />
  </>;
}
