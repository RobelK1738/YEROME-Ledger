import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsync } from '../../../hooks/useAsync.js';
import { useMutation } from '../../../hooks/useMutation.js';
import { endAdminReferral, getAdminCommissions, getAdminOverview, saveAdminReferral } from '../../../lib/data/v2.js';
import { emptyReferralForm } from '../../../lib/presentation/forms.js';
import { formatDate, todayISO } from '../../../lib/presentation/format.js';
import { PageHeader } from '../../../components/ui/PageHeader.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { PageSkeleton } from '../../../components/ui/Loading.jsx';
import { ErrorState } from '../../../components/ui/ErrorState.jsx';
import { Badge } from '../../../components/ui/Badge.jsx';
import { Button, ButtonGroup } from '../../../components/ui/Button.jsx';
import { Drawer } from '../../../components/ui/Overlay.jsx';
import { Field, FormSection, Select, Switch, TextInput } from '../../../components/ui/Field.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';
import { useConfirm } from '../../../components/ui/Feedback.jsx';
import { PeopleTabs } from './PeopleTabs.jsx';

const FORM_ID = 'referral-form';

function ReferralDrawer({ open, onClose, people, referrals, initial, onSaved }) {
  const [form, setForm] = useState(() => ({ ...emptyReferralForm(todayISO()), ...initial }));
  const [localError, setLocalError] = useState('');
  const { run, busy, error, setError } = useMutation();
  useEffect(() => {
    if (open) { setForm({ ...emptyReferralForm(todayISO()), ...initial }); setLocalError(''); setError(''); }
  }, [open, initial, setError]);
  const set = (key, value) => { setForm((state) => ({ ...state, [key]: value })); setLocalError(''); };
  const personOptions = people.map((person) => ({ value: person.ownerId, label: person.displayName }));

  function submit(event) {
    event.preventDefault();
    if (!form.referrerOwnerId || !form.referredOwnerId) { setLocalError('Choose both the referrer and the referred US Person.'); return; }
    if (form.referrerOwnerId === form.referredOwnerId) { setLocalError('The referrer and the referred US Person must be different people.'); return; }
    run(() => saveAdminReferral(form), {
      success: 'Referral saved.',
      onSuccess: async () => { await onSaved(); onClose(); },
    });
  }

  return (
    <Drawer open={open} onClose={onClose} title={form.replaceReferralId ? 'Replace referral' : 'Record referral'}
      description="Commission for each eligible active referred job. The configured rate is used for the monthly projection."
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form={FORM_ID} variant="primary" loading={busy}>Save referral</Button>
      </>}>
      <form id={FORM_ID} onSubmit={submit} noValidate>
        {error || localError ? <Notice tone="danger" title="Not saved">{localError || error}</Notice> : null}
        <FormSection title="Relationship" columns={1}>
          <Field label="Replaces an existing referral" optional
            hint="Choose one only when this record supersedes a current referral; its history is kept.">
            <Select value={form.replaceReferralId} placeholder="No — create a new referral"
              options={referrals.map((row) => ({ value: row.id, label: `${row.referrerName} → ${row.referredName}` }))}
              onChange={(e) => {
                const current = referrals.find((row) => row.id === e.target.value);
                setForm((state) => ({ ...state, replaceReferralId: e.target.value,
                  referredOwnerId: current?.referredOwnerId || state.referredOwnerId, startDate: todayISO() }));
              }} />
          </Field>
          <Field label="Referrer" required hint="The US Person who earns the commission.">
            <Select value={form.referrerOwnerId} placeholder="Choose a person" options={personOptions}
              onChange={(e) => set('referrerOwnerId', e.target.value)} />
          </Field>
          <Field label="Referred US Person" required hint="The person whose active jobs generate the commission.">
            <Select value={form.referredOwnerId} placeholder="Choose a person" options={personOptions}
              onChange={(e) => set('referredOwnerId', e.target.value)} />
          </Field>
          <Field label="Effective start date" required>
            <TextInput type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Switch checked={form.nameVisibleToReferrer} onChange={(e) => set('nameVisibleToReferrer', e.target.checked)}
            label="Show the referred person’s name to the referrer"
            description="Otherwise the referrer sees “Referred US Person”." />
        </FormSection>
      </form>
    </Drawer>
  );
}

export default function Referrals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: overview, loading, error, refresh } = useAsync(getAdminOverview, []);
  const { data: commissions, loading: loadingReferrals, error: referralError, refresh: refreshReferrals } = useAsync(getAdminCommissions, []);
  const [drawer, setDrawer] = useState(null);
  const confirm = useConfirm();
  const { run, busy } = useMutation();

  useEffect(() => {
    if (searchParams.get('new')) {
      setDrawer({ referredOwnerId: searchParams.get('referred') || '' });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const header = <PageHeader title="Referrals"
    subtitle="Who referred whom. See projected commission sources and amounts in the financial overview."
    actions={<Button variant="primary" icon="plus" onClick={() => setDrawer({})}>Record referral</Button>} />;
  if (loading || loadingReferrals) return <>{header}<PeopleTabs /><PageSkeleton header={false} stats={0} /></>;
  if (error || referralError) return <>{header}<PeopleTabs /><ErrorState error={error || referralError} onRetry={() => { refresh(); refreshReferrals(); }} /></>;

  const people = (overview?.people || []).filter((person) => person.personStatus !== 'archived');
  const referrals = commissions?.referrals || [];
  const today = todayISO();

  async function end(row) {
    if (!await confirm({ title: 'End this referral?', tone: 'danger', confirmLabel: 'End referral',
      message: <p>The referral from {row.referrerName} for {row.referredName} ends today ({formatDate(today)}). Dated history is preserved and already-posted accruals are unchanged.</p> })) return;
    await run(() => endAdminReferral(row.id, today), { success: 'Referral ended with dated history.', onSuccess: refreshReferrals });
  }

  const columns = [
    { key: 'pair', header: 'Referral', mobile: 'title', render: (row) => (
      <div className="cell-stack"><span className="cell-title">{row.referrerName} → {row.referredName}</span>
        <span className="cell-sub">Referrer → referred US Person</span></div>
    ), renderMobile: (row) => `${row.referrerName} → ${row.referredName}` },
    { key: 'status', header: 'Status', mobile: 'badge', render: (row) => row.needsContractReview
      ? <Badge tone="danger">Legacy commission basis</Badge>
      : row.relationshipCurrent ? <Badge tone="ok">Current</Badge>
        : row.startDate > today ? <Badge tone="info">Scheduled</Badge> : <Badge tone="muted">Ended</Badge> },
    { key: 'start', header: 'Starts', mobile: 'meta', render: (row) => formatDate(row.startDate) },
    { key: 'end', header: 'Ends', mobile: 'meta', render: (row) => (row.endDate ? formatDate(row.endDate) : 'Open-ended'),
      renderMobile: (row) => (row.endDate ? `Ends ${formatDate(row.endDate)}` : null) },
    { key: 'actions', header: '', mobile: 'actions', render: (row) => (!row.endDate || row.endDate >= today) ? (
      <ButtonGroup>
        <Button size="sm" variant="secondary" onClick={() => setDrawer({ replaceReferralId: row.id, referredOwnerId: row.referredOwnerId })}>Replace</Button>
        <Button size="sm" variant="ghost-danger" disabled={busy} onClick={() => end(row)}>End</Button>
      </ButtonGroup>
    ) : null },
  ];

  return <>
    {header}
    <PeopleTabs />
    <Card padded={false}>
      <DataTable label="Referrals" columns={columns} rows={referrals}
        emptyIcon="link" emptyTitle="No referrals recorded"
        emptyMessage="Record a referral when a US Person on the Referred partnership was introduced by another US Person."
        emptyAction={<Button variant="primary" icon="plus" onClick={() => setDrawer({})}>Record referral</Button>} />
    </Card>
    <ReferralDrawer open={Boolean(drawer)} initial={drawer || {}} onClose={() => setDrawer(null)}
      people={people} referrals={referrals} onSaved={refreshReferrals} />
  </>;
}
