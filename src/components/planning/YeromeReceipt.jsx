import { useState } from 'react';
import { yeromePaycheckAllocation, allocateYeromeReceipt } from '../../lib/presentation/paycheck-allocation.js';
import { dollarsToCents } from '../../lib/finance-v2/index.js';
import { money, formatDate } from '../../lib/presentation/format.js';
import { Field, MoneyInput } from '../ui/Field.jsx';
import { Button } from '../ui/Button.jsx';
import { Notice } from '../ui/Notice.jsx';

export function YeromeReceipt({ person, paycheck, commissions = [] }) {
  const plan = yeromePaycheckAllocation(person, paycheck);
  const [open, setOpen] = useState(false);
  const [received, setReceived] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const allocation = preview || (plan ? allocateYeromeReceipt(plan, plan.receiptCents) : null);
  const recipients = [...new Set(commissions.filter((row) => row.eligible && row.monthlyCents > 0).map((row) => row.referrerName))];
  function calculate(event) {
    event.preventDefault();
    try { setPreview(allocateYeromeReceipt(plan, dollarsToCents(received))); setError(''); }
    catch (failure) { setPreview(null); setError(failure.message); }
  }
  function reset() { setPreview(null); setError(''); setReceived(''); setOpen(false); }
  return <article className="paycheck-card" aria-label={`YEROME receipt for ${paycheck.employerName}, ${formatDate(paycheck.date)}`}>
    <header className="paycheck-card__header"><div><h2>{paycheck.employerName}</h2><p>Employer payday {formatDate(paycheck.date)} · From {person.displayName}</p></div>
      {plan ? <button className="statement-text-button" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Hide receipt details' : preview ? 'Edit received amount' : 'Use received amount'}</button> : null}
    </header>
    {!plan ? <p className="statement-input-note">The receipt allocation is unavailable. Check the actual cost inputs and partnership settings.</p> : <>
      {open ? <form className="deposit-form" onSubmit={calculate}>
        <Field label="Amount received from US Person" required><MoneyInput required value={received} onChange={(e) => { setReceived(e.target.value); setPreview(null); setError(''); }} /></Field>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="btn-group"><Button type="submit" variant="secondary" size="sm">Preview receipt allocation</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>Reset to expected amount</Button></div>
        <p className="statement-note">This preview uses the planned cost, commission and Gang amounts. It does not mark a transfer received.</p>
      </form> : null}
      <p className="receipt-amount">{preview ? 'Entered receipt' : 'Expected from US Person'}<strong>{money(allocation.receivedCents)}</strong></p>
      {preview?.belowPlanCents > 0 ? <p className="paycheck-basis">{money(preview.belowPlanCents)} below the expected transfer of {money(plan.receiptCents)}.</p> : null}
      {allocation.unallocatedCents > 0 ? <Notice tone="warn">{money(allocation.unallocatedCents)} exceeds the planned transfer. Keep that amount unallocated until reviewed; it is not included in profit.</Notice> : null}
      {allocation.shortfallCents > 0 ? <Notice tone="danger">{preview ? 'This receipt' : 'The expected receipt'} is {money(allocation.shortfallCents)} short of costs, commissions and Gang allocation. Revise the plan before allocating these amounts. There is no amount available to retain.</Notice> : null}
      <ol className={`paycheck-steps receipt-steps${allocation.shortfallCents ? ' paycheck-steps--short' : ''}`}>
        <li><span className="paycheck-step-label">Operating costs</span><strong>{money(allocation.actualCostCents)}</strong><small>Actual cost inputs</small></li>
        {plan.commissionCents > 0 ? <li><span className="paycheck-step-label">Referral commission</span><strong>{money(allocation.commissionCents)}</strong><small>{recipients.length ? `Reserve for ${recipients.join(', ')}` : 'Reserve pending recipient assignment'}</small></li> : null}
        <li><span className="paycheck-step-label">Gang allocation</span><strong>{money(allocation.gangCents)}</strong><small>10% of the US Person’s estimated after-tax income</small></li>
        <li><span className="paycheck-step-label">YEROME retains</span><strong>{money(allocation.retainedCents)}</strong><small>{allocation.shortfallCents ? 'Funding gap' : 'Remainder after allocations'}</small></li>
      </ol>
      <details className="paycheck-explanation"><summary>Actual cost breakdown</summary><dl className="fund-lines">
        {plan.costParts.map((line) => <div key={line.key}><dt>{line.label}</dt><dd>{money(line.cents)}</dd></div>)}
      </dl><p className="statement-note">Uses the saved actual operating cost assumptions, apportioned to this paycheck. Quoted service charges belong to the US Person’s transfer calculation and are not deducted again here.</p></details>
    </>}
  </article>;
}
