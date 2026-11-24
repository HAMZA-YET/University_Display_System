/** Lost-and-found labels. Codes match server/src/modules/lostFound/lostFound.constants.js. */
import { formatInTimeZone } from 'date-fns-tz';
import { UNIVERSITY_TZ } from './time';

export { LF_TYPES, LF_CATEGORIES } from './lostFoundConstants.js';

export const CLAIM_TABS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'];

const LABELS = {
  WALLET_ID_CARD: 'Wallet / ID card',
  BOOKS_STATIONERY: 'Books / stationery',
  JEWELLERY_ACCESSORY: 'Jewellery / accessory',
  WATER_BOTTLE: 'Water bottle',
  // claims
  ALL: 'All',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  // items
  OPEN: 'Listed',
  COLLECTION_APPROVED: 'Claim in progress',
  CLAIM_IN_PROGRESS: 'Claim in progress',
  RETURNED: 'Returned to owner',
  RESOLVED: 'Marked as found',
  // contact
  ADMIN: 'Admin only',
  EVERYONE: 'Everyone',
};

export function lfLabel(code) {
  if (!code) return '';
  if (LABELS[code]) return LABELS[code];
  const s = String(code).toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Simple date and time, e.g. "18 Nov 2026, 21:07". */
export function postedDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : formatInTimeZone(d, UNIVERSITY_TZ, 'd MMM yyyy, HH:mm');
}

const ACTIONS = {
  POSTED: 'Posted',
  EDITED: 'Edited by reporter',
  PHOTO_ADDED: 'Photo added',
  PHOTO_REMOVED: 'Photo removed',
  MARKED_FOUND: 'Marked as found by reporter',
  DELETED: 'Deleted',
  CLAIM_APPROVED: 'Claim approved',
  APPROVAL_RELEASED: 'Approval released',
  COLLECTION_CANCELLED: 'Collection cancelled',
  HANDED_OVER: 'Handed over to owner',
  SUBMITTED: 'Claim submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RELEASED: 'Approval released',
  AUTO_REJECTED: 'Rejected automatically',
  EVIDENCE_REDACTED: 'Evidence removed (retention)',
};

export function historyLabel(action) {
  return ACTIONS[action] || lfLabel(action);
}
