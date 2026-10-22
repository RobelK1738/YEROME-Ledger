import { Link } from 'react-router-dom';
import { Icon } from './Icon.jsx';
import { BasisTag } from './Badge.jsx';

// KPI tile. `basis` states whether the figure is an estimate, recorded fact, etc.
export function StatCard({ label, value, hint, basis, icon, tone = 'default', emphasis = false, to, linkLabel }) {
  const body = <>
    <div className="stat__top">
      {icon ? <span className="stat__icon" aria-hidden="true"><Icon name={icon} size={18} /></span> : null}
      <span className="stat__label">{label}</span>
      {basis ? <BasisTag kind={basis} /> : null}
    </div>
    <span className={`stat__value stat__value--${tone}`}>{value}</span>
    {hint ? <span className="stat__hint">{hint}</span> : null}
    {to ? <span className="stat__link">{linkLabel || 'View'} <Icon name="arrowRight" size={14} /></span> : null}
  </>;
  const className = `stat ${emphasis ? 'stat--emphasis' : ''} ${to ? 'stat--link' : ''}`.trim();
  return to ? <Link to={to} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}

export function StatGrid({ children, columns }) {
  return <div className={`stat-grid ${columns ? `stat-grid--${columns}` : ''}`.trim()}>{children}</div>;
}
