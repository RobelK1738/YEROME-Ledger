import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useAsync } from './hooks/useAsync.js';
import { getMyCommissions } from './lib/data/v2.js';
import { Layout } from './components/Layout.jsx';
import { RequireRole } from './components/RequireRole.jsx';
import { Loading } from './components/ui/Loading.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import AdminMfaPage from './pages/AdminMfaPage.jsx';
import AdminOverview from './pages/v2/AdminOverview.jsx';
import AdminPeople from './pages/v2/AdminPeople.jsx';
import AdminPayRuns from './pages/v2/AdminPayRuns.jsx';
import AdminConfiguration from './pages/v2/AdminConfiguration.jsx';
import AuditLogPage from './pages/admin/AuditLogPage.jsx';
import { OwnerHome, OwnerJobs, OwnerPayments, OwnerCommissions } from './pages/v2/OwnerPages.jsx';

const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: '▚', end: true, primary: true },
  { to: '/admin/people', label: 'US Persons', shortLabel: 'People', icon: '👥', primary: true },
  { to: '/admin/pay-runs', label: 'Pay Runs', shortLabel: 'Pay', icon: '📆', primary: true },
  { to: '/admin/config', label: 'Configuration', icon: '⚙' },
  { to: '/admin/audit', label: 'Audit', icon: '📝' },
];
const OWNER_NAV = [
  { to: '/owner', label: 'Home', icon: '▚', end: true, primary: true },
  { to: '/owner/jobs', label: 'My Jobs', shortLabel: 'Jobs', icon: '💼', primary: true },
  { to: '/owner/payments', label: 'Payments', shortLabel: 'Pay', icon: '📆', primary: true },
];

function OwnerShell() {
  const { data } = useAsync(getMyCommissions, []);
  const hasReferrals = Boolean(data?.referrals?.length);
  const nav = hasReferrals ? [...OWNER_NAV,
    { to: '/owner/commissions', label: 'Commissions', icon: '🤝', primary: true }] : OWNER_NAV;
  return <Layout navItems={nav} portalLabel="US Person" />;
}

function HomeRedirect() {
  const { loading, isAuthenticated, role, mfaRequired } = useAuth();
  if (loading) return <Loading full />;
  if (mfaRequired) return <Navigate to="/admin/mfa" replace />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={role === 'admin' ? '/admin' : '/owner'} replace />;
}

export default function App({ recoveryCallback }) {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage callback={recoveryCallback} />} />
    <Route path="/admin/mfa" element={<AdminMfaPage />} />
    <Route element={<RequireRole role="admin"><Layout navItems={ADMIN_NAV} portalLabel="YEROME Admin" /></RequireRole>}>
      <Route path="/admin" element={<AdminOverview />} />
      <Route path="/admin/people" element={<AdminPeople />} />
      <Route path="/admin/pay-runs" element={<AdminPayRuns />} />
      <Route path="/admin/config" element={<AdminConfiguration />} />
      <Route path="/admin/audit" element={<AuditLogPage />} />
      <Route path="/admin/owners/*" element={<Navigate to="/admin/people" replace />} />
      <Route path="/admin/jobs/*" element={<Navigate to="/admin/people" replace />} />
      <Route path="/admin/paychecks" element={<Navigate to="/admin/pay-runs" replace />} />
      <Route path="/admin/costs" element={<Navigate to="/admin/config" replace />} />
      <Route path="/admin/commissions" element={<Navigate to="/admin/people" replace />} />
      <Route path="/admin/settings" element={<Navigate to="/admin/config" replace />} />
      <Route path="/admin/setup" element={<Navigate to="/admin/people" replace />} />
    </Route>
    <Route element={<RequireRole role="owner"><OwnerShell /></RequireRole>}>
      <Route path="/owner" element={<OwnerHome />} />
      <Route path="/owner/jobs" element={<OwnerJobs />} />
      <Route path="/owner/payments" element={<OwnerPayments />} />
      <Route path="/owner/commissions" element={<OwnerCommissions />} />
      <Route path="/owner/jobs/:jobId" element={<Navigate to="/owner/jobs" replace />} />
      <Route path="/owner/paychecks" element={<Navigate to="/owner/payments" replace />} />
    </Route>
    <Route path="/" element={<HomeRedirect />} />
    <Route path="*" element={<HomeRedirect />} />
  </Routes>;
}
