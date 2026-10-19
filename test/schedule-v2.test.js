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
