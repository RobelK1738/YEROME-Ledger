import { BasisTag } from './Badge.jsx';

// Label/value rows that share one label column so figures align.
// items: [{ label, value, hint?, basis?, emphasis?, total? }]
export function DescriptionList({ items, className = '' }) {
  const rows = items.filter(Boolean);
  return (
    <dl className={`dlist ${className}`.trim()}>
      {rows.map((item, index) => (
        <div
          key={`${index}-${typeof item.label === 'string' ? item.label : ''}`}
          className={`dlist__row ${item.emphasis ? 'dlist__row--emphasis' : ''} ${item.total ? 'dlist__row--total' : ''}`.trim()}
        >
          <dt className="dlist__label">
            <span>{item.label}</span>
            {item.hint ? <span className="dlist__hint">{item.hint}</span> : null}
          </dt>
          <dd className="dlist__value">
            {item.value}
            {item.basis ? <BasisTag kind={item.basis} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
