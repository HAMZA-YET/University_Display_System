import { humanize } from '../../lib/labels';

/** Status badge: always a text label plus colour, never colour alone. */
export default function StatusBadge({ status, kind = 'notice' }) {
  if (!status) return null;
  const cls = kind === 'event' ? `badge badge-ev-${status}` : `badge badge-${status}`;
  return (
    <span className={cls}>
      <span className="visually-hidden">{kind === 'event' ? 'Event state: ' : 'Status: '}</span>
      {humanize(status).toUpperCase()}
    </span>
  );
}
