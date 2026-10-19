import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settlementProposal, allocateWeightedCents } from '../src/lib/finance-v2/settlement.js';

const receipt = (net, gross = net + 50000) => ({ actualGrossCents: gross,
  actualNetReceivedCents: net, federalWithheldCents: gross - net,
  socialSecurityWithheldCents: 0, medicareWithheldCents: 0,
  additionalMedicareWithheldCents: 0, stateWithheldCents: 0,
  otherDeductionsCents: 0 });
const check = (id, date, net, status = 'paid') =>
  ({ id, payDate: date, status, receipt: receipt(net) });
const base = { ownerId: 'owner-a', calendarMonth: '2026-02-01',
  agreementVersionId: 'agreement-a', activeJobCount: 1,
  partnership: 'DIRECT_2_WAY' };

test('one completed owner month balances each check and one apartment', () => {
  const proposal = settlementProposal({ ...base, paychecks: [
    check('b', '2026-02-27', 100000), check('a', '2026-02-13', 200000),
  ] });
  assert.equal(proposal.afterTaxCents, 300000);
  assert.equal(proposal.quotedCostCents, 185000);
  assert.equal(proposal.actualCostCents, 105000);
  assert.equal(proposal.partnerDueCents, 57500);
  assert.equal(proposal.gangCutCents, 30000);
  assert.equal(proposal.yeromeResidualCents, 107500);
  assert.deepEqual(proposal.lines.map((line) => line.paycheckId), ['a', 'b']);
  for (const line of proposal.lines) assert.equal(line.sourceNetCents,
    line.actualCostCents + line.partnerDueCents + line.commissionCents +
    line.gangCutCents + line.yeromeResidualCents);
  for (const field of ['sourceNetCents','quotedCostCents','actualCostCents',
    'partnerDueCents','commissionCents','gangCutCents','yeromeResidualCents']) {
    const totalField = field === 'sourceNetCents' ? 'afterTaxCents' : field;
    assert.equal(proposal.lines.reduce((sum, line) => sum + line[field], 0), proposal[totalField]);
  }
});

test('referred settlement keeps full $200 job commission and 50% quoted share', () => {
  const proposal = settlementProposal({ ...base, partnership: 'MIKI_REFERRAL_2_WAY',
    paychecks: [check('a','2026-02-13',300000)] });
  assert.equal(proposal.quotedCostCents, 205000);
  assert.equal(proposal.partnerDueCents, 47500);
  assert.equal(proposal.commissionCents, 20000);
  assert.equal(proposal.yeromeResidualCents, 97500);
});

test('late or missing receipt blocks posting and a correction changes only a new proposal', () => {
  assert.throws(() => settlementProposal({ ...base, paychecks: [
    check('a','2026-02-13',300000), check('b','2026-02-27',0,'scheduled')],
  }), /received paystubs/);
  const old = settlementProposal({ ...base, paychecks: [check('a','2026-02-13',300000)] });
  const corrected = settlementProposal({ ...base, paychecks: [{ ...check('a','2026-02-13',299000),
    receiptCorrectionSequence: 1 }] });
  assert.equal(old.partnerDueCents, 57500);
  assert.equal(corrected.partnerDueCents, 57000);
  assert.equal(corrected.lines[0].receiptCorrectionSequence, 1);
  assert.equal(old.lines[0].receiptCorrectionSequence, 0);
});

test('negative quoted net stays visible and requires loss policy', () => {
  const proposal = settlementProposal({ ...base, paychecks: [check('a','2026-02-13',100000)] });
  assert.equal(proposal.partnerDueCents, -42500);
  assert.equal(proposal.needsLossDecision, true);
  assert.equal(proposal.afterTaxCents,
    proposal.actualCostCents + proposal.partnerDueCents + proposal.commissionCents +
    proposal.gangCutCents + proposal.yeromeResidualCents);
});

test('weighted cents allocation preserves signed totals and deterministic ties', () => {
  assert.deepEqual(allocateWeightedCents(101,[1,1,1]),[34,34,33]);
  assert.deepEqual(allocateWeightedCents(-101,[1,1,1]),[-34,-34,-33]);
  assert.deepEqual(allocateWeightedCents(3,[0,0]),[2,1]);
});
