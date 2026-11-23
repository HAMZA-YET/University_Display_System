import { historyLabel, lfLabel, postedDate } from '../../lib/lostFoundLabels';

/** Append-only case history, oldest first. */
export default function CaseHistory({ history = [], title = 'History' }) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-title">
        <h2>{title}</h2>
      </div>
      {history.length === 0 ? (
        <p className="muted">No history yet.</p>
      ) : (
        <ol className="lf-timeline">
          {history.map((h, i) => (
            <li key={`${h.at}-${i}`}>
              <span className="when">
                {postedDate(h.at)}
                {h.actorRole ? ` - ${lfLabel(h.actorRole)}` : ''}
              </span>
              <div>
                <strong>{historyLabel(h.action)}</strong>
              </div>
              {h.note && <div className="small">{h.note}</div>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
