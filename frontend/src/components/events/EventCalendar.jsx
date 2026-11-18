import { Link } from 'react-router-dom';
import { zonedParts, formatTime, UNIVERSITY_TZ } from '../../lib/time';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
    <div className="table-wrap calendar-scroll" role="region" aria-label="Monthly event calendar; scroll horizontally to see all days" tabIndex={0}>
      <table className="calendar">
        <caption className="visually-hidden">Events in {monthLabel}</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th key={w} scope="col">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                if (!day) return <td key={di} className="other-month" aria-hidden="true" />;
                const items = byDay.get(key(year, month, day)) || [];
                const isToday = today && today.year === year && today.month === month && today.day === day;
                return (
                  <td key={di} className={isToday ? 'today' : ''}>
                    <div className="day-num">
                      {day}
                      {isToday && <span className="visually-hidden"> (today)</span>}
                    </div>
                    {items.map((e) => (
                      <Link key={e.id} to={`/notices/${e.noticeId}`} className={`cal-event ${e.state}`} title={`${e.title} - ${e.state}`}>
                        <span className={e.state === 'CANCELLED' ? 'strike' : ''}>{formatTime(e.start)}</span> {e.title}
                        <span className="visually-hidden"> ({e.state})</span>
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
  );
}
