import { Link } from 'react-router-dom';
import { formatDate, money } from '../../../lib/presentation/format.js';
import { Field, Select } from '../../../components/ui/Field.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';

/** Verified transfers to this recipient that still have unallocated funds. */
export function verifiedTransfersFor(transfers, recipientOwnerId) {
  return transfers.filter((row) => row.status === 'verified' && row.recipientOwnerId === recipientOwnerId && row.availableCents > 0);
}

export function TransferSelect({ transfers, recipientOwnerId, value, onChange }) {
  const options = verifiedTransfersFor(transfers, recipientOwnerId);
  if (!recipientOwnerId) return null;
  if (!options.length) {
    return (
      <Notice tone="warn" title="No verified transfer available">
        There is no evidence-verified transfer to this recipient with funds left to allocate.{' '}
        <Link to="/admin/pay-runs/transfers">Register and verify the transfer</Link> first.
      </Notice>
    );
  }
  return (
    <Field label="Verified transfer to this recipient" required
      hint="Only transfers already verified against external evidence can be allocated.">
      <Select value={value} placeholder="Choose a verified transfer" onChange={(e) => onChange(e.target.value)}
        options={options.map((row) => ({ value: row.id,
          label: `${formatDate(row.paidAt.slice(0, 10))} · ${row.reference} · ${money(row.availableCents)} available` }))} />
    </Field>
  );
}

export function SectionIntro({ title, children, actions }) {
  return (
    <div className="section-intro">
      <div className="section-intro__text">
        <h2 className="section-intro__title">{title}</h2>
        {children ? <p className="section-intro__body">{children}</p> : null}
      </div>
      {actions ? <div className="section-intro__actions">{actions}</div> : null}
    </div>
  );
}
