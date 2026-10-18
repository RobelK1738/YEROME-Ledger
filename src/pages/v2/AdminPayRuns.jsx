import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync.js';
import { getAdminOverview, getAdminCommissions, postAdminCommission, schedulePaychecks, recordPaycheck } from '../../lib/data/v2.js';
import { dollarsToCents } from '../../lib/finance-v2/index.js';
import { formatCurrency } from '../../lib/formatting/money.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Loading } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';

const emptyReceipt = { actualGross: '', actualNet: '', actualHours: '', federal: '', ss: '', medicare: '',
  additionalMedicare: '', state: '', other: '' };
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
  if (loading) return <Loading full label="Loading pay runs…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  const people = data?.people || [];
  const jobs = people.flatMap((person) => person.myJobs.map((job) => ({ ...job, personName: person.displayName })));
  const checks = people.flatMap((person) => person.myPaychecks.map((check) => ({
    ...check, personName: person.displayName,
    employerName: person.myJobs.find((job) => job.id === check.jobId)?.employerName || 'Job',
  }))).sort((a, b) => b.payDate.localeCompare(a.payDate));
  const set = (key, value) => setReceipt((state) => ({ ...state, [key]: value }));
  async function submit(work, success) {
    setBusy(true); setFormError(''); setMessage('');
    try { await work(); setMessage(success); setEditing(null); await Promise.all([refresh(), refreshCommissions()]); }
    catch (caught) { setFormError(caught.message || 'Could not save pay run.'); }
    finally { setBusy(false); }
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
        {check.status === 'scheduled' ? <button className="btn btn--secondary btn--sm" onClick={() => { setEditing(check.id); setReceipt({
          ...emptyReceipt, actualGross: check.actualGrossCents == null ? '' : String(check.actualGrossCents / 100),
          actualNet: check.actualNetReceivedCents == null ? '' : String(check.actualNetReceivedCents / 100),
        }); }}>Record receipt</button> : null}
        {editing === check.id ? <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(() => recordPaycheck({
          paycheckId: check.id,
          actualGrossCents: dollarsToCents(receipt.actualGross),
          actualNetReceivedCents: dollarsToCents(receipt.actualNet),
          actualHours: receipt.actualHours === '' ? null : Number(receipt.actualHours),
          federalWithheldCents: receipt.federal === '' ? null : dollarsToCents(receipt.federal),
          socialSecurityWithheldCents: receipt.ss === '' ? null : dollarsToCents(receipt.ss),
          medicareWithheldCents: receipt.medicare === '' ? null : dollarsToCents(receipt.medicare),
          additionalMedicareWithheldCents: receipt.additionalMedicare === '' ? null : dollarsToCents(receipt.additionalMedicare),
          stateWithheldCents: receipt.state === '' ? null : dollarsToCents(receipt.state),
          otherDeductionsCents: receipt.other === '' ? null : dollarsToCents(receipt.other),
        }), 'Actual paycheck recorded.'); }}>
          {input('Actual gross ($)', receipt.actualGross, (value) => set('actualGross', value), true)}
          {input('Actual net deposited ($)', receipt.actualNet, (value) => set('actualNet', value), true)}
          {input('Actual hours', receipt.actualHours, (value) => set('actualHours', value))}
          <p className="muted">Enter each tax line from the paystub. Use 0 when the paystub shows no amount.</p>
          {input('Federal withheld ($)', receipt.federal, (value) => set('federal', value), true)}
          {input('Social Security withheld ($)', receipt.ss, (value) => set('ss', value), true)}
          {input('Medicare withheld ($)', receipt.medicare, (value) => set('medicare', value), true)}
          {input('Additional Medicare withheld ($)', receipt.additionalMedicare, (value) => set('additionalMedicare', value), true)}
          {input('State withheld ($)', receipt.state, (value) => set('state', value), true)}
          {input('Other paycheck deductions ($)', receipt.other, (value) => set('other', value))}
          <div className="row"><button className="btn btn--primary" disabled={busy}>Save receipt</button>
            <button type="button" className="btn btn--secondary" onClick={() => setEditing(null)}>Cancel</button></div>
        </form> : null}
      </li>)}</ul> : <p className="muted">No dated paychecks yet. Generate a schedule to begin.</p>}
    </Card>
    <Card title="Miki referral commissions" subtitle="Post only completed full calendar months; record an external payment after it happens.">
      {commissionError ? <ErrorState error={commissionError} onRetry={refreshCommissions} /> : null}
      <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(() => postAdminCommission({
        action: 'accrue', referralId: commissionReferralId, calendarMonth: `${commissionMonth}-01`,
      }), 'Full-month commission accrued.'); }}>
        <label className="v2-field"><span>Verified referral</span><select required value={commissionReferralId}
          onChange={(event) => setCommissionReferralId(event.target.value)}><option value="">Choose referral</option>
          {(commissionData?.referrals || []).filter((row) => !row.needsContractReview).map((row) =>
            <option key={row.id} value={row.id}>{row.referrerName} → {row.referredName}</option>)}</select></label>
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
