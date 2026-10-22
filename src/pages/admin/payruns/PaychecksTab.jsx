import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { flattenPaychecks, isAwaitingReceipt, paycheckDisplayStatus } from '../../../lib/presentation/people.js';
import { addDaysISO, formatDate, matchesQuery, money, plural, relativeDays, todayISO } from '../../../lib/presentation/format.js';
import { Card } from '../../../components/ui/Card.jsx';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../../components/ui/Button.jsx';
import { FilterBar, FilterSelect, SearchInput } from '../../../components/ui/Toolbar.jsx';
import { usePayRuns } from './PayRuns.jsx';
import { ReceiptDrawer } from './ReceiptDrawer.jsx';
import { SectionIntro } from './shared.jsx';

const VIEWS = [
  { value: 'open', label: 'Needs action & next 30 days' },
  { value: 'awaiting', label: 'Awaiting receipt' },
  { value: 'scheduled', label: 'Upcoming (scheduled)' },
  { value: 'paid', label: 'Receipt recorded' },
  { value: 'skipped', label: 'Skipped' },
];

function inView(check, view, today) {
  if (view === 'open') return isAwaitingReceipt(check, today) ||
    (check.status === 'scheduled' && check.payDate <= addDaysISO(today, 30));
  if (view === 'awaiting') return isAwaitingReceipt(check, today);
  if (view === 'scheduled') return check.status === 'scheduled' && check.payDate >= today;
  if (view === 'all') return true;
  return check.status === view;
}

function withholding(check) {
  const lines = [check.federalWithheldCents, check.socialSecurityWithheldCents, check.medicareWithheldCents,
    check.additionalMedicareWithheldCents, check.stateWithheldCents];
  return lines.every((value) => value == null) ? null : lines.reduce((sum, value) => sum + (value || 0), 0);
}

export default function PaychecksTab() {
  const { people, refreshAll } = usePayRuns();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const today = todayISO();
  const view = searchParams.get('status') || 'open';
  const ownerId = searchParams.get('person') || '';
  const setParam = (key, fallback) => (value) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== fallback) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const current = people.filter((person) => person.personStatus !== 'archived');
  const all = flattenPaychecks(current);
  const rows = all.filter((check) => inView(check, view, today) && (!ownerId || check.ownerId === ownerId) &&
    matchesQuery(query, check.personName, check.employerName));
  const ascending = ['open', 'awaiting', 'scheduled'].includes(view);
  rows.sort((a, b) => (ascending ? a.payDate.localeCompare(b.payDate) : b.payDate.localeCompare(a.payDate)));
  const awaitingCount = all.filter((check) => isAwaitingReceipt(check, today)).length;

  const columns = [
    { key: 'date', header: 'Payday', mobile: 'title', render: (check) => (
      <div className="cell-stack"><span className="cell-title nowrap">{formatDate(check.payDate)}</span><span className="cell-sub">{relativeDays(check.payDate, today)}</span></div>
    ), renderMobile: (check) => formatDate(check.payDate) },
    { key: 'person', header: 'US Person · employer', mobile: 'meta', render: (check) => (
      <div className="cell-stack"><span className="cell-title">{check.personName}</span><span className="cell-sub">{check.employerName}</span></div>
    ), renderMobile: (check) => check.personName },
    { key: 'employer', header: 'Employer', mobile: 'meta', hideOnDesktop: true, render: (check) => check.employerName },
    { key: 'status', header: 'Status', mobile: 'badge', render: (check) => <StatusBadge kind="paycheck" status={paycheckDisplayStatus(check, today)} /> },
    { key: 'gross', header: 'Gross', align: 'right', hideOnMobile: true, render: (check) => <span className="num">{money(check.actualGrossCents)}</span> },
    { key: 'tax', header: 'Tax withheld', align: 'right', hideOnMobile: true, secondary: true, render: (check) => <span className="num">{money(withholding(check))}</span> },
    { key: 'net', header: 'Net deposit', align: 'right', mobile: 'amount', render: (check) => <span className="num">{money(check.actualNetReceivedCents)}</span>,
      renderMobile: (check) => (check.actualNetReceivedCents == null ? null : money(check.actualNetReceivedCents)) },
    { key: 'actions', header: '', mobile: 'actions', render: (check) => ['scheduled', 'paid'].includes(check.status) ? (
      <Button size="sm" variant={check.status === 'paid' ? 'ghost' : isAwaitingReceipt(check, today) ? 'primary' : 'secondary'}
        icon={check.status === 'paid' ? 'edit' : 'receipt'} onClick={() => setEditing(check)}>
        {check.status === 'paid' ? 'Correct' : 'Record receipt'}
      </Button>
    ) : null },
  ];

  return <>
    <SectionIntro title="Employer paychecks">
      A scheduled paycheck is an expected date. Record a receipt only from a real paystub or bank record —
      a recorded receipt is cash YEROME received, not a partner settlement.
    </SectionIntro>
    <FilterBar summary={`${plural(rows.length, 'paycheck')} shown${awaitingCount ? ` · ${awaitingCount} awaiting receipt` : ''}`}>
      <SearchInput value={query} onChange={setQuery} label="Search paychecks" placeholder="Person or employer" />
      <FilterSelect label="Show" value={view === 'all' ? '' : view} onChange={(value) => setParam('status', 'open')(value || 'all')}
        options={VIEWS} allLabel="All paychecks" />
      <FilterSelect label="US Person" value={ownerId} onChange={setParam('person', '')} allLabel="Everyone"
        options={current.map((person) => ({ value: person.ownerId, label: person.displayName }))} />
    </FilterBar>
    <Card padded={false}>
      <DataTable label="Paychecks" columns={columns} rows={rows} mobilePageSize={20}
        emptyIcon="receipt"
        emptyTitle={all.length ? 'No paychecks in this view' : 'No paychecks scheduled yet'}
        emptyMessage={all.length ? 'Choose another view or person.' : 'Generate employer pay dates for a job to start recording receipts.'}
        emptyAction={all.length ? null : <ButtonLink to="/admin/pay-runs/schedule" variant="primary" icon="calendar">Schedule pay dates</ButtonLink>} />
    </Card>
    <ReceiptDrawer check={editing} onClose={() => setEditing(null)} onSaved={refreshAll} />
  </>;
}
