#!/usr/bin/env bash
set -euo pipefail

for command_name in initdb pg_ctl psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing %s; install local PostgreSQL to run the disposable security suite.\n' "$command_name" >&2
    exit 2
  fi
done

test_root="$(cd "$(dirname "$0")/.." && pwd)"
test_tmp="$(mktemp -d /tmp/yerome-security-XXXXXX)"
test_port="$((20000 + RANDOM % 30000))"
cleanup() {
  if [ -f "$test_tmp/data/postmaster.pid" ]; then
    pg_ctl -D "$test_tmp/data" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$test_tmp"
}
trap cleanup EXIT

initdb -D "$test_tmp/data" --auth=trust --no-instructions >/dev/null
pg_ctl -D "$test_tmp/data" -o "-k $test_tmp -p $test_port -c listen_addresses=''" \
  -l "$test_tmp/server.log" start >/dev/null
psql -h "$test_tmp" -p "$test_port" -d postgres -v ON_ERROR_STOP=1 \
  -f "$test_root/test/fixtures/auth-shim.sql" >/dev/null
for migration_file in "$test_root"/supabase/migrations/*.sql; do
  psql -h "$test_tmp" -p "$test_port" -d postgres -v ON_ERROR_STOP=1 \
    -f "$migration_file" >/dev/null
done
psql -h "$test_tmp" -p "$test_port" -d postgres -v ON_ERROR_STOP=1 \
  -f "$test_root/test/fixtures/security-v2.sql" >/dev/null
psql -h "$test_tmp" -p "$test_port" -d postgres -v ON_ERROR_STOP=1 \
  -f "$test_root/supabase/seed.sql" >/dev/null
seed_rows="$(psql -h "$test_tmp" -p "$test_port" -d postgres -At -v ON_ERROR_STOP=1 \
  -c "select count(*) from public.job_compensation_terms where job_id in
       ('10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000002')")"
if [ "$seed_rows" != 3 ]; then
  printf 'Disposable v2 seed did not create three demo job terms.\n' >&2
  exit 1
fi
printf 'Disposable PostgreSQL migrations, role/security assertions, and v2 seed passed.\n'
