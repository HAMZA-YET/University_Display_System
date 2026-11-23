'use strict';

const path = require('path');
const sharp = require('sharp');
const Item = require('./item.model');
const C = require('./lostFound.constants');
const audit = require('../audit/audit.service');
const AppError = require('../../utils/AppError');
const clock = require('../../utils/clock');
const { getGateway } = require('../attachments/attachmentGateway');
const { loadEnv } = require('../../config/env');

/**
 * Item photos (A05 integration point).
 *
 * Files are stored through the shared attachment gateway (Member 1 replaces
 * the local adapter). This module decides WHO may see a photo:
 *   - public:          only while the item itself is listed
 *   - reporter/admin:  through the member route
 * Knowing a photo ID is never enough on its own.
 */

const isAdmin = (user) => Boolean(user && C.VERIFIER_ROLES.includes(user.role)
  && (!loadEnv().REQUIRE_PRIVILEGED_MFA || user.mfaEnabled === true));
const sameId = (a, b) => Boolean(a && b && String(a._id || a) === String(b._id || b));

function photoError(message) {
  return AppError.badRequest(message, [{ location: 'body', field: 'photo', message }]);
}

async function addPhoto(ctx, itemId, file) {
  if (!file) throw photoError('Choose a photo to upload.');
  const ext = path
    .extname(file.originalname || '')
    .slice(1)
    .toLowerCase();
  if (!C.PHOTO_EXTENSIONS.includes(ext)) throw photoError('Only JPG and PNG photos are allowed.');
  const maxBytes = C.maxPhotoBytes();
  if (!Buffer.isBuffer(file.buffer) || !file.buffer.length) throw photoError('The photo is empty or invalid.');
  if (file.buffer.length > maxBytes || file.size > maxBytes) throw photoError(`The photo is larger than ${maxBytes / 1024 / 1024} MB.`);

  const item = await Item.findOne({ _id: itemId, deletedAt: null }).lean();
  if (!item || !sameId(item.reporter, ctx.user._id)) throw AppError.notFound();
  if (!C.PUBLIC_STATUSES.includes(item.status)) throw AppError.invalidTransition('Photos can only be added to listed reports.');
  if ((item.photoIds || []).length >= C.MAX_PHOTOS) throw photoError(`A report can have at most ${C.MAX_PHOTOS} photos.`);

  // Decode the entire image before public storage; magic bytes alone do not
  // establish that an upload contains a complete, permitted image.
  const image = sharp(file.buffer, { limitInputPixels: 16000000, failOn: 'warning' });
  let metadata;
  try {
    metadata = await image.metadata();
    await image.raw().toBuffer();
  } catch {
    throw photoError('Malformed or oversized image content.');
  }
  const mime = metadata.format === 'png' ? 'image/png' : metadata.format === 'jpeg' ? 'image/jpeg' : null;
  if (!mime || (metadata.pages || 1) !== 1 || file.mimetype !== mime
    || !(mime === 'image/png' ? ext === 'png' : ['jpg', 'jpeg'].includes(ext))) {
    throw photoError('File extension, type and image content must agree.');
  }

  const meta = await getGateway().upload(file, ctx.user);
  if (meta.validationStatus !== 'VALID' || !/^image\/(png|jpeg)$/.test(meta.fileType)) {
    throw photoError(meta.rejectionReason || 'The file is not a valid JPG or PNG image.');
  }

  const updated = await Item.findOneAndUpdate(
    // Atomic limit check: the array must still have fewer than MAX_PHOTOS entries.
    { _id: itemId, reporter: ctx.user._id, deletedAt: null, status: { $in: C.PUBLIC_STATUSES }, [`photoIds.${C.MAX_PHOTOS - 1}`]: { $exists: false } },
    {
      $push: { photoIds: meta.fileId, history: { at: clock.now(), actor: ctx.user._id, actorRole: ctx.user.role, action: 'PHOTO_ADDED' } },
      $inc: { version: 1 },
    },
    { new: true }
  ).lean();
  if (!updated) throw AppError.invalidTransition('The report changed or already has the maximum number of photos. Reload and try again.');
  await audit.record(ctx, { action: 'LF_PHOTO_ADDED', entityType: 'LF_ITEM', entityId: itemId });
  return updated;
}

async function removePhoto(ctx, itemId, photoId) {
  const item = await Item.findOne({ _id: itemId, deletedAt: null }).lean();
  if (!item || !sameId(item.reporter, ctx.user._id)) throw AppError.notFound();
  if (!(item.photoIds || []).includes(photoId)) throw AppError.notFound('Photo not found.');
  const updated = await Item.findOneAndUpdate(
    { _id: itemId, reporter: ctx.user._id, deletedAt: null },
    {
      $pull: { photoIds: photoId },
      $push: { history: { at: clock.now(), actor: ctx.user._id, actorRole: ctx.user.role, action: 'PHOTO_REMOVED' } },
      $inc: { version: 1 },
    },
    { new: true }
  ).lean();
  await audit.record(ctx, { action: 'LF_PHOTO_REMOVED', entityType: 'LF_ITEM', entityId: itemId });
  return updated;
}

/** Resolves a photo for the public route: the item must itself be public. */
async function publicPhotoMeta(itemId, photoId) {
  const item = await Item.findOne({ _id: itemId, deletedAt: null, status: { $in: C.PUBLIC_STATUSES }, photoIds: photoId }).lean();
  if (!item) throw AppError.notFound();
  return loadMeta(photoId);
}

/** Resolves a photo for the reporter or the admin. Everyone else gets 404. */
async function privatePhotoMeta(user, itemId, photoId) {
  const item = await Item.findOne({ _id: itemId, photoIds: photoId }).lean();
  if (!item || !(sameId(item.reporter, user._id) || isAdmin(user))) throw AppError.notFound();
  return loadMeta(photoId);
}

async function loadMeta(photoId) {
  const meta = await getGateway().getMetadata(photoId);
  if (!meta || meta.validationStatus !== 'VALID') throw AppError.notFound();
  return meta;
}

async function streamPhoto(res, meta) {
  const stream = await getGateway().openStream(meta.fileId);
  if (!stream) throw AppError.notFound();
  res.setHeader('Content-Type', meta.fileType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
}

module.exports = { addPhoto, removePhoto, publicPhotoMeta, privatePhotoMeta, streamPhoto };
