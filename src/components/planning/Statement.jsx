import { Link } from 'react-router-dom';
import { money, formatDate, plural } from '../../lib/presentation/format.js';
import { payTermsText } from '../../lib/presentation/people.js';
import { statementAmounts, companyAmounts, nextFunds } from '../../lib/presentation/statement.js';
import { roundRatio } from '../../lib/finance-v2/index.js';

function AmountRow({ label, hint, month, biweekly, kind = '', negative = false, children }) {
  const amount = (value) => money(negative && value != null ? -value : value);
  return <tr className={`statement-row ${kind ? `statement-row--${kind}` : ''}`}>
    <th scope="row"><span>{label}</span>{hint ? <small>{hint}</small> : null}{children}</th>
    <td className={month < 0 && !negative ? 'statement-loss' : ''}>{amount(month)}</td>
    <td className={biweekly < 0 && !negative ? 'statement-loss' : ''}>{amount(biweekly)}</td>
  </tr>;
}

export function Breakdown({ person, people, admin = false }) {
  const company = Boolean(people);
  const values = company ? companyAmounts(people) : statementAmounts(person);
  const m = values.monthly, b = values.biweekly;
  const jobs = company ? [] : person.myJobs.filter((job) => job.status === 'active');
  const row = (key, label, options = {}) => <AmountRow key={key} label={label} month={m[key]} biweekly={b[key]} {...options} />;
  const sources = person?.commissionSources || [];
  return <section className="statement-sheet" aria-label="Income breakdown">
    <header className="statement-sheet__header"><div><h2>Income breakdown</h2><p>Typical monthly income and a two-week allocation.</p></div><span className="statement-estimate">Estimate</span></header>
    <div className="statement-table-wrap"><table className="statement-table">
      <caption className="sr-only">Monthly and biweekly income allocation</caption>
      <thead><tr><th scope="col">Source & allocation</th><th scope="col">Monthly</th><th scope="col">Every 2 weeks</th></tr></thead>
      <tbody>
        {company ? people.map((p) => {
          const v = statementAmounts(p);
          return <AmountRow key={p.ownerId} label={<Link to={`/admin/people/${p.ownerId}`}>{p.displayName}</Link>}
            hint={plural(p.activeJobCount, 'job')} month={v.monthly.gross} biweekly={v.biweekly.gross} kind="source" />;
        }) : jobs.map((job) => <AmountRow key={job.id} label={job.employerName} kind="source" hint={payTermsText(job)}
          month={job.annualGrossCents == null ? null : roundRatio(job.annualGrossCents, 1, 12)}
          biweekly={job.normalizedBiweeklyGrossCents}>
          <small>Starts {formatDate(job.startDate)} · first pay {formatDate(job.firstPayDate)}</small>
        </AmountRow>)}
        {row('gross', 'Total job income', { kind: 'subtotal' })}
        {row('tax', 'Tax reserve', { negative: true })}
        {row('net', 'After-tax income', { kind: 'subtotal' })}
        {admin ? <>
          {row('costs', 'Operating costs', { negative: true, hint: 'Apartment and job expenses' })}
          {row('owner', company ? 'Owner shares' : 'Owner share · 50%', { negative: true,
            hint: company ? 'Calculated after each owner’s service charges' : `50% after ${money(m.fees)} in monthly service charges` })}
          {row('commissions', 'Referral commissions', { negative: true })}
          {row('gang', 'Gang allocation · 10%', { negative: true })}
          {row('yerome', 'YEROME keeps', { kind: 'total' })}
        </> : <>
          {row('fees', 'Apartment & service charges', { negative: true })}
          {row('profit', 'Profit to split', { kind: 'subtotal' })}
          {row('owner', 'Your job share · 50%')}
          {row('service', 'YEROME service share · 50%', { kind: 'secondary' })}
          {sources.length ? <>
            {sources.map((source) => <AmountRow key={source.referralId} label={`Commission · ${source.referredDisplayName}`}
              hint={`${plural(source.eligibleJobCount, 'job')} × ${money(source.ratePerJobCents)} / month`}
              month={source.monthlyEquivalentCents} biweekly={roundRatio(source.monthlyEquivalentCents, 12, 26)} />)}
          </> : null}
          {row('personalTotal', 'You keep', { kind: 'total' })}
        </>}
      </tbody>
    </table></div>
    <footer className="statement-sheet__footer">Two-week amounts use 26 periods per year, not half a month. {admin ? 'Service charges determine owner shares; operating costs are deducted once.' : 'Your total includes your job share and any referral commissions.'}</footer>
  </section>;
}

export function NextFund({ person, people, admin = false, onEdit }) {
  const entries = people || [person];
  const fund = nextFunds(entries);
  const allocation = fund?.allocation;
  const plan = person?.allocationPlan;
  const rows = fund ? [
    ['Expected gross', fund.gross], ['Reserve for tax', fund.tax],
    ...(admin ? [['Operating costs', allocation.actualCostCents], ['Owner share', allocation.ownerShareCents],
      ['Referral commission', allocation.commissionCents], ['Gang allocation', allocation.gangCutCents], ['YEROME keeps', allocation.yeromeCents]]
      : [['Apartment & service charges', allocation.chargesCents], ['Your job share', allocation.ownerShareCents], ['Service share', allocation.serviceShareCents]]),
  ] : [];
  const upcoming = entries.flatMap((p) => (p.forecast?.upcoming || []).map((row) => ({ ...row, personName: p.displayName })))
    .sort((a, b) => a.date.localeCompare(b.date));
  return <section className="statement-next" aria-label="Next funds and instructions">
    <div className="statement-next__allocation">
      <div className="statement-section-heading"><div><h2>Next expected funds</h2><p>{fund ? `${formatDate(fund.date)} · ${[...new Set(fund.sources.map((row) => row.employerName))].join(', ')}` : 'Add a first pay date to see upcoming funds.'}</p></div></div>
      {fund ? <><dl className="fund-lines">{rows.map(([label, amount], index) => <div key={label} className={index === rows.length - 1 ? 'fund-lines__last' : ''}><dt>{label}</dt><dd>{money(amount)}</dd></div>)}</dl>
        <p className="statement-note">Allocate the expected gross using these estimates. This date may include one or several jobs.</p></> : null}
      {!admin && person?.commissionIncomeMonthlyCents > 0 ? <p className="statement-note">Referral income appears in your statement above. Follow Admin’s instructions for its timing and allocation.</p> : null}
      {upcoming.length ? <details className="statement-disclosure"><summary>Upcoming income dates</summary>
        <ul className="income-dates">{upcoming.slice(0, 12).map((row) => <li key={`${row.personName}:${row.jobId}:${row.date}`}><span>{formatDate(row.date)}<small>{people ? `${row.personName} · ` : ''}{row.employerName}</small></span><strong>{money(row.grossCents)}<small>gross</small></strong></li>)}</ul>
      </details> : null}
    </div>
    <div className="statement-next__instructions">
      <div className="statement-section-heading"><div><h2>{admin ? 'Allocation instructions' : 'From Admin'}</h2><p>{people ? 'Open an owner’s statement to set their instructions.' : 'How to handle the next fund.'}</p></div>{onEdit ? <button type="button" className="btn btn--secondary btn--sm" onClick={onEdit}>Edit</button> : null}</div>
      {plan?.nextFundDate ? <p className="instruction-date">Planned fund date · {formatDate(plan.nextFundDate)}</p> : null}
      <p className="preserve-lines">{plan?.instructions || (people ? 'Each owner’s saved instructions appear on their statement.' : 'No additional instructions yet.')}</p>
      {!people && admin && !plan?.instructions ? <p className="statement-note">Add a short instruction for the owner: what to set aside, what to keep, and where to allocate funds.</p> : null}
      {people ? <div className="company-instructions">{people.filter((p) => p.allocationPlan?.instructions).map((p) => <div key={p.ownerId}><Link to={`/admin/people/${p.ownerId}`}>{p.displayName}</Link><p className="preserve-lines">{p.allocationPlan.instructions}</p></div>)}</div> : null}
    </div>
  </section>;
}

export function CommissionDetails({ sources }) {
  if (!sources?.length) return null;
  return <section className="statement-sheet statement-commissions"><header className="statement-sheet__header"><div><h2>Who earns the commissions</h2><p>Referral income is separate from each owner’s job share.</p></div></header>
    <table className="statement-table"><caption className="sr-only">Commission sources</caption><thead><tr><th scope="col">Referrer & source</th><th scope="col">Monthly</th><th scope="col">Every 2 weeks</th></tr></thead><tbody>{sources.map((row) => <AmountRow key={row.referralId} label={`${row.referrerName} · ${row.referredName}`} hint={`${plural(row.activeJobCount, 'job')} × ${money(row.ratePerJobCents)}`} month={row.monthlyCents} biweekly={roundRatio(row.monthlyCents, 12, 26)} />)}</tbody></table>
  </section>;
}
