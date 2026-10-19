import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postedSettlementView, adminPostedSettlementDto } from '../src/lib/finance-v2/posted-settlement.js';
import { projectPerson, ownerStatementDto } from '../src/lib/finance-v2/projection.js';

test('receipt correction changes all Admin totals and the owner due without losing cents', () => {
  const row = { source_net_cents: 300000, quoted_cost_cents: 185000,
    actual_cost_cents: 105000, partner_due_cents: 57500,
    commission_cents: 0, gang_cut_cents: 30000, yerome_residual_cents: 107500 };
  const adjustment = { after_tax_delta_cents: -1000, quoted_cost_delta_cents: 0,
    actual_cost_delta_cents: 0,
    partner_due_delta_cents: -500, commission_delta_cents: 0,
    gang_delta_cents: -100, yerome_delta_cents: -400 };
  const view = postedSettlementView(row, [adjustment],
    [{ amount_cents: 10000, paid_at: '2026-03-01T12:00:00Z' }]);
  assert.deepEqual(view.original, {
    sourceNetCents: 300000, quotedCostCents: 185000, actualCostCents: 105000,
    partnerDueCents: 57500, commissionCents: 0, gangCutCents: 30000,
    yeromeResidualCents: 107500 });
  assert.equal(view.changes.sourceNetCents, -1000);
  assert.equal(view.current.sourceNetCents, 299000);
  assert.equal(view.current.actualCostCents, 105000);
  assert.equal(view.current.partnerDueCents, 57000);
  assert.equal(view.current.gangCutCents, 29900);
  assert.equal(view.current.yeromeResidualCents, 107100);
  assert.equal(view.owedCents, 47000);
  assert.equal(view.overpaidCents, 0);
  const admin = adminPostedSettlementDto({ ...row, id: 'settlement-a',
    job_paycheck_id: 'check-a', pay_date: '2026-02-13', receipt_correction_sequence: 0 },
  [adjustment], [{ amount_cents: 10000, paid_at: '2026-03-01T12:00:00Z' }]);
  assert.equal(admin.sourceNetCents, 299000);
  assert.equal(admin.original.yeromeResidualCents, 107500);
  assert.equal(admin.changes.yeromeResidualCents, -400);
  assert.equal(admin.yeromeResidualCents, 107100);
  const person = ownerStatementDto(projectPerson({ owner: {
    id: 'person-a', display_name: 'Person A', filing_status: 'single',
    state: 'TX', status: 'active', v2_partnership: 'DIRECT_2_WAY',
    agreement_verified_at: '2026-01-01T00:00:00Z' },
  partnerSettlements: [{ paycheckId: admin.paycheckId, payDate: admin.payDate,
    partnerDueOriginalCents: admin.original.partnerDueCents,
    partnerDueChangesCents: admin.changes.partnerDueCents,
    partnerDueCents: admin.partnerDueCents, paidCents: admin.paidCents,
    owedCents: admin.owedCents }] }));
  assert.equal(person.partnerSettlements[0].partnerDueCents, 57000);
  assert.equal(person.partnerSettlements[0].partnerDueChangesCents, -500);
  assert.equal('yeromeResidualCents' in person.partnerSettlements[0], false);
  assert.equal('actualCostCents' in person.partnerSettlements[0], false);
  assert.throws(() => postedSettlementView(row, [{ ...adjustment,
    yerome_delta_cents: 0 }]), /conserve cents/);
});
