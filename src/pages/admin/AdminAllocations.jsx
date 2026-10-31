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
  const header = <PageHeader title="YEROME allocation" subtitle="Receive the US Person’s transfer, cover actual costs and allocate the remainder." />;
  if (loading) return <>{header}<PageSkeleton header={false} /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;
  const people = data.people.filter((p) => p.personStatus !== 'archived');
  const person = people.find((p) => p.ownerId === params.get('owner')) || people[0];
  if (!person) return <>{header}<p>Add an owner and their first job to start planning allocations.</p></>;
  return <>{header}
    {people.length > 1 ? <Field label="US Person"><Select value={person.ownerId} options={people.map((p) => ({ value: p.ownerId, label: p.displayName }))} onChange={(e) => { setEditing(false); setParams({ owner: e.target.value }); }} /></Field> : <p className="allocation-owner">{person.displayName}</p>}
    <AllocationNotes title="Instructions for US Person" person={person} onEdit={() => setEditing(true)} />
    <PaycheckAllocations key={person.ownerId} person={person} admin commissions={data.commissions.filter((row) => row.referredOwnerId === person.ownerId)} />
    <AllocationEditor open={editing} person={person} onClose={() => setEditing(false)} onSaved={refresh} />
  </>;
}
