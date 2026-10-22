import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DescriptionList } from '../../components/ui/DescriptionList.jsx';
import { Notice } from '../../components/ui/Notice.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { PACKAGE_V1 } from '../../lib/finance-v2/index.js';
import { TAX_CONFIG_2026 } from '../../lib/calculations/taxConfig2026.js';
import { FILING_STATUS_OPTIONS } from '../../lib/presentation/labels.js';
import { money } from '../../lib/presentation/format.js';

const pct = (rate) => `${Number((rate * 100).toFixed(2))}%`;
const perMonth = (cents) => <>{money(cents)} <span className="muted">/ month</span></>;

const OPEN_DECISIONS = [
  { title: 'Partial-month referral eligibility', text: 'Commissions accrue only for complete calendar months until a rule is recorded.' },
  { title: 'Payout floor for negative quoted net', text: 'A month with negative quoted net needs a signed loss or offset rule before posting.' },
  { title: 'Commission payment date', text: 'When an accrued commission becomes payable is not yet defined.' },
  { title: 'Gang Cut destination', text: 'Where the internal Gang Cut is directed is not yet recorded.' },
  { title: 'Legal treatment of W-2 deposits', text: 'Requires an explicit recorded decision before final settlement.' },
];

export default function Configuration() {
  const single = TAX_CONFIG_2026.single;
  return <>
    <PageHeader title="Configuration"
      subtitle="The versioned assumptions behind every estimate. Values here are read-only: they are defined in the reviewed calculation code."
      meta={<div className="badge-row"><Badge tone="brand" dot={false}>Calculation {PACKAGE_V1.version}</Badge><Badge tone="muted" dot={false}>Tax {single.version}</Badge></div>} />

    <Notice tone="info" title="Where to change things">
      Person-specific apartment charges and agreement versions are edited from each <Link to="/admin/people">US Person</Link>’s
      profile. Package and tax values below change only through a reviewed code release, so they cannot be edited here.
    </Notice>

    <div className="grid-2">
      <Card title="Contract fees" icon="file" subtitle="Agreed charges under the written agreement. Visible to US Persons as charges.">
        <DescriptionList items={[
          { label: 'Direct partnership · per active job', value: perMonth(PACKAGE_V1.directVariableQuotedCents), basis: 'contractual' },
          { label: 'Referred partnership · per active job', value: perMonth(PACKAGE_V1.referredVariableQuotedCents), basis: 'contractual' },
          { label: 'Apartment · one per US Person (default)', value: perMonth(PACKAGE_V1.fixedQuotedCents), basis: 'contractual' },
          { label: 'Contractual partner share', value: '50% of quoted net' },
        ]} />
      </Card>
      <Card title="Internal cost assumptions" icon="shield" subtitle="YEROME’s real costs and internal allocations. Never shown to US Persons.">
        <DescriptionList items={[
          { label: 'Operating spend · per active job', value: perMonth(PACKAGE_V1.variableActualCents), basis: 'internal' },
          { label: 'Apartment spend · one per US Person (default)', value: perMonth(PACKAGE_V1.fixedActualCents), basis: 'internal' },
          { label: 'Referrer commission · per eligible active job', value: perMonth(PACKAGE_V1.referredCommissionPerJobCents), basis: 'internal' },
          { label: 'Gang Cut', value: '10% of after-tax income', basis: 'internal' },
        ]} />
      </Card>
    </div>

    <Card title="2026 tax assumptions" icon="scale" subtitle="Federal figures from IRS Rev. Proc. 2025-32; Texas has no personal income tax. Used for planning estimates only.">
      <div className="grid-2 grid-2--flush">
        <DescriptionList items={[
          { label: 'Social Security rate', value: pct(single.social_security_rate) },
          { label: 'Social Security wage base', value: money(single.social_security_wage_base_cents) },
          { label: 'Medicare rate', value: pct(single.medicare_rate) },
          { label: 'Additional Medicare rate', value: pct(single.additional_medicare_rate) },
          { label: 'State income tax (Texas)', value: pct(single.state_income_tax_rate) },
        ]} />
        <div className="table-wrap">
          <table className="mini-table">
            <caption className="sr-only">Standard deduction and additional Medicare threshold by filing status</caption>
            <thead><tr><th scope="col">Filing status</th><th scope="col" className="ta-right">Standard deduction</th><th scope="col" className="ta-right">Add’l Medicare above</th></tr></thead>
            <tbody>
              {FILING_STATUS_OPTIONS.map((option) => (
                <tr key={option.value}>
                  <th scope="row">{option.label}</th>
                  <td className="ta-right num">{money(TAX_CONFIG_2026[option.value].standard_deduction_cents)}</td>
                  <td className="ta-right num">{money(TAX_CONFIG_2026[option.value].additional_medicare_threshold_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>

    <Card title="Settlement readiness" icon="alert" padded={false}
      subtitle="Decisions that must be recorded before final settlement. Until then Pay Runs records receipts and estimates, and settlement posting stays gated.">
      <ul className="agenda">
        {OPEN_DECISIONS.map((item) => (
          <li className="agenda__item" key={item.title}>
            <span className="agenda__icon agenda__icon--warn" aria-hidden="true">!</span>
            <div className="agenda__body">
              <p className="agenda__title">{item.title}</p>
              <p className="agenda__meta">{item.text}</p>
            </div>
            <Badge tone="warn" dot={false}>Needs decision</Badge>
          </li>
        ))}
      </ul>
      <div className="card__footer"><Link to="/admin/audit">View audit history</Link></div>
    </Card>
  </>;
}
