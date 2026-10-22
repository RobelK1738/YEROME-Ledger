import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAdminSettlements, postAdminSettlement } from '../../../lib/data/v2.js';
import { dollarsToCents } from '../../../lib/finance-v2/index.js';
import { paymentKey } from '../../../lib/presentation/forms.js';
import { formatDate, formatMonth, money, todayISO } from '../../../lib/presentation/format.js';
import { useMutation } from '../../../hooks/useMutation.js';
import { Card } from '../../../components/ui/Card.jsx';
import { DescriptionList } from '../../../components/ui/DescriptionList.jsx';
import { Field, FormActions, FormSection, MoneyInput, Select, TextInput } from '../../../components/ui/Field.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';
import { Badge, BasisTag } from '../../../components/ui/Badge.jsx';
import { Drawer } from '../../../components/ui/Overlay.jsx';
import { Loading } from '../../../components/ui/Loading.jsx';
import { ErrorState, friendlyMessage } from '../../../components/ui/ErrorState.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { useConfirm } from '../../../components/ui/Feedback.jsx';
import { usePayRuns } from './PayRuns.jsx';
import { SectionIntro, TransferSelect } from './shared.jsx';

const LEDGER_ROWS = [
  ['Receipt net basis', 'sourceNetCents'], ['Agreed charges', 'quotedCostCents'],
  ['YEROME actual cost', 'actualCostCents'], ['Partner due', 'partnerDueCents'],
  ['Referral commission', 'commissionCents'], ['Gang Cut', 'gangCutCents'],
  ['YEROME residual', 'yeromeResidualCents'],
];
const PAYMENT_FORM = 'partner-payment-form';
const lastCompletedMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
};

function PaymentDrawer({ row, ownerId, month, transfers, onClose, onSaved }) {
  const [payment, setPayment] = useState({ amount: '', transferId: '' });
  const { run, busy, error, setError } = useMutation();
  useEffect(() => { if (row) { setPayment({ amount: '', transferId: '' }); setError(''); } }, [row, setError]);
  function submit(event) {
    event.preventDefault();
    run(() => postAdminSettlement({ action: 'payment', ownerId, calendarMonth: `${month}-01`, settlementId: row.settlementId,
      amountCents: dollarsToCents(payment.amount), transferId: payment.transferId,
      idempotencyKey: paymentKey('partner', row.settlementId, payment.transferId) }), {
      success: 'External partner payment recorded.',
      onSuccess: async () => { await onSaved(); onClose(); },
    });
  }
  return (
    <Drawer open={Boolean(row)} onClose={onClose} title="Record partner payment"
      description={row ? `Paycheck dated ${formatDate(row.payDate)} · ${money(row.owedCents)} outstanding` : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={PAYMENT_FORM} variant="primary" loading={busy} disabled={!payment.transferId}>Record payment</Button>
      </>}>
      {row ? (
        <form id={PAYMENT_FORM} onSubmit={submit}>
          <Notice tone="neutral">This records that a verified external transfer paid part or all of this person’s contractual share. It does not send money.</Notice>
          {error ? <Notice tone="danger" title="Not recorded">{error}</Notice> : null}
          <FormSection columns={1}>
            <Field label="Amount allocated to this paycheck" required>
              <MoneyInput min="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
            </Field>
            <TransferSelect transfers={transfers} recipientOwnerId={ownerId} value={payment.transferId}
              onChange={(transferId) => setPayment({ ...payment, transferId })} />
          </FormSection>
        </form>
      ) : null}
    </Drawer>
  );
}

function PostedSettlement({ row, busy, onPay, onReconcile }) {
  return (
    <li className="ledger-item">
      <div className="ledger-item__head">
        <div>
          <p className="ledger-item__title">Paycheck dated {formatDate(row.payDate)}</p>
          <div className="badge-row">
            {row.owedCents > 0 ? <Badge tone="warn">{money(row.owedCents)} outstanding</Badge> : <Badge tone="ok">Fully recorded</Badge>}
            {row.unverifiedPaidCents > 0 ? <Badge tone="danger">Historical payment needs evidence review</Badge> : null}
            {row.overpaidCents ? <Badge tone="danger">Over by {money(row.overpaidCents)}</Badge> : null}
          </div>
        </div>
        <div className="btn-group">
          {row.owedCents > 0 ? <Button size="sm" variant="secondary" onClick={() => onPay(row)}>Record payment</Button> : null}
          {row.pendingCorrections?.map((correction) => (
            <Button key={correction.id} size="sm" variant="ghost" disabled={busy} onClick={() => onReconcile(row, correction)}>
              Reconcile correction #{correction.sequence}
            </Button>
          ))}
        </div>
      </div>
      <div className="ledger-item__figures">
        <div><span className="figure__label">Partner due <BasisTag kind="contractual" /></span><span className="figure__value">{money(row.partnerDueCents)}</span></div>
        <div><span className="figure__label">Payments recorded <BasisTag kind="payment" /></span><span className="figure__value">{money(row.paidCents)}</span></div>
        <div><span className="figure__label">Outstanding</span><span className="figure__value">{money(row.owedCents)}</span></div>
      </div>
      {row.unverifiedPaidCents > 0 ? <p className="footnote">Recorded balances are preserved. Do not send replacement funds automatically.</p> : null}
      {row.overpaidCents ? <p className="footnote">Recorded amount exceeds the revised due. A credit or recovery review is required.</p> : null}
      {row.pendingCorrections?.length ? <p className="footnote">Corrections reconcile in order. If the revised due falls below a recorded payment, posting stops for a signed credit or recovery decision.</p> : null}
      <details className="disclosure">
        <summary>Original, changes and current totals</summary>
        <div className="table-wrap">
          <table className="mini-table">
            <thead><tr><th scope="col">Line</th><th scope="col" className="ta-right">Original</th><th scope="col" className="ta-right">Changes</th><th scope="col" className="ta-right">Current</th></tr></thead>
            <tbody>
              {LEDGER_ROWS.map(([label, key]) => (
                <tr key={key}><th scope="row">{label}</th><td className="ta-right num">{money(row.original[key])}</td>
                  <td className="ta-right num">{money(row.changes[key])}</td><td className="ta-right num">{money(row[key])}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </li>
  );
}

export default function SettlementsTab() {
  const { people, transfers, refreshAll } = usePayRuns();
  const [searchParams, setSearchParams] = useSearchParams();
  const ownerId = searchParams.get('person') || '';
  const month = searchParams.get('month') || '';
  const [draft, setDraft] = useState({ ownerId, month: month || lastCompletedMonth() });
  const [state, setState] = useState({ loading: false, error: null, data: null });
  const [paying, setPaying] = useState(null);
  const confirm = useConfirm();
  const { run, busy, error } = useMutation();

  const load = useCallback(async () => {
    if (!ownerId || !month) { setState({ loading: false, error: null, data: null }); return; }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try { setState({ loading: false, error: null, data: await getAdminSettlements(ownerId, `${month}-01`) }); }
    catch (caught) { setState({ loading: false, error: caught, data: null }); }
  }, [ownerId, month]);
  useEffect(() => { load(); }, [load]);

  const current = people.filter((person) => person.personStatus !== 'archived');
  const person = people.find((item) => item.ownerId === ownerId);
  const data = state.data;

  function review(event) {
    event.preventDefault();
    setSearchParams({ person: draft.ownerId, month: draft.month });
  }

  async function post() {
    if (!await confirm({ title: `Post ${formatMonth(month)} for ${person?.displayName}?`, confirmLabel: 'Post month',
      message: <p>This creates immutable settlement records from the month’s recorded receipts. It records obligations only — it does not send money.</p> })) return;
    await run(async () => {
      await postAdminSettlement({ action: 'post', ownerId, calendarMonth: `${month}-01`, idempotencyKey: `v2-${ownerId}-${month}` });
      await load();
    }, { success: 'Contractual month posted with immutable receipt snapshots.' });
  }

  async function reconcile(row, correction) {
    await run(async () => {
      await postAdminSettlement({ action: 'reconcile', ownerId, calendarMonth: `${month}-01`, settlementId: row.settlementId,
        receiptCorrectionId: correction.id, idempotencyKey: `receipt-reconcile-${correction.id}` });
      await load();
    }, { success: 'Receipt correction reconciled across the posted month.' });
  }

  const proposal = data?.proposal;

  return <>
    <SectionIntro title="Contractual settlements">
      A settlement turns a completed month of recorded receipts into each party’s contractual share. Posting needs a signed,
      enabled settlement policy for that person; none is enabled by default. Posting records obligations — it never sends money.
    </SectionIntro>
    <Card title="Review a completed month" icon="scale">
      <form onSubmit={review}>
        <FormSection columns={3}>
          <Field label="US Person" required>
            <Select value={draft.ownerId} placeholder="Choose a person" onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}
              options={current.map((item) => ({ value: item.ownerId, label: item.displayName }))} />
          </Field>
          <Field label="Completed calendar month" required>
            <TextInput type="month" max={lastCompletedMonth()} value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} />
          </Field>
          <FormActions align="start">
            <Button type="submit" variant="secondary" icon="search">Review month</Button>
          </FormActions>
        </FormSection>
      </form>
    </Card>

    {error ? <Notice tone="danger" title="Not completed">{error}</Notice> : null}
    {!ownerId || !month ? (
      <Card><EmptyState compact icon="scale" title="Choose a person and month" message="The review shows whether the month can be posted and what each party’s contractual share would be." /></Card>
    ) : state.loading ? <Card><Loading label="Reviewing month…" /></Card>
      : state.error ? <Card><ErrorState compact error={friendlyMessage(state.error)} onRetry={load} /></Card> : data ? <>
      <Card title={`${person?.displayName || 'US Person'} · ${formatMonth(month)}`} icon="file"
        subtitle={data.policyApproved ? 'Settlement policy enabled for this month.' : 'No enabled settlement policy for this month.'}
        actions={data.policyApproved ? <Badge tone="ok">Policy enabled</Badge> : <Badge tone="warn">Policy not enabled</Badge>}>
        {data.reviewReason ? <Notice tone="warn" title="Not ready to post">{data.reviewReason}</Notice> : null}
        {proposal ? <>
          <DescriptionList items={[
            { label: 'Receipt net basis', value: money(proposal.afterTaxCents), basis: 'recorded' },
            { label: 'Agreed charges', value: money(proposal.quotedCostCents), basis: 'contractual' },
            { label: 'Contractual partner share', value: money(proposal.partnerDueCents), emphasis: true },
            { label: 'Internal actual cost', value: money(proposal.actualCostCents), basis: 'internal' },
            { label: 'Referral commission', value: money(proposal.commissionCents), basis: 'internal' },
            { label: 'Gang Cut', value: money(proposal.gangCutCents), basis: 'internal' },
            { label: 'YEROME residual', value: money(proposal.yeromeResidualCents), total: true },
          ]} />
          <FormActions>
            {!data.policyApproved ? <span className="muted text-sm">Posting is blocked until a signed settlement policy is enabled.</span> : null}
            <Button variant="primary" icon="check" loading={busy} disabled={!data.policyApproved} onClick={post}>Post reviewed month</Button>
          </FormActions>
        </> : null}
      </Card>
      <Card title="Posted paychecks this month" icon="receipt" padded={false}>
        {data.settlements?.length ? (
          <ul className="ledger-list">
            {data.settlements.map((row) => <PostedSettlement key={row.settlementId} row={row} busy={busy} onPay={setPaying} onReconcile={reconcile} />)}
          </ul>
        ) : <EmptyState compact icon="receipt" title="Nothing posted for this month" message="Posted settlements and recorded partner payments appear here." />}
      </Card>
    </> : null}

    <PaymentDrawer row={paying} ownerId={ownerId} month={month} transfers={transfers} onClose={() => setPaying(null)}
      onSaved={async () => { await load(); await refreshAll(); }} />
  </>;
}
