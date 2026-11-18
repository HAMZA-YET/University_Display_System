import { formatDateTime } from '../../lib/time';
import { humanize } from '../../lib/labels';

function show(field, value) {
  if (value === null || value === undefined || value === '') return <span className="muted">(empty)</span>;
  if (field === 'attachments') {
    if (!value.length) return <span className="muted">(none)</span>;
    return value.map((a) => a.fileName).join(', ');
  }
  if (field === 'actionDeadline') return `${formatDateTime(value)} KST`;
  return String(value);
}

/** Field-by-field comparison between the approved revision and a correction. */
export default function RevisionDiff({ diff }) {
  return (
    <div className="stack">
      <p>
        Comparing approved revision <strong>{diff.base ? diff.base.revisionNumber : '-'}</strong> with correction{' '}
        <strong>{diff.revision.revisionNumber}</strong>. {diff.changedCount} field(s) changed.
      </p>
      {diff.revision.changeNote && (
        <div className="alert alert-info">
          <div>
            <div className="alert-title">Change note from the author</div>
            {diff.revision.changeNote}
          </div>
        </div>
      )}
      <div className="table-wrap stack-mobile">
        <table className="table diff-table">
          <caption className="visually-hidden">Field-by-field differences</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Current public version</th>
              <th scope="col">Proposed correction</th>
            </tr>
          </thead>
          <tbody>
            {diff.fields.map((f) => (
              <tr key={f.field}>
                <td data-label="Field">
                  <strong>{humanize(f.field)}</strong>
                  {f.changed && <div className="small" style={{ color: 'var(--color-warning)', fontWeight: 700 }}>CHANGED</div>}
                </td>
                <td data-label="Current" className={f.changed ? 'changed before' : ''}>
                  {show(f.field, f.before)}
                </td>
                <td data-label="Proposed" className={f.changed ? 'changed after' : ''}>
                  {show(f.field, f.after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
