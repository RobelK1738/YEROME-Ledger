import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { money, formatDate, plural } from '../../lib/presentation/format.js';
import { payTermsText } from '../../lib/presentation/people.js';
import { statementAmounts, companyAmounts, nextFunds, costDetails, taxDetails, fundMatchesBiweekly } from '../../lib/presentation/statement.js';
import { roundRatio } from '../../lib/finance-v2/index.js';

function AmountRow({ label, hint, month, biweekly, kind = '', negative = false, hidden = false, id }) {
  const amount = (value) => money(negative && value != null ? -value : value);
  return <tr id={id} hidden={hidden} className={`statement-row ${kind ? `statement-row--${kind}` : ''}`}>
    <th scope="row"><span>{label}</span>{hint ? <small>{hint}</small> : null}</th>
    <td className={month < 0 && !negative ? 'statement-loss' : ''}>{amount(month)}</td>
    <td className={biweekly < 0 && !negative ? 'statement-loss' : ''}>{amount(biweekly)}</td>
  </tr>;
}

/** Detail is part of its total, rather than a second summary elsewhere. */
function ExpandableRow({ label, details = [], ...props }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!details.length) return <AmountRow label={label} {...props} />;
  return <>
    <AmountRow {...props} label={<button type="button" className="statement-expand" aria-expanded={open}
      aria-controls={details.map((_, index) => `${id}-${index}`).join(' ')} onClick={() => setOpen((value) => !value)}>
      <span>{label}</span><span className="statement-chevron" aria-hidden="true">⌃</span>
    </button>} />
    {details.map((detail, index) => <AmountRow key={detail.key || index} {...detail} kind="detail" hidden={!open} id={`${id}-${index}`} />)}
  </>;
}

function jobDetails(jobs) {
  return jobs.map((job) => ({ key: job.id, label: job.employerName,
    hint: `${payTermsText(job) || 'Pay details missing'} · starts ${formatDate(job.startDate)} · first pay ${formatDate(job.firstPayDate)}`,
    month: job.annualGrossCents == null ? null : roundRatio(job.annualGrossCents, 1, 12),
    biweekly: job.normalizedBiweeklyGrossCents }));
}

export function Breakdown({ person, people, admin = false, commissions = [] }) {
  const company = Boolean(people);
  const entries = people || [person];
  const values = company ? companyAmounts(people) : statementAmounts(person);
  const m = values.monthly, b = values.biweekly;
  const jobs = company ? [] : person.myJobs.filter((job) => job.status === 'active');
  const jobCount = entries.reduce((sum, p) => sum + p.activeJobCount, 0);
  const incomeDetails = company ? people.map((p) => {
    const v = statementAmounts(p);
    return { key: p.ownerId, label: <Link to={`/admin/people/${p.ownerId}`}>{p.displayName}</Link>,
      hint: plural(p.activeJobCount, 'job'), month: v.monthly.gross, biweekly: v.biweekly.gross };
  }) : jobDetails(jobs);
  const costs = costDetails(entries, admin);
  const sources = person?.commissionSources || [];
  const hasCommissionIncome = (person?.commissionIncomeMonthlyCents || 0) > 0;
  const row = (key, label, options = {}) => <AmountRow key={key} label={label} month={m[key]} biweekly={b[key]} {...options} />;
  const effectiveTax = m.gross > 0 && m.tax != null ? `${(m.tax / m.gross * 100).toFixed(1)}% estimated effective rate` : undefined;
  return <section className="statement-sheet" aria-label="Income breakdown">
    <header className="statement-sheet__header"><h2>Income & allocation</h2><span className="statement-estimate">USD · Estimated</span></header>
    <div className="statement-table-wrap"><table className="statement-table">
      <caption className="sr-only">Monthly and biweekly income allocation</caption>
      <thead><tr><th scope="col">Breakdown</th><th scope="col">Monthly</th><th scope="col">Every 2 weeks</th></tr></thead>
      <tbody>
        <ExpandableRow label="Job income" hint={`${company ? `${plural(people.length, 'owner')} · ` : ''}${plural(jobCount, 'job')}`}
          month={m.gross} biweekly={b.gross} details={incomeDetails} kind="subtotal" />
        <ExpandableRow label="Tax reserve" month={m.tax} biweekly={b.tax} negative hint={effectiveTax}
          details={taxDetails(entries).map((line) => ({ key: line.key, label: line.label,
            month: line.monthlyCents, biweekly: line.biweeklyCents, negative: true }))} />
        {row('net', 'After-tax income', { kind: 'subtotal' })}
        <ExpandableRow label={admin ? 'Operating costs' : 'Service charges'} month={admin ? m.costs : m.fees}
          biweekly={admin ? b.costs : b.fees} negative details={costs.map((line) => ({ key: line.key, label: line.label,
            hint: line.perJobCents ? `${money(line.perJobCents)} per job / month` : undefined,
            month: line.monthlyCents, biweekly: line.biweeklyCents, negative: true }))} />
        {admin ? <>
          <ExpandableRow label={company ? 'Owner shares' : 'Owner share · 50%'} month={m.owner} biweekly={b.owner} negative
            details={entries.map((p) => { const v = statementAmounts(p); return { key: p.ownerId,
              label: company ? p.displayName : 'Profit to split',
              hint: `After ${money(v.monthly.fees)} / month in service charges`,
              month: company ? v.monthly.owner : v.monthly.profit,
              biweekly: company ? v.biweekly.owner : v.biweekly.profit }; })} />
          {m.commissions ? <ExpandableRow label="Referral commissions" month={m.commissions} biweekly={b.commissions} negative
            details={commissions.filter((source) => source.monthlyCents > 0).map((source) => ({ key: source.referralId,
              label: `${source.referrerName} · ${source.referredName}`, hint: `${plural(source.activeJobCount, 'job')} × ${money(source.ratePerJobCents)} / month`,
              month: source.monthlyCents, biweekly: roundRatio(source.monthlyCents, 12, 26), negative: true }))} /> : null}
          {row('gang', 'Gang allocation · 10%', { negative: true })}
          {row('yerome', 'YEROME keeps', { kind: 'total' })}
        </> : <>
          {row('profit', 'Profit to split', { kind: 'subtotal' })}
          {row('service', 'YEROME share · 50%', { kind: 'secondary' })}
          {hasCommissionIncome ? <>
            {row('owner', 'Your job share · 50%')}
            <ExpandableRow label="Your referral income" month={m.commissionIncome} biweekly={b.commissionIncome}
              hint={plural(sources.filter((source) => source.currentlyEarning).reduce((sum, source) => sum + source.eligibleJobCount, 0), 'referred job')}
              details={sources.filter((source) => source.currentlyEarning).map((source) => ({ key: source.referralId,
                label: source.referredDisplayName, hint: `${plural(source.eligibleJobCount, 'job')} × ${money(source.ratePerJobCents)} / month`,
                month: source.monthlyEquivalentCents, biweekly: roundRatio(source.monthlyEquivalentCents, 12, 26) }))} />
            {row('personalTotal', 'You keep', { kind: 'total' })}
          </> : row('owner', 'Your share · 50%', { kind: 'total' })}
        </>}
      </tbody>
    </table></div>
    <footer className="statement-sheet__footer">Two-week estimates use 26 periods a year. {admin ? 'Owner shares use service charges; operating costs are deducted once.' : 'Service charges are deducted before the 50/50 split.'}</footer>
  </section>;
}

export function NextFund({ person, people, admin = false, onEdit }) {
  const entries = people || [person];
  const fund = nextFunds(entries);
  const plan = person?.allocationPlan;
  const sameAllocation = fund && fundMatchesBiweekly(entries, admin);
  const allocation = fund?.allocation;
  const rows = fund ? [
    ['Expected gross', fund.gross], ['Tax reserve', fund.tax],
    ...(admin ? [['Operating costs', allocation.actualCostCents],
      ...(people ? entries.filter((p) => p.forecast?.nextDate === fund.date)
        .map((p) => [`${p.displayName} · share`, p.forecast.allocation?.ownerShareCents ?? null]) : [['Owner share', allocation.ownerShareCents]]),
      ...(allocation.commissionCents ? [['Referral commissions', allocation.commissionCents]] : []),
      ['Gang allocation', allocation.gangCutCents], ['YEROME keeps', allocation.yeromeCents]]
      : [['Service charges', allocation.chargesCents], ['Your share', allocation.ownerShareCents], ['YEROME share', allocation.serviceShareCents]]),
  ] : [];
  const dates = new Map();
  for (const p of entries) for (const row of p.forecast?.upcoming || []) {
    if (!dates.has(row.date)) dates.set(row.date, []);
    dates.get(row.date).push({ ...row, personName: p.displayName });
  }
  const upcoming = [...dates].sort(([a], [b]) => a.localeCompare(b)).slice(0, 8);
  const savedInstructions = people?.filter((p) => p.allocationPlan?.instructions) || [];
  return <section className="statement-next" aria-label="Next funds and instructions">
    <div className="statement-next__allocation">
      <p className="statement-kicker">Next expected income</p>
      <h2 className="next-fund-date">{fund ? formatDate(fund.date) : 'Pay date needed'}</h2>
      <p className="statement-note">{fund ? [...new Set(fund.sources.map((source) => source.employerName))].join(', ') : 'Admin can add a first pay date to the job.'}</p>
      {sameAllocation ? <p className="statement-note">Use the <strong>Every 2 weeks</strong> allocation above for this fund.</p> : fund ? <details className="statement-disclosure"><summary>Allocation for this date</summary>
        <dl className="fund-lines">{rows.map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{money(amount)}</dd></div>)}</dl>
        <p className="statement-note">Only jobs paying on this date are included.</p>
      </details> : null}
      {upcoming.length ? <details className="statement-disclosure"><summary>Income calendar</summary><ul className="income-dates">
        {upcoming.map(([date, sources]) => <li key={date}><span>{formatDate(date)}<small>{plural(sources.length, 'job')}</small></span><strong>{money(sources.reduce((sum, row) => sum + row.grossCents, 0))}<small>gross</small></strong></li>)}
      </ul></details> : null}
      {entries.flatMap((p) => (p.forecast?.warnings || []).map((warning) => `${people ? `${p.displayName}: ` : ''}${warning}`)).map((warning) => <p key={warning} className="statement-note">{warning}</p>)}
    </div>
    <div className="statement-next__instructions">
      <div className="statement-section-heading"><h2>{admin ? 'Allocation instructions' : 'From Admin'}</h2>{onEdit ? <button type="button" className="statement-text-button" onClick={onEdit}>Edit</button> : null}</div>
      {people ? (savedInstructions.length ? <div className="company-instructions">{savedInstructions.map((p) => <div key={p.ownerId}><Link to={`/admin/people/${p.ownerId}`}>{p.displayName}</Link><p className="preserve-lines">{p.allocationPlan.instructions}</p></div>)}</div>
        : <p className="statement-note">Open an owner’s statement to add allocation instructions.</p>)
        : <p className="preserve-lines">{plan?.instructions || 'No additional instructions.'}</p>}
      {!admin && person?.commissionIncomeMonthlyCents > 0 ? <p className="statement-note">Referral income follows Admin’s instructions and is separate from employer pay dates.</p> : null}
    </div>
  </section>;
}

export function CommissionDetails({ sources }) {
  const earning = sources?.filter((source) => source.monthlyCents > 0) || [];
  if (!earning.length) return null;
  return <section className="statement-sheet" aria-label="Referral income earned"><header className="statement-sheet__header"><h2>Referral income earned</h2></header>
    <table className="statement-table"><caption className="sr-only">Referral income from other owners</caption><thead><tr><th scope="col">Source</th><th scope="col">Monthly</th><th scope="col">Every 2 weeks</th></tr></thead><tbody>{earning.map((source) => <AmountRow key={source.referralId} label={source.referredName}
      hint={`${plural(source.activeJobCount, 'job')} × ${money(source.ratePerJobCents)} / month`} month={source.monthlyCents} biweekly={roundRatio(source.monthlyCents, 12, 26)} />)}</tbody></table>
  </section>;
}
