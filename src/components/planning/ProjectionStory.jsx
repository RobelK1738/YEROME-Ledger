import { Card } from '../ui/Card.jsx';
import { DescriptionList } from '../ui/DescriptionList.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Notice } from '../ui/Notice.jsx';
import { Badge } from '../ui/Badge.jsx';
import { DataTable } from '../ui/DataTable.jsx';
import { money, formatDate, plural } from '../../lib/presentation/format.js';
import { payTermsText } from '../../lib/presentation/people.js';

export function IncomeSources({ person }) {
  const jobs = person.myJobs || [];
  const columns = [
    { key: 'job', header: 'Income source', mobile: 'title', render: (row) => <div className="cell-stack"><strong>{row.employerName}</strong><span className="cell-sub">{row.roleTitle || 'Job'} · {payTermsText(row) || 'Pay details not entered'}</span></div> },
    { key: 'status', header: 'Status', mobile: 'badge', render: (row) => <Badge tone={row.status === 'active' ? 'ok' : 'muted'}>{row.status}</Badge> },
    { key: 'gross', header: 'Gross / month', align: 'right', mobile: 'amount', render: (row) => money(row.status === 'active' && row.annualGrossCents != null ? Math.round(row.annualGrossCents / 12) : null) },
  ];
  return <Card title="Where income comes from" icon="briefcase" padded={false}
    subtitle={`${plural(person.activeJobCount, 'job')} in projection · ${plural(jobs.length, 'job')} submitted. Income and splits assume the included jobs have started.`}>
    <DataTable label="Job income sources" columns={columns} rows={jobs} emptyTitle="No jobs submitted" emptyMessage="Add job rates, expected hours and income dates to begin projecting." />
  </Card>;
}

export function MonthlyBreakdown({ person: p, admin = false }) {
  const rows = [
    { label: 'Combined job income', value: money(p.monthlyGrossEstimateCents) },
    { label: 'Estimated taxes', hint: 'Calculated on all jobs for this owner together', value: money(p.monthlyTaxEstimateCents) },
    { label: 'After-tax income', value: money(p.monthlyAfterTaxEquivalentCents), emphasis: true },
    { label: 'Apartment + job service charges', value: money(p.agreedChargesMonthlyCents) },
    { label: 'Profit available to split', value: money(p.quotedNetMonthlyCents), emphasis: true },
    { label: admin ? 'Owner share · 50%' : 'Your job share · 50%', value: money(p.myShareMonthlyCents), total: true },
  ];
  const commission = p.commissionIncomeMonthlyCents || 0;
  return <Card title="How the monthly estimate breaks down" icon="scale" subtitle="As if all included jobs have started, using saved rates and expected hours for a typical month.">
    {!p.projectionAvailable ? <Notice tone="warn">{!p.stateSupported ? 'Tax assumptions are available for Texas in 2026 only.' : !p.partnershipConfigured ? 'Admin needs to choose the partnership model.' : 'Complete the saved pay details to calculate the full split.'} Available income sources remain visible below.</Notice> : null}
    <DescriptionList items={rows} />
    {commission > 0 ? <DescriptionList items={[
      { label: 'Referral commission income', value: money(commission) },
      { label: admin ? 'Owner total · jobs + commissions' : 'Your total · jobs + commissions', value: money(p.myShareMonthlyCents == null ? null : p.myShareMonthlyCents + commission), total: true },
    ]} /> : null}
    {p.quotedNetMonthlyCents < 0 ? <Notice tone="warn">Costs exceed projected after-tax income. The negative split is shown so the shortfall can be planned for.</Notice> : null}
    {admin ? <details className="disclosure"><summary>YEROME costs, allocations and profit</summary>
      <DescriptionList items={[
        { label: 'Actual operating costs', value: money(p.actualCostMonthlyCents) },
        { label: 'Owner job share', value: money(p.myShareMonthlyCents) },
        { label: 'Referral commission expense', value: money(p.commissionMonthlyCents) },
        { label: 'Gang Cut · 10% of after-tax income', value: money(p.gangCutMonthlyCents) },
        { label: 'YEROME profit after all allocations', value: money(p.yeromeTakeHomeMonthlyCents), total: true },
      ]} />
      <p className="footnote">After-tax income = actual costs + owner share + referral commission + Gang Cut + YEROME profit. Service charges include margin and are used to calculate the owner split; they are not a second actual-cost deduction.</p>
    </details> : null}
    <p className="footnote">Estimates use the existing 2026 Texas tax model and current submitted information. Income dates, hours and tax withholding may differ.</p>
  </Card>;
}

export function Forecast({ person: p, admin = false, compact = false }) {
  const f = p.forecast;
  const a = f?.allocation;
  const columns = [
    { key: 'date', header: 'Expected date', mobile: 'title', render: (row) => formatDate(row.date) },
    { key: 'source', header: 'Income source', mobile: 'meta', render: (row) => row.employerName },
    { key: 'gross', header: 'Gross estimate', align: 'right', hideOnMobile: true, render: (row) => money(row.grossCents) },
    { key: 'tax', header: 'Tax estimate', align: 'right', hideOnMobile: true, render: (row) => money(row.taxCents) },
    { key: 'net', header: 'After-tax estimate', align: 'right', mobile: 'amount', render: (row) => money(row.netCents) },
  ];
  return <Card title="Next expected income & allocation" icon="calendar" subtitle={f?.nextDate ? `Expected ${formatDate(f.nextDate)} · from job schedules` : 'Dates are calculated from the first pay date and frequency.'}>
    {f?.nextDate ? <>
      <DescriptionList items={[
        { label: 'Expected gross funds', value: money(f.nextGrossCents) },
        { label: 'Estimated taxes', value: money(f.nextTaxCents) },
        { label: 'Expected after-tax funds', value: money(f.nextNetCents), total: true },
      ]} />
      {a ? <>
        <p className="section-label">Suggested allocation from monthly assumptions</p>
        <DescriptionList items={admin ? [
          { label: 'Actual operating costs', value: money(a.actualCostCents) },
          { label: 'Owner job share', value: money(a.ownerShareCents) },
          { label: 'Referral commission', value: money(a.commissionCents) },
          { label: 'Gang Cut', value: money(a.gangCutCents) },
          { label: 'YEROME profit', value: money(a.yeromeCents), total: true },
        ] : [
          { label: 'Apartment + job service charges', value: money(a.chargesCents) },
          { label: 'Your job share', value: money(a.ownerShareCents) },
          { label: 'Remaining service share', value: money(a.serviceShareCents), total: true },
        ]} />
      </> : <Notice tone="info">The full allocation will appear when compensation, partnership and tax inputs are complete.</Notice>}
      {a && Object.values(a).some((value) => value < 0) ? <Notice tone="warn">This estimate includes a shortfall. Review the inputs and Admin’s plan before allocating funds.</Notice> : null}
    </> : <EmptyState compact icon="calendar" title="No upcoming income date" message="Add an expected first income date and frequency to a job. Dates appear automatically." />}
    {f?.warnings?.map((warning) => <Notice key={warning} tone="info">{warning}</Notice>)}
    {!compact && f?.upcoming?.length ? <DataTable label="Upcoming estimated income" columns={columns} rows={f.upcoming}
      getRowKey={(row) => `${row.jobId}:${row.date}`} mobilePageSize={10} /> : null}
    <p className="footnote">{f?.basis} Forecast shown through {formatDate(f?.end)}.</p>
  </Card>;
}

export function AllocationPlan({ plan, action }) {
  const populated = plan && (plan.nextFundDate || plan.instructions);
  return <Card title="Admin’s instructions for the next fund" icon="transfer" actions={action}
    subtitle="Use these instructions alongside the calculated allocation.">
    {populated ? <>
      <DescriptionList items={[
        { label: 'Planned fund date', value: plan.nextFundDate ? formatDate(plan.nextFundDate) : 'Admin has not set a date' },
      ]} />
      {plan.instructions ? <div className="plan-instructions"><p className="section-label">Instructions from Admin</p><p className="preserve-lines">{plan.instructions}</p></div> : null}
      <p className="footnote">Updated {formatDate(plan.updatedAt?.slice(0, 10))}. A planning instruction does not record a payment.</p>
    </> : <EmptyState compact icon="transfer" title="No next-fund plan yet" message="Admin can add allocation instructions and a planned fund date here. Your income projection is available independently." />}
  </Card>;
}

export function CommissionSources({ sources = [], admin = false }) {
  return <Card title="Where commissions come from" icon="coins" subtitle="$200 per eligible active referred job per month, separate from the owner’s own job share.">
    {sources.length ? <DescriptionList items={sources.map((row) => ({
      label: admin ? `${row.referrerName} ← ${row.referredName}` : row.referredDisplayName,
      hint: `${plural(admin ? row.activeJobCount : row.eligibleJobCount, 'eligible job')} × ${money(row.ratePerJobCents)} / month`,
      value: money(admin ? row.monthlyCents : row.monthlyEquivalentCents),
    }))} /> : <EmptyState compact icon="link" title="No commission sources" message="Referral links added by Admin will show the source and projected amount here." />}
    <p className="footnote">This is a monthly projection. Admin’s instructions for the next fund supplies a date and allocation when known.</p>
  </Card>;
}

export function ProjectionStory({ person, admin = false, allocationAction }) {
  return <>
    <IncomeSources person={person} />
    <MonthlyBreakdown person={person} admin={admin} />
    <div className="grid-2">
      <Forecast person={person} admin={admin} compact />
      <AllocationPlan plan={person.allocationPlan} action={allocationAction} />
    </div>
  </>;
}
