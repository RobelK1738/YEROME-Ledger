import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { getMyStatement } from '../../lib/data/v2.js';
import { OWNER_PAYCHECK_STATUS, statusMeta } from '../../lib/presentation/labels.js';
import { formatDate, money } from '../../lib/presentation/format.js';
import { paycheckDisplayStatus } from '../../lib/presentation/people.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { DescriptionList } from '../../components/ui/DescriptionList.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Drawer } from '../../components/ui/Overlay.jsx';
import { Tabs, TabPanel } from '../../components/ui/Tabs.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';

const VIEWS = ['paychecks', 'distributions', 'tax'];

function PaycheckStatus({ check, today }) {
  const meta = statusMeta(OWNER_PAYCHECK_STATUS, paycheckDisplayStatus(check, today));
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function PaycheckDrawer({ check, employer, today, onClose }) {
  return (
    <Drawer open={Boolean(check)} onClose={onClose} title={check ? `Paycheck · ${formatDate(check.payDate)}` : ''}
      description={employer}>
      {check ? <>
        <div className="badge-row"><PaycheckStatus check={check} today={today} /></div>
        {check.status !== 'paid' ? (
          <Notice tone="neutral">Amounts appear after YEROME records this paystub and deposit.</Notice>
        ) : null}
        <DescriptionList items={[
          check.periodStart ? { label: 'Pay period', value: `${formatDate(check.periodStart)} – ${formatDate(check.periodEnd)}` } : null,
          { label: 'Employer gross', value: money(check.actualGrossCents), basis: check.status === 'paid' ? 'recorded' : undefined },
          { label: 'Federal income tax withheld', value: money(check.federalWithheldCents) },
          { label: 'Social Security withheld', value: money(check.socialSecurityWithheldCents) },
          { label: 'Medicare withheld', value: money(check.medicareWithheldCents) },
          check.additionalMedicareWithheldCents ? { label: 'Additional Medicare withheld', value: money(check.additionalMedicareWithheldCents) } : null,
          { label: 'State tax withheld', value: money(check.stateWithheldCents) },
          { label: 'Net deposited', value: money(check.actualNetReceivedCents), total: true },
        ]} />
        <p className="footnote">An employer paycheck is separate from your partner distribution, which is calculated after the pay period is reviewed.</p>
      </> : null}
    </Drawer>
  );
}

function Paychecks({ statement, today }) {
  const [open, setOpen] = useState(null);
  const employerFor = (jobId) => statement.myJobs.find((job) => job.id === jobId)?.employerName || 'Employer';
  const rows = [...statement.myPaychecks].sort((a, b) => b.payDate.localeCompare(a.payDate));
  const columns = [
    { key: 'date', header: 'Pay date', mobile: 'title', render: (row) => formatDate(row.payDate) },
    { key: 'employer', header: 'Employer', mobile: 'meta', render: (row) => employerFor(row.jobId) },
    { key: 'status', header: 'Status', mobile: 'badge', render: (row) => <PaycheckStatus check={row} today={today} /> },
    { key: 'gross', header: 'Gross', align: 'right', hideOnMobile: true, render: (row) => <span className="num">{money(row.actualGrossCents)}</span> },
    { key: 'net', header: 'Net deposited', align: 'right', mobile: 'amount', render: (row) => <span className="num">{money(row.actualNetReceivedCents)}</span>,
      renderMobile: (row) => money(row.actualNetReceivedCents) },
  ];
  return <>
    <Card padded={false} title="Employer paychecks" subtitle="Select a paycheck to see its recorded withholding.">
      <DataTable label="Employer paychecks" columns={columns} rows={rows} onRowClick={setOpen}
        emptyIcon="receipt" emptyTitle="No pay dates yet"
        emptyMessage="Pay dates appear here once YEROME schedules them for your jobs." />
    </Card>
    <PaycheckDrawer check={open} employer={open ? employerFor(open.jobId) : ''} today={today} onClose={() => setOpen(null)} />
  </>;
}

function Distributions({ statement }) {
  const rows = [...(statement.partnerSettlements || [])].sort((a, b) => b.payDate.localeCompare(a.payDate));
  if (!rows.length) {
    return <Card><EmptyState icon="banknote" title="No distributions posted yet"
      message="A distribution is posted after a pay period is completed and reviewed. Recorded paychecks alone don’t create a settled share." /></Card>;
  }
  return (
    <ul className="ledger-list">
      {rows.map((row) => (
        <li key={row.paycheckId} className="ledger-item card">
          <div className="ledger-item__head">
            <div>
              <p className="ledger-item__title">Pay period ending {formatDate(row.payDate)}</p>
              <p className="ledger-item__sub">{row.lastPaidAt ? `Last distribution recorded ${formatDate(row.lastPaidAt.slice(0, 10))}` : 'No distribution recorded yet'}</p>
            </div>
            {row.owedCents > 0 ? <Badge tone="warn">{money(row.owedCents)} outstanding</Badge> : <Badge tone="ok">Fully distributed</Badge>}
          </div>
          <div className="ledger-item__figures">
            <div><span className="figure__label">Original share</span><span className="figure__value num">{money(row.partnerDueOriginalCents)}</span></div>
            <div><span className="figure__label">Changes</span><span className="figure__value num">{money(row.partnerDueChangesCents)}</span></div>
            <div><span className="figure__label">Current share</span><span className="figure__value num">{money(row.partnerDueCents)}</span></div>
            <div><span className="figure__label">Recorded paid</span><span className="figure__value num">{money(row.paidCents)}</span></div>
          </div>
          {row.needsAdjustment ? <Notice tone="info">A paystub correction for this period is waiting for a contractual adjustment review.</Notice> : null}
          {row.unverifiedPaidCents > 0 ? <Notice tone="warn">Some historical payments are being checked against evidence. Recorded balances are kept as they are in the meantime.</Notice> : null}
          {row.overpaidCents ? <Notice tone="warn">{money(row.overpaidCents)} was recorded above the revised share. YEROME will review it.</Notice> : null}
        </li>
      ))}
    </ul>
  );
}

function TaxPosition({ statement }) {
  const r = statement.taxReconciliation;
  return (
    <div className="grid-2">
      <Card title={`${statement.taxYear} tax position`} icon="scale" subtitle="Informational only. It doesn’t make any further deduction from your share.">
        {statement.annualTaxNeedsReview ? (
          <Notice tone="info">Your annual estimate needs a dated wage review after a pay-term or job-status change. Monthly figures remain estimates.</Notice>
        ) : null}
        <DescriptionList items={[
          { label: 'Estimated annual tax', value: money(statement.annualTaxLiabilityEstimateCents), basis: 'estimate' },
          { label: 'Withheld on recorded paychecks', value: money(r?.actualWithholdingCents), basis: 'recorded' },
          { label: 'Estimate less withholding so far', value: money(r?.projectedGapCents), emphasis: true },
          { label: 'Social Security withheld so far', value: money(r?.actualSocialSecurityWithheldCents), basis: 'recorded' },
          { label: 'Possible Social Security above the annual cap', value: money(r?.potentialExcessSocialSecurityCents) },
        ]} />
        {r?.missingWithholdingCount ? (
          <Notice tone="warn">Withholding is missing on {r.missingWithholdingCount} received paycheck(s), so the comparison is incomplete until those paystubs are reviewed.</Notice>
        ) : null}
      </Card>
      <Card title="Reading these numbers" icon="info">
        <ul className="plain-list">
          <li>Future paycheck withholding and any estimated tax payments aren’t included, so this isn’t a year-end balance.</li>
          <li>Any Social Security credit is claimed on your tax return. It isn’t part of paycheck cash or a partner distribution.</li>
          <li>Texas has no personal state income tax.</li>
        </ul>
      </Card>
    </div>
  );
}

export default function OwnerPayments() {
  const { data, loading, error, refresh } = useAsync(getMyStatement, []);
  const [params, setParams] = useSearchParams();
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : 'paychecks';
  const header = <PageHeader title="Payments" subtitle="What your employer paid and what has been distributed to you. Two separate things, shown separately." />;
  if (loading) return <>{header}<PageSkeleton header={false} stats={0} rows={6} label="Loading payments…" /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;
  const today = data.asOf?.slice(0, 10) || undefined;
  const tabs = [
    { id: 'paychecks', label: 'Employer paychecks', count: data.myPaychecks.length },
    { id: 'distributions', label: 'Partner distributions', count: (data.partnerSettlements || []).length },
    { id: 'tax', label: 'Tax position' },
  ];
  return <>
    {header}
    <Tabs idPrefix="payments" label="Payment views" tabs={tabs} value={view}
      onChange={(next) => setParams(next === 'paychecks' ? {} : { view: next })} />
    <TabPanel idPrefix="payments" id={view}>
      {view === 'paychecks' ? <Paychecks statement={data} today={today} /> : null}
      {view === 'distributions' ? <Distributions statement={data} /> : null}
      {view === 'tax' ? <TaxPosition statement={data} /> : null}
    </TabPanel>
  </>;
}
