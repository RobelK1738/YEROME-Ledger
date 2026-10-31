import { useAsync } from '../../hooks/useAsync.js';
import { getMyStatement } from '../../lib/data/v2.js';
import { PAY_FREQUENCY_LABELS } from '../../lib/presentation/labels.js';
import { formatDate, money } from '../../lib/presentation/format.js';
import { payTermsText, payDetailsFor } from '../../lib/presentation/people.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DescriptionList } from '../../components/ui/DescriptionList.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';

const ORDER = { active: 0, paused: 2, ended: 3, archived: 4 };

function JobCard({ job }) {
  return (
    <Card className="job-card" icon="briefcase" title={job.employerName} subtitle={job.roleTitle || 'Role not specified'}
      actions={<StatusBadge kind="job" status={job.status} />}>
      {job.missingPayDetails ? (
        <Notice tone="warn" title="Compensation inputs needed">Add compensation inputs to calculate income for this job.</Notice>
      ) : (
        <DescriptionList items={[
          { label: 'Pay details', value: payTermsText(job) },
          { label: 'Expected gross per income date', hint: `${job.periodsPerYear} pay periods per year`, value: money(job.typicalEmployerPaycheckGrossCents), basis: 'estimate' },
          { label: 'Two-week planning gross', value: money(job.normalizedBiweeklyGrossCents), basis: 'estimate' },
          { label: 'Income frequency', value: PAY_FREQUENCY_LABELS[job.payFrequency] || job.payFrequency || '—' },
          { label: 'First expected income date', value: job.firstPayDate ? formatDate(job.firstPayDate) : 'Not scheduled' },
          job.startDate ? { label: 'Start date', value: formatDate(job.startDate) } : null,
        ]} />
      )}
    </Card>
  );
}

export default function OwnerJobs() {
  const { data, loading, error, refresh } = useAsync(getMyStatement, []);
  const header = <PageHeader title="My jobs" subtitle="Your saved employment and pay details as recorded by YEROME. Contact YEROME if anything looks wrong." />;
  if (loading) return <>{header}<PageSkeleton header={false} stats={0} rows={4} label="Loading your jobs…" /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;
  const jobs = data.myJobs.map(payDetailsFor).sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
  return <>
    {header}
    {jobs.length ? (
      <div className="card-grid">{jobs.map((job) => <JobCard key={job.id} job={job} />)}</div>
    ) : (
      <Card><EmptyState icon="briefcase" title="No jobs yet" message="YEROME adds your jobs. They’ll appear here with pay details and expected income dates once added." /></Card>
    )}
  </>;
}
