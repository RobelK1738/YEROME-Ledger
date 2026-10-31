import { useNavigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { getAdminOverview } from '../../lib/data/v2.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard, StatGrid } from '../../components/ui/StatCard.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { DescriptionList } from '../../components/ui/DescriptionList.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { CommissionSources } from '../../components/planning/ProjectionStory.jsx';
import { money, formatDate } from '../../lib/presentation/format.js';

export default function AdminOverview() {
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const navigate = useNavigate();
  const header = <PageHeader title="The YEROME financial picture" subtitle="Owners and jobs → income → taxes and costs → profit and splits → the next fund."
    actions={<><ButtonLink to="/admin/people/new" variant="primary" icon="plus">Add owner</ButtonLink><ButtonLink to="/admin/projections" variant="secondary">Plan upcoming funds</ButtonLink></>} />;
  if (loading) return <>{header}<PageSkeleton header={false} /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;
  const people = (data.people || []).filter((p) => p.personStatus !== 'archived');
  const ready = people.filter((p) => p.projectionAvailable);
  const sum = (key) => ready.reduce((total, p) => total + (p[key] || 0), 0);
  const next = people.flatMap((p) => (p.forecast?.upcoming || []).map((row) => ({ ...row, displayName: p.displayName })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const columns = [
    { key: 'owner', header: 'Owner & income sources', mobile: 'title', render: (p) => <div className="cell-stack"><strong>{p.displayName}</strong><span className="cell-sub">{p.myJobs.filter((j) => j.status === 'active').map((j) => j.employerName).join(', ') || 'No jobs in projection'}</span></div> },
    { key: 'jobs', header: 'Jobs', mobile: 'meta', render: (p) => `${p.activeJobCount} included / ${p.myJobs.length} total` },
    { key: 'gross', header: 'Gross / month', align: 'right', hideOnMobile: true, render: (p) => money(p.monthlyGrossEstimateCents) },
    { key: 'share', header: 'Owner share / month', align: 'right', mobile: 'amount', render: (p) => money(p.myShareMonthlyCents) },
    { key: 'commission', header: 'Commission income', align: 'right', mobile: 'meta', render: (p) => money(p.commissionIncomeMonthlyCents) },
    { key: 'profit', header: 'YEROME profit', align: 'right', hideOnMobile: true, render: (p) => money(p.yeromeTakeHomeMonthlyCents) },
    { key: 'next', header: 'Next expected income', mobile: 'meta', render: (p) => formatDate(p.forecast?.nextDate) },
  ];
  return <>{header}
    <StatGrid columns={4}>
      <StatCard label="Owners" value={people.length} icon="users" />
      <StatCard label="Jobs in projection" value={people.reduce((n, p) => n + p.activeJobCount, 0)} icon="briefcase" />
      <StatCard label="Gross income / month" value={money(people.reduce((n, p) => n + p.monthlyGrossEstimateCents, 0))} basis="estimate" />
      <StatCard label="YEROME profit / month" value={money(sum('yeromeTakeHomeMonthlyCents'))} basis="estimate" emphasis />
    </StatGrid>
    {ready.length !== people.length ? <Notice tone="info">Full splits are available for {ready.length} of {people.length} owners. Totals below include those owners; incomplete profiles still show their submitted income sources.</Notice> : null}
    <div className="grid-2">
      <Card title="How the monthly income is allocated" icon="scale" subtitle="Combined estimates for owners with complete inputs.">
        <DescriptionList items={[
          { label: 'Gross income', value: money(sum('monthlyGrossEstimateCents')) },
          { label: 'Estimated taxes', value: money(sum('monthlyTaxEstimateCents')) },
          { label: 'After-tax income', value: money(sum('monthlyAfterTaxEquivalentCents')), emphasis: true },
          { label: 'Actual operating costs', value: money(sum('actualCostMonthlyCents')) },
          { label: 'Owner job shares', value: money(sum('myShareMonthlyCents')) },
          { label: 'Referral commission expense', value: money(sum('commissionMonthlyCents')) },
          { label: 'Gang Cut', value: money(sum('gangCutMonthlyCents')) },
          { label: 'YEROME profit', value: money(sum('yeromeTakeHomeMonthlyCents')), total: true },
        ]} />
      </Card>
      <Card title="Next expected employer income" icon="calendar" subtitle="Based on first pay dates and pay frequency.">
        {next.length ? <DescriptionList items={next.slice(0, 6).map((row) => ({
          label: `${formatDate(row.date)} · ${row.displayName}`, hint: row.employerName, value: money(row.netCents),
        }))} /> : <p>Add job income dates to see what is expected next.</p>}
        <ButtonLink to="/admin/projections" variant="secondary">View forecasts & allocation plans</ButtonLink>
      </Card>
    </div>
    <Card title="Every owner’s story" icon="users" padded={false} subtitle="Open an owner to see all jobs, calculations and shared instructions.">
      <DataTable label="Owner projections" columns={columns} rows={people} getRowKey={(p) => p.ownerId}
        onRowClick={(p) => navigate(`/admin/people/${p.ownerId}`)} emptyTitle="Add the first owner" emptyMessage="Create an owner and add their jobs to begin estimating." />
    </Card>
    <CommissionSources sources={data.commissions || []} admin />
    <p className="footnote">All amounts are estimates from current submitted information. Each owner’s taxes are calculated separately on their combined jobs. Forecasts use configured 2026 Texas assumptions.</p>
  </>;
}
