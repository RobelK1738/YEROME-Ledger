// Date helpers for pay schedules. All dates are date-only ISO strings
// ("YYYY-MM-DD"). Parsing/formatting is done in UTC to avoid timezone/DST drift.

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function toISO(dt) {
  return dt.toISOString().slice(0, 10);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const dt = parseISO(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return toISO(dt);
}

export function addMonths(iso, months) {
  const dt = parseISO(iso);
  const day = dt.getUTCDate();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + months);
  // Clamp to the last valid day of the resulting month.
  const daysInMonth = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(day, daysInMonth));
  return toISO(dt);
}

/**
 * Generate `count` pay dates starting at `startISO` for a pay frequency.
 *   weekly      -> every 7 days
 *   biweekly    -> every 14 days
 *   monthly     -> same day each month (clamped)
 */
export function generatePayDates(startISO, count, frequency) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    let d;
    if (frequency === 'weekly') d = addDays(startISO, i * 7);
    else if (frequency === 'monthly') d = addMonths(startISO, i);
    else if (frequency === 'biweekly') d = addDays(startISO, i * 14);
    else if (frequency === 'semimonthly') throw new RangeError('Semi-monthly schedules need two verified payday anchors');
    else throw new RangeError('Unsupported pay frequency');
    out.push(d);
  }
  return out;
}

function validDate(iso) {
  try { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) && toISO(parseISO(iso)) === iso; }
  catch { return false; }
}

/** Derive a completed month's obligations from the employer's recorded anchor. */
export function expectedPayDatesForMonth(firstPayDate, month, frequency) {
  if (!validDate(firstPayDate) || !validDate(month) || !month.endsWith('-01')) {
    throw new RangeError('A verified first payday and calendar month are required');
  }
  if (frequency === 'semimonthly') throw new RangeError('Semi-monthly schedules need two verified payday anchors');
  const end = toISO(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)));
  if (firstPayDate > end) return [];
  if (frequency === 'monthly') {
    const anchored = addMonths(firstPayDate,
      (Number(month.slice(0, 4)) - Number(firstPayDate.slice(0, 4))) * 12 +
      Number(month.slice(5, 7)) - Number(firstPayDate.slice(5, 7)));
    return anchored >= firstPayDate && anchored >= month && anchored <= end ? [anchored] : [];
  }
  const step = { weekly: 7, biweekly: 14 }[frequency];
  if (!step) throw new RangeError('Unsupported pay frequency');
  const days = Math.round((parseISO(month) - parseISO(firstPayDate)) / 86400000);
  const firstIndex = Math.max(0, Math.ceil(days / step));
  const dates = [];
  for (let index = firstIndex; ; index += 1) {
    const date = addDays(firstPayDate, index * step);
    if (date > end) break;
    dates.push(date);
  }
  return dates;
}

/** Generate from the original anchor so clamped February never shifts March. */
export function generateScheduledPayDates(anchor, requestedStart, count, frequency) {
  if (!validDate(anchor) || !validDate(requestedStart) || !Number.isInteger(count) || count < 1 || count > 52) {
    throw new RangeError('A recorded payroll cadence and 1–52 dates are required');
  }
  const month = `${requestedStart.slice(0, 7)}-01`;
  if (!expectedPayDatesForMonth(anchor, month, frequency).includes(requestedStart)) {
    throw new RangeError('First payday does not match the recorded payroll cadence');
  }
  let index;
  if (frequency === 'monthly') index =
    (Number(requestedStart.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 +
    Number(requestedStart.slice(5, 7)) - Number(anchor.slice(5, 7));
  else index = Math.round((parseISO(requestedStart) - parseISO(anchor)) / 86400000) /
    (frequency === 'weekly' ? 7 : 14);
  return Array.from({ length: count }, (_, offset) =>
    frequency === 'monthly' ? addMonths(anchor, index + offset) :
      addDays(anchor, (index + offset) * (frequency === 'weekly' ? 7 : 14)));
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(iso) {
  if (!iso) return '—';
  try {
    return dateFmt.format(parseISO(iso));
  } catch {
    return iso;
  }
}
