import { useEffect, useState } from 'react';
import { recordPaycheck } from '../../../lib/data/v2.js';
import { RECEIPT_LINES, receiptBalance, receiptFormFromCheck, receiptPayload } from '../../../lib/presentation/forms.js';
import { formatDate, money } from '../../../lib/presentation/format.js';
import { useMutation } from '../../../hooks/useMutation.js';
import { Drawer } from '../../../components/ui/Overlay.jsx';
import { AffixInput, Field, FormSection, MoneyInput, TextArea } from '../../../components/ui/Field.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';

const FORM_ID = 'receipt-form';

function Balance({ balance }) {
  if (!balance.complete) {
    return <div className="balance balance--pending" aria-live="polite">
      <Icon name="info" size={16} />
      <span>Enter gross, net and every line to check the paystub balances.</span>
    </div>;
  }
  return balance.balanced ? (
    <div className="balance balance--ok" aria-live="polite">
      <Icon name="checkCircle" size={16} />
      <span>Balanced: gross {money(balance.grossCents)} = net deposit + withholding + deductions.</span>
    </div>
  ) : (
    <div className="balance balance--off" aria-live="polite">
      <Icon name="alert" size={16} />
      <span>Off by {money(Math.abs(balance.differenceCents))}: net + withholding + deductions = {money(balance.accountedCents)}, gross = {money(balance.grossCents)}.</span>
    </div>
  );
}

/** Enter (or correct) one paycheck's actual amounts from a real paystub. */
export function ReceiptDrawer({ check, onClose, onSaved }) {
  const [receipt, setReceipt] = useState(() => (check ? receiptFormFromCheck(check) : null));
  const [localError, setLocalError] = useState('');
  const { run, busy, error, setError } = useMutation();
  useEffect(() => {
    if (check) { setReceipt(receiptFormFromCheck(check)); setLocalError(''); setError(''); }
  }, [check, setError]);

  const correcting = check?.status === 'paid';
  const set = (key) => (event) => { const { value } = event.target; setReceipt((state) => ({ ...state, [key]: value })); setLocalError(''); };
  const balance = receipt ? receiptBalance(receipt) : null;

  function submit(event) {
    event.preventDefault();
    if (balance.complete && !balance.balanced) {
      setLocalError('Gross must equal the net deposit plus all withholding and deductions. Check the paystub lines.');
      return;
    }
    run(() => recordPaycheck(receiptPayload(check, receipt)), {
      success: correcting ? 'Receipt correction recorded with audit history.' : 'Paycheck receipt recorded.',
      onSuccess: async () => { await onSaved(); onClose(); },
    });
  }

  return (
    <Drawer open={Boolean(check)} onClose={onClose} size="wide"
      title={correcting ? 'Correct paycheck receipt' : 'Record paycheck receipt'}
      description="Enter amounts exactly as shown on the paystub or bank record."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={FORM_ID} variant="primary" loading={busy}>{correcting ? 'Record correction' : 'Save receipt'}</Button>
      </>}>
      {check && receipt ? (
        <form id={FORM_ID} onSubmit={submit}>
          <div className="summary-strip">
            <div><span className="summary-strip__label">US Person</span><span className="summary-strip__value">{check.personName}</span></div>
            <div><span className="summary-strip__label">Employer</span><span className="summary-strip__value">{check.employerName}</span></div>
            <div><span className="summary-strip__label">Payday</span><span className="summary-strip__value">{formatDate(check.payDate)}</span></div>
            <div><span className="summary-strip__label">Status</span><StatusBadge kind="paycheck" status={check.status} /></div>
          </div>
          <Notice tone="neutral">Recording a receipt documents a deposit that already happened. It does not move money or settle a partner share.</Notice>
          {error || localError ? <Notice tone="danger" title="Not saved">{localError || error}</Notice> : null}

          <FormSection title="Pay amounts">
            <Field label="Actual gross pay" required>
              <MoneyInput value={receipt.actualGross} onChange={set('actualGross')} />
            </Field>
            <Field label="Net deposited" required hint="The amount that actually reached the bank account.">
              <MoneyInput value={receipt.actualNet} onChange={set('actualNet')} />
            </Field>
            <Field label="Actual hours" optional>
              <AffixInput type="number" min="0" step="0.01" inputMode="decimal" suffix="hours" value={receipt.actualHours} onChange={set('actualHours')} />
            </Field>
          </FormSection>

          <FormSection title="Withholding & deductions" description="Enter every line from the paystub. Use 0 when a line shows no amount.">
            {RECEIPT_LINES.map((line) => (
              <Field key={line.key} label={line.label} required>
                <MoneyInput value={receipt[line.key]} onChange={set(line.key)} />
              </Field>
            ))}
            <div className="field--full"><Balance balance={balance} /></div>
          </FormSection>

          {correcting ? (
            <FormSection title="Correction" columns={1}>
              <Field label="Reason for correction" required hint="Kept in the audit history with the previous values.">
                <TextArea value={receipt.reason} onChange={set('reason')} rows={3} />
              </Field>
            </FormSection>
          ) : null}
        </form>
      ) : null}
    </Drawer>
  );
}
