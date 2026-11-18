import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import NoticeView from '../../components/notices/NoticeView';
import ReviewPanel from '../../components/notices/ReviewPanel';
import ReviewHistory from '../../components/notices/ReviewHistory';
import RevisionDiff from '../../components/notices/RevisionDiff';
import EventStatusBanner from '../../components/events/EventStatusBanner';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Select from '../../components/ui/Select';
import Checkbox from '../../components/ui/Checkbox';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import DateTimeField from '../../components/ui/DateTimeField';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import useAuth from '../../hooks/useAuth';
import useDepartments from '../../hooks/useDepartments';
import {
  getNotice,
  previewNotice,
  revisionDiff,
  approveRevision,
  rejectRevision,
  withdrawNotice,
  archiveNotice,
  updatePlacement,
} from '../../api/notices';
import { postponeEvent, cancelEvent } from '../../api/events';
import { fromLocalInput, formatDateTime } from '../../lib/time';
import { PRIORITIES, humanize } from '../../lib/labels';

function PlacementPanel({ notice, onDone }) {
  const [priority, setPriority] = useState(notice.priority);
  const [pinned, setPinned] = useState(notice.pinned);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      onDone(await updatePlacement(notice.id, { priority, pinned }, notice.version), 'Priority and pinning updated. The public order is updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Priority and pinning</h2>
      </div>
      <div className="stack">
        <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} options={PRIORITIES.map((p) => ({ value: p, label: humanize(p) }))} />
        <Checkbox label="Pinned" checked={pinned} onChange={(e) => setPinned(e.target.checked)} hint="At most 5 pinned notices at once." />
        {error && <Alert type="error">{error}</Alert>}
        <Button variant="secondary" onClick={save} busy={busy}>
          Save placement
        </Button>
      </div>
    </section>
  );
}

function EventActions({ event, onDone }) {
  const [dialog, setDialog] = useState(null);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const changeable = ['SCHEDULED', 'POSTPONED'].includes(event.state);
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Linked event</h2>
      </div>
      <div className="stack">
        <EventStatusBanner event={event} />
        {event.scheduleHistory && event.scheduleHistory.length > 0 && (
          <div className="small">
            <strong>Schedule history</strong>
            <ul>
              {event.scheduleHistory.map((h, i) => (
                <li key={i}>
                  Was {formatDateTime(h.previousStart)} to {formatDateTime(h.previousEnd)}, changed {formatDateTime(h.changedAt)}: {h.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {changeable && (
          <div className="row">
            <Button variant="secondary" onClick={() => setDialog('postpone')}>
              Postpone
            </Button>
            <Button variant="danger" onClick={() => setDialog('cancel')}>
              Cancel event
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={dialog === 'postpone'}
        title="Postpone event"
        message="The same event keeps its identity. The old times are kept in its history."
        confirmLabel="Postpone event"
        variant="primary"
        requireReason
        reasonLabel="Reason for postponement"
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          if (!newStart || !newEnd) throw new Error('Choose the new start and end.');
          const res = await postponeEvent(event.id, { newStart: fromLocalInput(newStart), newEnd: fromLocalInput(newEnd), reason });
          onDone(null, `Event postponed. Domain event ${res.domainEvent.eventId} recorded.`);
        }}
      >
        <div className="form-grid">
          <DateTimeField label="New start" required value={newStart} onChange={(e) => setNewStart(e.target.value)} />
          <DateTimeField label="New end" required value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'cancel'}
        title="Cancel event"
        message="A cancelled event stays visible with its reason and cannot be postponed or edited afterwards."
        confirmLabel="Cancel event"
        requireReason
        reasonLabel="Reason for cancellation"
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await cancelEvent(event.id, reason);
          onDone(null, 'Event cancelled.');
        }}
      />
    </section>
  );
}

export default function ReviewNotice() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const { user } = useAuth();
  const { byCode } = useDepartments();
  const [flash, setFlash] = useState(null);
  const [dialog, setDialog] = useState(null);

  const result = useApi(async () => {
    const notice = await getNotice(id);
    const revId = search.get('revision') || (notice.pendingRevision ? notice.pendingRevision.id : null);
    const [preview, diff] = await Promise.all([
      previewNotice(id),
      revId && notice.pendingRevision && notice.pendingRevision.id === revId ? revisionDiff(id, revId) : Promise.resolve(null),
    ]);
    return { notice, preview, diff };
  }, [id, search.get('revision')]);

  function done(_updated, message) {
    setFlash(message);
    result.reload();
  }

  return (
    <DataState {...result} onRetry={result.reload}>
      {({ notice, preview, diff }) => {
        const ownNotice = notice.author && notice.author.id === user.id;
        const isAdmin = user.role === 'ADMIN';
        const s = notice.effectiveStatus;
        const correctionOwn = diff && diff.revision.author && diff.revision.author.id === user.id;
        return (
          <>
            <PageHeader
              title={notice.title}
              breadcrumb={<Link to="/reviewer/queue">Review queue</Link>}
              actions={<StatusBadge status={s} />}
              description={`Author: ${notice.author ? notice.author.name : '-'} | Version ${notice.version}${notice.approvedVersionNumber ? ` | Approved revision ${notice.approvedVersionNumber}` : ''}`}
            />
            {flash && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <Alert type="success">{flash}</Alert>
              </div>
            )}
            <div className="grid grid-sidebar">
              <div className="stack">
                {diff ? (
                  <section className="panel">
                    <div className="panel-title">
                      <h2>Correction under review</h2>
                    </div>
                    <RevisionDiff diff={diff} />
                    {correctionOwn && !isAdmin ? (
                      <Alert type="warning">You authored this correction, so another reviewer must decide.</Alert>
                    ) : (
                      <div className="row" style={{ marginTop: 'var(--space-4)' }}>
                        <Button icon="check" onClick={() => setDialog('approveCorrection')}>
                          Approve correction
                        </Button>
                        <Button variant="danger" onClick={() => setDialog('rejectCorrection')}>
                          Reject correction
                        </Button>
                      </div>
                    )}
                  </section>
                ) : (
                  <>
                    {['SCHEDULED', 'PUBLISHED', 'EXPIRED'].includes(s) && (
                      <Alert type="info">
                        This shows the working copy. The public page shows the approved revision.{' '}
                        {s === 'PUBLISHED' && <Link to={`/notices/${notice.id}`}>Open the public page</Link>}
                      </Alert>
                    )}
                    <NoticeView notice={preview} departments={byCode} preview={notice.status !== 'APPROVED'} />
                  </>
                )}
              </div>
              <aside className="stack">
                {notice.status === 'SUBMITTED' && <ReviewPanel notice={notice} onDone={done} ownNotice={ownNotice} isAdmin={isAdmin} />}
                {notice.status === 'APPROVED' && s !== 'EXPIRED' && <PlacementPanel key={notice.version} notice={notice} onDone={done} />}
                {(notice.status === 'APPROVED' || notice.status === 'WITHDRAWN') && (
                  <section className="panel">
                    <div className="panel-title">
                      <h2>Lifecycle</h2>
                    </div>
                    <div className="stack small">
                      {notice.publicationStart && (
                        <div>
                          Window: {formatDateTime(notice.publicationStart)} to {notice.publicationEnd ? formatDateTime(notice.publicationEnd) : 'open'} (KST)
                        </div>
                      )}
                      <div className="row">
                        {notice.status === 'APPROVED' && (
                          <Button variant="danger" onClick={() => setDialog('withdraw')}>
                            Withdraw
                          </Button>
                        )}
                        {(notice.status === 'WITHDRAWN' || s === 'EXPIRED') && (
                          <Button variant="secondary" onClick={() => setDialog('archive')}>
                            Archive
                          </Button>
                        )}
                      </div>
                    </div>
                  </section>
                )}
                {notice.event && notice.status === 'APPROVED' && <EventActions event={notice.event} onDone={done} />}
                <section className="panel">
                  <div className="panel-title">
                    <h2>History</h2>
                  </div>
                  <ReviewHistory history={notice.reviewHistory} />
                </section>
              </aside>
            </div>

            <ConfirmDialog
              open={dialog === 'approveCorrection'}
              title="Approve correction"
              message="The corrected content becomes public immediately and readers see an Updated date."
              confirmLabel="Approve correction"
              variant="primary"
              onClose={() => setDialog(null)}
              onConfirm={async () => {
                await approveRevision(notice.id, diff.revision.id);
                done(null, 'Correction approved. The new version is public.');
              }}
            />
            <ConfirmDialog
              open={dialog === 'rejectCorrection'}
              title="Reject correction"
              message="The public version will not change. The author sees your reason."
              confirmLabel="Reject correction"
              requireReason
              onClose={() => setDialog(null)}
              onConfirm={async (reason) => {
                await rejectRevision(notice.id, diff.revision.id, reason);
                done(null, 'Correction rejected. The public version is unchanged.');
              }}
            />
            <ConfirmDialog
              open={dialog === 'withdraw'}
              title="Withdraw notice"
              message="The notice disappears from list, detail, search and attachment links immediately."
              confirmLabel="Withdraw notice"
              requireReason
              onClose={() => setDialog(null)}
              onConfirm={async (reason) => {
                await withdrawNotice(notice.id, reason);
                done(null, 'The notice was withdrawn.');
              }}
            />
            <ConfirmDialog
              open={dialog === 'archive'}
              title="Archive notice"
              message="Archived notices are never public and are hidden from the default staff lists."
              confirmLabel="Archive notice"
              onClose={() => setDialog(null)}
              onConfirm={async () => {
                await archiveNotice(notice.id);
                done(null, 'The notice was archived.');
              }}
            />
          </>
        );
      }}
    </DataState>
  );
}
