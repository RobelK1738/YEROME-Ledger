import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { listAuditLog } from '../../lib/data/audit.js';
import { AUDIT_CATEGORIES, auditActionLabel, auditEntityLabel, auditMatches, auditSummary, auditTone } from '../../lib/presentation/audit.js';
import { formatDateTime, plural } from '../../lib/presentation/format.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageSkeleton } from '../../components/ui/Loading.jsx';
import { ErrorState } from '../../components/ui/ErrorState.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { FilterBar, FilterSelect, SearchInput } from '../../components/ui/Toolbar.jsx';

const PAGE = 200;

function AuditEntry({ entry, currentUserId }) {
  const summary = auditSummary(entry);
  return (
    <li className="audit-row">
      <div className="audit-row__time">
        <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
      </div>
      <div className="audit-row__main">
        <div className="audit-row__head">
          <Badge tone={auditTone(entry.action)}>{auditActionLabel(entry.action)}</Badge>
          <span className="audit-row__entity">{auditEntityLabel(entry.entity_type)}</span>
        </div>
        {summary ? <p className="audit-row__summary">{summary}</p> : null}
        <p className="audit-row__actor">{!entry.actor_user_id ? 'No actor recorded' : entry.actor_user_id === currentUserId ? 'By you (YEROME Admin)' : 'By another signed-in identity — see technical details'}</p>
        <details className="disclosure disclosure--compact">
          <summary>Technical details</summary>
          <dl className="tech-details">
            <dt>Action code</dt><dd><code>{entry.action}</code></dd>
            <dt>Entity</dt><dd><code>{entry.entity_type || '—'}</code>{entry.entity_id ? <> · <code>{entry.entity_id}</code></> : null}</dd>
            <dt>Actor ID</dt><dd><code>{entry.actor_user_id || '—'}</code></dd>
            <dt>Entry ID</dt><dd><code>{entry.id}</code></dd>
            <dt>Recorded</dt><dd><code>{entry.created_at}</code></dd>
          </dl>
          <pre className="json">{JSON.stringify(entry.metadata_json ?? {}, null, 2)}</pre>
        </details>
      </div>
    </li>
  );
}

export default function AuditLog() {
  const { user } = useAuth();
  const [limit, setLimit] = useState(PAGE);
  const { data, loading, refreshing, error, refresh } = useAsync(() => listAuditLog({ limit }), [limit]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const header = <PageHeader title="Audit log" subtitle="A chronological, append-only record of important YEROME changes. Newest first." />;
  if (loading && !data) return <>{header}<PageSkeleton header={false} stats={0} rows={8} label="Loading audit log…" /></>;
  if (error && !data) return <>{header}<ErrorState error={error} onRetry={refresh} /></>;

  const entries = data || [];
  const rows = entries.filter((entry) => auditMatches(entry, { query, category }));
  const maybeMore = entries.length >= limit;

  return <>
    {header}
    <FilterBar summary={`${plural(rows.length, 'entry', 'entries')} shown of ${entries.length} loaded`}>
      <SearchInput value={query} onChange={setQuery} label="Search audit log" placeholder="Search actions, names, IDs or details" />
      <FilterSelect label="Category" value={category} onChange={setCategory} options={AUDIT_CATEGORIES} allLabel="All categories" />
    </FilterBar>
    <Card padded={false}>
      {rows.length ? (
        <ul className="audit-list">{rows.map((entry) => <AuditEntry key={entry.id} entry={entry} currentUserId={user?.id} />)}</ul>
      ) : (
        <EmptyState compact icon="history" title={entries.length ? 'No matching entries' : 'No audit entries yet'}
          message={entries.length ? 'Try a different search or category. Older entries may need to be loaded.' : 'Creating US Persons, editing jobs and recording receipts will appear here.'} />
      )}
      {maybeMore ? (
        <div className="card__footer card__footer--center">
          <Button variant="secondary" loading={loading || refreshing} onClick={() => setLimit((value) => value + PAGE)}>Load older entries</Button>
        </div>
      ) : null}
    </Card>
  </>;
}
