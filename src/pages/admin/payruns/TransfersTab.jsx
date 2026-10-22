import { useEffect, useState } from 'react';
import { postAdminTransfer } from '../../../lib/data/v2.js';
import { dollarsToCents } from '../../../lib/finance-v2/index.js';
import { TRANSFER_STATUS } from '../../../lib/presentation/labels.js';
import { formatDate, matchesQuery, money, plural } from '../../../lib/presentation/format.js';
import { useMutation } from '../../../hooks/useMutation.js';
import { Card } from '../../../components/ui/Card.jsx';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { Checkbox, Field, FormSection, MoneyInput, Select, TextInput } from '../../../components/ui/Field.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { Drawer } from '../../../components/ui/Overlay.jsx';
import { DescriptionList } from '../../../components/ui/DescriptionList.jsx';
import { ErrorState } from '../../../components/ui/ErrorState.jsx';
import { FilterBar, FilterSelect, SearchInput } from '../../../components/ui/Toolbar.jsx';
import { usePayRuns } from './PayRuns.jsx';
import { SectionIntro } from './shared.jsx';

const EMPTY = { recipientOwnerId: '', amount: '', paidAt: '', reference: '', sourceAccountAlias: '', destinationAccountAlias: '' };
const REGISTER_FORM = 'register-transfer-form';
const VERIFY_FORM = 'verify-transfer-form';

function RegisterDrawer({ open, people, onClose, onSaved }) {
  const [record, setRecord] = useState(EMPTY);
  const { run, busy, error, setError } = useMutation();
  useEffect(() => { if (open) { setRecord(EMPTY); setError(''); } }, [open, setError]);
  const set = (key) => (event) => { const { value } = event.target; setRecord((state) => ({ ...state, [key]: value })); };
  function submit(event) {
    event.preventDefault();
    run(() => postAdminTransfer({ ...record, action: 'register', totalCents: dollarsToCents(record.amount) }), {
      success: 'Transfer registered. Verify its external evidence before allocating it.',
      onSuccess: async () => { await onSaved(); onClose(); },
    });
  }
  return (
    <Drawer open={open} onClose={onClose} title="Register an external transfer"
      description="Record a single-recipient USD bank transfer that has already been made outside YEROME Ledger."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={REGISTER_FORM} variant="primary" loading={busy}>Register transfer</Button>
      </>}>
      <form id={REGISTER_FORM} onSubmit={submit}>
        <Notice tone="warn" title="Keep sensitive data out">Use private account aliases and a reference to securely retained proof. Never enter account numbers, credentials or document contents. A bank batch spanning several people needs separate per-recipient evidence.</Notice>
        {error ? <Notice tone="danger" title="Not registered">{error}</Notice> : null}
        <FormSection title="Transfer" columns={2}>
          <Field label="Actual recipient" required full>
            <Select value={record.recipientOwnerId} placeholder="Choose recipient" onChange={set('recipientOwnerId')}
              options={people.map((person) => ({ value: person.ownerId, label: person.displayName }))} />
          </Field>
          <Field label="Total amount" required hint="USD">
            <MoneyInput min="0.01" value={record.amount} onChange={set('amount')} />
          </Field>
          <Field label="Date the transfer was made" required>
            <TextInput type="date" value={record.paidAt} onChange={set('paidAt')} />
          </Field>
          <Field label="Bank transaction reference" required full>
            <TextInput value={record.reference} onChange={set('reference')} autoComplete="off" />
          </Field>
        </FormSection>
        <FormSection title="Accounts (aliases only)" columns={1}>
          <Field label="Bank/provider and source account alias" required hint="e.g. “Chase operating ••12”. No full account numbers.">
            <TextInput value={record.sourceAccountAlias} onChange={set('sourceAccountAlias')} autoComplete="off" />
          </Field>
          <Field label="Recipient destination account alias" required>
            <TextInput value={record.destinationAccountAlias} onChange={set('destinationAccountAlias')} autoComplete="off" />
          </Field>
        </FormSection>
      </form>
    </Drawer>
  );
}

function VerifyDrawer({ transfer, recipientName, onClose, onSaved }) {
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const { run, busy, error, setError } = useMutation();
  useEffect(() => { if (transfer) { setEvidence(''); setConfirmed(false); setError(''); } }, [transfer, setError]);
  function submit(event) {
    event.preventDefault();
    run(() => postAdminTransfer({ ...transfer, action: 'verify', transferId: transfer.id, evidenceReference: evidence, evidenceConfirmed: confirmed }), {
      success: 'Evidence verification recorded. This transfer can fund only this recipient’s obligations.',
      onSuccess: async () => { await onSaved(); onClose(); },
    });
  }
  return (
    <Drawer open={Boolean(transfer)} onClose={onClose} title="Verify transfer evidence"
      description="Compare the retained proof with every detail below before confirming."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={VERIFY_FORM} variant="primary" loading={busy} disabled={!confirmed}>Verify against evidence</Button>
      </>}>
      {transfer ? (
        <form id={VERIFY_FORM} onSubmit={submit}>
          {error ? <Notice tone="danger" title="Not verified">{error}</Notice> : null}
          <DescriptionList items={[
            { label: 'Recipient', value: recipientName },
            { label: 'Amount', value: `${money(transfer.totalCents)} ${transfer.currency || ''}`.trim() },
            { label: 'Date', value: formatDate(transfer.paidAt.slice(0, 10)) },
            { label: 'Reference', value: transfer.reference },
            { label: 'From → to', value: `${transfer.sourceAccountAlias || 'Unknown source'} → ${transfer.destinationAccountAlias || 'Unknown destination'}` },
          ]} />
          <FormSection columns={1}>
            <Field label="Reference to retained transfer proof" required hint="Where the bank confirmation is stored — not the document itself.">
              <TextInput value={evidence} onChange={(e) => setEvidence(e.target.value)} autoComplete="off" />
            </Field>
            <Checkbox required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
              label="I checked the external proof"
              description="This recipient received this USD amount on this date, under this reference, from and to the account aliases shown." />
          </FormSection>
        </form>
      ) : null}
    </Drawer>
  );
}

export default function TransfersTab() {
  const { people, transfers, transfersState, refreshAll } = usePayRuns();
  const [registering, setRegistering] = useState(false);
  const [verifying, setVerifying] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const current = people.filter((person) => person.personStatus !== 'archived');
  const nameFor = (id) => people.find((person) => person.ownerId === id)?.displayName || 'Historical recipient needs review';
  const rows = transfers.filter((row) => (!status || row.status === status) &&
    matchesQuery(query, nameFor(row.recipientOwnerId), row.reference, row.sourceAccountAlias, row.destinationAccountAlias));

  const columns = [
    { key: 'recipient', header: 'Recipient', mobile: 'title', render: (row) => (
      <div className="cell-stack"><span className="cell-title">{nameFor(row.recipientOwnerId)}</span>
        <span className="cell-sub">{row.reference}</span></div>
    ), renderMobile: (row) => nameFor(row.recipientOwnerId) },
    { key: 'date', header: 'Sent', mobile: 'meta', render: (row) => formatDate(row.paidAt.slice(0, 10)) },
    { key: 'accounts', header: 'From → to', hideOnMobile: true, secondary: true, render: (row) => (
      <span className="text-sm">{row.sourceAccountAlias || 'Unknown source'} → {row.destinationAccountAlias || 'Unknown destination'}</span>
    ) },
    { key: 'status', header: 'Evidence', mobile: 'badge', render: (row) => (
      <div className="cell-stack"><StatusBadge kind="transfer" status={row.status} />
        {row.evidenceReference ? <span className="cell-sub truncate" title={row.evidenceReference}>Proof: {row.evidenceReference}</span> : null}</div>
    ), renderMobile: (row) => <StatusBadge kind="transfer" status={row.status} /> },
    { key: 'amount', header: 'Amount', align: 'right', mobile: 'amount', render: (row) => <span className="num">{money(row.totalCents)}</span>,
      renderMobile: (row) => money(row.totalCents) },
    { key: 'available', header: 'Allocated', align: 'right', mobile: 'meta', render: (row) => (
      <div className="cell-stack cell-stack--end"><span className="num">{money(row.allocatedCents)}</span><span className="cell-sub num">{money(row.availableCents)} available</span></div>
    ), renderMobile: (row) => `${money(row.availableCents)} available` },
    { key: 'actions', header: '', mobile: 'actions', render: (row) => row.status === 'registered'
      ? <Button size="sm" variant="primary" icon="shield" onClick={() => setVerifying(row)} aria-label={`Verify evidence for ${row.reference}`}>Verify</Button>
      : null },
  ];

  return <>
    <SectionIntro title="External transfer records"
      actions={<Button variant="primary" icon="plus" onClick={() => setRegistering(true)}>Register transfer</Button>}>
      Transfers are bank payments that already happened outside YEROME Ledger. Register one, verify it against retained proof,
      then allocate it to a settlement or commission. Registering or verifying never initiates a payment.
    </SectionIntro>
    {transfersState.error ? <ErrorState compact error={transfersState.error} onRetry={transfersState.refresh} /> : <>
      <FilterBar summary={plural(rows.length, 'transfer')}>
        <SearchInput value={query} onChange={setQuery} label="Search transfers" placeholder="Recipient, reference or account alias" />
        <FilterSelect label="Evidence" value={status} onChange={setStatus}
          options={Object.entries(TRANSFER_STATUS).map(([value, meta]) => ({ value, label: meta.label }))} />
      </FilterBar>
      <Card padded={false}>
        <DataTable label="Transfers" columns={columns} rows={rows}
          emptyIcon="transfer" emptyTitle={transfers.length ? 'No matching transfers' : 'No transfers recorded'}
          emptyMessage={transfers.length ? 'Adjust the search or filter.' : 'Register a transfer after money has been sent to a US Person outside YEROME Ledger.'} />
      </Card>
    </>}
    <RegisterDrawer open={registering} people={current} onClose={() => setRegistering(false)} onSaved={refreshAll} />
    <VerifyDrawer transfer={verifying} recipientName={verifying ? nameFor(verifying.recipientOwnerId) : ''}
      onClose={() => setVerifying(null)} onSaved={refreshAll} />
  </>;
}
