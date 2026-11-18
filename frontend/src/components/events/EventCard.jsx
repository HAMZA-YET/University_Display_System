import { Link } from 'react-router-dom';
import StatusBadge from '../ui/StatusBadge';
import Icon from '../ui/Icon';
import { formatDate, formatTime, formatDateTime } from '../../lib/time';

export default function EventCard({ event }) {
  const cancelled = event.state === 'CANCELLED';
  return (
    <article className="card" style={{ borderLeftColor: `var(--status-${event.state.toLowerCase()})` }}>
      <div className="row-between">
        <h3>
          <Link to={`/notices/${event.noticeId}`}>{event.title}</Link>
        </h3>
        <StatusBadge status={event.state} kind="event" />
      </div>
      <div className="card-meta" style={{ color: 'var(--color-text)' }}>
        <span>
          <Icon name="calendar" size={14} /> <span className={cancelled ? 'strike' : ''}>{formatDate(event.start, event.timezone)}</span>
        </span>
        <span>
          <Icon name="clock" size={14} />
          <span className={cancelled ? 'strike' : ''}>
            Start {formatTime(event.start, event.timezone)} - End {formatTime(event.end, event.timezone)}
          </span>
          <span className="muted">({event.timezone})</span>
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
      {event.state === 'POSTPONED' && (
        <p className="small" style={{ margin: 0 }}>
          New time: <strong>{formatDateTime(event.start, event.timezone)}</strong>. Originally{' '}
          <span className="strike">{formatDateTime(event.originalStart, event.timezone)}</span>. Reason: {event.postponementReason}
        </p>
      )}
      {cancelled && (
        <p className="small" style={{ margin: 0 }}>
          <strong>Cancelled.</strong> Reason: {event.cancellationReason}
        </p>
      )}
      <Link to={`/notices/${event.noticeId}`} className="small">
        Read the related notice
      </Link>
    </article>
  );
}
