export const CATEGORIES = ['ACADEMIC', 'EXAM', 'SCHOLARSHIP', 'ADMISSION', 'EVENT', 'ADMINISTRATIVE', 'GENERAL'];
export const AUDIENCES = ['ALL', 'STUDENTS', 'FACULTY', 'STAFF'];
export const VISIBILITIES = ['PUBLIC', 'CAMPUS'];
export const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];
export const POSITIONS = ['PROFESSOR', 'ASSOCIATE_PROFESSOR', 'ASSISTANT_PROFESSOR', 'LECTURER', 'VISITING_PROFESSOR', 'ADJUNCT'];
export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const ROLES = ['ADMIN', 'AUTHOR', 'REVIEWER', 'READER'];
export const EFFECTIVE_STATUSES = ['DRAFT', 'SUBMITTED', 'RETURNED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'WITHDRAWN', 'ARCHIVED'];

const DAY_NAMES = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' };

/** "ASSOCIATE_PROFESSOR" -> "Associate Professor" */
export function humanize(value) {
  if (!value) return '';
  return String(value)
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function dayName(code) {
  return DAY_NAMES[code] || code;
}

export const VISIBILITY_HELP = {
  PUBLIC: 'Public - anyone can see it',
  CAMPUS: 'Campus - only signed-in users can see it',
};

export function formatBytes(size) {
  if (!size && size !== 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
