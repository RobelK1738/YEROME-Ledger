import { Link } from 'react-router-dom';
import { Icon } from './Icon.jsx';

function classes({ variant = 'secondary', size, block, iconOnly, className }) {
  return ['btn', `btn--${variant}`, size && `btn--${size}`, block && 'btn--block', iconOnly && 'btn--icon', className]
    .filter(Boolean).join(' ');
}

function Content({ icon, iconRight, loading, children }) {
  return <>
    {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={16} /> : null}
    {children != null ? <span className="btn__label">{children}</span> : null}
    {iconRight ? <Icon name={iconRight} size={16} /> : null}
  </>;
}

/** Native button. `loading` disables it and marks it busy to prevent double submits. */
export function Button({ variant, size, block, icon, iconRight, loading = false, className, children, type = 'button', disabled, ...props }) {
  return (
    <button
      type={type}
      className={classes({ variant, size, block, iconOnly: !children && icon, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <Content icon={icon} iconRight={iconRight} loading={loading}>{children}</Content>
    </button>
  );
}

export function ButtonLink({ to, variant, size, block, icon, iconRight, className, children, ...props }) {
  return (
    <Link to={to} className={classes({ variant, size, block, iconOnly: !children && icon, className })} {...props}>
      <Content icon={icon} iconRight={iconRight}>{children}</Content>
    </Link>
  );
}

export function ButtonGroup({ children, align = 'start', className = '' }) {
  return <div className={`btn-group btn-group--${align} ${className}`.trim()}>{children}</div>;
}
