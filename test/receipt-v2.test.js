import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatedReceipt } from '../src/lib/finance-v2/receipt.js';
import { allPages } from '../server/_lib/v2.js';

const input = { actualGrossCents: 129500, actualNetReceivedCents: 100000,
  federalWithheldCents: 20000, socialSecurityWithheldCents: 8000,
  medicareWithheldCents: 1500, additionalMedicareWithheldCents: 0,
  stateWithheldCents: 0, otherDeductionsCents: 0 };

test('receipt requires all cent fields and exact gross reconciliation', () => {
  assert.equal(validatedReceipt(input).actualGrossCents, 129500);
  assert.throws(() => validatedReceipt({ ...input, actualNetReceivedCents: 100001 }), /Gross must equal/);
  assert.throws(() => validatedReceipt({ ...input, otherDeductionsCents: null }), /otherDeductionsCents/);
  assert.throws(() => validatedReceipt({ ...input, federalWithheldCents: -1 }), /federalWithheldCents/);
});

test('paginated ledger loader retrieves more than 500 rows without truncation', async () => {
  const records = Array.from({ length: 1101 }, (_, id) => ({ id }));
  const query = () => ({ range: async (from, to) => ({ data: records.slice(from, to + 1), error: null }) });
  const loaded = await allPages(query, 500);
  assert.equal(loaded.length, 1101);
  assert.equal(loaded.at(-1).id, 1100);
});
