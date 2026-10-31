import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync.js';
import { getAdminOverview } from '../../lib/data/v2.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { Field, Select } from '../../components/ui/Field.jsx';
import { PaycheckAllocations, AllocationNotes } from '../../components/planning/PaycheckAllocations.jsx';
import { AllocationEditor } from '../../components/planning/AllocationEditor.jsx';

export default function AdminAllocations() {
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const { data, loading, error, refresh } = useAsync(getAdminOverview, []);
  const header = <PageHeader title="Paycheck allocation" subtitle="The instructions each owner sees for their job paychecks." />;
  if (loading) return <>{header}<PageSkeleton header={false} /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;
  const people = data.people.filter((p) => p.personStatus !== 'archived');
  const person = people.find((p) => p.ownerId === params.get('owner')) || people[0];
  if (!person) return <>{header}<p>Add an owner and their first job to start planning allocations.</p></>;
  return <>{header}
    {people.length > 1 ? <Field label="Owner"><Select value={person.ownerId} options={people.map((p) => ({ value: p.ownerId, label: p.displayName }))} onChange={(e) => { setEditing(false); setParams({ owner: e.target.value }); }} /></Field> : <p className="allocation-owner">{person.displayName}</p>}
    <AllocationNotes person={person} onEdit={() => setEditing(true)} />
    <PaycheckAllocations key={person.ownerId} person={person} />
    <AllocationEditor open={editing} person={person} onClose={() => setEditing(false)} onSaved={refresh} />
  </>;
}
