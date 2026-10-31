import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createOwner } from '../../../lib/data/adminApi.js';
import { emptyPersonForm } from '../../../lib/presentation/forms.js';
import { FILING_STATUS_OPTIONS, PARTNERSHIP_LABELS, PARTNERSHIP_OPTIONS } from '../../../lib/presentation/labels.js';
import { USERNAME_EXAMPLE, normalizeUsername, usernameError } from '../../../lib/presentation/username.js';
import { friendlyMessage } from '../../../components/ui/ErrorState.jsx';
import { PageHeader } from '../../../components/ui/PageHeader.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { ChoiceGroup, Field, FormActions, FormSection, PasswordInput, Select, TextInput } from '../../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../../components/ui/Button.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';
import { DescriptionList } from '../../../components/ui/DescriptionList.jsx';
import { Icon } from '../../../components/ui/Icon.jsx';
import { useToast } from '../../../components/ui/Feedback.jsx';

const STEPS = [
  { id: 'identity', label: 'Identity & sign-in' },
  { id: 'partnership', label: 'Partnership' },
  { id: 'review', label: 'Review & create' },
];

function validate(step, form) {
  const errors = {};
  if (step === 0) {
    if (!form.displayName.trim()) errors.displayName = 'Enter the name YEROME uses for this person.';
    const username = usernameError(form.username);
    if (username) errors.username = username;
    if (!form.password) errors.password = 'Set a temporary password for their first sign-in.';
  }
  return errors;
}

function Stepper({ current, onSelect, maxReached }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {STEPS.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
        const reachable = index <= maxReached && index !== current;
        return (
          <li key={step.id} className={`stepper__item is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <button type="button" className="stepper__button" disabled={!reachable} onClick={() => onSelect(index)}>
              <span className="stepper__marker" aria-hidden="true">
                {state === 'done' ? <Icon name="check" size={14} strokeWidth={3} /> : index + 1}
              </span>
              <span className="stepper__label">{step.label}</span>
              {state === 'done' ? <span className="sr-only"> (complete)</span> : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Created({ owner, username, onReset }) {
  return (
    <Card className="success-card">
      <div className="success-card__icon" aria-hidden="true"><Icon name="checkCircle" size={28} /></div>
      <h2 className="success-card__title">{owner.display_name} was added</h2>
      <p className="success-card__text">
        They sign in on the <strong>US Person</strong> tab with the username <code className="code">{username}</code> and the
        temporary password you set. Share the password privately — YEROME Ledger does not send it.
      </p>
      <div className="btn-group btn-group--center">
        <ButtonLink to={`/admin/jobs/new?owner=${owner.id}`} variant="primary" icon="briefcase">Add their first job</ButtonLink>
        <ButtonLink to={`/admin/people/${owner.id}`} variant="secondary">Open profile</ButtonLink>
        <Button variant="ghost" onClick={onReset}>Add another person</Button>
      </div>
    </Card>
  );
}

export default function PersonCreate() {
  const { notify } = useToast();
  const [form, setForm] = useState(emptyPersonForm);
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const headingRef = useRef(null);

  const set = (key, value) => {
    setForm((state) => ({ ...state, [key]: value }));
    if (errors[key]) setErrors((state) => ({ ...state, [key]: undefined }));
  };

  function goTo(index) {
    setStep(index);
    setMaxReached((value) => Math.max(value, index));
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function next(event) {
    event.preventDefault();
    const found = validate(step, form);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`person-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    if (step < STEPS.length - 1) goTo(step + 1);
    else create();
  }

  async function create() {
    for (let index = 0; index < STEPS.length - 1; index += 1) {
      const found = validate(index, form);
      if (Object.keys(found).length) { setErrors(found); goTo(index); return; }
    }
    if (busy) return;
    setBusy(true);
    setServerError('');
    try {
      const result = await createOwner(form);
      setCreated({ owner: result.owner, username: normalizeUsername(form.username) });
      setForm((state) => ({ ...state, password: '' }));
      notify(`${result.owner?.display_name || 'US Person'} created.`);
    } catch (caught) {
      const message = friendlyMessage(caught);
      if (/username/i.test(message)) {
        setErrors({ username: message });
        goTo(0);
      } else {
        setServerError(message || 'Could not create the US Person.');
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setForm(emptyPersonForm());
    setCreated(null);
    setErrors({});
    setServerError('');
    setStep(0);
    setMaxReached(0);
  }

  const username = normalizeUsername(form.username);
  const usernameValid = form.username && !usernameError(form.username);

  return <div className="form-page">
    <PageHeader back={{ to: '/admin/people', label: 'US Persons' }} title="Add US Person"
      subtitle="Create a sign-in for the person and set their projection inputs. You can add jobs right after." />

    {created ? <Created owner={created.owner} username={created.username} onReset={reset} /> : <>
      <Stepper current={step} maxReached={maxReached} onSelect={goTo} />
      <form className="card form-card" onSubmit={next} noValidate>
        <div className="card__body">
          <h2 className="sr-only" tabIndex={-1} ref={headingRef}>Step {step + 1} of {STEPS.length}: {STEPS[step].label}</h2>

          {step === 0 ? <>
            <FormSection step="1" title="Identity" description="How this person appears throughout YEROME Ledger.">
              <Field label="Display name" id="person-displayName" required full error={errors.displayName}
                hint="Their real name as shown to Admin and on their own portal, e.g. Michael Abate.">
                <TextInput value={form.displayName} autoComplete="off" onChange={(e) => set('displayName', e.target.value)} />
              </Field>
            </FormSection>
            <FormSection step="2" title="Sign-in account" description="The US Person signs in with a username — not an email address.">
              <Field label="Login username" id="person-username" required error={errors.username}
                hint={<>3–40 characters: lowercase letters, numbers and underscores. Example: <code className="code">{USERNAME_EXAMPLE}</code>. Not an email address.</>}>
                <TextInput value={form.username} autoComplete="off" autoCapitalize="none" spellCheck={false}
                  placeholder={USERNAME_EXAMPLE}
                  onChange={(e) => set('username', e.target.value)}
                  onBlur={() => form.username && setErrors((state) => ({ ...state, username: usernameError(form.username) || undefined }))} />
              </Field>
              <Field label="Temporary password" id="person-password" required error={errors.password}
                hint="Share it privately. They can be given a new one later.">
                <PasswordInput value={form.password} autoComplete="new-password" onChange={(e) => set('password', e.target.value)} />
              </Field>
              {usernameValid ? (
                <p className="form-preview field--full">
                  <Icon name="user" size={16} /> Signs in as <strong>{username}</strong> on the US Person tab.
                </p>
              ) : null}
            </FormSection>
          </> : null}

          {step === 1 ? <>
            <FormSection step="3" title="Partnership model" columns={1}
              description="Determines the planning charges and whether a referral commission applies.">
              <ChoiceGroup label="Partnership" layout="cards" options={PARTNERSHIP_OPTIONS} value={form.partnership}
                onChange={(value) => set('partnership', value)} required />
              {form.partnership === 'MIKI_REFERRAL_2_WAY' ? (
                <Notice tone="info">After creating this person, record the referral under <strong>Owners → Referrals</strong>. Their projection is available immediately. The referral link identifies who earns the commission.</Notice>
              ) : null}
            </FormSection>
            <FormSection step="4" title="Tax filing status" description="Used only for the 2026 planning tax estimate.">
              <Field label="Filing status" id="person-filingStatus">
                <Select value={form.filingStatus} options={FILING_STATUS_OPTIONS} onChange={(e) => set('filingStatus', e.target.value)} />
              </Field>
            </FormSection>
          </> : null}

          {step === 2 ? <>
            <FormSection title="Review" columns={1} description="Check the details before creating the account.">
              <DescriptionList items={[
                { label: 'Display name', value: form.displayName.trim() },
                { label: 'Login username', value: <code className="code">{username}</code> },
                { label: 'Temporary password', value: '•'.repeat(Math.min(form.password.length, 12)) },
                { label: 'Partnership', value: PARTNERSHIP_LABELS[form.partnership] },
                { label: 'Filing status', value: FILING_STATUS_OPTIONS.find((o) => o.value === form.filingStatus)?.label },
              ]} />
              <div className="btn-group">
                <Button size="sm" variant="ghost" icon="edit" onClick={() => goTo(0)}>Edit sign-in</Button>
                <Button size="sm" variant="ghost" icon="edit" onClick={() => goTo(1)}>Edit partnership</Button>
              </div>
            </FormSection>
            {serverError ? <Notice tone="danger" title="The US Person was not created">{serverError}</Notice> : null}
          </> : null}
        </div>
        <div className="card__footer">
          <FormActions align="between">
            {step === 0 ? <Link className="btn btn--ghost" to="/admin/people">Cancel</Link>
              : <Button variant="ghost" icon="arrowLeft" onClick={() => goTo(step - 1)}>Back</Button>}
            <span className="form-actions__step">Step {step + 1} of {STEPS.length}</span>
            {step < STEPS.length - 1 ? <Button type="submit" variant="primary" iconRight="arrowRight">Continue</Button>
              : <Button type="submit" variant="primary" icon="check" loading={busy}>Create US Person</Button>}
          </FormActions>
        </div>
      </form>
    </>}
  </div>;
}
