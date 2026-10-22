import { useRef, useState } from 'react';
import { schedulePaychecks } from '../../../lib/data/v2.js';
import { flattenJobs } from '../../../lib/presentation/people.js';
import { PAY_FREQUENCY_LABELS } from '../../../lib/presentation/labels.js';
import { formatDate, todayISO } from '../../../lib/presentation/format.js';
import { useMutation } from '../../../hooks/useMutation.js';
import { Card } from '../../../components/ui/Card.jsx';
import { DataTable } from '../../../components/ui/DataTable.jsx';
import { Field, FormActions, FormSection, Select, TextInput } from '../../../components/ui/Field.jsx';
import { Button, ButtonLink } from '../../../components/ui/Button.jsx';
import { Notice } from '../../../components/ui/Notice.jsx';
import { Badge, StatusBadge } from '../../../components/ui/Badge.jsx';
import { usePayRuns } from './PayRuns.jsx';
import { SectionIntro } from './shared.jsx';

export default function ScheduleTab() {
  const { people, refreshAll } = usePayRuns();
  const [schedule, setSchedule] = useState({ jobId: '', firstPayDate: '', count: '26' });
  const { run, busy, error } = useMutation();
  const formRef = useRef(null);
  const today = todayISO();

  const current = people.filter((person) => person.personStatus !== 'archived');
  const jobs = flattenJobs(current);
  const selected = jobs.find((job) => job.id === schedule.jobId);
  const calendars = jobs.filter((job) => !['ended', 'archived'].includes(job.status)).map((job) => {
    const person = current.find((item) => item.ownerId === job.ownerId);
    const future = (person?.myPaychecks || []).filter((check) => check.jobId === job.id && check.status === 'scheduled' && check.payDate >= today)
      .sort((a, b) => a.payDate.localeCompare(b.payDate));
    return { ...job, upcomingCount: future.length, nextDate: future[0]?.payDate || null, lastDate: future.at(-1)?.payDate || null };
  });

  function prefill(job) {
    setSchedule((state) => ({ ...state, jobId: job.id, firstPayDate: '' }));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => formRef.current?.querySelector('input[type="date"]')?.focus(), 250);
  }

  function submit(event) {
    event.preventDefault();
    run(() => schedulePaychecks({ ...schedule, count: Number(schedule.count) }), {
      success: 'Pay dates scheduled.',
      onSuccess: async () => { setSchedule((state) => ({ ...state, firstPayDate: '' })); await refreshAll(); },
    });
  }

  const columns = [
    { key: 'job', header: 'Job', mobile: 'title', render: (job) => (
      <div className="cell-stack"><span className="cell-title">{job.employerName}</span><span className="cell-sub">{job.personName}</span></div>
    ), renderMobile: (job) => `${job.employerName} · ${job.personName}` },
    { key: 'status', header: 'Status', mobile: 'badge', render: (job) => <StatusBadge status={job.status} /> },
    { key: 'calendar', header: 'Pay calendar', mobile: 'meta', render: (job) => job.needsTermsReview
      ? <Badge tone="warn" dot={false}>Terms need review</Badge>
      : `${PAY_FREQUENCY_LABELS[job.payFrequency] || job.payFrequency} · anchor ${formatDate(job.firstPayDate)}`,
    renderMobile: (job) => (job.needsTermsReview ? 'Terms need review' : PAY_FREQUENCY_LABELS[job.payFrequency]) },
    { key: 'upcoming', header: 'Scheduled ahead', mobile: 'meta', render: (job) => job.upcomingCount
      ? `${job.upcomingCount} dates · ${formatDate(job.nextDate)} → ${formatDate(job.lastDate)}` : <span className="muted">None</span>,
    renderMobile: (job) => (job.upcomingCount ? `${job.upcomingCount} upcoming` : 'None scheduled') },
    { key: 'actions', header: '', mobile: 'actions', render: (job) => job.needsTermsReview
      ? <ButtonLink size="sm" variant="ghost" to={`/admin/jobs/${job.id}/terms`}>Add pay terms</ButtonLink>
      : <Button size="sm" variant="secondary" icon="calendar" onClick={() => prefill(job)}>Generate dates</Button> },
  ];

  return <>
    <SectionIntro title="Employer pay schedules">
      Expected paydays come from each job’s pay calendar. Generated dates are only expectations; nothing is received until a receipt is recorded.
    </SectionIntro>
    <div className="grid-sidebar">
      <Card title="Pay calendars" icon="calendar" padded={false} subtitle="Current and upcoming paydays per job.">
        <DataTable label="Pay calendars" columns={columns} rows={calendars}
          emptyIcon="briefcase" emptyTitle="No active jobs" emptyMessage="Add a job with pay terms before scheduling paydays."
          emptyAction={<ButtonLink to="/admin/jobs/new" variant="primary" icon="plus">Add job</ButtonLink>} />
      </Card>
      <div ref={formRef}>
        <Card title="Generate pay dates" icon="plus">
          <form onSubmit={submit}>
            {error ? <Notice tone="danger" title="Dates not generated">{error}</Notice> : null}
            <FormSection columns={1}>
              <Field label="Job" required>
                <Select value={schedule.jobId} onChange={(e) => setSchedule({ ...schedule, jobId: e.target.value })}>
                  <option value="">Choose a job</option>
                  {current.map((person) => person.myJobs.length ? (
                    <optgroup key={person.ownerId} label={person.displayName}>
                      {person.myJobs.map((job) => <option key={job.id} value={job.id}>{job.employerName}</option>)}
                    </optgroup>
                  ) : null)}
                </Select>
              </Field>
              <Field label="First payday to generate" required
                hint={selected && !selected.needsTermsReview
                  ? `Must fall on this job’s ${(PAY_FREQUENCY_LABELS[selected.payFrequency] || '').toLowerCase()} calendar (anchor ${formatDate(selected.firstPayDate)}).`
                  : 'Must fall on the job’s recorded pay calendar.'}>
                <TextInput type="date" value={schedule.firstPayDate} onChange={(e) => setSchedule({ ...schedule, firstPayDate: e.target.value })} />
              </Field>
              <Field label="Number of pay dates" required hint="1–52. If pay terms change mid-way, generate each term separately.">
                <TextInput type="number" inputMode="numeric" min="1" max="52" value={schedule.count} onChange={(e) => setSchedule({ ...schedule, count: e.target.value })} />
              </Field>
            </FormSection>
            <FormActions>
              <Button type="submit" variant="primary" icon="calendar" loading={busy}>Generate dates</Button>
            </FormActions>
          </form>
          <p className="footnote">Twice-monthly calendars need review before dates can be generated.</p>
        </Card>
      </div>
    </div>
  </>;
}
