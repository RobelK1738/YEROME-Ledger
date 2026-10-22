import { Icon } from './Icon.jsx';

const ICONS = { info: 'info', ok: 'checkCircle', warn: 'alert', danger: 'alert', neutral: 'info' };

/** Inline alert / callout. Errors announce assertively, everything else politely. */
export function Notice({ tone = 'info', title, children, action, onDismiss, className = '', role }) {
  const resolvedRole = role ?? (tone === 'danger' ? 'alert' : undefined);
  return (
    <div className={`notice notice--${tone} ${className}`.trim()} role={resolvedRole}>
      <Icon name={ICONS[tone] || 'info'} size={18} className="notice__icon" />
      <div className="notice__body">
        {title ? <p className="notice__title">{title}</p> : null}
        {children ? <div className="notice__text">{children}</div> : null}
        {action ? <div className="notice__action">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="notice__dismiss" onClick={onDismiss} aria-label="Dismiss">
          <Icon name="x" size={16} />
        </button>
      ) : null}
    </div>
  );
}
