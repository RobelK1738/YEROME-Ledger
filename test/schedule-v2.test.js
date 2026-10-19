import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedPayDatesForMonth, generateScheduledPayDates, generatePayDates } from '../src/lib/formatting/dates.js';

test('expected employer dates expose unscheduled biweekly checks and other jobs', () => {
  assert.deepEqual(expectedPayDatesForMonth('2026-02-13', '2026-02-01', 'biweekly'),
    ['2026-02-13', '2026-02-27']);
  assert.deepEqual(expectedPayDatesForMonth('2026-02-06', '2026-02-01', 'weekly'),
    ['2026-02-06', '2026-02-13', '2026-02-20', '2026-02-27']);
  assert.deepEqual(expectedPayDatesForMonth('2026-01-31', '2026-02-01', 'monthly'),
    ['2026-02-28']);
  assert.deepEqual(expectedPayDatesForMonth('2024-01-31', '2024-02-01', 'monthly'),
    ['2024-02-29']);
  assert.deepEqual(generateScheduledPayDates('2026-01-31', '2026-02-28', 2, 'monthly'),
    ['2026-02-28', '2026-03-31']);
  assert.throws(() => generateScheduledPayDates('2026-01-31', '2026-02-27', 2, 'monthly'),
    /recorded payroll cadence/);
});

test('semi-monthly recurrence is blocked until two employer anchors are recorded', () => {
  assert.throws(() => expectedPayDatesForMonth('2026-01-20', '2026-02-01', 'semimonthly'),
    /two verified payday anchors/);
  assert.throws(() => generatePayDates('2026-01-20', 4, 'semimonthly'),
    /two verified payday anchors/);
});


test('historical and future payroll schedules select dated terms and reject crossings', async () => {
  const { generateEffectivePayDates } = await import('../src/lib/formatting/dates.js');
  const terms = [
    { id: 'old', effective_from: '2026-01-01', effective_to: '2026-06-30',
      first_pay_date: '2026-02-13', pay_frequency: 'biweekly' },
    { id: 'new', effective_from: '2026-07-01', effective_to: null,
      first_pay_date: '2026-07-31', pay_frequency: 'monthly' },
  ];
  assert.deepEqual(generateEffectivePayDates(terms, '2026-02-13', 2),
    { termId: 'old', dates: ['2026-02-13', '2026-02-27'] });
  assert.deepEqual(generateEffectivePayDates(terms, '2026-07-31', 2),
    { termId: 'new', dates: ['2026-07-31', '2026-08-31'] });
  assert.throws(() => generateEffectivePayDates(terms, '2026-06-19', 2), /term boundary/);
  assert.throws(() => generateEffectivePayDates(terms, '2025-12-31', 1), /unique payroll term/);
  assert.throws(() => generateEffectivePayDates([...terms, { ...terms[0], id: 'overlap' }],
    '2026-02-13', 2), /unique payroll term/);
  assert.throws(() => generateEffectivePayDates(terms, '2026-02-14', 1), /recorded payroll cadence/);
});
