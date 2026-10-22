import { Icon } from './Icon.jsx';

export function Card({ title, subtitle, actions, icon, children, className = '', padded = true, as: Tag = 'section', footer }) {
  return (
    <Tag className={`card ${className}`.trim()}>
      {(title || actions) && (
        <header className="card__header">
          <div className="card__heading">
            {icon ? <span className="card__icon" aria-hidden="true"><Icon name={icon} size={18} /></span> : null}
            <div className="card__titles">
              {title ? <h2 className="card__title">{title}</h2> : null}
              {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? <div className="card__actions">{actions}</div> : null}
        </header>
      )}
      <div className={padded ? 'card__body' : 'card__body card__body--flush'}>{children}</div>
      {footer ? <footer className="card__footer">{footer}</footer> : null}
    </Tag>
  );
}
