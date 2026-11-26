import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import { DataState } from '../../components/ui/States';
import { TypeTag, ClaimStatusBadge } from '../../components/lostFound/LfBadges';
import DeleteButton from '../../components/lostFound/DeleteButton';
import BulkDeletableTable from '../../components/lostFound/BulkDeletableTable';
import { BackToLostFound } from './LostFoundItem';
import useApi from '../../hooks/useApi';
import useQueryParams from '../../hooks/useQueryParams';
import { listMyItems, listMyClaims, deleteMyItem, deleteMyClaim } from '../../api/lostFound';
import { postedDate } from '../../lib/lostFoundLabels';

const TYPE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'LOST', label: 'Lost' },
  { value: 'FOUND', label: 'Found' },
];

function MyReports({ page, type, setParams }) {
  const result = useApi(() => listMyItems({ page: page || 1, type }), [page, type]);
  const columns = [
    {
      key: 'title',
      header: 'Item',
      render: (r) => (
        <span className="row">
          <TypeTag type={r.type} /> <Link to={`/items/my-reports/${r.id}`}>{r.title}</Link>
        </span>
      ),
    },
    { key: 'reference', header: 'Reference', render: (r) => <span className="mono">{r.reference}</span> },
    { key: 'postedAt', header: 'Posted', render: (r) => <span className="nowrap">{postedDate(r.postedAt)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div className="actions">
          <Button size="sm" variant="secondary" to={`/items/my-reports/${r.id}`}>
            Open
          </Button>
          {['OPEN', 'COLLECTION_APPROVED'].includes(r.status) && (
            <Button size="sm" variant="secondary" icon="edit" to={`/items/my-reports/${r.id}/edit`}>
              Edit
            </Button>
          )}
          <DeleteButton what="report" name={r.title} onDelete={() => deleteMyItem(r.id).then(result.reload)} />
        </div>
      ),
    },
  ];
  return (
    <div className="stack">
      <div className="lf-chips" role="group" aria-label="Report type">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t.value || 'all'}
            type="button"
            className="lf-chip"
            aria-pressed={type === t.value}
            onClick={() => setParams({ type: t.value })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <DataState
        {...result}
        onRetry={result.reload}
        isEmpty={(d) => !d.data.length}
        emptyTitle="No reports"
        emptyText="Reports you post appear here."
      >
        {(d) => (
          <>
            <BulkDeletableTable caption="My reports" columns={columns} rows={d.data} deleteOne={deleteMyItem} onDone={result.reload} />
            <Pagination meta={d.meta} onPage={(p) => setParams({ page: p })} />
          </>
        )}
      </DataState>
    </div>
  );
}

function MyClaims({ page, setParams }) {
  const result = useApi(() => listMyClaims({ page: page || 1 }), [page]);
  const columns = [
    { key: 'title', header: 'Item', render: (r) => <Link to={`/items/my-claims/${r.id}`}>{r.item ? r.item.title : 'Item'}</Link> },
    { key: 'status', header: 'Admin decision', render: (r) => <ClaimStatusBadge status={r.status} /> },
    { key: 'createdAt', header: 'Claimed', render: (r) => <span className="nowrap">{postedDate(r.createdAt)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div className="actions">
          <Button size="sm" variant="secondary" to={`/items/my-claims/${r.id}`}>
            Open
          </Button>
          <DeleteButton what="claim" name={r.item ? r.item.title : 'this claim'} onDelete={() => deleteMyClaim(r.id).then(result.reload)} />
        </div>
      ),
    },
  ];
  return (
    <DataState
      {...result}
      onRetry={result.reload}
      isEmpty={(d) => !d.data.length}
      emptyTitle="No claims"
      emptyText="When you claim a found item, you can follow the admin's decision here."
    >
      {(d) => (
        <>
          <BulkDeletableTable caption="My claims" columns={columns} rows={d.data} deleteOne={deleteMyClaim} onDone={result.reload} itemNoun="claim" />
          <Pagination meta={d.meta} onPage={(p) => setParams({ page: p })} />
        </>
      )}
    </DataState>
  );
}

/** My Cases: My Reports | My Claims. The server returns only the signed-in member's own cases. */
export default function MyCases() {
  const [params, setParams] = useQueryParams(['tab', 'type', 'page']);
  const tab = params.tab === 'claims' ? 'claims' : 'reports';
  return (
    <>
      <PageHeader
        title="My Cases"
        breadcrumb={<BackToLostFound />}
        actions={
          <Button to="/items/report" icon="plus">
            Report an item
          </Button>
        }
      />
      <div className="stack">
        <div className="tabs" role="tablist" aria-label="My cases">
          <button type="button" role="tab" aria-selected={tab === 'reports'} onClick={() => setParams({ tab: '', type: '' })}>
            My Reports
          </button>
          <button type="button" role="tab" aria-selected={tab === 'claims'} onClick={() => setParams({ tab: 'claims', type: '' })}>
            My Claims
          </button>
        </div>
        {tab === 'reports' ? (
          <MyReports page={params.page} type={params.type} setParams={setParams} />
        ) : (
          <MyClaims page={params.page} setParams={setParams} />
        )}
      </div>
    </>
  );
}
