import { useToast, useConfirm } from '../../../components/ui/Feedback.jsx';
import { useMutation } from '../../../hooks/useMutation.js';
import { saveAdminJob } from '../../../lib/data/v2.js';
import { jobStatusPayload } from '../../../lib/presentation/forms.js';
import { formatDate, todayISO } from '../../../lib/presentation/format.js';
import { Button, ButtonGroup, ButtonLink } from '../../../components/ui/Button.jsx';
import { useIsCompact } from '../../../hooks/useMediaQuery.js';

const SUCCESS = { pause: 'Job paused. Dated status history was recorded.',
  resume: 'Job active again. Dated status history was recorded.', end: 'Job ended.' };

/** Pause / resume / end with confirmation. Effective today, as before. */
export function JobActions({ job, onChanged, from, compact = false }) {
  const confirm = useConfirm();
  const { notify } = useToast();
  const { run, busy } = useMutation();
  const phone = useIsCompact();
  const today = todayISO();
  if (job.status === 'ended' || job.status === 'archived') return <span className="muted text-sm">No actions</span>;

  async function act(action) {
    const label = `${job.employerName}${job.personName ? ` (${job.personName})` : ''}`;
    if (action === 'end' && !await confirm({
      title: 'End this job?', tone: 'danger', confirmLabel: 'End job',
      message: <p>{label} will end as of {formatDate(today)}. Its pay history and status history are preserved, and it cannot be resumed afterwards.</p>,
    })) return;
    if (action === 'pause' && !await confirm({
      title: 'Pause this job?', confirmLabel: 'Pause job',
      message: <p>{label} will be paused from {formatDate(today)}. It stops counting toward estimates until resumed.</p>,
    })) return;
    await run(() => saveAdminJob(jobStatusPayload(job.id, action, today), 'edit'), {
      success: SUCCESS[action],
      onSuccess: onChanged,
      onError: (caught) => notify(caught.message || 'Could not update the job.', { tone: 'danger' }),
    });
  }

  // In desktop tables the status actions are icon buttons so the row stays
  // scannable; phones list them with text labels in the row footer.
  const iconOnly = compact && !phone;
  const statusButton = (action, icon, label, variant = 'ghost') => (
    <Button size="sm" variant={variant} icon={icon} loading={busy && action !== 'end'} disabled={busy}
      onClick={() => act(action)} aria-label={iconOnly ? `${label} ${job.employerName}` : undefined} title={iconOnly ? label : undefined}>
      {iconOnly ? null : label}
    </Button>
  );

  return (
    <ButtonGroup className="job-actions">
      <ButtonLink to={`/admin/jobs/${job.id}/terms`} state={from ? { from } : undefined} size="sm" variant="secondary" icon={compact ? undefined : 'edit'}>
        Change terms
      </ButtonLink>
      {job.status === 'active' ? statusButton('pause', 'pause', 'Pause') : null}
      {job.status === 'paused' || job.status === 'pending' ? statusButton('resume', 'play', 'Resume') : null}
      {statusButton('end', 'stop', 'End job', 'ghost-danger')}
    </ButtonGroup>
  );
}
