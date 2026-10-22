import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_EMAIL, ADMIN_RECOVERY_REDIRECT_URL, captureAdminRecoveryCallback,
  completeAdminRecovery, hasPasswordInput, requestAdminRecovery,
} from '../src/lib/auth/adminRecovery.js';
import { validatePassword } from '../server/_lib/supabaseAdmin.js';

function callback(url) {
  const parsed = new URL(url);
  const replacements = [];
  const history = { state: { preserved: true }, replaceState(...args) { replacements.push(args); } };
  return { attempt: captureAdminRecoveryCallback(parsed, history), replacements };
}

const admin = { id: 'admin-id', email: ADMIN_EMAIL, app_metadata: { role: 'admin' } };

test('implicit recovery fragment is removed before redemption and consumed once', async () => {
  const { attempt, replacements } = callback('https://yerome-ledger.vercel.app/reset-password#access_token=SECRET_ACCESS&refresh_token=SECRET_REFRESH&type=recovery');
  assert.deepEqual(replacements, [[{ preserved: true }, '', '/reset-password']]);
  assert.equal(JSON.stringify(attempt), '{"kind":"link"}');
  let calls = 0;
  const auth = {
    async setSession(tokens) {
      calls += 1;
      assert.deepEqual(tokens, { access_token: 'SECRET_ACCESS', refresh_token: 'SECRET_REFRESH' });
      return { data: { session: { user: admin } }, error: null };
    },
    async getUser() { return { data: { user: admin }, error: null }; },
  };
  const [first, second] = await Promise.all([attempt.redeem(auth), attempt.redeem(auth)]);
  assert.deepEqual(first, { kind: 'ready' });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test('PKCE code is removed before exchange and only a recovery exchange is accepted', async () => {
  const { attempt, replacements } = callback('https://yerome-ledger.vercel.app/reset-password?code=ONE_USE_CODE&sb_flow_id=abc');
  assert.equal(replacements[0][2], '/reset-password');
  const signouts = [];
  const auth = {
    async exchangeCodeForSession(code, options) {
      assert.equal(code, 'ONE_USE_CODE');
      assert.deepEqual(options, { flowId: 'abc' });
      return { data: { session: { user: admin }, redirectType: 'oauth' }, error: null };
    },
    async signOut(options) { signouts.push(options); return { error: null }; },
    async getUser() { throw new Error('Must not validate a non-recovery exchange'); },
  };
  assert.deepEqual(await attempt.redeem(auth), { kind: 'invalid' });
  assert.deepEqual(signouts, [{ scope: 'local' }]);
});

test('PKCE recovery session validates the live Admin identity', async () => {
  const { attempt } = callback('https://yerome-ledger.vercel.app/reset-password?code=ONE_USE_CODE');
  const auth = {
    async exchangeCodeForSession(code) {
      assert.equal(code, 'ONE_USE_CODE');
      return { data: { session: {}, redirectType: 'recovery' }, error: null };
    },
    async getUser() { return { data: { user: admin }, error: null }; },
  };
  assert.deepEqual(await attempt.redeem(auth), { kind: 'ready' });
});

test('expired and invalid links never redeem credentials or echo error descriptions', async () => {
  for (const [url, expected] of [
    ['https://yerome-ledger.vercel.app/reset-password#error=access_denied&error_code=otp_expired&error_description=SECRET', 'expired'],
    ['https://yerome-ledger.vercel.app/reset-password?code=', 'invalid'],
    ['https://yerome-ledger.vercel.app/reset-password#access_token=A&refresh_token=R&type=signup', 'invalid'],
  ]) {
    const { attempt, replacements } = callback(url);
    assert.deepEqual(attempt, { kind: expected });
    assert.equal(replacements[0][2], '/reset-password');
    assert.ok(!JSON.stringify(attempt).includes('SECRET'));
  }
  const { attempt } = callback('https://yerome-ledger.vercel.app/login#access_token=SECRET');
  assert.deepEqual(attempt, { kind: 'none' });
});

test('Site URL fallback moves a dashboard recovery callback to the reset route', () => {
  const { attempt, replacements } = callback('https://yerome-ledger.vercel.app/#access_token=A&refresh_token=R&type=recovery');
  assert.equal(attempt.kind, 'link');
  assert.equal(replacements[0][2], '/reset-password');
});

test('Owner and other sessions cannot unlock the Admin reset form', async () => {
  const { attempt } = callback('https://yerome-ledger.vercel.app/reset-password#access_token=A&refresh_token=R&type=recovery');
  const signouts = [];
  const auth = {
    async setSession() { return { data: { session: {} }, error: null }; },
    async getUser() { return { data: { user: { email: 'owner@example.test', app_metadata: { role: 'owner' } } }, error: null }; },
    async signOut(options) { signouts.push(options); return { error: null }; },
  };
  assert.deepEqual(await attempt.redeem(auth), { kind: 'invalid' });
  assert.deepEqual(signouts, [{ scope: 'local' }]);
});

test('Admin request uses exact production redirect and never requests Owner recovery', async () => {
  const requests = [];
  const auth = { async resetPasswordForEmail(...args) { requests.push(args); return { error: null }; } };
  assert.deepEqual(await requestAdminRecovery(auth, ' owner@example.test '), { kind: 'sent' });
  assert.equal(requests.length, 0);
  assert.deepEqual(await requestAdminRecovery(auth, ` ${ADMIN_EMAIL.toUpperCase()} `), { kind: 'sent' });
  assert.deepEqual(requests, [[ADMIN_EMAIL, { redirectTo: ADMIN_RECOVERY_REDIRECT_URL }]]);
});

test('password update requires recovery authorization and nonempty input, then revokes sessions', async () => {
  const password = 'simple';
  assert.ok(hasPasswordInput(password));
  assert.equal(hasPasswordInput(''), false);
  const calls = [];
  const auth = {
    async getUser() { calls.push('getUser'); return { data: { user: admin }, error: null }; },
    async updateUser(details) { calls.push(['updateUser', details]); return { error: null }; },
    async signOut(options) { calls.push(['signOut', options]); return { error: null }; },
  };
  assert.deepEqual(await completeAdminRecovery(auth, password, false), { kind: 'invalid' });
  assert.deepEqual(await completeAdminRecovery(auth, '', true), { kind: 'invalid' });
  assert.deepEqual(calls, []);
  assert.deepEqual(await completeAdminRecovery(auth, password, true), { kind: 'complete', revoked: true });
  assert.deepEqual(calls, ['getUser', ['updateUser', { password }], ['signOut', { scope: 'global' }]]);
});

test('Owner password validation leaves password policy to Supabase Auth', () => {
  assert.equal(validatePassword('simple'), null);
  assert.equal(validatePassword(''), 'Password is required.');
  assert.equal(validatePassword(undefined), 'Password is required.');
});

test('Auth password rejection does not report a broken recovery link or revoke sessions', async () => {
  const calls = [];
  const auth = {
    async getUser() { calls.push('getUser'); return { data: { user: admin }, error: null }; },
    async updateUser(details) { calls.push(['updateUser', details]); return { error: { code: 'weak_password' } }; },
    async signOut() { calls.push('signOut'); return { error: null }; },
  };
  assert.deepEqual(await completeAdminRecovery(auth, 'simple', true), { kind: 'password-rejected' });
  assert.deepEqual(calls, ['getUser', ['updateUser', { password: 'simple' }]]);
});

test('recovery session rejected during password update is treated as invalid', async () => {
  const auth = {
    async getUser() { return { data: { user: admin }, error: null }; },
    async updateUser() { return { error: { status: 401 } }; },
  };
  assert.deepEqual(await completeAdminRecovery(auth, 'simple', true), { kind: 'invalid' });
});

test('failed global revocation is reported and local session is discarded', async () => {
  const signouts = [];
  const auth = {
    async getUser() { return { data: { user: admin }, error: null }; },
    async updateUser() { return { error: null }; },
    async signOut(options) {
      signouts.push(options);
      return { error: options.scope === 'global' ? new Error('failure') : null };
    },
  };
  assert.deepEqual(await completeAdminRecovery(auth, 'A-long-unique-secret-42!', true),
    { kind: 'complete', revoked: false });
  assert.deepEqual(signouts, [{ scope: 'global' }, { scope: 'local' }]);
});

test('an expired exchange and a changed Admin identity cannot update a password', async () => {
  const { attempt } = callback('https://yerome-ledger.vercel.app/reset-password?code=EXPIRED');
  assert.deepEqual(await attempt.redeem({
    async exchangeCodeForSession() {
      return { data: { session: null }, error: { code: 'otp_expired' } };
    },
  }), { kind: 'expired' });

  let updated = false;
  const auth = {
    async getUser() { return { data: { user: { email: ADMIN_EMAIL,
      app_metadata: { role: 'owner' } } }, error: null }; },
    async updateUser() { updated = true; return { error: null }; },
  };
  assert.deepEqual(await completeAdminRecovery(auth, 'A-long-unique-secret-42!', true),
    { kind: 'invalid' });
  assert.equal(updated, false);
});
