import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '../../lib/constants.js';
import { Icon } from './Icon.jsx';

export function useDocumentTitle(title) {
  useEffect(() => {
    if (title) document.title = `${title} · ${APP_NAME}`;
  }, [title]);
}

export function PageHeader({ title, subtitle, actions, back, eyebrow, meta, documentTitle }) {
  useDocumentTitle(documentTitle || (typeof title === 'string' ? title : null));
  return (
    <header className="page-header">
      <div className="page-header__text">
        {back ? (
          <Link className="page-header__back" to={back.to}>
            <Icon name="arrowLeft" size={16} />
            <span>{back.label}</span>
          </Link>
        ) : null}
        {eyebrow ? <p className="page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="page-header__title">{title}</h1>
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
        {meta ? <div className="page-header__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
