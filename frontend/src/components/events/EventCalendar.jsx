import { Link } from 'react-router-dom';
import { zonedParts, formatTime, UNIVERSITY_TZ } from '../../lib/time';
import { humanize } from '../../lib/labels';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EVENT_STATES = ['SCHEDULED', 'POSTPONED', 'CANCELLED', 'COMPLETED'];

function key(y, m, d) {
  return `${y}-${m}-${d}`;
}

/**
 * Month grid built from the same events array as the list view, so both
 * views always show the same events and states. Days are in Asia/Seoul.
 */
export default function EventCalendar({ year, month, events }) {
  const byDay = new Map();
  events.forEach((e) => {
    const p = zonedParts(e.start, UNIVERSITY_TZ);
    if (!p) return;
    const k = key(p.year, p.month, p.day);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  });

  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = zonedParts(new Date(), UNIVERSITY_TZ);
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="event-calendar-shell">
      <div className="table-wrap calendar-scroll" role="region" aria-label="Monthly event calendar; scroll horizontally to see all days" tabIndex={0}>
        <table className="calendar event-month-grid">
          <caption className="visually-hidden">Events in {monthLabel}</caption>
          <thead>
            <tr>
              {WEEKDAYS.map((weekday, index) => (
                <th key={weekday} scope="col" className={index > 4 ? 'weekend' : undefined}>
                  <abbr title={weekday}>{weekday.slice(0, 3)}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day, di) => {
                  if (!day) return <td key={di} className={`other-month${di > 4 ? ' weekend' : ''}`} aria-hidden="true" />;
                  const items = byDay.get(key(year, month, day)) || [];
                  const isToday = today && today.year === year && today.month === month && today.day === day;
                  return (
                    <td key={di} className={[di > 4 ? 'weekend' : '', isToday ? 'today' : ''].filter(Boolean).join(' ')}>
                      <div className="day-num">
                        <time dateTime={`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`} aria-current={isToday ? 'date' : undefined}>
                          {day}{isToday && <span className="visually-hidden"> (today)</span>}
                        </time>
                        {isToday && <span className="calendar-today-label" aria-hidden="true">Today</span>}
                      </div>
                      {items.map((e) => (
                        <Link key={e.id} to={`/notices/${e.noticeId}`} className={`cal-event ${e.state}`} title={`${formatTime(e.start)} · ${e.title} — ${humanize(e.state)}`}>
                          <span className="cal-event-meta"><time className="cal-event-time" dateTime={e.start}>{formatTime(e.start)}</time><span className="cal-event-state">{humanize(e.state)}</span></span>
                          <span className="cal-event-title">{e.title}</span>
                        </Link>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="event-calendar-footer">
        <p>{events.length ? 'Select an event to read its notice.' : 'No events in this month for the selected filters.'}</p>
        <ul className="event-calendar-legend" aria-label="Event states">
          {EVENT_STATES.map((state) => <li key={state} className={state}><span aria-hidden="true" />{humanize(state)}</li>)}
        </ul>
      </div>
    </div>
  );
}
