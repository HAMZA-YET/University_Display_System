'use strict';

/**
 * Lost-and-found constants (Member 3 / C).
 *
 * Team decision (v2): reports are published immediately, with no admin
 * review. Only CLAIMS on FOUND items are verified by the ADMIN.
 *
 *   item.type    LOST | FOUND
 *   item.status  OPEN                listed publicly
 *                COLLECTION_APPROVED listed as "Claim in progress" (found items)
 *                RETURNED            handed over to the claimant (found items)
 *                RESOLVED            reporter marked their lost item as found
 *   item.deletedAt                   set when deleted (hidden, kept for audit)
 *
 *   claim.status PENDING | APPROVED | REJECTED   (shown to students)
 *                WITHDRAWN                       (internal: claimant deleted it)
 *
 * APPROVED is not a completed return: only a recorded handover makes the
 * item RETURNED.
 */

const ITEM_TYPES = ['LOST', 'FOUND'];

const CATEGORIES = [
  'ELECTRONICS',
  'WALLET_ID_CARD',
  'KEYS',
  'BAG',
  'CLOTHING',
  'BOOKS_STATIONERY',
  'JEWELLERY_ACCESSORY',
  'WATER_BOTTLE',
  'UMBRELLA',
  'OTHER',
];

const ITEM_STATUS = ['OPEN', 'COLLECTION_APPROVED', 'RETURNED', 'RESOLVED'];

/** Item statuses that appear in public listings (and deletedAt is null). */
const PUBLIC_STATUSES = ['OPEN', 'COLLECTION_APPROVED'];

const CLAIM_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'];
const VISIBLE_CLAIM_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

/** A member holds at most one live claim per item in these statuses. */
const ACTIVE_CLAIM_STATUSES = ['PENDING', 'APPROVED'];

const CONTACT_VISIBILITY = ['ADMIN', 'EVERYONE'];

/** The admin verifies claims. There is no separate officer role. */
const VERIFIER_ROLES = ['ADMIN'];

/** Spam protection: reports per member per 24 hours (admins are exempt). */
const DAILY_REPORT_LIMIT = 10;

/** Item photos (stored through the shared attachment gateway). */
const MAX_PHOTOS = 3;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png'];
function maxPhotoBytes() {
  const { maxUploadBytes, VERCEL_MAX_BYTES } = require('../attachments/attachment.validation');
  const { loadEnv } = require('../../config/env');
  const storageLimit = loadEnv().ATTACHMENT_STORAGE === 'vercel-blob' ? VERCEL_MAX_BYTES : PHOTO_MAX_BYTES;
  return Math.min(PHOTO_MAX_BYTES, maxUploadBytes(), storageLimit);
}

const CASE_EVENT_TYPES = [
  'LF_ITEM_POSTED',
  'LF_ITEM_DELETED',
  'LF_ITEM_RESOLVED',
  'LF_CLAIM_SUBMITTED',
  'LF_CLAIM_APPROVED',
  'LF_CLAIM_REJECTED',
  'LF_CLAIM_WITHDRAWN',
  'LF_CLAIM_RELEASED',
  'LF_ITEM_HANDED_OVER',
];

module.exports = {
  ITEM_TYPES,
  CATEGORIES,
  ITEM_STATUS,
  PUBLIC_STATUSES,
  CLAIM_STATUS,
  VISIBLE_CLAIM_STATUSES,
  ACTIVE_CLAIM_STATUSES,
  CONTACT_VISIBILITY,
  VERIFIER_ROLES,
  DAILY_REPORT_LIMIT,
  MAX_PHOTOS,
  PHOTO_MAX_BYTES,
  maxPhotoBytes,
  PHOTO_EXTENSIONS,
  CASE_EVENT_TYPES,
};
