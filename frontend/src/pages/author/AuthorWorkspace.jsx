import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import Alert from '../../components/ui/Alert';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Pagination from '../../components/ui/Pagination';
import Select from '../../components/ui/Select';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import useQueryParams from '../../hooks/useQueryParams';
import { listNotices, submitNotice, deleteNotice, withdrawNotice } from '../../api/notices';
import { formatDateTime } from '../../lib/time';
import { EFFECTIVE_STATUSES, humanize } from '../../lib/labels';

export default function AuthorWorkspace() {
  const location = useLocation();
  const [params, setParams] = useQueryParams(['status', 'page']);
  const [flash, setFlash] = useState(location.state && location.state.flash ? { type: 'success', text: location.state.flash } : null);
  const [dialog, setDialog] = useState(null);
  const result = useApi(() => listNotices({ status: params.status, page: params.page || 1 }), [params.status, params.page]);

  async function submit(row) {
    setFlash(null);
    try {
      await submitNotice(row.id, row.version);
      setFlash({ type: 'success', text: `"${row.title}" was submitted for review.` });
      result.reload();
    } catch (err) {
      setFlash({ type: 'error', text: err.message, list: (err.details || []).map((d) => d.message), editId: row.id });
    }
  }

  const columns = [
    {
      key: 'title',
      header: 'Title',
      render: (r) => (
        <div>
          <strong>{r.title}</strong>
          {r.hasPendingCorrection && <div className="small muted">Correction waiting for review</div>}
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.effectiveStatus} /> },
    { key: 'updated', header: 'Last updated', render: (r) => <span className="nowrap">{formatDateTime(r.updatedAt)}</span> },
    {
      key: 'window',
      header: 'Requested window (KST)',
      render: (r) => (
        <span className="small">
          {r.requestedPublicationStart ? formatDateTime(r.requestedPublicationStart) : 'Not set'}
          {r.requestedPublicationEnd ? ` to ${formatDateTime(r.requestedPublicationEnd)}` : ''}
        </span>
      ),
    },
    {
      key: 'feedback',
      header: 'Review feedback',
      render: (r) =>
        r.lastReview ? (
          <div className="small">
            <strong>{humanize(r.lastReview.decision)}</strong> {formatDateTime(r.lastReview.decidedAt)}
            {r.lastReview.reviewer && r.lastReview.reviewer.name && <div>By {r.lastReview.reviewer.name}</div>}
            {r.lastReview.reason && <div>"{r.lastReview.reason}"</div>}
          </div>
        ) : (
          <span className="muted small">None yet</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => {
        const s = r.effectiveStatus;
        return (
          <div className="actions">
            {(s === 'DRAFT' || s === 'RETURNED') && (
              <>
                <Button size="sm" variant="secondary" icon="edit" to={`/author/notices/${r.id}/edit`}>
                  Edit
                </Button>
                <Button size="sm" variant="secondary" icon="eye" to={`/author/notices/${r.id}/preview`}>
                  Preview
                </Button>
                <Button size="sm" icon="upload" onClick={() => submit(r)}>
                  Submit
                </Button>
                <Button size="sm" variant="ghost" icon="trash" onClick={() => setDialog({ type: 'delete', row: r })}>
                  Delete draft
                </Button>
              </>
            )}
            {s === 'SUBMITTED' && (
              <Button size="sm" variant="secondary" icon="eye" to={`/author/notices/${r.id}/preview`}>
                View
              </Button>
            )}
            {['SCHEDULED', 'PUBLISHED', 'EXPIRED'].includes(s) && (
              <>
                <Button size="sm" variant="secondary" icon="eye" to={s === 'PUBLISHED' ? `/notices/${r.id}` : `/author/notices/${r.id}/preview`}>
                  View
                </Button>
                {!r.hasPendingCorrection && (
                  <Button size="sm" variant="secondary" icon="edit" to={`/author/notices/${r.id}/revise`}>
                    Create correction
                  </Button>
                )}
                {s === 'PUBLISHED' && (
                  <Button size="sm" variant="danger" onClick={() => setDialog({ type: 'withdraw', row: r })}>
                    Withdraw
                  </Button>
                )}
              </>
            )}
            {s === 'REJECTED' && (
              <Button size="sm" variant="secondary" to={`/author/notices/${r.id}/preview`}>
                View feedback
              </Button>
            )}
            {(s === 'WITHDRAWN' || s === 'ARCHIVED') && (
              <Button size="sm" variant="secondary" to={`/author/notices/${r.id}/preview`}>
                View
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="My notices"
        description="Your drafts, submissions and published notices, with review feedback."
        actions={
          <Button icon="plus" to="/author/notices/new">
            New notice
          </Button>
        }
      />
      <div className="stack">
        {flash && (
          <Alert type={flash.type} title={flash.text}>
            {flash.list && flash.list.length > 0 && (
              <>
                <ul>
                  {flash.list.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
                <Link to={`/author/notices/${flash.editId}/edit`}>Open the editor to fix these fields</Link>
              </>
            )}
          </Alert>
        )}
        <div style={{ maxWidth: 280 }}>
          <Select
            label="Filter by status"
            value={params.status}
            onChange={(e) => setParams({ status: e.target.value })}
            placeholder="All (except archived)"
            options={EFFECTIVE_STATUSES.map((s) => ({ value: s, label: humanize(s) }))}
          />
        </div>
        <DataState {...result} onRetry={result.reload} isEmpty={(d) => !d.data.length} emptyTitle="No notices yet" emptyText="Create your first notice with the New notice button.">
          {(d) => (
            <>
              <Table caption="My notices" columns={columns} rows={d.data} />
              <Pagination meta={d.meta} onPage={(page) => setParams({ page })} />
            </>
          )}
        </DataState>
      </div>

      <ConfirmDialog
        open={dialog && dialog.type === 'delete'}
        title="Delete draft"
        message={dialog ? `Delete the draft "${dialog.row.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete draft"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await deleteNotice(dialog.row.id);
          setFlash({ type: 'success', text: 'The draft was deleted.' });
          result.reload();
        }}
      />
      <ConfirmDialog
        open={dialog && dialog.type === 'withdraw'}
        title="Withdraw published notice"
        message="The notice will disappear from all public pages, search and attachment links immediately."
        confirmLabel="Withdraw notice"
        requireReason
        reasonLabel="Reason for withdrawal"
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await withdrawNotice(dialog.row.id, reason);
          setFlash({ type: 'success', text: 'The notice was withdrawn.' });
          result.reload();
        }}
      />
    </>
  );
}
