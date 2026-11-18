import PageHeader from '../../components/layout/PageHeader';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import Pagination from '../../components/ui/Pagination';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import useQueryParams from '../../hooks/useQueryParams';
import useDepartments from '../../hooks/useDepartments';
import { reviewQueue } from '../../api/notices';
import { formatDateTime } from '../../lib/time';
import { humanize } from '../../lib/labels';

export default function ReviewerQueue() {
  const [params, setParams] = useQueryParams(['page']);
  const { byCode } = useDepartments();
  const result = useApi(() => reviewQueue({ page: params.page || 1 }), [params.page]);

  const columns = [
    { key: 'title', header: 'Title', render: (r) => <strong>{r.title}</strong> },
    { key: 'author', header: 'Author', render: (r) => (r.author ? r.author.name : '-') },
    { key: 'department', header: 'Department', render: (r) => (r.department === 'ALL' ? 'All' : byCode[r.department] || r.department || '-') },
    { key: 'category', header: 'Category', render: (r) => humanize(r.category) },
    { key: 'type', header: 'Type', render: (r) => <span className="tag">{r.type === 'NEW' ? 'New notice' : 'Correction'}</span> },
    { key: 'submittedAt', header: 'Submitted (KST)', render: (r) => <span className="nowrap">{formatDateTime(r.submittedAt)}</span> },
    {
      key: 'window',
      header: 'Requested window',
      render: (r) => (
        <span className="small">
          {r.requestedPublicationStart ? formatDateTime(r.requestedPublicationStart) : 'Not set'}
          {r.requestedPublicationEnd ? ` to ${formatDateTime(r.requestedPublicationEnd)}` : ''}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.effectiveStatus} /> },
    {
      key: 'open',
      header: 'Action',
      render: (r) => (
        <Button size="sm" to={`/reviewer/notices/${r.noticeId}${r.revisionId ? `?revision=${r.revisionId}` : ''}`}>
          {r.ownNotice ? 'View (your own)' : 'Review'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Review queue" description="Submitted notices and pending corrections, oldest first." />
      <DataState {...result} onRetry={result.reload} isEmpty={(d) => !d.data.length} emptyTitle="Nothing to review" emptyText="New submissions and corrections will appear here.">
        {(d) => (
          <>
            <Table caption="Review queue" columns={columns} rows={d.data} rowKey={(r) => `${r.noticeId}-${r.revisionId || 'new'}`} />
            <Pagination meta={d.meta} onPage={(page) => setParams({ page })} />
          </>
        )}
      </DataState>
    </>
  );
}
