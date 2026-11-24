'use strict';

const AppError = require('../../utils/AppError');
const { getGateway } = require('../attachments/attachmentGateway');
const { loadEnv } = require('../../config/env');
const Notice = require('./notice.model');
const PinGuard = require('./pinGuard.model');

/** Population used for management views. */
const MANAGEMENT_POPULATE = [
  { path: 'author', select: 'name email role' },
  { path: 'reviewer', select: 'name email role' },
  { path: 'reviewHistory.reviewer', select: 'name email role' },
  {
    path: 'approvedRevision',
    populate: [
      { path: 'author', select: 'name email' },
      { path: 'reviewedBy', select: 'name email' },
    ],
  },
  {
    path: 'pendingRevision',
    populate: [
      { path: 'author', select: 'name email' },
      { path: 'reviewedBy', select: 'name email' },
    ],
  },
];

/**
 * Resolves attachment references sent by the client. Only fileIds are
 * accepted; metadata always comes from the gateway, never the request body.
 * `allowedExisting` lists attachments already in the approved snapshot so a
 * correction can keep files uploaded by someone else.
 */
async function resolveAttachments(inputs, user, allowedExisting = []) {
  if (!inputs) return undefined;
  const seen = new Set();
  const result = [];
  const existingById = new Map(allowedExisting.map((a) => [a.fileId, a]));
  for (const [index, input] of inputs.entries()) {
    if (seen.has(input.fileId)) continue;
    seen.add(input.fileId);
    const meta = await getGateway().getMetadata(input.fileId);
    const field = `attachments.${index}.fileId`;
    if (!meta) {
      throw AppError.badRequest('An attachment was not found.', [{ location: 'body', field, message: 'Unknown file' }]);
    }
    const ownUpload = String(meta.uploader) === String(user._id);
    if (!ownUpload && user.role !== 'ADMIN' && !existingById.has(meta.fileId)) {
      throw AppError.badRequest('You can only attach files you uploaded.', [
        { location: 'body', field, message: 'File was uploaded by another user' },
      ]);
    }
    result.push({
      fileId: meta.fileId,
      fileName: meta.fileName,
      fileType: meta.fileType,
      size: meta.size,
      validationStatus: meta.validationStatus,
    });
  }
  return result;
}

function assertWindow(start, end, { startField = 'requestedPublicationStart', endField = 'requestedPublicationEnd' } = {}) {
  if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
    throw AppError.badRequest('The end of the publication window must be after the start.', [
      { location: 'body', field: endField, message: 'End must be after start' },
    ]);
  }
  return startField;
}

function snapshotFrom(source) {
  return {
    title: source.title,
    summary: source.summary,
    body: source.body,
    category: source.category,
    department: source.department,
    audience: source.audience,
    visibility: source.visibility,
    publishingOffice: source.publishingOffice,
    contactEmail: source.contactEmail || null,
    actionDeadline: source.actionDeadline || null,
    attachments: (source.attachments || []).map((a) => ({
      fileId: a.fileId,
      fileName: a.fileName,
      fileType: a.fileType,
      size: a.size,
      validationStatus: a.validationStatus,
    })),
  };
}

function publicSearchFrom(snapshot) {
  return {
    title: snapshot.title,
    summary: snapshot.summary,
    body: snapshot.body,
    category: snapshot.category,
    department: snapshot.department,
    audience: snapshot.audience,
    visibility: snapshot.visibility,
  };
}

/**
 * Pinned limit (Section 12): at most MAX_PINNED_NOTICES pinned notices that
 * are approved and not expired (published now or scheduled) at once.
 */
async function preparePinCapacity() {
  if (!(await require('../../utils/transaction').supportsTransactions())) {
    throw new AppError(503, 'PIN_TRANSACTIONS_REQUIRED', 'Pinning notices requires a MongoDB replica set.');
  }
  // Initialize outside the transaction so concurrent first use cannot race on
  // inserting the singleton inside a transaction that will later be retried.
  try {
    await PinGuard.updateOne({ _id: 'global' }, { $setOnInsert: { revision: 0 } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
}

async function assertPinCapacity(now, excludeId, session) {
  if (!session) throw new AppError(503, 'PIN_TRANSACTIONS_REQUIRED', 'Pinning notices requires a MongoDB replica set.');
  const guard = await PinGuard.updateOne({ _id: 'global' }, { $inc: { revision: 1 } }, { session });
  if (guard.matchedCount !== 1) throw new AppError(503, 'PIN_GUARD_UNAVAILABLE', 'Notice pin capacity is unavailable. Try again.');
  const max = loadEnv().MAX_PINNED_NOTICES;
  const filter = {
    status: 'APPROVED',
    pinned: true,
    $or: [{ publicationEnd: null }, { publicationEnd: { $gt: now } }],
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const count = await Notice.countDocuments(filter).session(session || null);
  if (count >= max) {
    throw new AppError(
      409,
      'PIN_LIMIT_REACHED',
      `At most ${max} notices can be pinned at once. Unpin another notice first.`,
      [],
      { maxPinned: max, currentPinned: count }
    );
  }
}

function sessionOpts(session) {
  return session ? { session } : {};
}

module.exports = {
  MANAGEMENT_POPULATE,
  resolveAttachments,
  assertWindow,
  snapshotFrom,
  publicSearchFrom,
  assertPinCapacity,
  preparePinCapacity,
  sessionOpts,
};
