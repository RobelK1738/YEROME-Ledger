import { Outlet, useOutletContext } from 'react-router-dom';
import { useAsync } from '../../../hooks/useAsync.js';
import { getAdminCommissions, getAdminOverview, getAdminTransfers } from '../../../lib/data/v2.js';
import { flattenPaychecks, isAwaitingReceipt } from '../../../lib/presentation/people.js';
import { todayISO } from '../../../lib/presentation/format.js';
import { PageHeader } from '../../../components/ui/PageHeader.jsx';
import { SectionNav } from '../../../components/ui/Tabs.jsx';
import { PageSkeleton } from '../../../components/ui/Loading.jsx';
import { ErrorState } from '../../../components/ui/ErrorState.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';

export function usePayRuns() {
  return useOutletContext();
}

export default function PayRuns() {
  const overview = useAsync(getAdminOverview, []);
  const transfers = useAsync(getAdminTransfers, []);
  const commissions = useAsync(getAdminCommissions, []);

  const header = <PageHeader title="Pay Runs"
    subtitle="Employer paychecks, contractual settlements, commissions and external transfer records — each kept separate." />;
  const note = (
    <p className="page-note">
      <Icon name="shield" size={16} />
      <span>Recording here documents money that moved elsewhere. Nothing on this page sends, schedules or releases a payment.</span>
    </p>
  );

  if (overview.loading) return <>{header}<PageSkeleton header={false} stats={0} label="Loading pay runs…" /></>;
  if (overview.error) return <>{header}<ErrorState error={overview.error} onRetry={overview.refresh} /></>;

  const people = overview.data?.people || [];
  const today = todayISO();
  const awaiting = flattenPaychecks(people.filter((person) => person.personStatus !== 'archived'))
    .filter((check) => isAwaitingReceipt(check, today)).length;
  const unverified = (transfers.data?.transfers || []).filter((row) => row.status !== 'verified').length;
  const refreshAll = () => Promise.all([overview.refresh(), transfers.refresh(), commissions.refresh()]);

  const context = {
    people,
    transfers: transfers.data?.transfers || [],
    transfersState: transfers,
    commissions: commissions.data || { referrals: [], accruals: [] },
    commissionsState: commissions,
    refreshAll,
    refreshOverview: overview.refresh,
  };

  return <>
    {header}
    {note}
    <SectionNav label="Pay Runs sections" items={[
      { to: '/admin/pay-runs/paychecks', label: 'Paychecks', icon: 'receipt', count: awaiting || null, countTone: 'warn' },
      { to: '/admin/pay-runs/schedule', label: 'Pay schedules', icon: 'calendar' },
      { to: '/admin/pay-runs/settlements', label: 'Settlements', icon: 'scale' },
      { to: '/admin/pay-runs/transfers', label: 'Transfers', icon: 'transfer', count: unverified || null, countTone: 'warn' },
      { to: '/admin/pay-runs/commissions', label: 'Commissions', icon: 'coins' },
    ]} />
    <Outlet context={context} />
  </>;
}
