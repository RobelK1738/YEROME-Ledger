import { useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from './Icon.jsx';

/** In-page tabs (WAI-ARIA tabs pattern with arrow-key navigation). */
export function Tabs({ tabs, value, onChange, label = 'Sections', idPrefix = 'tab' }) {
  const refs = useRef([]);
  const onKeyDown = (event, index) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1 };
    let next = null;
    if (keys[event.key]) next = (index + keys[event.key] + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next == null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => { refs.current[index] = node; }}
          id={`${idPrefix}-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          aria-controls={`${idPrefix}-${tab.id}-panel`}
          tabIndex={value === tab.id ? 0 : -1}
          className={`tabs__tab ${value === tab.id ? 'tabs__tab--active' : ''}`}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.icon ? <Icon name={tab.icon} size={16} /> : null}
          <span>{tab.label}</span>
          {tab.count != null ? <span className="tabs__count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, idPrefix = 'tab', children }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-${id}-panel`} aria-labelledby={`${idPrefix}-${id}`} tabIndex={0} className="tab-panel">
      {children}
    </div>
  );
}

/** Section navigation backed by URLs so back/forward and deep links work. */
export function SectionNav({ items, label = 'Section navigation' }) {
  return (
    <nav className="tabs tabs--nav" aria-label={label}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          replace={item.replace}
          className={({ isActive }) => `tabs__tab ${isActive ? 'tabs__tab--active' : ''}`}
        >
          {item.icon ? <Icon name={item.icon} size={16} /> : null}
          <span>{item.label}</span>
          {item.count ? <span className={`tabs__count ${item.countTone ? `tabs__count--${item.countTone}` : ''}`}>{item.count}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}
