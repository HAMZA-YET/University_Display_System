import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/** University time zone (D5). All forms show and accept this zone. */
export const UNIVERSITY_TZ = import.meta.env.VITE_UNIVERSITY_TZ || 'Asia/Seoul';
export const TZ_LABEL = 'Korea Standard Time (Asia/Seoul)';

function valid(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-12-10 14:00" in the given zone. */
export function formatDateTime(value, tz = UNIVERSITY_TZ) {
  const d = valid(value);
  return d ? formatInTimeZone(d, tz, 'yyyy-MM-dd HH:mm') : '';
}

/** "Thu, 10 Dec 2026" */
export function formatDate(value, tz = UNIVERSITY_TZ) {
  const d = valid(value);
  return d ? formatInTimeZone(d, tz, 'EEE, d MMM yyyy') : '';
}

export function formatTime(value, tz = UNIVERSITY_TZ) {
  const d = valid(value);
  return d ? formatInTimeZone(d, tz, 'HH:mm') : '';
}

/** UTC date -> value for <input type="datetime-local"> in the university zone. */
export function toLocalInput(value, tz = UNIVERSITY_TZ) {
  const d = valid(value);
  return d ? formatInTimeZone(d, tz, "yyyy-MM-dd'T'HH:mm") : '';
}

/** datetime-local value in the university zone -> ISO 8601 with offset. */
export function fromLocalInput(local, tz = UNIVERSITY_TZ) {
  if (!local) return null;
  const d = fromZonedTime(local, tz);
  if (Number.isNaN(d.getTime())) return null;
  return formatInTimeZone(d, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Year, month (0-based) and day of a date in the university zone. */
export function zonedParts(value, tz = UNIVERSITY_TZ) {
  const d = valid(value);
  if (!d) return null;
  const [y, m, day] = formatInTimeZone(d, tz, 'yyyy-M-d').split('-').map(Number);
  return { year: y, month: m - 1, day };
}

/** Start of a month in the university zone as an ISO string with offset. */
export function monthStartIso(year, month, tz = UNIVERSITY_TZ) {
  const mm = String(month + 1).padStart(2, '0');
  return fromLocalInput(`${year}-${mm}-01T00:00`, tz);
}
