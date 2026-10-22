import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useAsync } from './hooks/useAsync.js';
import { getMyCommissions } from './lib/data/v2.js';
import { Layout } from './components/Layout.jsx';
import { RequireRole } from './components/RequireRole.jsx';
import { Loading } from './components/ui/Loading.jsx';
import { FeedbackProvider } from './components/ui/Feedback.jsx';
import { ADMIN_NAV, OWNER_NAV, OWNER_COMMISSIONS_NAV } from './app/navigation.js';
import LoginPage from './pages/LoginPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import AdminOverview from './pages/admin/AdminOverview.jsx';
import PeopleList from './pages/admin/people/PeopleList.jsx';
import PersonCreate from './pages/admin/people/PersonCreate.jsx';
import PersonDetail from './pages/admin/people/PersonDetail.jsx';
import Referrals from './pages/admin/people/Referrals.jsx';
import JobsList from './pages/admin/jobs/JobsList.jsx';
import JobForm from './pages/admin/jobs/JobForm.jsx';
import PayRuns from './pages/admin/payruns/PayRuns.jsx';
import PaychecksTab from './pages/admin/payruns/PaychecksTab.jsx';
import ScheduleTab from './pages/admin/payruns/ScheduleTab.jsx';
import SettlementsTab from './pages/admin/payruns/SettlementsTab.jsx';
import TransfersTab from './pages/admin/payruns/TransfersTab.jsx';
import CommissionsTab from './pages/admin/payruns/CommissionsTab.jsx';
import Configuration from './pages/admin/Configuration.jsx';
import AuditLog from './pages/admin/AuditLog.jsx';
import OwnerHome from './pages/owner/OwnerHome.jsx';
import OwnerJobs from './pages/owner/OwnerJobs.jsx';
import OwnerPayments from './pages/owner/OwnerPayments.jsx';
import OwnerCommissions from './pages/owner/OwnerCommissions.jsx';

function OwnerShell() {
  const { data } = useAsync(getMyCommissions, []);
  const hasReferrals = Boolean(data?.referrals?.length);
  const nav = hasReferrals ? [...OWNER_NAV, OWNER_COMMISSIONS_NAV] : OWNER_NAV;
  return <Layout navItems={nav} portalLabel="US Person portal" />;
}

function HomeRedirect() {
  const { loading, isAuthenticated, role } = useAuth();
  if (loading) return <Loading full />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={role === 'admin' ? '/admin' : '/owner'} replace />;
}

export default function App({ recoveryCallback }) {
  return <FeedbackProvider>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage callback={recoveryCallback} />} />
      <Route element={<RequireRole role="admin"><Layout navItems={ADMIN_NAV} portalLabel="YEROME Admin" /></RequireRole>}>
        <Route path="/admin" element={<AdminOverview />} />
        <Route path="/admin/people" element={<PeopleList />} />
        <Route path="/admin/people/new" element={<PersonCreate />} />
        <Route path="/admin/people/referrals" element={<Referrals />} />
        <Route path="/admin/people/:ownerId" element={<PersonDetail />} />
        <Route path="/admin/jobs" element={<JobsList />} />
        <Route path="/admin/jobs/new" element={<JobForm />} />
        <Route path="/admin/jobs/:jobId/terms" element={<JobForm />} />
        <Route path="/admin/jobs/*" element={<Navigate to="/admin/jobs" replace />} />
        <Route path="/admin/pay-runs" element={<PayRuns />}>
          <Route index element={<Navigate to="paychecks" replace />} />
          <Route path="paychecks" element={<PaychecksTab />} />
          <Route path="schedule" element={<ScheduleTab />} />
          <Route path="settlements" element={<SettlementsTab />} />
          <Route path="transfers" element={<TransfersTab />} />
          <Route path="commissions" element={<CommissionsTab />} />
          <Route path="*" element={<Navigate to="/admin/pay-runs/paychecks" replace />} />
        </Route>
        <Route path="/admin/config" element={<Configuration />} />
        <Route path="/admin/audit" element={<AuditLog />} />
        <Route path="/admin/owners/*" element={<Navigate to="/admin/people" replace />} />
        <Route path="/admin/referrals" element={<Navigate to="/admin/people/referrals" replace />} />
        <Route path="/admin/paychecks" element={<Navigate to="/admin/pay-runs/paychecks" replace />} />
        <Route path="/admin/transfers" element={<Navigate to="/admin/pay-runs/transfers" replace />} />
        <Route path="/admin/commissions" element={<Navigate to="/admin/pay-runs/commissions" replace />} />
        <Route path="/admin/costs" element={<Navigate to="/admin/config" replace />} />
        <Route path="/admin/settings" element={<Navigate to="/admin/config" replace />} />
        <Route path="/admin/setup" element={<Navigate to="/admin/people/new" replace />} />
        <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
      </Route>
      <Route element={<RequireRole role="owner"><OwnerShell /></RequireRole>}>
        <Route path="/owner" element={<OwnerHome />} />
        <Route path="/owner/jobs" element={<OwnerJobs />} />
        <Route path="/owner/payments" element={<OwnerPayments />} />
        <Route path="/owner/commissions" element={<OwnerCommissions />} />
        <Route path="/owner/jobs/:jobId" element={<Navigate to="/owner/jobs" replace />} />
        <Route path="/owner/paychecks" element={<Navigate to="/owner/payments" replace />} />
        <Route path="/owner/*" element={<Navigate to="/owner" replace />} />
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  </FeedbackProvider>;
}
