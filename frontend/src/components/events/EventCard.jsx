import { Link } from 'react-router-dom';
import StatusBadge from '../ui/StatusBadge';
import Icon from '../ui/Icon';
import { formatDate, formatTime, formatDateTime } from '../../lib/time';

export default function EventCard({ event, compact = false }) {
  const cancelled = event.state === 'CANCELLED';
  const date = formatDate(event.start, event.timezone);
  const [, day, month] = date.split(' ');
  return (
    <article className={`card event-card ${compact ? 'event-card-compact' : ''}`}>
      <div className="event-card-header">
        <time className="event-date-block" dateTime={event.start} aria-label={date}><strong>{day}</strong><span>{month}</span></time>
        <div className="event-card-heading">
        <h3>
          <Link to={`/notices/${event.noticeId}`}>{event.title}</Link>
        </h3>
        <StatusBadge status={event.state} kind="event" />
        </div>
      </div>
      <div className="card-meta" style={{ color: 'var(--color-text)' }}>
        {!compact && <span>
          <Icon name="calendar" size={14} /> <span className={cancelled ? 'strike' : ''}>{formatDate(event.start, event.timezone)}</span>
        </span>}
        <span>
          <Icon name="clock" size={14} />
          <span className={cancelled ? 'strike' : ''}>
            Start {formatTime(event.start, event.timezone)} - End {formatTime(event.end, event.timezone)}
          </span>
          {!compact && <span className="muted">({event.timezone})</span>}
        </span>
        <span>
          <Icon name="location" size={14} /> {event.venue}
          {event.venueBuilding ? `, ${event.venueBuilding}` : ''}
          {event.venueRoom ? ` ${event.venueRoom}` : ''}
        </span>
        <span className="event-organizer">
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
