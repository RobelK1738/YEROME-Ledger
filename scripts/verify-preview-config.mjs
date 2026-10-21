// One-time, build-only Preview diagnostic. Remove this file and the prebuild
// hook after the authorized check. Never import this module from browser code.
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';

const BRANCH = 'fix/production-v2-migration-rollout';
const PROJECT_URL = 'https://uliolbtonhrmjwaeliyj.supabase.co';
const ADMIN_EMAIL = 'robiemelaku@gmail.com';

export async function verifyPreviewConfig(env, listUsers) {
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== BRANCH) {
    return 'SKIP_SCOPE';
  }

  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (url !== PROJECT_URL ||
      (env.SUPABASE_URL && env.VITE_SUPABASE_URL &&
        env.SUPABASE_URL !== env.VITE_SUPABASE_URL)) return 'FAIL_PROJECT_SCOPE';
  if (env.ADMIN_EMAIL !== ADMIN_EMAIL) return 'FAIL_ADMIN_EMAIL';
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return 'FAIL_SERVICE_KEY';

  try {
    const { data, error } = await listUsers(url, env.SUPABASE_SERVICE_ROLE_KEY);
    if (error || !Array.isArray(data?.users)) return 'FAIL_AUTH_READ';
    const admins = data.users.filter((user) => user?.app_metadata?.role === 'admin');
    return admins.length === 1 && admins[0].email === ADMIN_EMAIL
      ? 'PASS' : 'FAIL_ADMIN_IDENTITY';
  } catch {
    return 'FAIL_AUTH_READ';
  }
}

async function listUsersOnce(url, serviceKey) {
  const client = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client.auth.admin.listUsers({ page: 1, perPage: 200 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await verifyPreviewConfig(process.env, listUsersOnce);
  process.stdout.write(`PREVIEW_CONFIG_DIAGNOSTIC=${result}\n`);
  if (result !== 'PASS' && result !== 'SKIP_SCOPE') process.exitCode = 1;
}
