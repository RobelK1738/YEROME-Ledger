import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync.js';
import { getAdminOverview, getAdminCommissions, getAdminSettlements, postAdminSettlement, postAdminCommission, schedulePaychecks, recordPaycheck } from '../../lib/data/v2.js';
import { dollarsToCents } from '../../lib/finance-v2/index.js';
import { formatCurrency } from '../../lib/formatting/money.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Loading } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';

const emptyReceipt = { actualGross: '', actualNet: '', actualHours: '', federal: '', ss: '', medicare: '',
  additionalMedicare: '', state: '', other: '0', reason: '' };
function input(label, value, onChange, required = false) {
  return <label className="v2-field"><span>{label}</span><input type="number" min="0" step="0.01"
    required={required} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export default function AdminPayRuns() {
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const { data: commissionData, error: commissionError, refresh: refreshCommissions } = useAsync(getAdminCommissions, []);
  const [schedule, setSchedule] = useState({ jobId: '', firstPayDate: '', count: '26' });
  const [editing, setEditing] = useState(null);
  const [receipt, setReceipt] = useState(emptyReceipt);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [commissionMonth, setCommissionMonth] = useState('');
  const [commissionReferralId, setCommissionReferralId] = useState('');
  const [commissionPayment, setCommissionPayment] = useState({ accrualId: '', amount: '', paidAt: '', paymentReference: '' });
  const [settlementQuery, setSettlementQuery] = useState({ ownerId: '', month: '' });
  const [settlementData, setSettlementData] = useState(null);
  const [payment, setPayment] = useState({ settlementId: '', amount: '', paidAt: '', reference: '', key: crypto.randomUUID() });
  if (loading) return <Loading full label="Loading pay runs…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  const people = data?.people || [];
  const jobs = people.flatMap((person) => person.myJobs.map((job) => ({ ...job, personName: person.displayName })));
  const checks = people.flatMap((person) => person.myPaychecks.map((check) => ({
    ...check, personName: person.displayName,
    employerName: person.myJobs.find((job) => job.id === check.jobId)?.employerName || 'Job',
  }))).sort((a, b) => b.payDate.localeCompare(a.payDate));
  const set = (key, value) => setReceipt((state) => ({ ...state, [key]: value }));
  function editReceipt(check) {
    const dollars = (value) => value == null ? '' : String(value / 100);
    setEditing(check.id);
    setReceipt({
      actualGross: dollars(check.actualGrossCents), actualNet: dollars(check.actualNetReceivedCents),
      actualHours: '', federal: dollars(check.federalWithheldCents),
      ss: dollars(check.socialSecurityWithheldCents), medicare: dollars(check.medicareWithheldCents),
      additionalMedicare: dollars(check.additionalMedicareWithheldCents),
      state: dollars(check.stateWithheldCents), other: dollars(check.otherDeductionsCents) || '0',
      reason: '',
    });
  }
  async function submit(work, success) {
    setBusy(true); setFormError(''); setMessage('');
    try { await work(); setMessage(success); setEditing(null); await Promise.all([refresh(), refreshCommissions()]); }
    catch (caught) { setFormError(caught.message || 'Could not save pay run.'); }
    finally { setBusy(false); }
  }
  async function loadSettlements(ownerId = settlementQuery.ownerId, month = settlementQuery.month) {
    if (ownerId && month) setSettlementData(await getAdminSettlements(ownerId, `${month}-01`));
  }
  return <>
    <PageHeader title="Pay Runs" subtitle="Actual employer deposits and withholding are recorded separately from contractual estimates." />
    {message ? <p role="status" className="v2-notice">{message}</p> : null}
    {formError ? <p role="alert" className="form-error">{formError}</p> : null}
    <Card title="Schedule employer pay dates" subtitle="Dates follow each job’s payroll calendar. A 27-check year can be entered explicitly.">
      <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(() => schedulePaychecks({
        ...schedule, count: Number(schedule.count),
      }), 'Pay dates scheduled.'); }}>
        <label className="v2-field"><span>Job</span><select required value={schedule.jobId}
          onChange={(event) => setSchedule({ ...schedule, jobId: event.target.value })}>
          <option value="">Choose job</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.personName} · {job.employerName}</option>)}</select></label>
        <label className="v2-field"><span>First payday</span><input required type="date" value={schedule.firstPayDate}
          onChange={(event) => setSchedule({ ...schedule, firstPayDate: event.target.value })} /></label>
        <label className="v2-field"><span>Number of pay dates</span><input required type="number" min="1" max="52" value={schedule.count}
          onChange={(event) => setSchedule({ ...schedule, count: event.target.value })} /></label>
        <button className="btn btn--primary" disabled={busy}>Generate dates</button>
      </form>
    </Card>
    <Card title="Dated paychecks" subtitle="Mark received only from a real paystub or bank record. Recorded cash does not imply a partner settlement.">
      {checks.length ? <ul className="v2-list">{checks.map((check) => <li key={check.id}>
        <div><strong>{check.payDate}</strong> · {check.personName} · {check.employerName} · {check.status}</div>
        <div>{check.actualNetReceivedCents == null ? 'Actual net not recorded' : `Employer net deposit ${formatCurrency(check.actualNetReceivedCents)}`}</div>
        {['scheduled', 'paid'].includes(check.status) ? <button className="btn btn--secondary btn--sm"
          onClick={() => editReceipt(check)}>{check.status === 'paid' ? 'Correct receipt' : 'Record receipt'}</button> : null}
        {editing === check.id ? <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(() => recordPaycheck({
          paycheckId: check.id, action: check.status === 'paid' ? 'correct' : 'receive', reason: receipt.reason,
          actualGrossCents: dollarsToCents(receipt.actualGross),
          actualNetReceivedCents: dollarsToCents(receipt.actualNet),
          actualHours: receipt.actualHours === '' ? null : Number(receipt.actualHours),
          federalWithheldCents: receipt.federal === '' ? null : dollarsToCents(receipt.federal),
          socialSecurityWithheldCents: receipt.ss === '' ? null : dollarsToCents(receipt.ss),
          medicareWithheldCents: receipt.medicare === '' ? null : dollarsToCents(receipt.medicare),
          additionalMedicareWithheldCents: receipt.additionalMedicare === '' ? null : dollarsToCents(receipt.additionalMedicare),
          stateWithheldCents: receipt.state === '' ? null : dollarsToCents(receipt.state),
          otherDeductionsCents: receipt.other === '' ? null : dollarsToCents(receipt.other),
        }), check.status === 'paid' ? 'Receipt correction recorded with audit history.' : 'Actual paycheck recorded.'); }}>
          {input('Actual gross ($)', receipt.actualGross, (value) => set('actualGross', value), true)}
          {input('Actual net deposited ($)', receipt.actualNet, (value) => set('actualNet', value), true)}
          {input('Actual hours', receipt.actualHours, (value) => set('actualHours', value))}
          <p className="muted">Enter each tax line from the paystub. Use 0 when the paystub shows no amount.</p>
          {input('Federal withheld ($)', receipt.federal, (value) => set('federal', value), true)}
          {input('Social Security withheld ($)', receipt.ss, (value) => set('ss', value), true)}
          {input('Medicare withheld ($)', receipt.medicare, (value) => set('medicare', value), true)}
          {input('Additional Medicare withheld ($)', receipt.additionalMedicare, (value) => set('additionalMedicare', value), true)}
          {input('State withheld ($)', receipt.state, (value) => set('state', value), true)}
          {input('Other paycheck deductions ($)', receipt.other, (value) => set('other', value), true)}
          {check.status === 'paid' ? <label className="v2-field"><span>Correction reason</span><input required
            value={receipt.reason} onChange={(event) => set('reason', event.target.value)} /></label> : null}
          <p className="muted">Gross must equal net deposit plus withholding and other deductions.</p>
          <div className="row"><button className="btn btn--primary" disabled={busy}>{check.status === 'paid' ? 'Record correction' : 'Save receipt'}</button>
            <button type="button" className="btn btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
        </form> : null}
      </li>)}</ul> : <p className="muted">No dated paychecks yet. Generate a schedule to begin.</p>}
    </Card>
    <Card title="Contractual settlement" subtitle="A completed month can post only under a signed, enabled settlement policy. No policy is seeded.">
      <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(() => loadSettlements(), 'Settlement month loaded.'); }}>
        <label className="v2-field"><span>US Person</span><select required value={settlementQuery.ownerId}
          onChange={(event) => { setSettlementQuery({ ...settlementQuery, ownerId: event.target.value }); setSettlementData(null); }}>
          <option value="">Choose person</option>{people.map((person) =>
            <option key={person.ownerId} value={person.ownerId}>{person.displayName}</option>)}</select></label>
        <label className="v2-field"><span>Completed calendar month</span><input required type="month"
          value={settlementQuery.month} onChange={(event) => {
            setSettlementQuery({ ...settlementQuery, month: event.target.value }); setSettlementData(null);
          }} /></label>
        <button className="btn btn--secondary" disabled={busy}>Review month</button>
      </form>
      {settlementData?.reviewReason ? <p className="muted">{settlementData.reviewReason}</p> : null}
      {settlementData?.proposal ? <>
        <p>Receipt net basis: {formatCurrency(settlementData.proposal.afterTaxCents)} · agreed charges: {formatCurrency(settlementData.proposal.quotedCostCents)} · contractual share: {formatCurrency(settlementData.proposal.partnerDueCents)}.</p>
        <p>Internal actual cost: {formatCurrency(settlementData.proposal.actualCostCents)} · Miki commission: {formatCurrency(settlementData.proposal.commissionCents)} · Gang: {formatCurrency(settlementData.proposal.gangCutCents)} · YEROME residual: {formatCurrency(settlementData.proposal.yeromeResidualCents)}.</p>
        <button className="btn btn--primary" disabled={busy || !settlementData.policyApproved}
          onClick={() => submit(async () => {
            await postAdminSettlement({ action: 'post', ownerId: settlementQuery.ownerId,
              calendarMonth: `${settlementQuery.month}-01`,
              idempotencyKey: `v2-${settlementQuery.ownerId}-${settlementQuery.month}` });
            await loadSettlements();
          }, 'Contractual month posted with immutable receipt snapshots.')}>Post reviewed month</button>
      </> : null}
      {settlementData?.settlements?.length ? <ul className="v2-list">{settlementData.settlements.map((row) =>
        <li key={row.settlementId}><strong>Paycheck dated {row.payDate}</strong>
          <p>Current partner due {formatCurrency(row.partnerDueCents)} · paid {formatCurrency(row.paidCents)} · owed {formatCurrency(row.owedCents)}</p>
          {row.overpaidCents ? <p>Recorded amount exceeds revised due by {formatCurrency(row.overpaidCents)}. Credit or recovery review required.</p> : null}
          <details><summary>Original, changes and current totals</summary>
            {[
              ['Receipt net', 'sourceNetCents'], ['Agreed charges', 'quotedCostCents'],
              ['YEROME actual cost', 'actualCostCents'], ['Partner due', 'partnerDueCents'],
              ['Miki commission', 'commissionCents'], ['Gang', 'gangCutCents'],
              ['YEROME residual', 'yeromeResidualCents'],
            ].map(([label, key]) => <p key={key}>{label}: original {formatCurrency(row.original[key])} + changes {formatCurrency(row.changes[key])} = current {formatCurrency(row[key])}</p>)}
          </details>
          <button className="btn btn--ghost btn--sm" onClick={() => setPayment({ ...payment, settlementId: row.settlementId })}>Record partial/full payment</button>
          {row.pendingCorrections?.map((correction) => <button key={correction.id}
            className="btn btn--ghost btn--sm" disabled={busy}
            onClick={() => submit(async () => {
              await postAdminSettlement({ action: 'reconcile', ownerId: settlementQuery.ownerId,
                calendarMonth: `${settlementQuery.month}-01`, settlementId: row.settlementId,
                receiptCorrectionId: correction.id,
                idempotencyKey: `receipt-reconcile-${correction.id}` });
              await loadSettlements();
            }, 'Receipt correction reconciled across the posted month.')}>
            Reconcile receipt correction {correction.sequence}</button>)}
          {row.pendingCorrections?.length ? <p className="muted">Corrections reconcile in order. If revised due is below a recorded payment, posting stops for a signed credit or recovery decision.</p> : null}
        </li>)}</ul> : null}
      {payment.settlementId && settlementData ? <form className="v2-form" onSubmit={(event) => {
        event.preventDefault(); submit(async () => {
          await postAdminSettlement({ action: 'payment', ownerId: settlementQuery.ownerId,
            calendarMonth: `${settlementQuery.month}-01`, settlementId: payment.settlementId,
            amountCents: dollarsToCents(payment.amount), paidAt: payment.paidAt,
            externalReference: payment.reference, idempotencyKey: payment.key });
          await loadSettlements();
          setPayment({ settlementId: '', amount: '', paidAt: '', reference: '', key: crypto.randomUUID() });
        }, 'External partner payment recorded.');
      }}>
        <p>Record an external payment only after it occurred.</p>
        {input('Amount paid ($)', payment.amount, (value) => setPayment({ ...payment, amount: value }), true)}
        <label className="v2-field"><span>Paid at</span><input required type="date" value={payment.paidAt}
          onChange={(event) => setPayment({ ...payment, paidAt: event.target.value })} /></label>
        <label className="v2-field"><span>External payment reference</span><input required value={payment.reference}
          onChange={(event) => setPayment({ ...payment, reference: event.target.value })} /></label>
        <button className="btn btn--primary" disabled={busy}>Record payment</button>
      </form> : null}
    </Card>
    <Card title="Miki referral commissions" subtitle="Post only completed full calendar months; record an external payment after it happens.">
      {commissionError ? <ErrorState error={commissionError} onRetry={refreshCommissions} /> : null}
      <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(() => postAdminCommission({
        action: 'accrue', referralId: commissionReferralId, calendarMonth: `${commissionMonth}-01`,
      }), 'Full-month commission accrued.'); }}>
        <label className="v2-field"><span>Verified referral</span><select required value={commissionReferralId}
          onChange={(event) => setCommissionReferralId(event.target.value)}><option value="">Choose referral</option>
          {(commissionData?.referrals || []).filter((row) => !row.needsContractReview).map((row) =>
            <option key={row.id} value={row.id}>{row.referrerName} → {row.referredName}{row.relationshipCurrent ? '' : ' · historical or scheduled'}</option>)}</select></label>
        <label className="v2-field"><span>Completed calendar month</span><input required type="month" value={commissionMonth}
          onChange={(event) => setCommissionMonth(event.target.value)} /></label>
        <button className="btn btn--secondary" disabled={busy}>Post full-month accrual</button>
      </form>
      {(commissionData?.accruals || []).length ? <ul className="v2-list">
        {commissionData.accruals.map((accrual) => <li key={accrual.id}>
          {accrual.calendarMonth} · {accrual.eligibleJobCount} eligible jobs · accrued {formatCurrency(accrual.accruedCents)} · paid {formatCurrency(accrual.paidCents)} · owed {formatCurrency(accrual.owedCents)}
        </li>)}
      </ul> : <p className="muted">No full-month accrual has been posted.</p>}
      <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(() => postAdminCommission({
        action: 'payment', accrualId: commissionPayment.accrualId,
        amountCents: dollarsToCents(commissionPayment.amount),
        paidAt: commissionPayment.paidAt, paymentReference: commissionPayment.paymentReference,
      }), 'External commission payment recorded.'); }}>
        <label className="v2-field"><span>Accrual with amount owed</span><select required value={commissionPayment.accrualId}
          onChange={(event) => setCommissionPayment({ ...commissionPayment, accrualId: event.target.value })}>
          <option value="">Choose accrual</option>{(commissionData?.accruals || []).filter((row) => row.owedCents > 0)
            .map((row) => <option key={row.id} value={row.id}>{row.calendarMonth} · {formatCurrency(row.owedCents)} owed</option>)}</select></label>
        {input('Amount actually paid ($)', commissionPayment.amount,
          (value) => setCommissionPayment({ ...commissionPayment, amount: value }), true)}
        <label className="v2-field"><span>External payment date</span><input required type="date" value={commissionPayment.paidAt}
          onChange={(event) => setCommissionPayment({ ...commissionPayment, paidAt: event.target.value })} /></label>
        <label className="v2-field"><span>External payment reference</span><input required value={commissionPayment.paymentReference}
          onChange={(event) => setCommissionPayment({ ...commissionPayment, paymentReference: event.target.value })} /></label>
        <button className="btn btn--primary" disabled={busy}>Record payment</button>
      </form>
    </Card>
  </>;
}
