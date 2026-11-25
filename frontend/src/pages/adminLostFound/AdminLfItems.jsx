import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import BulkDeletableTable from '../../components/lostFound/BulkDeletableTable';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Icon from '../../components/ui/Icon';
import Pagination from '../../components/ui/Pagination';
import { DataState } from '../../components/ui/States';
import { TypeTag, ItemStatusBadge } from '../../components/lostFound/LfBadges';
import DeleteButton from '../../components/lostFound/DeleteButton';
import useApi from '../../hooks/useApi';
import useQueryParams from '../../hooks/useQueryParams';
import { adminListItems, adminDeleteItem } from '../../api/lostFound';
import { LF_CATEGORIES, lfLabel, postedDate } from '../../lib/lostFoundLabels';

export function BackToDashboard() {
  return (
    <Link to="/admin/lost-found">
      <Icon name="chevronLeft" size={14} /> Back to Admin Dashboard
    </Link>
  );
}

/** All reports (lost and found). Opened from the dashboard boxes, categories or "Show all". */
export default function AdminLfItems() {
  const [params, setParams] = useQueryParams(['type', 'category', 'page']);
  const result = useApi(
    () => adminListItems({ type: params.type, category: params.category, page: params.page || 1 }),
    [params.type, params.category, params.page]
  );
  const counts = result.data ? result.data.meta.typeCounts : null;
  const title = params.type === 'LOST' ? 'Lost Items' : params.type === 'FOUND' ? 'Found Items' : 'All Lost & Found items';

  const tabs = [
    { value: '', label: 'All', n: counts ? counts.ALL : null },
    { value: 'LOST', label: 'Lost', n: counts ? counts.LOST : null },
    { value: 'FOUND', label: 'Found', n: counts ? counts.FOUND : null },
  ];

  const columns = [
    {
      key: 'title',
      header: 'Item',
      render: (r) => (
        <span className="row">
          <TypeTag type={r.type} /> <Link to={`/admin/lost-found/items/${r.id}`}>{r.title}</Link>
          {r.status !== 'OPEN' && <ItemStatusBadge status={r.status} />}
        </span>
      ),
    },
    { key: 'category', header: 'Category', render: (r) => lfLabel(r.category) },
    { key: 'reporter', header: 'Reported by', render: (r) => (r.reporter ? r.reporter.name : '-') },
    { key: 'postedAt', header: 'Posted', render: (r) => <span className="nowrap">{postedDate(r.postedAt)}</span> },
    {
      key: 'claims',
      header: 'Claims',
      render: (r) =>
        r.type === 'LOST' ? (
          <span className="muted">-</span>
        ) : r.pendingClaimCount ? (
          <strong>{r.pendingClaimCount} waiting</strong>
        ) : (
          r.claimCount || 0
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div className="actions">
          <Button size="sm" variant="secondary" to={`/admin/lost-found/items/${r.id}`}>
            Open
          </Button>
          <DeleteButton what="report" name={r.title} onDelete={() => adminDeleteItem(r.id).then(result.reload)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={params.category ? `${title}: ${lfLabel(params.category)}` : title} breadcrumb={<BackToDashboard />} />
      <div className="stack">
        <div className="row-between">
          <div className="lf-chips" role="group" aria-label="Type">
            {tabs.map((t) => (
              <button
                key={t.value || 'all'}
                type="button"
                className="lf-chip"
                aria-pressed={params.type === t.value}
                onClick={() => setParams({ type: t.value })}
              >
                {t.label}
                {t.n !== null && t.n !== undefined && <span className="lf-chip-count">{t.n}</span>}
              </button>
            ))}
          </div>
          <div style={{ minWidth: 220 }}>
            <Select
              label="Category"
              value={params.category}
              onChange={(e) => setParams({ category: e.target.value })}
              placeholder="All categories"
              options={LF_CATEGORIES.map((c) => ({ value: c, label: lfLabel(c) }))}
            />
          </div>
        </div>
        <DataState
          {...result}
          onRetry={result.reload}
          isEmpty={(d) => !d.data.length}
          emptyTitle="No reports"
          emptyText="Nothing matches these filters."
        >
          {(d) => (
            <>
              <p className="lf-count">
                Showing <strong>{d.meta.total}</strong> report{d.meta.total === 1 ? '' : 's'}
              </p>
              <BulkDeletableTable caption={title} columns={columns} rows={d.data} deleteOne={adminDeleteItem} onDone={result.reload} />
              <Pagination meta={d.meta} onPage={(page) => setParams({ page })} />
            </>
          )}
        </DataState>
      </div>
    </>
  );
}
