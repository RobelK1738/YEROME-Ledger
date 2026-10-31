import { useState } from 'react';
import { nextJobPaychecks, paycheckAllocation, allocateDeposit } from '../../lib/presentation/paycheck-allocation.js';
import { dollarsToCents } from '../../lib/finance-v2/index.js';
import { money, formatDate, plural } from '../../lib/presentation/format.js';
import { Field, MoneyInput, Select } from '../ui/Field.jsx';
import { Button } from '../ui/Button.jsx';
import { Notice } from '../ui/Notice.jsx';
import { YeromeReceipt } from './YeromeReceipt.jsx';

function UsPersonPaycheck({ person, paycheck }) {
  const plan = paycheckAllocation(person, paycheck);
  const [open, setOpen] = useState(false);
  const [deposit, setDeposit] = useState('');
  const [withheld, setWithheld] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  function calculate(event) {
    event.preventDefault();
    try {
      const result = allocateDeposit(plan, { depositCents: dollarsToCents(deposit), withheldCents: dollarsToCents(withheld) });
      setPreview(result); setError('');
    } catch (failure) { setPreview(null); setError(failure.message); }
  }
  function reset() { setPreview(null); setError(''); setDeposit(''); setWithheld(''); setOpen(false); }
  const taxReserve = preview ? preview.taxReserveCents : plan?.taxCents;
  const takeHome = preview ? preview.takeHomeCents : plan?.ownerCents;
  return <article className="paycheck-card" aria-label={`${paycheck.employerName}, ${formatDate(paycheck.date)}`}>
    <header className="paycheck-card__header"><div><h2>{paycheck.employerName}</h2><p>{formatDate(paycheck.date)} · Expected gross {money(paycheck.grossCents)}</p></div>
      {plan ? <button className="statement-text-button" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Hide deposit details' : preview ? 'Edit deposit details' : 'Use deposit amount'}</button> : null}
    </header>
    {!plan ? <p className="statement-input-note">An allocation is unavailable. Admin can check the income, costs and split.</p> : <>
      {open ? <form className="deposit-form" onSubmit={calculate}>
        <div className="form-grid">
          <Field label="Direct deposit received" required><MoneyInput required value={deposit} onChange={(e) => { setDeposit(e.target.value); setPreview(null); }} /></Field>
          <Field label="Tax already withheld" required hint="Federal, Social Security, Medicare and state tax combined. Enter 0 if none. Exclude benefits and other deductions."><MoneyInput required value={withheld} onChange={(e) => { setWithheld(e.target.value); setPreview(null); }} /></Field>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="btn-group"><Button type="submit" variant="secondary" size="sm">Preview allocation</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>Reset to estimate</Button></div>
        <p className="statement-note">Deposit details are a preview. YEROME’s amount stays based on the saved plan.</p>
      </form> : null}
      <p className="paycheck-basis">{preview ? `From a ${money(preview.depositCents)} deposit · ${money(preview.withheldCents)} tax already withheld` : 'Estimate from gross pay · before employer withholding'}</p>
      {preview?.shortfallCents > 0 ? <Notice tone="danger">This deposit is {money(preview.shortfallCents)} short of the planned tax reserve and YEROME amount. Ask Admin for revised instructions before allocating it.</Notice> : null}
      <ol className={`paycheck-steps${preview?.shortfallCents ? ' paycheck-steps--short' : ''}`}>
        <li><span className="paycheck-step-label">{preview?.shortfallCents ? 'Tax reserve needed' : '1 · Set aside for tax'}</span><strong>{money(taxReserve)}</strong><small>Tax reserve account</small></li>
        <li><span className="paycheck-step-label">{preview?.shortfallCents ? 'YEROME amount planned' : '2 · Send to YEROME'}</span><strong>{money(plan.yeromeCents)}</strong><small>Service charges + YEROME share</small></li>
        <li><span className="paycheck-step-label">{preview?.shortfallCents ? 'Available to keep' : '3 · Keep'}</span><strong>{money(takeHome)}</strong><small>{preview?.shortfallCents ? 'Plan needs revision' : 'Your take-home amount'}</small></li>
      </ol>
      <details className="paycheck-explanation"><summary>How this is calculated</summary>
        <dl className="fund-lines">
          {plan.taxParts.map((line) => <div key={line.key}><dt>{line.label} · estimate</dt><dd>{money(line.cents)}</dd></div>)}
          <div><dt>Total estimated tax</dt><dd>{money(plan.taxCents)}</dd></div>
          {preview ? <div><dt>Tax already withheld</dt><dd>−{money(preview.withheldCents)}</dd></div> : null}
          <div><dt>Service charges</dt><dd>{money(plan.chargesCents)}</dd></div>
          <div><dt>YEROME profit share</dt><dd>{money(plan.serviceShareCents)}</dd></div>
        </dl>
        <p className="statement-note">The owner’s monthly charges and split are spread across job paychecks in proportion to expected after-tax income. Tax uses the combined annual estimate. Withholding reduces the reserve, never below zero.</p>
      </details>
    </>}
  </article>;
}

export function PaycheckAllocations({ person, admin = false, commissions = [] }) {
  const [date, setDate] = useState('next');
  const upcoming = person.forecast?.upcoming || [];
  const dates = [...new Set(upcoming.map((row) => row.date))].sort();
  const selectedDate = date === 'next' || dates.includes(date) ? date : 'next';
  const rows = selectedDate === 'next' ? nextJobPaychecks(person) : upcoming.filter((row) => row.date === selectedDate);
  const scheduledJobs = new Set(upcoming.map((row) => row.jobId));
  const missing = person.myJobs.filter((job) => job.status === 'active' && !scheduledJobs.has(job.id));
  return <>
    <div className="allocation-toolbar"><div><h2>{admin ? 'Allocate each receipt' : 'Allocate each paycheck'}</h2><p>{selectedDate === 'next' ? (admin ? 'Expected transfers from the US Person for each job’s next paycheck.' : 'The next expected paycheck for each job.') : `${plural(rows.length, 'paycheck')} expected on this date.`}</p></div>
      {dates.length ? <Field label={admin ? "Source pay date" : "Pay date"}><Select value={selectedDate} onChange={(e) => setDate(e.target.value)} options={[{ value: 'next', label: 'Next paycheck per job' }, ...dates.map((value) => ({ value, label: formatDate(value) }))]} /></Field> : null}
    </div>
    <p className="allocation-intro">{admin ? 'Start with the transfer expected from the US Person. Allocate it to actual operating costs, referral commissions, Gang allocation and YEROME’s remainder.' : 'Start with the estimate. If the employer has withheld taxes, use the deposit amount and tax already withheld to calculate the remaining reserve.'}</p>
    <div className="paycheck-list">{rows.map((paycheck) => admin ? <YeromeReceipt key={`${paycheck.jobId}:${paycheck.date}`} person={person} paycheck={paycheck} commissions={commissions} /> : <UsPersonPaycheck key={`${paycheck.jobId}:${paycheck.date}`} person={person} paycheck={paycheck} />)}</div>
    {!rows.length ? <p className="statement-input-note">No pay dates in the current forecast. Admin can add the job’s first pay date and pay frequency.</p> : null}
    {missing.length ? <p className="statement-note">No upcoming date in the forecast for: {missing.map((job) => job.employerName).join(', ')}.</p> : null}
    <p className="statement-method">{admin ? 'These are receipt allocation estimates from saved actual cost inputs. The US Person’s tax reserve and take-home are allocated before this transfer reaches YEROME. Receipt previews are not bank verification.' : 'These are planning instructions. Tax uses the 2026 annual wage model. Referral income is separate from employer paychecks and follows Admin’s notes.'}</p>
  </>;
}

export function AllocationNotes({ person, onEdit, title = 'From Admin' }) {
  if (!person.allocationPlan?.instructions && !onEdit) return null;
  return <section className="allocation-notes"><div className="statement-section-heading"><h2>{title}</h2>{onEdit ? <button type="button" className="statement-text-button" onClick={onEdit}>Edit instructions</button> : null}</div>
    <p className="preserve-lines">{person.allocationPlan?.instructions || (onEdit ? 'Add account destinations or other instructions for this owner.' : 'No additional instructions.')}</p>
  </section>;
}
