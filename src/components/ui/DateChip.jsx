const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

/** Calendar-style date block for agenda lists. `date` is YYYY-MM-DD. */
export function DateChip({ date, tone = 'default' }) {
  const parsed = new Date(`${date}T00:00:00Z`);
  const valid = !Number.isNaN(parsed.getTime());
  return (
    <span className={`date-chip date-chip--${tone}`} aria-hidden="true">
      <span className="date-chip__month">{valid ? monthFmt.format(parsed) : '—'}</span>
      <span className="date-chip__day">{valid ? parsed.getUTCDate() : ''}</span>
    </span>
  );
}
