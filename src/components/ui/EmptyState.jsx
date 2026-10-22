import { Icon } from './Icon.jsx';

export function EmptyState({ icon = 'file', title = 'Nothing here yet', message, action, compact = false }) {
  return (
    <div className={`state state--empty ${compact ? 'state--compact' : ''}`.trim()}>
      <div className="state__icon" aria-hidden="true"><Icon name={icon} size={22} /></div>
      <h3 className="state__title">{title}</h3>
      {message ? <p className="state__text">{message}</p> : null}
      {action ? <div className="state__action">{action}</div> : null}
    </div>
  );
}
