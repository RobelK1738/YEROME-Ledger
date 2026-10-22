import { formatCurrency } from '../formatting/money.js';
import { formatDate } from '../formatting/dates.js';

export { formatDate };

/** Calendar date used for business-day comparisons (UTC, matching the API). */
export function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function addDaysISO(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Integer cents → currency, or an em dash when the amount is not available. */
export function money(cents) {
  return cents == null || !Number.isFinite(Number(cents)) ? '—' : formatCurrency(Number(cents));
}

const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** '2026-09-01' or '2026-09' → 'September 2026'. */
export function formatMonth(value) {
  if (!value) return '—';
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  if (!match) return String(value);
  return monthFmt.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export function formatDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) : dateTimeFmt.format(date);
}

/** 'today', 'in 3 days', '2 days ago' relative to a UTC calendar date. */
export function relativeDays(date, today = todayISO()) {
  if (!date) return '';
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function matchesQuery(query, ...fields) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => String(field ?? '').toLowerCase().includes(needle));
}
