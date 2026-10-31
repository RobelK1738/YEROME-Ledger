import { supabase } from '../supabase/client.js';

export async function v2Request(path, method = 'GET', body = null) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to continue.');
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export const getMyStatement = () => v2Request('/api/me/statement');
export const getMyCommissions = () => v2Request('/api/me/commissions');
export const getAdminOverview = () => v2Request('/api/admin/overview');
export const saveProjectionPlan = (input) => v2Request('/api/admin/planning', 'PATCH', input);
export const saveAdminJob = (input, action = 'create') =>
  v2Request('/api/admin/job', action === 'create' ? 'POST' : 'PATCH', input);
export const saveAdminPerson = (input) => v2Request('/api/admin/person', 'PATCH', input);
export const setPersonStatus = (ownerId, status) =>
  v2Request('/api/owners/set-status', 'POST', { ownerId, status });
export const saveAdminReferral = (input) => v2Request('/api/admin/referral', 'POST', input);
export const endAdminReferral = (referralId, effectiveFrom) =>
  v2Request('/api/admin/referral', 'PATCH', { action: 'end', referralId, effectiveFrom });
export const schedulePaychecks = (input) => v2Request('/api/admin/paycheck', 'POST', input);
export const recordPaycheck = (input) => v2Request('/api/admin/paycheck', 'PATCH', input);
export const getAdminCommissions = () => v2Request('/api/admin/commissions');
export const postAdminCommission = (input) => v2Request('/api/admin/commissions', 'POST', input);
export const getAdminSettlements = (ownerId, calendarMonth) =>
  v2Request(`/api/admin/settlements?ownerId=${encodeURIComponent(ownerId)}&calendarMonth=${encodeURIComponent(calendarMonth)}`);
export const postAdminSettlement = (input) => v2Request('/api/admin/settlements', 'POST', input);

export const getAdminTransfers = () => v2Request('/api/admin/transfers');
export const postAdminTransfer = (input) => v2Request('/api/admin/transfers', 'POST', input);
