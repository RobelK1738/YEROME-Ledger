import { useState } from 'react';
import { createOwner } from '../../../lib/data/adminApi.js';
import { emptyPersonForm } from '../../../lib/presentation/forms.js';
import { FILING_STATUS_OPTIONS, PARTNERSHIP_OPTIONS } from '../../../lib/presentation/labels.js';
import { normalizeUsername, usernameError } from '../../../lib/presentation/username.js';
import { useMutation } from '../../../hooks/useMutation.js';
import { PageHeader } from '../../../components/ui/PageHeader.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { ChoiceGroup, Field, FormSection, PasswordInput, Select, TextInput } from '../../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../../components/ui/Button.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';

export default function PersonCreate() {
  const [form, setForm] = useState(emptyPersonForm);
  const [created, setCreated] = useState(null);
  const { run, busy, error, setError } = useMutation();
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  function submit(event) {
    event.preventDefault();
    const invalidUsername = usernameError(form.username);
    if (invalidUsername) { setError(invalidUsername); return; }
    run(() => createOwner({ ...form, username: normalizeUsername(form.username) }), {
      success: 'Owner added.', onSuccess: (result) => { setCreated(result.owner); set('password', ''); },
    });
  }
  return <div className="form-page"><PageHeader back={{ to: '/admin/people', label: 'Owners' }} title={created ? 'Owner added' : 'Add owner'}
    subtitle={created ? created.display_name : 'Create their login and choose how their income is split.'} />
    {created ? <Card><p>Sign-in username: <strong>{normalizeUsername(form.username)}</strong></p><div className="btn-group">
      <ButtonLink to={`/admin/jobs/new?owner=${created.id}`} variant="primary">Add their first job</ButtonLink>
      <ButtonLink to={`/admin/people/${created.id}`} variant="secondary">Open statement</ButtonLink>
    </div></Card> : <form className="card form-card" onSubmit={submit}><div className="card__body">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <FormSection title="Owner & login">
        <Field label="Name" required full><TextInput required value={form.displayName} onChange={(e) => set('displayName', e.target.value)} /></Field>
        <Field label="Username" required hint="Letters, numbers and underscores. This is what the owner uses to sign in."><TextInput required autoCapitalize="none" spellCheck={false} autoComplete="off" value={form.username} onChange={(e) => set('username', e.target.value)} /></Field>
        <Field label="Temporary password" required><PasswordInput required autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} /></Field>
      </FormSection>
      <FormSection title="Income split" columns={1}><ChoiceGroup label="Partnership" options={PARTNERSHIP_OPTIONS} value={form.partnership} onChange={(value) => set('partnership', value)} /></FormSection>
      <Field label="Tax filing status"><Select value={form.filingStatus} options={FILING_STATUS_OPTIONS} onChange={(e) => set('filingStatus', e.target.value)} /></Field>
    </div><div className="card__footer"><div className="btn-group"><ButtonLink to="/admin/people" variant="ghost">Cancel</ButtonLink><Button type="submit" variant="primary" loading={busy}>Add owner</Button></div></div></form>}
  </div>;
}
