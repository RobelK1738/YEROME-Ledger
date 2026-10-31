import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminPasswordLogin, sessionAuthorization } from '../src/lib/auth/signIn.js';

test('Admin login sends the password unchanged and requires server authorization', async () => {
  const session = { access_token: 'synthetic-session' };
  const calls = [];
  const auth = {
    async signInWithPassword(input) { calls.push(input); return { data: { session }, error: null }; },
    async signOut() { assert.fail('Successful login must retain the session'); },
  };
  assert.deepEqual(await adminPasswordLogin(auth, ' admin@example.test ', ' space-sensitive ', async (value) => {
    assert.equal(value, session); return { role: 'admin' };
  }), { role: 'admin' });
  assert.deepEqual(calls, [{ email: 'admin@example.test', password: ' space-sensitive ' }]);
});

test('password rejection, service outage and throttling get distinct safe messages', async () => {
  const cases = [
    [{ code: 'invalid_credentials', message: 'PRIVATE_PROVIDER_DETAIL' }, /Email or password was not accepted/],
    [{ name: 'AuthRetryableFetchError', message: 'PRIVATE_PROVIDER_DETAIL' }, /Could not reach/],
    [{ status: 503, message: 'PRIVATE_PROVIDER_DETAIL' }, /Could not reach/],
    [{ status: 429, message: 'PRIVATE_PROVIDER_DETAIL' }, /Too many sign-in attempts/],
    [{ code: 'unknown', message: 'PRIVATE_PROVIDER_DETAIL' }, /could not be completed/],
  ];
  for (const [error, expected] of cases) {
    const auth = { async signInWithPassword() { return { data: {}, error }; } };
    await assert.rejects(adminPasswordLogin(auth, 'admin@example.test', 'synthetic', () => assert.fail('Rejected password cannot reach authorization')),
      (failure) => expected.test(failure.message) && !failure.message.includes('PRIVATE_PROVIDER_DETAIL'));
  }
  await assert.rejects(adminPasswordLogin({ async signInWithPassword() { throw new TypeError('PRIVATE_URL'); } },
    'admin@example.test', 'synthetic', () => assert.fail()), /Could not reach/);
});

test('accepted password with denied or unavailable access discards the local session', async () => {
  for (const [result, expected] of [
    [{ role: 'owner' }, /does not have Admin access/],
    [{ role: null, failure: 'access' }, /does not have Admin access/],
    [{ role: null, failure: 'unavailable' }, /password was accepted.*could not verify access/],
    [{ role: null, failure: 'expired' }, /session expired/],
  ]) {
    const session = { access_token: 'synthetic' };
    const calls = [];
    const auth = {
      async signInWithPassword() { return { data: { session } }; },
      async signOut(options) { calls.push(options); throw new Error('Simulated network failure'); },
    };
    await assert.rejects(adminPasswordLogin(auth, 'admin@example.test', 'synthetic', async (value) => {
      calls.push(value); return value ? result : { role: null };
    }), expected);
    assert.deepEqual(calls, [session, { scope: 'local' }, null]);
  }
});

test('session verification never treats a server or network failure as a wrong password', async () => {
  const session = { access_token: 'synthetic' };
  for (const [status, failure] of [[401, 'expired'], [403, 'access'], [500, 'unavailable']]) {
    assert.deepEqual(await sessionAuthorization(session, async (path, options) => {
      assert.equal(path, '/api/auth/session'); assert.equal(options.cache, 'no-store');
      return new Response('{}', { status });
    }), { role: null, failure });
  }
  assert.deepEqual(await sessionAuthorization(session, async () => { throw new Error('offline'); }), { role: null, failure: 'unavailable' });
  assert.deepEqual(await sessionAuthorization(session, async () => Response.json({ role: 'unexpected', private_data: 'ignored' })), { role: null, failure: 'access' });
  assert.deepEqual(await sessionAuthorization(session, async () => Response.json({ role: 'admin', private_data: 'ignored' })), { role: 'admin' });
  assert.deepEqual(await sessionAuthorization(null, () => assert.fail()), { role: null });
});
