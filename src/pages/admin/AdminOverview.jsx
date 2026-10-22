import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { getAdminCommissions, getAdminOverview } from '../../lib/data/v2.js';
import { overviewMetrics } from '../../lib/presentation/people.js';
import { formatDate, money, plural, relativeDays, todayISO } from '../../lib/presentation/format.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard, StatGrid } from '../../components/ui/StatCard.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Badge, BasisTag } from '../../components/ui/Badge.jsx';
import { DateChip } from '../../components/ui/DateChip.jsx';
import { Icon } from '../../components/ui/Icon.jsx';

function SetupChecklist({ metrics }) {
  const steps = [
    { done: metrics.totalProfiles > 0, title: 'Add a US Person',
      text: 'Create their sign-in, partnership model and agreement record.', to: '/admin/people/new', cta: 'Add US Person' },
    { done: metrics.totalJobs > 0, title: 'Add a job',
      text: 'Record the employer, role and pay terms for that person.', to: '/admin/jobs/new', cta: 'Add job' },
    { done: metrics.scheduledCount > 0 || metrics.recordedLast30.count > 0, title: 'Schedule employer pay dates',
      text: 'Generate expected paydays so receipts can be recorded against them.', to: '/admin/pay-runs/schedule', cta: 'Schedule pay dates' },
  ];
  if (steps.every((step) => step.done)) return null;
  const nextIndex = steps.findIndex((step) => !step.done);
  return (
    <Card className="setup" title="Set up YEROME Ledger" icon="sparkle"
      subtitle={`${steps.filter((step) => step.done).length} of ${steps.length} steps complete. Estimates appear once a person has a verified agreement and job terms.`}>
      <ol className="setup__steps">
        {steps.map((step, index) => (
          <li key={step.title} className={`setup__step ${step.done ? 'is-done' : ''} ${index === nextIndex ? 'is-next' : ''}`}>
            <span className="setup__marker" aria-hidden="true">{step.done ? <Icon name="check" size={14} strokeWidth={3} /> : index + 1}</span>
            <div className="setup__text">
              <p className="setup__title">{step.title}{step.done ? <span className="sr-only"> (complete)</span> : null}</p>
              <p className="setup__desc">{step.text}</p>
            </div>
            {!step.done ? (
              <ButtonLink to={step.to} variant={index === nextIndex ? 'primary' : 'secondary'} size="sm">{step.cta}</ButtonLink>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function MoneyMovement({ metrics }) {
  return (
    <Card title="Money movement" icon="transfer"
      subtitle="Three different events. A schedule is not a deposit, and a deposit is not a partner payment.">
      <div className="ledger-strip">
        <div className="ledger-strip__item">
          <BasisTag kind="scheduled" />
          <p className="ledger-strip__value">{plural(metrics.upcoming.length, 'paycheck')}</p>
          <p className="ledger-strip__label">Expected from employers in the next 14 days</p>
        </div>
        <div className="ledger-strip__item">
          <BasisTag kind="recorded" />
          <p className="ledger-strip__value">{money(metrics.recordedLast30.netCents)}</p>
          <p className="ledger-strip__label">Employer net deposits recorded in the last 30 days · {plural(metrics.recordedLast30.count, 'paycheck')}</p>
        </div>
        <div className="ledger-strip__item">
          <BasisTag kind="payment" />
          <p className="ledger-strip__value">{money(metrics.partnerPaymentsRecordedCents)}</p>
          <p className="ledger-strip__label">Partner distributions recorded against posted settlements, all time</p>
        </div>
      </div>
    </Card>
  );
}

function Attention({ metrics, today }) {
  const items = [
    ...metrics.awaitingReceipt.slice(0, 6).map((check) => ({
      key: `check-${check.id}`, icon: 'receipt', tone: 'warn',
      title: `Receipt not recorded · ${check.personName}`,
      meta: `${check.employerName} payday ${formatDate(check.payDate)} (${relativeDays(check.payDate, today)})`,
      to: '/admin/pay-runs/paychecks?status=awaiting', cta: 'Record',
    })),
    ...metrics.reviewQueue.map(({ person, reasons }) => ({
      key: `person-${person.ownerId}`, icon: 'user', tone: 'info',
      title: person.displayName,
      reasons,
      to: `/admin/people/${person.ownerId}`, cta: 'Review',
    })),
  ];
  const hiddenChecks = Math.max(metrics.awaitingReceipt.length - 6, 0);
  return (
    <Card title="Needs attention" icon="alert" padded={false}
      subtitle="Missing receipts and profiles whose estimate is withheld until reviewed.">
      {items.length ? (
        <ul className="agenda">
          {items.map((item) => (
            <li key={item.key} className="agenda__item">
              <span className={`agenda__icon agenda__icon--${item.tone}`} aria-hidden="true"><Icon name={item.icon} size={16} /></span>
              <div className="agenda__body">
                <p className="agenda__title">{item.title}</p>
                {item.meta ? <p className="agenda__meta">{item.meta}</p> : null}
                {item.reasons ? (
                  <div className="badge-row">
                    {item.reasons.map((reason) => <Badge key={reason.key} tone="warn" dot={false}>{reason.label}</Badge>)}
                  </div>
                ) : null}
              </div>
              <Link className="agenda__link" to={item.to}>{item.cta}<Icon name="chevronRight" size={16} /></Link>
            </li>
          ))}
          {hiddenChecks ? (
            <li className="agenda__more"><Link to="/admin/pay-runs/paychecks?status=awaiting">{plural(hiddenChecks, 'more paycheck')} awaiting receipt</Link></li>
          ) : null}
        </ul>
      ) : (
        <EmptyState compact icon="checkCircle" title="All clear"
          message="Every current profile has an estimate and no past paydays are missing a receipt." />
      )}
    </Card>
  );
}

function Upcoming({ metrics, today }) {
  return (
    <Card title="Upcoming employer paydays" icon="calendar" padded={false}
      subtitle="Next 14 days. Timing only — no partner distribution is implied."
      actions={<Link className="card__link" to="/admin/pay-runs/paychecks">All paychecks</Link>}>
      {metrics.upcoming.length ? (
        <ul className="agenda">
          {metrics.upcoming.slice(0, 8).map((check) => (
            <li key={check.id} className="agenda__item">
              <DateChip date={check.payDate} />
              <div className="agenda__body">
                <p className="agenda__title">{check.personName}</p>
                <p className="agenda__meta">{check.employerName} · {relativeDays(check.payDate, today)}</p>
              </div>
              <BasisTag kind="scheduled" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon="calendar" title="No paydays in the next two weeks"
          message="Generate employer pay dates for each job to see them here."
          action={<ButtonLink to="/admin/pay-runs/schedule" size="sm">Schedule pay dates</ButtonLink>} />
      )}
    </Card>
  );
}

const SHORTCUTS = [
  { to: '/admin/people/new', icon: 'user', label: 'Add US Person' },
  { to: '/admin/jobs/new', icon: 'briefcase', label: 'Add job' },
  { to: '/admin/pay-runs/paychecks', icon: 'receipt', label: 'Record a paycheck receipt' },
  { to: '/admin/pay-runs/transfers', icon: 'transfer', label: 'Register a transfer record' },
  { to: '/admin/people/referrals', icon: 'link', label: 'Manage referrals' },
  { to: '/admin/audit', icon: 'history', label: 'Review audit history' },
];

export default function AdminOverview() {
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const { data: referralData } = useAsync(getAdminCommissions, []);
  const today = todayISO();
  if (loading) return <PageSkeleton label="Loading overview…" />;
  if (error) return <><PageHeader title="Overview" /><ErrorState error={error} onRetry={refresh} /></>;
  const metrics = overviewMetrics(data, referralData?.referrals || [], today);
  const isNew = metrics.totalProfiles === 0;

  return <>
    <PageHeader title="Overview" eyebrow={formatDate(today)}
      subtitle="Today’s operating picture. Every figure is labelled as an estimate, a scheduled date or a recorded transaction."
      actions={<>
        <ButtonLink to="/admin/jobs/new" variant="secondary" icon="briefcase">Add job</ButtonLink>
        <ButtonLink to="/admin/people/new" variant="primary" icon="plus">Add US Person</ButtonLink>
      </>} />

    <SetupChecklist metrics={metrics} />

    {!isNew ? <>
      <StatGrid>
        <StatCard icon="users" label="Active US Persons" value={metrics.activeProfiles} to="/admin/people" linkLabel="View people"
          hint={`${metrics.peopleWithActiveJobs} with an active job${metrics.pausedProfiles ? ` · ${metrics.pausedProfiles} paused` : ''}`} />
        <StatCard icon="briefcase" label="Active jobs" value={metrics.activeJobs} to="/admin/jobs" linkLabel="View jobs"
          hint={`${plural(metrics.totalJobs, 'job')} on record`} />
        <StatCard icon="trending" label="YEROME net · monthly" basis="estimate" emphasis
          value={money(metrics.yeromeMonthlyEstimateCents)}
          hint={`Run rate per month from ${metrics.estimatedPeople} of ${metrics.totalProfiles} profiles with verified inputs`} />
        <StatCard icon="alert" label="Profiles needing review" value={metrics.reviewQueue.length}
          tone={metrics.reviewQueue.length ? 'warn' : 'default'}
          hint={metrics.reviewQueue.length ? 'Estimate withheld until reviewed' : 'Every profile has an estimate'} />
      </StatGrid>

      <MoneyMovement metrics={metrics} />

      <div className="grid-2">
        <Attention metrics={metrics} today={today} />
        <Upcoming metrics={metrics} today={today} />
      </div>
    </> : null}

    <section aria-labelledby="shortcuts-title" className="shortcuts">
      <h2 id="shortcuts-title" className="section-title">Shortcuts</h2>
      <div className="shortcut-grid">
        {SHORTCUTS.map((item) => (
          <Link key={item.to} to={item.to} className="shortcut">
            <span className="shortcut__icon" aria-hidden="true"><Icon name={item.icon} size={18} /></span>
            <span className="shortcut__label">{item.label}</span>
            <Icon name="chevronRight" size={16} className="shortcut__chevron" />
          </Link>
        ))}
      </div>
    </section>
  </>;
}
