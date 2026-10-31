import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Run after npm run build. An Admin route's JS is still publicly downloadable.
const assets = new URL('../dist/assets/', import.meta.url);
const files = (await readdir(assets)).filter((name) => name.endsWith('.js'));
assert.ok(files.length, 'Build the app before checking browser privacy.');
for (const name of files) {
  const source = await readFile(new URL(name, assets), 'utf8');
  assert.doesNotMatch(source, /(?:fixedActualCents|variableActualCents|referredCommissionPerJobCents)\s*:\s*(?:\d|["'])/,
    `${name} embeds internal package values`);
  assert.doesNotMatch(source, /apartmentActualMonthlyCents\s*\?\?\s*(?:65000|65e3)/,
    `${name} embeds an internal apartment default`);
  assert.doesNotMatch(source, /10% of (?:the US Person|after-tax)|Gang allocation · 10%|\$200 per eligible active/ ,
    `${name} embeds an internal allocation rate`);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role["']\s*[,}]/,
    `${name} contains server-only credentials or configuration`);
}
console.log(`Checked ${files.length} browser chunks: no embedded internal package defaults or service-role configuration.`);
