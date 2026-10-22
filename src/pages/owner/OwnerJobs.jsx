import { useAsync } from '../../hooks/useAsync.js';
import { getMyStatement } from '../../lib/data/v2.js';
import { PAY_FREQUENCY_LABELS } from '../../lib/presentation/labels.js';
import { formatDate, money } from '../../lib/presentation/format.js';
import { payTermsText } from '../../lib/presentation/people.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DescriptionList } from '../../components/ui/DescriptionList.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';

const ORDER = { active: 0, pending: 1, paused: 2, ended: 3, archived: 4 };

function JobCard({ job }) {
  return (
    <Card className="job-card" icon="briefcase" title={job.employerName} subtitle={job.roleTitle || 'Role not specified'}
      actions={<StatusBadge kind="job" status={job.status} />}>
      {job.needsTermsReview ? (
        <Notice tone="warn" title="Pay terms under review">YEROME is confirming this job’s pay terms. Estimates for it will appear once review is complete.</Notice>
      ) : (
        <DescriptionList items={[
          { label: 'Pay terms', value: payTermsText(job) },
          { label: 'Typical paycheck gross', hint: `${job.periodsPerYear} pay periods per year`, value: money(job.typicalEmployerPaycheckGrossCents), basis: 'estimate' },
          { label: 'Two-week planning gross', value: money(job.normalizedBiweeklyGrossCents), basis: 'estimate' },
          { label: 'Payroll frequency', value: PAY_FREQUENCY_LABELS[job.payFrequency] || job.payFrequency || '—' },
          { label: 'First configured payday', value: job.firstPayDate ? formatDate(job.firstPayDate) : 'Not scheduled' },
          job.startDate ? { label: 'Start date', value: formatDate(job.startDate) } : null,
        ]} />
      )}
    </Card>
  );
}

export default function OwnerJobs() {
  const { data, loading, error, refresh } = useAsync(getMyStatement, []);
  const header = <PageHeader title="My jobs" subtitle="Your employment and pay terms as recorded by YEROME. Contact YEROME if anything looks wrong." />;
  if (loading) return <>{header}<PageSkeleton header={false} stats={0} rows={4} label="Loading your jobs…" /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;
  const jobs = [...data.myJobs].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
  return <>
    {header}
    {jobs.length ? (
      <div className="card-grid">{jobs.map((job) => <JobCard key={job.id} job={job} />)}</div>
    ) : (
      <Card><EmptyState icon="briefcase" title="No jobs yet" message="YEROME adds your jobs. They’ll appear here with pay terms and pay dates once added." /></Card>
    )}
  </>;
}
