import { JOB_STATUS, PAYCHECK_STATUS, PERSON_STATUS, TRANSFER_STATUS, statusMeta } from '../../lib/presentation/labels.js';

export function Badge({ children, tone = 'muted', dot = true, className = '' }) {
  return (
    <span className={`badge badge--${tone} ${className}`.trim()}>
      {dot ? <span className="badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const MAPS = { person: PERSON_STATUS, owner: PERSON_STATUS, job: JOB_STATUS, paycheck: PAYCHECK_STATUS, transfer: TRANSFER_STATUS };

export function StatusBadge({ status, kind = 'job' }) {
  const meta = statusMeta(MAPS[kind] || JOB_STATUS, status);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

const BASIS = {
  estimate: { label: 'Estimate', title: 'Planning estimate from current terms. Not a recorded transaction.' },
  recorded: { label: 'Recorded', title: 'Entered from a paystub, bank record or other evidence.' },
  scheduled: { label: 'Scheduled', title: 'An expected date. No money has been received.' },
  payment: { label: 'Payment recorded', title: 'An external payment recorded against an obligation. Recording does not move money.' },
  internal: { label: 'Admin only', title: 'Internal YEROME information. Never shown to US Persons.' },
  contractual: { label: 'Contractual', title: 'Calculated from the written agreement terms.' },
};

/** Labels what kind of financial figure a value is, so estimates never read as cash. */
export function BasisTag({ kind }) {
  const meta = BASIS[kind];
  if (!meta) return null;
  return <span className={`basis basis--${kind}`} title={meta.title}>{meta.label}</span>;
}
