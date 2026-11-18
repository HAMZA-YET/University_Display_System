import { useState } from 'react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import Select from '../ui/Select';
import Checkbox from '../ui/Checkbox';
import DateTimeField from '../ui/DateTimeField';
import Alert from '../ui/Alert';
import { PRIORITIES, humanize } from '../../lib/labels';
import { toLocalInput, fromLocalInput } from '../../lib/time';
import { approveNotice, returnNotice, rejectNotice } from '../../api/notices';

/** Approve / Return / Reject actions for a SUBMITTED notice. */
export default function ReviewPanel({ notice, onDone, ownNotice, isAdmin }) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [mode, setMode] = useState('NOW');
  const [start, setStart] = useState(toLocalInput(notice.requestedPublicationStart));
  const [end, setEnd] = useState(toLocalInput(notice.requestedPublicationEnd));
  const [priority, setPriority] = useState(notice.priority || 'NORMAL');
  const [pinned, setPinned] = useState(Boolean(notice.pinned));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const blocked = ownNotice && !isAdmin;

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const body = { mode, priority, pinned, publicationEnd: end ? fromLocalInput(end) : null };
      if (mode === 'SCHEDULE') body.publicationStart = fromLocalInput(start);
      const res = await approveNotice(notice.id, body);
      setApproveOpen(false);
      onDone(res.data, `Approved. ${res.domainEvent.type === 'NOTICE_PUBLISHED' ? 'The notice is now published.' : 'The notice is scheduled.'}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="review-actions">
      <div className="panel-title">
        <h2 id="review-actions">Review decision</h2>
      </div>
      {blocked ? (
        <Alert type="warning" title="Separation of duties">
          You authored this notice, so you cannot approve, return or reject it. Another reviewer must decide.
        </Alert>
      ) : (
        <div className="stack">
          {ownNotice && isAdmin && (
            <Alert type="warning">You authored this notice. As an administrator you may override; the action will be recorded in the audit log.</Alert>
          )}
          <div className="row">
            <Button icon="check" onClick={() => setApproveOpen(true)}>
              Approve
            </Button>
            <Button variant="secondary" icon="refresh" onClick={() => setDialog('return')}>
              Return for changes
            </Button>
            <Button variant="danger" icon="close" onClick={() => setDialog('reject')}>
              Reject
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={approveOpen}
        title="Approve and set publication"
        onClose={() => !busy && setApproveOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproveOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={approve} busy={busy}>
              {mode === 'NOW' ? 'Approve and publish now' : 'Approve and schedule'}
            </Button>
          </>
        }
      >
        <div className="stack">
          <fieldset>
            <legend>Publication</legend>
            <div className="stack">
              <label className="checkbox">
                <input type="radio" name="mode" value="NOW" checked={mode === 'NOW'} onChange={() => setMode('NOW')} />
                <span>Publish now</span>
              </label>
              <label className="checkbox">
                <input type="radio" name="mode" value="SCHEDULE" checked={mode === 'SCHEDULE'} onChange={() => setMode('SCHEDULE')} />
                <span>Schedule (start must be in the future)</span>
              </label>
            </div>
          </fieldset>
          <div className="form-grid">
            {mode === 'SCHEDULE' && (
              <DateTimeField label="Publication start" required value={start} onChange={(e) => setStart(e.target.value)} />
            )}
            <DateTimeField label="Publication end (optional)" value={end} onChange={(e) => setEnd(e.target.value)} hint="Leave empty to keep it visible until withdrawn." />
            <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} options={PRIORITIES.map((p) => ({ value: p, label: humanize(p) }))} />
            <Checkbox label="Pin this notice to the top" checked={pinned} onChange={(e) => setPinned(e.target.checked)} hint="At most 5 notices can be pinned at once." />
          </div>
          {error && (
            <Alert type="error" title="Could not approve">
              {error.message}
              {error.details && error.details.length > 0 && (
                <ul>
                  {error.details.map((d, i) => (
                    <li key={i}>{d.message}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={dialog === 'return'}
        title="Return notice to the author"
        message="The author will see your reason and can edit and resubmit the notice."
        confirmLabel="Return notice"
        variant="primary"
        requireReason
        reasonLabel="What should the author change?"
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => onDone(await returnNotice(notice.id, reason), 'The notice was returned to the author.')}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        title="Reject notice"
        message="Rejection is final. The author will see your reason and cannot resubmit this notice."
        confirmLabel="Reject notice"
        requireReason
        reasonLabel="Reason for rejection"
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => onDone(await rejectNotice(notice.id, reason), 'The notice was rejected.')}
      />
    </section>
  );
}
