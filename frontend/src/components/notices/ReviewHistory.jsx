import StatusBadge from '../ui/StatusBadge';
import { formatDateTime } from '../../lib/time';
import { humanize } from '../../lib/labels';

const BADGE = {
  SUBMITTED: 'SUBMITTED',
  RETURNED: 'RETURNED',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
  CORRECTION_APPROVED: 'APPROVED',
  CORRECTION_REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  ARCHIVED: 'ARCHIVED',
};

/** Review history for staff and the author. Never shown on public pages. */
export default function ReviewHistory({ history = [] }) {
  if (!history.length) return <p className="muted">No review activity yet.</p>;
  return (
    <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Review history">
      {[...history].reverse().map((h, i) => (
        <li key={i} className="card" style={{ borderLeftColor: 'var(--color-border-strong)' }}>
          <div className="row-between">
            <div className="row">
              <StatusBadge status={BADGE[h.decision] || 'DRAFT'} />
              <strong>{humanize(h.decision)}</strong>
              {h.revisionNumber && <span className="muted small">Revision {h.revisionNumber}</span>}
            </div>
            <span className="small muted">{formatDateTime(h.decidedAt)} KST</span>
          </div>
          {h.reviewer && h.reviewer.name && h.decision !== 'SUBMITTED' && <div className="small">By {h.reviewer.name}</div>}
          {h.reason && (
            <blockquote style={{ margin: 0, paddingLeft: 'var(--space-3)', borderLeft: '3px solid var(--color-border-strong)' }}>
              {h.reason}
            </blockquote>
          )}
        </li>
      ))}
    </ol>
  );
}
