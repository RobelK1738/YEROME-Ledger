import { useEffect, useState } from 'react';
import { postAdminCommission } from '../../../lib/data/v2.js';
import { dollarsToCents } from '../../../lib/finance-v2/index.js';
import { paymentKey } from '../../../lib/presentation/forms.js';
import { formatMonth, money } from '../../../lib/presentation/format.js';
import { useMutation } from '../../../hooks/useMutation.js';
import { Card } from '../../../components/ui/Card.jsx';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { Field, FormActions, FormSection, MoneyInput, Select, TextInput } from '../../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../../components/ui/Button.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Drawer } from '../../../components/ui/Overlay.jsx';
import { ErrorState } from '../../../components/ui/ErrorState.jsx';
import { usePayRuns } from './PayRuns.jsx';
import { SectionIntro, TransferSelect } from './shared.jsx';

const PAYMENT_FORM = 'commission-payment-form';
const lastCompletedMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
};

function PaymentDrawer({ accrual, referral, transfers, onClose, onSaved }) {
  const [payment, setPayment] = useState({ amount: '', transferId: '' });
  const { run, busy, error, setError } = useMutation();
  useEffect(() => { if (accrual) { setPayment({ amount: '', transferId: '' }); setError(''); } }, [accrual, setError]);
  function submit(event) {
    event.preventDefault();
    run(() => postAdminCommission({ action: 'payment', accrualId: accrual.id, amountCents: dollarsToCents(payment.amount),
      transferId: payment.transferId, idempotencyKey: paymentKey('commission', accrual.id, payment.transferId) }), {
      success: 'External commission payment recorded.',
      onSuccess: async () => { await onSaved(); onClose(); },
    });
  }
  return (
    <Drawer open={Boolean(accrual)} onClose={onClose} title="Record commission payment"
      description={accrual ? `${referral?.referrerName || 'Referrer'} · ${formatMonth(accrual.calendarMonth)} · ${money(accrual.owedCents)} owed` : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={PAYMENT_FORM} variant="primary" loading={busy} disabled={!payment.transferId}>Record payment</Button>
      </>}>
      {accrual ? (
        <form id={PAYMENT_FORM} onSubmit={submit}>
          <Notice tone="neutral">Records that a verified transfer to the referrer paid this accrual. It does not send money.</Notice>
          {error ? <Notice tone="danger" title="Not recorded">{error}</Notice> : null}
          <FormSection columns={1}>
            <Field label="Amount allocated to this accrual" required>
              <MoneyInput min="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
            </Field>
            <TransferSelect transfers={transfers} recipientOwnerId={referral?.referrerOwnerId} value={payment.transferId}
              onChange={(transferId) => setPayment({ ...payment, transferId })} />
          </FormSection>
        </form>
      ) : null}
    </Drawer>
  );
}

export default function CommissionsTab() {
  const { commissions, commissionsState, transfers, refreshAll } = usePayRuns();
  const [accrual, setAccrual] = useState({ referralId: '', month: lastCompletedMonth() });
  const [paying, setPaying] = useState(null);
  const { run, busy, error } = useMutation();
  const referrals = commissions.referrals || [];
  const accruals = commissions.accruals || [];
  const eligible = referrals.filter((row) => !row.needsContractReview);
  const referralFor = (id) => referrals.find((row) => row.id === id);

  function accrue(event) {
    event.preventDefault();
    run(() => postAdminCommission({ action: 'accrue', referralId: accrual.referralId, calendarMonth: `${accrual.month}-01` }), {
      success: 'Full-month commission accrued.', onSuccess: refreshAll,
    });
  }

  const columns = [
    { key: 'month', header: 'Month', mobile: 'title', render: (row) => formatMonth(row.calendarMonth) },
    { key: 'referral', header: 'Referral', mobile: 'meta', render: (row) => {
      const referral = referralFor(row.referralId);
      return referral ? `${referral.referrerName} → ${referral.referredName}` : 'Referral';
    } },
    { key: 'jobs', header: 'Eligible jobs', align: 'right', mobile: 'meta', render: (row) => row.eligibleJobCount,
      renderMobile: (row) => `${row.eligibleJobCount} eligible jobs` },
    { key: 'accrued', header: 'Accrued', align: 'right', mobile: 'amount', render: (row) => <span className="num">{money(row.accruedCents)}</span>,
      renderMobile: (row) => money(row.accruedCents) },
    { key: 'paid', header: 'Payments recorded', align: 'right', hideOnMobile: true, secondary: true, render: (row) => <span className="num">{money(row.paidCents)}</span> },
    { key: 'owed', header: 'Owed', align: 'right', mobile: 'badge', render: (row) => row.owedCents > 0
      ? <Badge tone="warn" dot={false}>{money(row.owedCents)}</Badge> : <Badge tone="ok" dot={false}>Settled</Badge> },
    { key: 'actions', header: '', mobile: 'actions', render: (row) => <>
      {row.unverifiedPaidCents > 0 ? <Badge tone="danger">Payment needs evidence review</Badge> : null}
      {row.owedCents > 0 ? <Button size="sm" variant="secondary" onClick={() => setPaying(row)}>Record payment</Button> : null}
    </> },
  ];

  return <>
    <SectionIntro title="Referral commissions">
      Accrue only completed full calendar months: $200 per eligible active referred job. An accrual is an amount owed;
      record a payment only after a verified transfer to the referrer.
    </SectionIntro>
    {commissionsState.error ? <ErrorState compact error={commissionsState.error} onRetry={commissionsState.refresh} /> : <>
      <Card title="Post a full-month accrual" icon="plus" subtitle="Choose a verified referral and a calendar month that has ended.">
        <form onSubmit={accrue}>
          {error ? <Notice tone="danger" title="Not posted">{error}</Notice> : null}
          <FormSection columns={3}>
            <Field label="Verified referral" required>
              <Select value={accrual.referralId} placeholder="Choose referral" onChange={(e) => setAccrual({ ...accrual, referralId: e.target.value })}
                options={eligible.map((row) => ({ value: row.id,
                  label: `${row.referrerName} → ${row.referredName}${row.relationshipCurrent ? '' : ' · historical or scheduled'}` }))} />
            </Field>
            <Field label="Completed calendar month" required>
              <TextInput type="month" max={lastCompletedMonth()} value={accrual.month} onChange={(e) => setAccrual({ ...accrual, month: e.target.value })} />
            </Field>
            <FormActions align="start">
              <Button type="submit" variant="primary" loading={busy}>Post accrual</Button>
            </FormActions>
          </FormSection>
        </form>
      </Card>
      <Card title="Accruals" icon="coins" padded={false} subtitle="Posted full-month accruals and recorded payments.">
        <DataTable label="Commission accruals" columns={columns} rows={accruals}
          emptyIcon="coins" emptyTitle="No accruals posted"
          emptyMessage={eligible.length ? 'Post the first completed month using the form above.' : 'Record a referral first, then accrue completed months here.'}
          emptyAction={eligible.length ? null : <ButtonLink to="/admin/people/referrals" size="sm">Manage referrals</ButtonLink>} />
      </Card>
    </>}
    <PaymentDrawer accrual={paying} referral={paying ? referralFor(paying.referralId) : null} transfers={transfers}
      onClose={() => setPaying(null)} onSaved={refreshAll} />
  </>;
}
