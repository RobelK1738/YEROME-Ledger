import { useEffect, useState } from 'react';
import { saveAdminPerson } from '../../../lib/data/v2.js';
import { agreementFormFor, agreementPayload } from '../../../lib/presentation/forms.js';
import { PARTNERSHIP_OPTIONS } from '../../../lib/presentation/labels.js';
import { todayISO } from '../../../lib/presentation/format.js';
import { useMutation } from '../../../hooks/useMutation.js';
import { Drawer } from '../../../components/ui/Overlay.jsx';
import { Checkbox, ChoiceGroup, Field, FormSection, MoneyInput, TextInput } from '../../../components/ui/Field.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';
import { BasisTag } from '../../../components/ui/Badge.jsx';

const FORM_ID = 'agreement-form';

/** Records a new, prospective agreement version for one US Person. */
export function AgreementDrawer({ open, person, onClose, onSaved }) {
  const [form, setForm] = useState(() => agreementFormFor(person, todayISO()));
  const [referenceError, setReferenceError] = useState('');
  const { run, busy, error, setError } = useMutation();

  useEffect(() => {
    if (open) { setForm(agreementFormFor(person, todayISO())); setReferenceError(''); setError(''); }
  }, [open, person, setError]);

  const set = (key, value) => setForm((state) => ({ ...state, [key]: value }));

  function submit(event) {
    event.preventDefault();
    if (form.agreementVerified && !form.agreementReference.trim()) {
      setReferenceError('Enter the agreement reference to mark it verified.');
      document.getElementById('agreement-reference')?.focus();
      return;
    }
    run(() => saveAdminPerson(agreementPayload(form)), {
      success: 'Agreement version saved. The previous version is preserved.',
      onSuccess: async () => { await onSaved?.(); onClose(); },
    });
  }

  return (
    <Drawer open={open} onClose={onClose} title="Record agreement version"
      description={person ? `${person.displayName} · changes are prospective and keep the previous version in history.` : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={FORM_ID} variant="primary" loading={busy}>Save new version</Button>
      </>}>
      <form id={FORM_ID} onSubmit={submit} noValidate>
        {error ? <Notice tone="danger" title="Not saved">{error}</Notice> : null}
        <FormSection title="Partnership" columns={1}>
          <ChoiceGroup label="Partnership model" layout="cards" options={PARTNERSHIP_OPTIONS} value={form.partnership}
            onChange={(value) => set('partnership', value)} required />
        </FormSection>
        <FormSection title="Signed agreement" columns={1}>
          <Field label="Agreement reference" id="agreement-reference" required={form.agreementVerified}
            optional={!form.agreementVerified} error={referenceError}
            hint="Where the signed copy is filed. Required to mark the agreement verified.">
            <TextInput value={form.agreementReference} onChange={(e) => { set('agreementReference', e.target.value); setReferenceError(''); }} />
          </Field>
          <Checkbox checked={form.agreementVerified} onChange={(e) => set('agreementVerified', e.target.checked)}
            label="I verified the signed agreement"
            description="Estimates are shown only while a verified agreement is in effect." />
        </FormSection>
        <FormSection title="Apartment" description="One apartment per US Person, charged monthly.">
          <Field label={<>Agreed apartment charge <BasisTag kind="contractual" /></>} required
            hint="Commercial charge under the agreement. The US Person sees this amount.">
            <MoneyInput suffix="/ month" value={form.quotedMonthly} onChange={(e) => set('quotedMonthly', e.target.value)} />
          </Field>
          <Field label={<>Actual apartment spending <BasisTag kind="internal" /></>} required
            hint="YEROME’s real cost. Never shown to the US Person.">
            <MoneyInput suffix="/ month" value={form.actualMonthly} onChange={(e) => set('actualMonthly', e.target.value)} />
          </Field>
        </FormSection>
        <FormSection title="Timing" columns={1}>
          <Field label="Effective from" required hint="Defaults to the day after the current version starts or today, whichever is later.">
            <TextInput type="date" value={form.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} />
          </Field>
        </FormSection>
      </form>
    </Drawer>
  );
}
