import StatusBadge from '../ui/StatusBadge';
import Icon from '../ui/Icon';
import { formatDate, formatTime, formatDateTime } from '../../lib/time';

/** State banner for an event. Cancelled times are struck through. */
export default function EventStatusBanner({ event }) {
  const struck = event.state === 'CANCELLED';
  return (
    <div className={`event-banner ${event.state}`} aria-label="Linked event">
      <div className="row-between">
        <div className="row">
          <Icon name="calendar" />
          <strong>{event.title}</strong>
        </div>
        <StatusBadge status={event.state} kind="event" />
      </div>
      <div className="card-meta" style={{ marginTop: 'var(--space-2)', color: 'var(--color-text)' }}>
        <span className={struck ? 'strike' : ''}>
          <Icon name="clock" size={14} /> {formatDate(event.start, event.timezone)}, {formatTime(event.start, event.timezone)}-
          {formatTime(event.end, event.timezone)} ({event.timezone})
        </span>
        <span>
          <Icon name="location" size={14} /> {event.venue}
          {event.venueBuilding ? `, ${event.venueBuilding}` : ''}
          {event.venueRoom ? ` ${event.venueRoom}` : ''}
        </span>
        <span>
          <Icon name="user" size={14} /> {event.organizer}
        </span>
      </div>
      {event.state === 'POSTPONED' && event.originalStart && (
        <p className="small" style={{ margin: 'var(--space-2) 0 0' }}>
          Originally <span className="strike">{formatDateTime(event.originalStart, event.timezone)}</span>. Reason: {event.postponementReason}
        </p>
      )}
      {event.state === 'CANCELLED' && (
        <p className="small" style={{ margin: 'var(--space-2) 0 0' }}>
          <strong>Cancelled.</strong> Reason: {event.cancellationReason}
        </p>
      )}
    </div>
  );
}
