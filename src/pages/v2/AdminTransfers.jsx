import { useState } from 'react';
import { postAdminTransfer } from '../../lib/data/v2.js';
import { dollarsToCents } from '../../lib/finance-v2/index.js';
import { formatCurrency } from '../../lib/formatting/money.js';
import { Card } from '../../components/ui/Card.jsx';

const empty = { recipientOwnerId: '', amount: '', paidAt: '', reference: '',
  sourceAccountAlias: '', destinationAccountAlias: '' };
export default function AdminTransfers({ people, transfers, busy, submit }) {
  const [record, setRecord] = useState(empty);
  const [reviewId, setReviewId] = useState('');
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const set = (key, value) => setRecord((state) => ({ ...state, [key]: value }));
  return <Card title="External transfers" subtitle="Register a single-recipient USD bank transfer, then verify it against external evidence before allocating it.">
    <p className="muted">Use private account aliases and a reference to securely retained proof. Do not enter account numbers, credentials or document contents. A bank batch spanning people needs separate per-recipient evidence and cannot be entered as one transfer.</p>
    <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(async () => {
      await postAdminTransfer({ ...record, action: 'register', totalCents: dollarsToCents(record.amount) });
      setRecord(empty);
    }, 'Transfer registered. Verify its external evidence before allocating it.'); }}>
      <label className="v2-field"><span>Actual recipient</span><select required value={record.recipientOwnerId}
        onChange={(event) => set('recipientOwnerId', event.target.value)}>
        <option value="">Choose recipient</option>{people.map((person) => <option key={person.ownerId}
          value={person.ownerId}>{person.displayName}</option>)}</select></label>
      {[
        ['amount', 'Total transfer amount (USD)', 'number'], ['paidAt', 'Actual transfer date', 'date'],
        ['reference', 'Bank transaction reference', 'text'],
        ['sourceAccountAlias', 'Bank/provider and source account alias', 'text'],
        ['destinationAccountAlias', 'Recipient destination account alias', 'text'],
      ].map(([key, label, type]) => <label className="v2-field" key={key}><span>{label}</span>
        <input required type={type} step={type === 'number' ? '0.01' : undefined}
          min={type === 'number' ? '0.01' : undefined} value={record[key]}
          onChange={(event) => set(key, event.target.value)} /></label>)}
      <button className="btn btn--secondary" disabled={busy}>Register transfer</button>
    </form>
    <ul className="v2-list">{transfers.map((transfer) => <li key={transfer.id}>
      <strong>{people.find((person) => person.ownerId === transfer.recipientOwnerId)?.displayName || 'Historical recipient needs review'}</strong>
      <p>{transfer.paidAt.slice(0, 10)} · {formatCurrency(transfer.totalCents)} · {transfer.currency || 'currency needs review'} · {transfer.reference}</p>
      <p>{transfer.sourceAccountAlias || 'Unknown source'} → {transfer.destinationAccountAlias || 'Unknown destination'} · {transfer.channel || 'channel needs review'}</p>
      <p>{transfer.status === 'verified' ? 'Verified against evidence' : transfer.status === 'registered' ? 'Registered — evidence not yet verified' : 'Historical evidence review required'} · allocated {formatCurrency(transfer.allocatedCents)} · available {formatCurrency(transfer.availableCents)}</p>
      {transfer.evidenceReference ? <p>Evidence reference: {transfer.evidenceReference}</p> : null}
      {transfer.status === 'registered' ? <button className="btn btn--ghost btn--sm" type="button"
        onClick={() => { setReviewId(transfer.id); setEvidence(''); setConfirmed(false); }}>Review evidence</button> : null}
      {reviewId === transfer.id && transfer.status === 'registered' ? <form className="v2-form"
        onSubmit={(event) => { event.preventDefault(); submit(async () => {
          await postAdminTransfer({ ...transfer, action: 'verify', transferId: transfer.id,
            evidenceReference: evidence, evidenceConfirmed: confirmed });
          setReviewId('');
        }, 'External evidence verification recorded. This transfer can fund only this recipient’s obligations.'); }}>
        <label className="v2-field"><span>Reference to retained transfer proof</span><input required value={evidence}
          onChange={(event) => setEvidence(event.target.value)} /></label>
        <label><input type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I checked the external proof: this recipient received this USD amount on this date, under this reference, from and to the account aliases shown.</label>
        <button className="btn btn--primary" disabled={busy || !confirmed}>Verify against evidence</button>
      </form> : null}
    </li>)}</ul>
  </Card>;
}
