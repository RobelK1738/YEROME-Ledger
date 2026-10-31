import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { Layout } from './components/Layout.jsx';
import { RequireRole } from './components/RequireRole.jsx';
import { Loading } from './components/ui/Loading.jsx';
import { FeedbackProvider } from './components/ui/Feedback.jsx';
import { ADMIN_NAV, OWNER_NAV } from './app/navigation.js';
import LoginPage from './pages/LoginPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import AdminOverview from './pages/admin/AdminOverview.jsx';
import PeopleList from './pages/admin/people/PeopleList.jsx';
import PersonCreate from './pages/admin/people/PersonCreate.jsx';
import PersonDetail from './pages/admin/people/PersonDetail.jsx';
import Referrals from './pages/admin/people/Referrals.jsx';
import JobsList from './pages/admin/jobs/JobsList.jsx';
import JobForm from './pages/admin/jobs/JobForm.jsx';
import Configuration from './pages/admin/Configuration.jsx';
import AuditLog from './pages/admin/AuditLog.jsx';
import OwnerHome from './pages/owner/OwnerHome.jsx';

const AdminAllocations = lazy(() => import('./pages/admin/AdminAllocations.jsx'));
const OwnerAllocations = lazy(() => import('./pages/owner/OwnerAllocations.jsx'));

function OwnerShell() {
  return <Layout navItems={OWNER_NAV} />;
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
      <Route element={<RequireRole role="admin"><Layout navItems={ADMIN_NAV} /></RequireRole>}>
        <Route path="/admin" element={<AdminOverview />} />
        <Route path="/admin/allocations" element={<Suspense fallback={<Loading />}><AdminAllocations /></Suspense>} />
        <Route path="/admin/people" element={<PeopleList />} />
        <Route path="/admin/people/new" element={<PersonCreate />} />
        <Route path="/admin/people/referrals" element={<Referrals />} />
        <Route path="/admin/people/:ownerId" element={<PersonDetail />} />
        <Route path="/admin/jobs" element={<JobsList />} />
        <Route path="/admin/jobs/new" element={<JobForm />} />
        <Route path="/admin/jobs/:jobId/edit" element={<JobForm />} />
        <Route path="/admin/jobs/:jobId/terms" element={<JobForm />} />
        <Route path="/admin/jobs/*" element={<Navigate to="/admin/jobs" replace />} />
        <Route path="/admin/projections" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/pay-runs/*" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/config" element={<Configuration />} />
        <Route path="/admin/audit" element={<AuditLog />} />
        <Route path="/admin/owners/*" element={<Navigate to="/admin/people" replace />} />
        <Route path="/admin/referrals" element={<Navigate to="/admin/people/referrals" replace />} />
        <Route path="/admin/paychecks" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/transfers" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/commissions" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/costs" element={<Navigate to="/admin/config" replace />} />
        <Route path="/admin/settings" element={<Navigate to="/admin/config" replace />} />
        <Route path="/admin/setup" element={<Navigate to="/admin/people/new" replace />} />
        <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
      </Route>
      <Route element={<RequireRole role="owner"><OwnerShell /></RequireRole>}>
        <Route path="/owner" element={<OwnerHome />} />
        <Route path="/owner/allocations" element={<Suspense fallback={<Loading />}><OwnerAllocations /></Suspense>} />
        <Route path="/owner/jobs" element={<Navigate to="/owner" replace />} />
        <Route path="/owner/plan" element={<Navigate to="/owner/allocations" replace />} />
        <Route path="/owner/payments" element={<Navigate to="/owner" replace />} />
        <Route path="/owner/commissions" element={<Navigate to="/owner" replace />} />
        <Route path="/owner/jobs/:jobId" element={<Navigate to="/owner/jobs" replace />} />
        <Route path="/owner/paychecks" element={<Navigate to="/owner/allocations" replace />} />
        <Route path="/owner/*" element={<Navigate to="/owner" replace />} />
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  </FeedbackProvider>;
}
