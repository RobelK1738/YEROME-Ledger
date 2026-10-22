// Form primitives. A <Field> owns the label, hint and error and wires their ids
// into the control inside it, so every input gets a visible label and correct
// aria-describedby / aria-invalid without each page repeating that plumbing.

import { createContext, useContext, useId, useState } from 'react';
import { Icon } from './Icon.jsx';

const FieldContext = createContext(null);

function cx(...names) {
  return names.filter(Boolean).join(' ');
}

export function Field({ label, htmlFor, id: idProp, hint, error, required, optional, full, className, children }) {
  const autoId = useId();
  const id = idProp || htmlFor || `field-${autoId.replace(/:/g, '')}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error), required }}>
      <div className={cx('field', error && 'field--error', full && 'field--full', className)}>
        {label ? (
          <label className="field__label" htmlFor={id}>
            <span>{label}</span>
            {required ? <span className="field__req" aria-hidden="true">*</span> : null}
            {optional ? <span className="field__optional">Optional</span> : null}
          </label>
        ) : null}
        {children}
        {hint ? <p className="field__hint" id={hintId}>{hint}</p> : null}
        {error ? (
          <p className="field__error" id={errorId}>
            <Icon name="alert" size={14} />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

function useControlProps(props) {
  const ctx = useContext(FieldContext);
  return {
    ...props,
    id: props.id || ctx?.id,
    'aria-describedby': props['aria-describedby'] || ctx?.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (ctx?.invalid ? true : undefined),
    required: props.required ?? ctx?.required,
  };
}

export function TextInput({ className, ...props }) {
  return <input className={cx('input', className)} {...useControlProps(props)} />;
}

export function TextArea({ className, ...props }) {
  return <textarea className={cx('input input--textarea', className)} {...useControlProps(props)} />;
}

export function Select({ options, placeholder, className, children, ...props }) {
  return (
    <div className="select">
      <select className={cx('input select__control', className)} {...useControlProps(props)}>
        {placeholder != null ? <option value="">{placeholder}</option> : null}
        {options ? options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
        )) : children}
      </select>
      <Icon name="chevronDown" size={16} className="select__chevron" />
    </div>
  );
}

/** Input with fixed adornments such as "$" or "/ month". */
export function AffixInput({ prefix, suffix, className, ...props }) {
  return (
    <div className={cx('affix', prefix && 'affix--prefix', suffix && 'affix--suffix')}>
      {prefix ? <span className="affix__text affix__text--prefix" aria-hidden="true">{prefix}</span> : null}
      <input className={cx('input', className)} {...useControlProps(props)} />
      {suffix ? <span className="affix__text affix__text--suffix" aria-hidden="true">{suffix}</span> : null}
    </div>
  );
}

export function MoneyInput({ suffix, min = '0', step = '0.01', ...props }) {
  return <AffixInput prefix="$" suffix={suffix} type="number" inputMode="decimal" min={min} step={step} {...props} />;
}

export function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  const controlProps = useControlProps(props);
  return (
    <div className="affix affix--suffix affix--button">
      <input className="input" {...controlProps} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="affix__button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={controlProps.id}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  );
}

/** Full-width checkbox row with an optional description. */
export function Checkbox({ label, description, className, ...props }) {
  const autoId = useId();
  const id = props.id || `check-${autoId.replace(/:/g, '')}`;
  return (
    <label className={cx('check', props.disabled && 'check--disabled', className)} htmlFor={id}>
      <input type="checkbox" className="check__input" {...props} id={id} />
      <span className="check__box" aria-hidden="true"><Icon name="check" size={14} strokeWidth={3} /></span>
      <span className="check__text">
        <span className="check__label">{label}</span>
        {description ? <span className="check__description">{description}</span> : null}
      </span>
    </label>
  );
}

export function Switch({ label, description, className, ...props }) {
  const autoId = useId();
  const id = props.id || `switch-${autoId.replace(/:/g, '')}`;
  return (
    <label className={cx('switch', className)} htmlFor={id}>
      <span className="check__text">
        <span className="check__label">{label}</span>
        {description ? <span className="check__description">{description}</span> : null}
      </span>
      <input type="checkbox" role="switch" className="switch__input" {...props} id={id} />
      <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>
    </label>
  );
}

/** Radio group rendered as a segmented control (or stacked option cards). */
export function ChoiceGroup({ label, name, options, value, onChange, layout = 'segmented', hint, required }) {
  const autoId = useId();
  const groupName = name || `choice-${autoId.replace(/:/g, '')}`;
  const hintId = hint ? `${groupName}-hint` : undefined;
  return (
    <fieldset className={cx('choice', `choice--${layout}`)} aria-describedby={hintId}>
      {label ? (
        <legend className="field__label">
          <span>{label}</span>
          {required ? <span className="field__req" aria-hidden="true">*</span> : null}
        </legend>
      ) : null}
      <div className="choice__options">
        {options.map((option) => (
          <label key={option.value} className={cx('choice__option', value === option.value && 'is-selected')}>
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={option.disabled}
            />
            <span className="choice__body">
              <span className="choice__label">{option.label}</span>
              {option.description && layout !== 'segmented' ? (
                <span className="choice__description">{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      {hint ? <p className="field__hint" id={hintId}>{hint}</p> : null}
    </fieldset>
  );
}

/** Groups related fields under a heading; children flow in a responsive grid. */
export function FormSection({ step, title, description, columns = 2, aside, children }) {
  return (
    <section className="form-section">
      {title ? (
        <header className="form-section__header">
          {step ? <span className="form-section__step" aria-hidden="true">{step}</span> : null}
          <div>
            <h3 className="form-section__title">{title}</h3>
            {description ? <p className="form-section__description">{description}</p> : null}
          </div>
          {aside ? <div className="form-section__aside">{aside}</div> : null}
        </header>
      ) : null}
      <div className={cx('form-grid', columns === 1 && 'form-grid--single', columns === 3 && 'form-grid--three')}>
        {children}
      </div>
    </section>
  );
}

export function FormActions({ children, align = 'end', sticky = false }) {
  return <div className={cx('form-actions', `form-actions--${align}`, sticky && 'form-actions--sticky')}>{children}</div>;
}
