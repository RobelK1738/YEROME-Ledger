import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PACKAGE_V1 } from '../../lib/finance-v2/index.js';
import { formatCurrency } from '../../lib/formatting/money.js';

export default function AdminConfiguration() {
  return <>
    <PageHeader title="Configuration" subtitle="Versioned planning assumptions and agreements." />
    <Card title="Partnership package" subtitle={`Calculation version ${PACKAGE_V1.version}`}>
      <dl className="v2-breakdown">
        <dt>Direct agreed charge · per active job/month</dt><dd>{formatCurrency(PACKAGE_V1.directVariableQuotedCents)}</dd>
        <dt>Referred agreed charge · per active job/month</dt><dd>{formatCurrency(PACKAGE_V1.referredVariableQuotedCents)}</dd>
        <dt>Actual YEROME operating spend · per active job/month</dt><dd>{formatCurrency(PACKAGE_V1.variableActualCents)}</dd>
        <dt>Agreed apartment charge · one per US Person/month</dt><dd>{formatCurrency(PACKAGE_V1.fixedQuotedCents)}</dd>
        <dt>Actual apartment spend · one per US Person/month</dt><dd>{formatCurrency(PACKAGE_V1.fixedActualCents)}</dd>
        <dt>Referrer commission · per eligible active job/month</dt><dd>{formatCurrency(PACKAGE_V1.referredCommissionPerJobCents)}</dd>
        <dt>Internal Gang Cut</dt><dd>10% of after-tax income</dd>
      </dl>
      <p>Person-specific apartment charges and written agreement versions are managed from <Link to="/admin/people">US Persons</Link>.</p>
    </Card>
    <Card title="Before final settlement">
      <p>Partial-month referral eligibility, payout floor for negative quoted net, commission payment date, Gang destination, and legal treatment of W-2 deposits require explicit recorded decisions. Pay Runs currently records employer receipts and estimates.</p>
    </Card>
    <p><Link to="/admin/audit">View audit history</Link></p>
  </>;
}
