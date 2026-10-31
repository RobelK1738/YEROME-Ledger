import { useEffect, useState } from 'react';
import { Drawer } from '../ui/Overlay.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, TextArea } from '../ui/Field.jsx';
import { Notice } from '../ui/Notice.jsx';
import { useMutation } from '../../hooks/useMutation.js';
import { saveProjectionPlan } from '../../lib/data/v2.js';

export function AllocationEditor({ open, person, onClose, onSaved }) {
  const [instructions, setInstructions] = useState('');
  const { run, busy, error, setError } = useMutation();
  useEffect(() => {
    if (open) {
      setInstructions(person?.allocationPlan?.instructions || '');
      setError('');
    }
  }, [open, person, setError]);
  function submit(event) {
    event.preventDefault();
    run(() => saveProjectionPlan({ ownerId: person.ownerId, action: 'allocation',
      nextFundDate: person?.allocationPlan?.nextFundDate || null, instructions }), {
      success: 'Instructions saved and visible to the owner.',
      onSuccess: async () => { await onSaved?.(); onClose(); },
    });
  }
  return <Drawer open={open} onClose={onClose} title="Allocation instructions" description={person?.displayName}
    footer={<><Button onClick={onClose} variant="secondary">Cancel</Button><Button type="submit" form="allocation-editor" loading={busy} variant="primary">Save instructions</Button></>}>
    <form id="allocation-editor" onSubmit={submit}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="Instructions for the owner" optional hint="For example: what to set aside, where to allocate funds, or how commissions should be handled.">
        <TextArea rows={6} maxLength={5000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </Field>
    </form>
  </Drawer>;
}
