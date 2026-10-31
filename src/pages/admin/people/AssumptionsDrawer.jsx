import { useEffect, useState } from 'react';
import { Drawer } from '../../../components/ui/Overlay.jsx';
import { Field, FormSection, ChoiceGroup, MoneyInput } from '../../../components/ui/Field.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';
import { PARTNERSHIP_OPTIONS } from '../../../lib/presentation/labels.js';
import { saveProjectionPlan } from '../../../lib/data/v2.js';
import { dollarsToCents } from '../../../lib/finance-v2/index.js';
import { useMutation } from '../../../hooks/useMutation.js';

function initial(person) {
  return { partnership: person?.partnership || 'DIRECT_2_WAY',
    actual: String((person?.apartmentActualMonthlyCents ?? 65000) / 100),
    charge: String((person?.apartmentQuotedMonthlyCents ?? 90000) / 100) };
}
export function AssumptionsDrawer({ open, person, onClose, onSaved }) {
  const [form, setForm] = useState(() => initial(person));
  const { run, busy, error, setError } = useMutation();
  useEffect(() => { if (open) { setForm(initial(person)); setError(''); } }, [open, person, setError]);
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  function submit(event) {
    event.preventDefault();
    let input;
    try { input = { ownerId: person.ownerId, action: 'assumptions', partnership: form.partnership,
      actualMonthlyCents: dollarsToCents(form.actual), quotedMonthlyCents: dollarsToCents(form.charge) }; }
    catch { setError('Enter valid monthly amounts.'); return; }
    run(() => saveProjectionPlan(input), { success: 'Planning assumptions updated.',
      onSuccess: async () => { await onSaved?.(); onClose(); } });
  }
  return <Drawer open={open} onClose={onClose} title="Planning assumptions" description={person?.displayName}
    footer={<><Button onClick={onClose} variant="secondary">Cancel</Button><Button type="submit" form="assumptions-form" variant="primary" loading={busy}>Save assumptions</Button></>}>
    <form id="assumptions-form" onSubmit={submit}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <FormSection title="Partnership" columns={1}><ChoiceGroup label="Partnership model" layout="cards" options={PARTNERSHIP_OPTIONS} value={form.partnership} onChange={(value) => set('partnership', value)} /></FormSection>
      <FormSection title="Monthly apartment amounts" columns={1} description="One apartment per owner, regardless of job count.">
        <Field label="Apartment charge" hint="Used to calculate the owner’s split." required><MoneyInput value={form.charge} onChange={(e) => set('charge', e.target.value)} /></Field>
        <Field label="Actual apartment cost" hint="Admin-only spending used to calculate YEROME profit." required><MoneyInput value={form.actual} onChange={(e) => set('actual', e.target.value)} /></Field>
      </FormSection>
      <p className="footnote">Saving updates the current projection immediately. Existing historical finance records remain intact.</p>
    </form>
  </Drawer>;
}
