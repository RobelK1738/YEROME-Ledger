import { useId } from 'react';
import { Icon } from './Icon.jsx';

export function FilterBar({ children, summary }) {
  return (
    <div className="filter-bar">
      <div className="filter-bar__controls">{children}</div>
      {summary ? <p className="filter-bar__summary" aria-live="polite">{summary}</p> : null}
    </div>
  );
}

export function SearchInput({ value, onChange, label = 'Search', placeholder = 'Search…' }) {
  const id = useId();
  return (
    <div className="search">
      <label className="sr-only" htmlFor={id}>{label}</label>
      <Icon name="search" size={16} className="search__icon" />
      <input
        id={id}
        type="search"
        className="input search__input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
      />
      {value ? (
        <button type="button" className="search__clear" onClick={() => onChange('')} aria-label="Clear search">
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options, allLabel = 'All' }) {
  const id = useId();
  return (
    <div className="filter-select">
      <label className="filter-select__label" htmlFor={id}>{label}</label>
      <div className="select">
        <select id={id} className="input select__control" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{allLabel}</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <Icon name="chevronDown" size={16} className="select__chevron" />
      </div>
    </div>
  );
}
