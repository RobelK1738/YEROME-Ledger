import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { getAdminOverview, saveAdminJob, saveAdminPerson, saveAdminReferral, setPersonStatus } from '../../lib/data/v2.js';
import { createOwner } from '../../lib/data/adminApi.js';
import { dollarsToCents } from '../../lib/finance-v2/index.js';
import { formatCurrency } from '../../lib/formatting/money.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Loading } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const nextDay = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const moneyInput = (cents) => String((Number(cents) || 0) / 100);
const money = (cents) => cents == null ? '—' : formatCurrency(cents);

function FormField({ label, children }) {
  return <label className="v2-field"><span>{label}</span>{children}</label>;
}

export default function AdminPeople() {
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [person, setPerson] = useState({ displayName: '', username: '', password: '', filingStatus: 'single',
    partnership: 'DIRECT_2_WAY', agreementReference: '', agreementVerified: false });
  const [job, setJob] = useState({ ownerId: '', employerName: '', roleTitle: '', mode: 'hourly', hourlyRate: '',
    expectedWeeklyHours: '40', annualSalary: '', payFrequency: 'biweekly', periodsPerYear: '26',
    firstPayDate: '', startDate: today(), effectiveFrom: today() });
  const [agreement, setAgreement] = useState({ ownerId: '', partnership: 'DIRECT_2_WAY',
    agreementReference: '', agreementVerified: false, actualMonthly: '650', quotedMonthly: '900', effectiveFrom: today() });
  const [referral, setReferral] = useState({ referrerOwnerId: '', referredOwnerId: '', nameVisibleToReferrer: false });
  const people = data?.people || [];
  const add = searchParams.get('add');

  async function submit(work, success) {
    setBusy(true); setFormError(''); setNotice('');
    try { await work(); setNotice(success); await refresh(); setSearchParams({}); }
    catch (caught) { setFormError(caught.message || 'Could not save changes.'); await refresh(); }
    finally { setBusy(false); }
  }

  function selectAgreement(ownerId) {
    const selected = people.find((row) => row.ownerId === ownerId);
    setAgreement({ ownerId,
      partnership: selected?.partnership || 'DIRECT_2_WAY',
      agreementReference: '', agreementVerified: Boolean(selected?.agreementVerifiedAt),
      actualMonthly: moneyInput(selected?.apartmentActualMonthlyCents || 65000),
      quotedMonthly: moneyInput(selected?.apartmentQuotedMonthlyCents || 90000),
      effectiveFrom: nextDay(selected?.currentAgreementEffectiveFrom > today() ? selected.currentAgreementEffectiveFrom : today()),
    });
  }

  function selectJob(id) {
    const existing = people.flatMap((row) => row.myJobs.map((j) => ({ ...j, ownerId: row.ownerId })))
      .find((j) => j.id === id);
    setJob(existing ? {
      jobId: existing.id, ownerId: existing.ownerId, employerName: existing.employerName,
      roleTitle: existing.roleTitle || '', mode: existing.compensationMode || 'hourly',
      hourlyRate: moneyInput(existing.hourlyRateCents),
      expectedWeeklyHours: String(existing.expectedWeeklyHours ?? 40),
      annualSalary: moneyInput(existing.annualGrossCents),
      payFrequency: existing.payFrequency || 'biweekly', periodsPerYear: String(existing.periodsPerYear || 26),
      firstPayDate: existing.firstPayDate || '', startDate: '',
      effectiveFrom: nextDay(existing.currentTermsEffectiveFrom > today() ? existing.currentTermsEffectiveFrom : today()),
    } : { ownerId: '', employerName: '', roleTitle: '', mode: 'hourly', hourlyRate: '',
      expectedWeeklyHours: '40', annualSalary: '', payFrequency: 'biweekly', periodsPerYear: '26',
      firstPayDate: '', startDate: today(), effectiveFrom: today() });
    setSearchParams({ add: 'job' });
  }

  if (loading) return <Loading full label="Loading US Persons…" />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;
  return <>
    <PageHeader title="US Persons" subtitle="One person’s jobs, tax estimate, apartment and agreed charges stay together."
      actions={<div className="row"><button className="btn btn--primary" onClick={() => setSearchParams({ add: 'person' })}>Add US Person</button>
        <button className="btn btn--secondary" onClick={() => selectJob('')}>Add Job</button></div>} />
    {notice ? <p role="status" className="v2-notice">{notice}</p> : null}
    {formError ? <p role="alert" className="form-error">{formError}</p> : null}

    {add === 'person' ? <Card title="Add US Person" subtitle="A financial projection appears only after the written agreement is verified.">
      <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(() => createOwner(person), 'US Person created.'); }}>
        <FormField label="Display name"><input required value={person.displayName} onChange={(e) => setPerson({ ...person, displayName: e.target.value })} /></FormField>
        <FormField label="Login username"><input required value={person.username} onChange={(e) => setPerson({ ...person, username: e.target.value })} /></FormField>
        <FormField label="Temporary password"><input required type="password" minLength="8" value={person.password} onChange={(e) => setPerson({ ...person, password: e.target.value })} /></FormField>
        <FormField label="Filing status"><select value={person.filingStatus} onChange={(e) => setPerson({ ...person, filingStatus: e.target.value })}>
          <option value="single">Single</option><option value="mfj">Married filing jointly</option>
          <option value="mfs">Married filing separately</option><option value="hoh">Head of household</option></select></FormField>
        <FormField label="Partnership"><select value={person.partnership} onChange={(e) => setPerson({ ...person, partnership: e.target.value })}>
          <option value="DIRECT_2_WAY">Direct · 50/50</option><option value="MIKI_REFERRAL_2_WAY">Referred · 50/50 plus separate commission</option></select></FormField>
        <FormField label="Written agreement reference"><input value={person.agreementReference} onChange={(e) => setPerson({ ...person, agreementReference: e.target.value })} /></FormField>
        <label className="v2-check"><input type="checkbox" checked={person.agreementVerified}
          onChange={(e) => setPerson({ ...person, agreementVerified: e.target.checked })} />I verified the signed agreement</label>
        <div className="row"><button className="btn btn--primary" disabled={busy}>Create US Person</button>
          <button type="button" className="btn btn--secondary" onClick={() => setSearchParams({})}>Cancel</button></div>
      </form>
    </Card> : null}

    {add === 'job' ? <Card title={job.jobId ? 'Change job pay terms' : 'Add Job'}
      subtitle="Hourly rate and expected weekly hours determine the steady-state estimate. Changes start on the effective date.">
      <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(() => saveAdminJob({
        ...(job.jobId ? { jobId: job.jobId, action: 'change_terms' } : {}),
        ownerId: job.ownerId, employerName: job.employerName, roleTitle: job.roleTitle,
        mode: job.mode, hourlyRateCents: job.mode === 'hourly' ? dollarsToCents(job.hourlyRate) : null,
        expectedWeeklyHours: job.mode === 'hourly' ? Number(job.expectedWeeklyHours) : null,
        annualSalaryCents: job.mode === 'salary' ? dollarsToCents(job.annualSalary) : null,
        payFrequency: job.payFrequency, periodsPerYear: Number(job.periodsPerYear),
        firstPayDate: job.firstPayDate || null, startDate: job.startDate || null,
        effectiveFrom: job.effectiveFrom, status: 'active',
      }, job.jobId ? 'edit' : 'create'), 'Job pay terms saved.'); }}>
        <FormField label="US Person"><select required disabled={Boolean(job.jobId)} value={job.ownerId}
          onChange={(e) => setJob({ ...job, ownerId: e.target.value })}>
          <option value="">Choose a person</option>{people.map((row) => <option key={row.ownerId} value={row.ownerId}>{row.displayName}</option>)}</select></FormField>
        <FormField label="Employer"><input required disabled={Boolean(job.jobId)} value={job.employerName} onChange={(e) => setJob({ ...job, employerName: e.target.value })} /></FormField>
        <FormField label="Role title"><input disabled={Boolean(job.jobId)} value={job.roleTitle} onChange={(e) => setJob({ ...job, roleTitle: e.target.value })} /></FormField>
        <FormField label="Pay type"><select value={job.mode} onChange={(e) => setJob({ ...job, mode: e.target.value })}>
          <option value="hourly">Hourly</option><option value="salary">Annual salary</option></select></FormField>
        {job.mode === 'hourly' ? <><FormField label="Hourly wage ($)"><input required type="number" min="0" step="0.01" value={job.hourlyRate} onChange={(e) => setJob({ ...job, hourlyRate: e.target.value })} /></FormField>
          <FormField label="Expected hours per week"><input required type="number" min="0" step="0.001" value={job.expectedWeeklyHours} onChange={(e) => setJob({ ...job, expectedWeeklyHours: e.target.value })} /></FormField></>
          : <FormField label="Annual salary ($)"><input required type="number" min="0" step="0.01" value={job.annualSalary} onChange={(e) => setJob({ ...job, annualSalary: e.target.value })} /></FormField>}
        <FormField label="Pay frequency"><select value={job.payFrequency} onChange={(e) => setJob({ ...job, payFrequency: e.target.value,
          periodsPerYear: { weekly: '52', biweekly: '26', semimonthly: '24', monthly: '12' }[e.target.value] })}>
          <option value="biweekly">Biweekly</option><option value="weekly">Weekly</option>
          <option value="semimonthly">Twice monthly</option><option value="monthly">Monthly</option></select></FormField>
        <FormField label="Periods in this pay calendar"><input required type="number" min="1" max="53" value={job.periodsPerYear} onChange={(e) => setJob({ ...job, periodsPerYear: e.target.value })} /></FormField>
        <FormField label="First payday"><input type="date" value={job.firstPayDate} onChange={(e) => setJob({ ...job, firstPayDate: e.target.value })} /></FormField>
        {!job.jobId ? <FormField label="Job start date"><input type="date" value={job.startDate} onChange={(e) => setJob({ ...job, startDate: e.target.value })} /></FormField> : null}
        <FormField label="Terms effective from"><input required type="date" value={job.effectiveFrom} onChange={(e) => setJob({ ...job, effectiveFrom: e.target.value })} /></FormField>
        <div className="row"><button className="btn btn--primary" disabled={busy}>Save job</button>
          <button type="button" className="btn btn--secondary" onClick={() => setSearchParams({})}>Cancel</button></div>
      </form>
    </Card> : null}

    <div className="v2-person-grid">{people.map((row) => <Card key={row.ownerId} title={row.displayName}
      subtitle={`${row.personStatus} · ${row.activeJobCount} active jobs · target 10–12, no enforced limit`}>
      <p><strong>Expected partner share:</strong> {row.projectionAvailable ? `${money(row.myShareMonthlyCents)} per month` : 'Needs active status, agreement, referral or pay-term review'}</p>
      <p><strong>YEROME internal:</strong> {row.projectionAvailable ? `${formatCurrency(row.yeromeTakeHomeMonthlyCents)} estimated per month` : '—'}</p>
      <p><strong>Combined estimated 2026 tax:</strong> {money(row.annualTaxLiabilityEstimateCents)} per year</p>
      <details><summary>Jobs and finance detail</summary>
        <ul className="v2-list">{row.myJobs.map((item) => <li key={item.id}>
          <strong>{item.employerName}</strong> · {item.status} · {item.compensationMode || 'terms need review'} ·{' '}
          {item.annualGrossCents == null ? '—' : `${formatCurrency(item.annualGrossCents)} annual gross estimate`}
          {item.status !== 'ended' && item.status !== 'archived' ? <>
            <button className="btn btn--ghost btn--sm" onClick={() => selectJob(item.id)}>Change future pay</button>
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => {
              if (window.confirm(`End ${item.employerName} as of today?`)) {
                submit(() => saveAdminJob({ jobId: item.id, action: 'end', endDate: today() }, 'edit'), 'Job ended.');
              }
            }}>End job</button>
          </> : null}
        </li>)}</ul>
        <p>Agreed charges: {money(row.agreedChargesMonthlyCents)} per month · one apartment per person.</p>
        <p>Actual YEROME spend: {money(row.actualCostMonthlyCents)} per month · Gang Cut: {money(row.gangCutMonthlyCents)} per month · Miki commission: {money(row.commissionMonthlyCents)} per month.</p>
      </details>
      <div className="row"><button className="btn btn--secondary btn--sm" onClick={() => { selectAgreement(row.ownerId); setSearchParams({ add: 'agreement' }); }}>Review agreement</button>
        {row.personStatus !== 'active' ? <button className="btn btn--ghost btn--sm" disabled={busy}
          onClick={() => submit(() => setPersonStatus(row.ownerId, 'active'), 'US Person reactivated.')}>Reactivate</button> :
          <button className="btn btn--ghost btn--sm" disabled={busy}
            onClick={() => submit(() => setPersonStatus(row.ownerId, 'inactive'), 'US Person access paused.')}>Pause access</button>}
        {row.personStatus !== 'archived' ? <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => {
          if (window.confirm(`Archive ${row.displayName}? History will be preserved.`)) {
            submit(() => setPersonStatus(row.ownerId, 'archived'), 'US Person archived.');
          }
        }}>Archive</button> : null}</div>
    </Card>)}</div>
    {!people.length ? <Card><p className="muted">No US Persons yet. Add the first person to begin.</p></Card> : null}

    {add === 'agreement' ? <Card title="Review agreement and apartment"
      subtitle="Changes are prospective and preserve the previous version. Quoted charges are commercial fees, not claims of actual third-party spending.">
      <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(() => saveAdminPerson({
        ownerId: agreement.ownerId, partnership: agreement.partnership,
        agreementReference: agreement.agreementReference, agreementVerified: agreement.agreementVerified,
        actualMonthlyCents: dollarsToCents(agreement.actualMonthly),
        quotedMonthlyCents: dollarsToCents(agreement.quotedMonthly), effectiveFrom: agreement.effectiveFrom,
      }), 'Agreement version saved.'); }}>
        <FormField label="US Person"><select required value={agreement.ownerId} onChange={(e) => selectAgreement(e.target.value)}>
          <option value="">Choose a person</option>{people.map((row) => <option key={row.ownerId} value={row.ownerId}>{row.displayName}</option>)}</select></FormField>
        <FormField label="Partnership"><select value={agreement.partnership} onChange={(e) => setAgreement({ ...agreement, partnership: e.target.value })}>
          <option value="DIRECT_2_WAY">Direct 50/50</option><option value="MIKI_REFERRAL_2_WAY">Referred 50/50 + separate $200/job commission</option></select></FormField>
        <FormField label="Written agreement reference"><input value={agreement.agreementReference} onChange={(e) => setAgreement({ ...agreement, agreementReference: e.target.value })} /></FormField>
        <label className="v2-check"><input type="checkbox" checked={agreement.agreementVerified} onChange={(e) => setAgreement({ ...agreement, agreementVerified: e.target.checked })} />I verified the signed agreement</label>
        <FormField label="Agreed apartment charge per person/month ($)"><input type="number" min="0" step="0.01" value={agreement.quotedMonthly} onChange={(e) => setAgreement({ ...agreement, quotedMonthly: e.target.value })} /></FormField>
        <FormField label="Actual apartment spending per person/month ($) · Admin only"><input type="number" min="0" step="0.01" value={agreement.actualMonthly} onChange={(e) => setAgreement({ ...agreement, actualMonthly: e.target.value })} /></FormField>
        <FormField label="Effective from"><input required type="date" value={agreement.effectiveFrom} onChange={(e) => setAgreement({ ...agreement, effectiveFrom: e.target.value })} /></FormField>
        <div className="row"><button className="btn btn--primary" disabled={busy}>Save prospective version</button>
          <button type="button" className="btn btn--secondary" onClick={() => setSearchParams({})}>Cancel</button></div>
      </form>
    </Card> : null}

    <Card title="Referral agreement" subtitle="$200 per eligible active referred job for a full calendar-month estimate. No percentage split.">
      <form className="v2-form" onSubmit={(event) => { event.preventDefault(); submit(() => saveAdminReferral(referral), 'Referral agreement saved.'); }}>
        <FormField label="Referrer"><select required value={referral.referrerOwnerId} onChange={(e) => setReferral({ ...referral, referrerOwnerId: e.target.value })}>
          <option value="">Choose a person</option>{people.map((row) => <option key={row.ownerId} value={row.ownerId}>{row.displayName}</option>)}</select></FormField>
        <FormField label="Referred US Person"><select required value={referral.referredOwnerId} onChange={(e) => setReferral({ ...referral, referredOwnerId: e.target.value })}>
          <option value="">Choose a person</option>{people.map((row) => <option key={row.ownerId} value={row.ownerId}>{row.displayName}</option>)}</select></FormField>
        <label className="v2-check"><input type="checkbox" checked={referral.nameVisibleToReferrer}
          onChange={(e) => setReferral({ ...referral, nameVisibleToReferrer: e.target.checked })} />Agreement permits showing the referred person’s name</label>
        <button className="btn btn--primary" disabled={busy}>Record referral</button>
      </form>
    </Card>
  </>;
}
