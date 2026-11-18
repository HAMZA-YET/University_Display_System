import PageHeader from '../../components/layout/PageHeader';
import Table from '../../components/ui/Table';
import Select from '../../components/ui/Select';
import Pagination from '../../components/ui/Pagination';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import useQueryParams from '../../hooks/useQueryParams';
import { listDomainEvents } from '../../api/users';
import { formatDateTime } from '../../lib/time';

const TYPES = ['NOTICE_PUBLISHED', 'NOTICE_SCHEDULED', 'NOTICE_CORRECTED', 'NOTICE_WITHDRAWN', 'NOTICE_ARCHIVED', 'EVENT_CREATED', 'EVENT_POSTPONED', 'EVENT_CANCELLED'];

/** Domain events are the contract handed to Member 4 (notifications). IDs are stable UUIDv5 values. */
export default function DomainEvents() {
  const [params, setParams] = useQueryParams(['type', 'page']);
  const result = useApi(() => listDomainEvents({ type: params.type, page: params.page || 1 }), [params.type, params.page]);
  const columns = [
    { key: 'eventId', header: 'Event ID', render: (e) => <span className="mono">{e.eventId}</span> },
    { key: 'type', header: 'Type', render: (e) => <strong>{e.type}</strong> },
    { key: 'entity', header: 'Entity', render: (e) => <span className="mono">{`${e.entityType} ${e.entityId} v${e.entityVersion}`}</span> },
    { key: 'title', header: 'Title', render: (e) => (e.payload && e.payload.title) || '-' },
    { key: 'timestamp', header: 'Time (KST)', render: (e) => <span className="nowrap">{formatDateTime(e.timestamp)}</span> },
    { key: 'delivery', header: 'Delivery', render: (e) => e.deliveryStatus },
  ];
  return (
    <>
      <PageHeader title="Domain events" description="One record per logical action. Repeating an action never creates a duplicate (idempotency key)." />
      <div className="stack">
        <div style={{ maxWidth: 320 }}>
          <Select label="Type" value={params.type} onChange={(e) => setParams({ type: e.target.value })} placeholder="All types" options={TYPES.map((t) => ({ value: t, label: t }))} />
        </div>
        <DataState {...result} onRetry={result.reload} isEmpty={(d) => !d.data.length} emptyTitle="No domain events">
          {(d) => (
            <>
              <Table caption="Domain events" columns={columns} rows={d.data} rowKey="eventId" />
              <Pagination meta={d.meta} onPage={(page) => setParams({ page })} />
            </>
          )}
        </DataState>
      </div>
    </>
  );
}
