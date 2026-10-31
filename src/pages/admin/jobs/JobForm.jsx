import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAsync } from '../../../hooks/useAsync.js';
import { useMutation } from '../../../hooks/useMutation.js';
import { getAdminOverview, saveAdminJob } from '../../../lib/data/v2.js';
import { dollarsToCents, hourlyAnnualGrossCents, roundRatio } from '../../../lib/finance-v2/index.js';
import { emptyJobForm, jobFormFromExisting, jobPayload } from '../../../lib/presentation/forms.js';
import { flattenJobs } from '../../../lib/presentation/people.js';
import { PERIODS_BY_FREQUENCY } from '../../../lib/presentation/labels.js';
import { money, todayISO } from '../../../lib/presentation/format.js';
import { PageHeader } from '../../../components/ui/PageHeader.jsx';
import { Card } from '../../../components/ui/Card.jsx';
import { PageSkeleton } from '../../../components/ui/Loading.jsx';
import { ErrorState } from '../../../components/ui/ErrorState.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { AffixInput, ChoiceGroup, Field, FormActions, FormSection, MoneyInput, Select, TextInput } from '../../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../../components/ui/Button.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';
import { BasisTag } from '../../../components/ui/Badge.jsx';

const PAY_TYPES = [{ value: 'hourly', label: 'Hourly' }, { value: 'salary', label: 'Annual salary' }];

/** Planning preview using the same functions as the projection. Never saved. */
function estimate(job) {
  try {
    const periods = Number(job.periodsPerYear);
    const annual = job.mode === 'hourly'
      ? hourlyAnnualGrossCents(dollarsToCents(job.hourlyRate), Number(job.expectedWeeklyHours))
      : dollarsToCents(job.annualSalary);
    if (!Number.isSafeInteger(annual) || annual < 0) return null;
    return { annual, perPaycheck: Number.isInteger(periods) && periods > 0 ? roundRatio(annual, 1, periods) : null };
  } catch {
    return null;
  }
}

export default function JobForm() {
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const [job, setJob] = useState(null);
  const { run, busy, error: saveError } = useMutation();
  const today = todayISO();
  const isEdit = Boolean(jobId);

  const people = (data?.people || []).filter((person) => person.personStatus !== 'archived');
  const existing = isEdit ? flattenJobs(data?.people || []).find((item) => item.id === jobId) : null;

  useEffect(() => {
    if (!data || job) return;
    if (isEdit) { if (existing) setJob(jobFormFromExisting(existing, today)); }
    else setJob(emptyJobForm(today, searchParams.get('owner') || ''));
  }, [data, existing, isEdit, job, searchParams, today]);

  const returnTo = location.state?.from || (job?.ownerId ? `/admin/people/${job.ownerId}?tab=jobs` : '/admin/jobs');
  const back = { to: location.state?.from || '/admin/jobs', label: location.state?.from?.startsWith('/admin/people') ? 'US Person' : 'Jobs' };
  const title = isEdit ? 'Edit job' : 'Add job';

  if (loading) return <div className="form-page"><PageSkeleton stats={0} rows={6} label="Loading job form…" /></div>;
  if (error) return <div className="form-page"><PageHeader back={back} title={title} /><ErrorState error={error} onRetry={refresh} /></div>;
  if (isEdit && !existing) {
    return <div className="form-page"><PageHeader back={back} title="Job not found" />
      <Card><EmptyState icon="briefcase" title="This job does not exist" message="It may belong to an archived US Person, or the link is incorrect."
        action={<ButtonLink to="/admin/jobs">Back to Jobs</ButtonLink>} /></Card></div>;
  }
  if (!people.length) {
    return <div className="form-page"><PageHeader back={back} title={title} />
      <Card><EmptyState icon="users" title="Add a US Person first" message="Every job belongs to a US Person."
        action={<ButtonLink to="/admin/people/new" variant="primary" icon="plus">Add US Person</ButtonLink>} /></Card></div>;
  }
  if (!job) return null;

  const set = (key, value) => setJob((state) => ({ ...state, [key]: value }));
  const preview = estimate(job);
  const ended = existing && ['ended', 'archived'].includes(existing.status);

  function submit(event) {
    event.preventDefault();
    run(() => {
      return saveAdminJob(jobPayload(job), job.jobId ? 'edit' : 'create');
    }, {
      success: job.jobId ? 'Job details saved. Projections updated.' : 'Job added. Projections are ready.',
      onSuccess: () => navigate(returnTo),
    });
  }

  return <div className="form-page">
    <PageHeader back={back} title={title}
      subtitle={isEdit
        ? `${existing.employerName} · ${existing.personName}. Update the saved pay details; projections use them automatically.`
        : 'Hourly rate and expected weekly hours, or annual salary, drive the steady-state estimate.'} />
    {ended ? <Notice tone="warn" title="This job has ended">Ended jobs cannot be edited.</Notice> : null}
    <form className="card form-card" onSubmit={submit}>
      <div className="card__body">
        {saveError ? <Notice tone="danger" title="The job was not saved">{saveError}</Notice> : null}

        <FormSection step="1" title="Assignment" description="Who holds this job and where.">
          <Field label="US Person" required full>
            <Select value={job.ownerId} disabled={isEdit} placeholder="Choose a person"
              options={people.map((person) => ({ value: person.ownerId, label: person.displayName }))}
              onChange={(e) => set('ownerId', e.target.value)} />
          </Field>
          <Field label="Employer" required>
            <TextInput value={job.employerName} autoComplete="organization" onChange={(e) => set('employerName', e.target.value)} />
          </Field>
          <Field label="Role title" optional>
            <TextInput value={job.roleTitle} onChange={(e) => set('roleTitle', e.target.value)} />
          </Field>
        </FormSection>

        <FormSection step="2" title="Compensation" description="Only the fields for the selected pay type are saved.">
          <div className="field field--full">
            <ChoiceGroup label="Pay type" options={PAY_TYPES} value={job.mode} onChange={(value) => set('mode', value)} required />
          </div>
          {job.mode === 'hourly' ? <>
            <Field label="Hourly wage" required>
              <MoneyInput suffix="/ hour" required value={job.hourlyRate} onChange={(e) => set('hourlyRate', e.target.value)} />
            </Field>
            <Field label="Expected hours per week" required hint="Typical weekly hours used for the projection.">
              <AffixInput type="number" inputMode="decimal" min="0" step="0.001" suffix="hours" required
                value={job.expectedWeeklyHours} onChange={(e) => set('expectedWeeklyHours', e.target.value)} />
            </Field>
          </> : (
            <Field label="Annual salary" required full>
              <MoneyInput suffix="/ year" required value={job.annualSalary} onChange={(e) => set('annualSalary', e.target.value)} />
            </Field>
          )}
          {preview ? (
            <div className="estimate-preview field--full" aria-live="polite">
              <div><span className="estimate-preview__label">Annual gross</span><span className="estimate-preview__value">{money(preview.annual)}</span></div>
              <div><span className="estimate-preview__label">Expected gross per income date</span><span className="estimate-preview__value">{money(preview.perPaycheck)}</span></div>
              <BasisTag kind="estimate" />
            </div>
          ) : null}
        </FormSection>

        <FormSection step="3" title="Expected pay" description="Enter the first pay date once. Future dates are calculated automatically.">
          <Field label="Pay frequency" required>
            <Select value={job.payFrequency} onChange={(e) => setJob((state) => ({ ...state, payFrequency: e.target.value,
              periodsPerYear: PERIODS_BY_FREQUENCY[e.target.value] }))}>
              {job.payFrequency === 'semimonthly' ? <option value="semimonthly" disabled>Twice monthly — calendar review required</option> : null}
              <option value="biweekly">Every two weeks</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </Field>
          <Field label="First pay date" required full
            hint="The first expected payment from this employer. That date and the frequency are enough.">
            <TextInput type="date" value={job.firstPayDate} onChange={(e) => set('firstPayDate', e.target.value)} />
          </Field>
        </FormSection>

        <FormSection step="4" title="Start date">
          <Field label="Job start date" optional hint="Future jobs start counting automatically on this date.">
            <TextInput type="date" value={job.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
        </FormSection>
      </div>
      <div className="card__footer">
        <FormActions>
          <Link className="btn btn--ghost" to={returnTo}>Cancel</Link>
          <Button type="submit" variant="primary" icon="check" loading={busy} disabled={ended}>
            {isEdit ? 'Save job' : 'Add job'}
          </Button>
        </FormActions>
      </div>
    </form>
  </div>;
}
