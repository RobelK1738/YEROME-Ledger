import { money } from '../../lib/presentation/format.js';

/** Integer cents as tabular currency; missing values read as "Not available". */
export function Money({ cents, period, tone, className = '' }) {
  if (cents == null) {
    return <span className={`money money--missing ${className}`.trim()} title="Not available">—<span className="sr-only">Not available</span></span>;
  }
  const value = Number(cents);
  const resolvedTone = tone || (value < 0 ? 'negative' : 'default');
  return (
    <span className={`money money--${resolvedTone} ${className}`.trim()}>
      {money(value)}
      {period ? <span className="money__period"> / {period}</span> : null}
    </span>
  );
}
