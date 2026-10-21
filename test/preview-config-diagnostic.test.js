import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPreviewConfig } from '../scripts/verify-preview-config.mjs';

const validEnv = {
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'fix/production-v2-migration-rollout',
  VITE_SUPABASE_URL: 'https://uliolbtonhrmjwaeliyj.supabase.co',
  ADMIN_EMAIL: 'robiemelaku@gmail.com',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-secret',
};

test('does not request Auth outside this exact Preview branch', async () => {
  let calls = 0;
  const list = async () => { calls += 1; return {}; };
  assert.equal(await verifyPreviewConfig({ ...validEnv, VERCEL_ENV: 'production' }, list), 'SKIP_SCOPE');
  assert.equal(await verifyPreviewConfig({ ...validEnv, VERCEL_GIT_COMMIT_REF: 'main' }, list), 'SKIP_SCOPE');
  assert.equal(calls, 0);
});

test('requires exact project and Admin identity before making one read-only request', async () => {
  let calls = 0;
  const list = async (url, key) => {
    calls += 1;
    assert.equal(url, validEnv.VITE_SUPABASE_URL);
    assert.equal(key, validEnv.SUPABASE_SERVICE_ROLE_KEY);
    return { data: { users: [{ email: validEnv.ADMIN_EMAIL, app_metadata: { role: 'admin' } }] } };
  };
  assert.equal(await verifyPreviewConfig({ ...validEnv, ADMIN_EMAIL: 'wrong@example.com' }, list), 'FAIL_ADMIN_EMAIL');
  assert.equal(await verifyPreviewConfig({ ...validEnv, VITE_SUPABASE_URL: 'https://other.supabase.co' }, list), 'FAIL_PROJECT_SCOPE');
  assert.equal(calls, 0);
  assert.equal(await verifyPreviewConfig(validEnv, list), 'PASS');
  assert.equal(calls, 1);
});

test('returns only fixed codes for invalid Auth replies and errors', async () => {
  assert.equal(await verifyPreviewConfig(validEnv, async () => ({ error: new Error('secret') })), 'FAIL_AUTH_READ');
  assert.equal(await verifyPreviewConfig(validEnv, async () => { throw new Error('secret'); }), 'FAIL_AUTH_READ');
  assert.equal(await verifyPreviewConfig(validEnv, async () => ({
    data: { users: [{ email: 'wrong@example.com', app_metadata: { role: 'admin' } }] },
  })), 'FAIL_ADMIN_IDENTITY');
});
