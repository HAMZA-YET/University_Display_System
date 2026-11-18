'use strict';

const crypto = require('crypto');
const { Readable } = require('stream');
const StoredFile = require('./storedFile.model');
const { detect, safeFileName, toMetadata, VERCEL_MAX_BYTES } = require('./attachment.validation');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');

const validFileId = (value) => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const validPath = (value) => typeof value === 'string' && /^uids\/attachments\/[a-f0-9]{48}$/.test(value);

/** Dependency injection is used by tests only; production always uses the SDK. */
function createVercelBlobGateway(sdk = require('@vercel/blob')) {
  async function upload(file, uploader) {
    const fileId = crypto.randomBytes(16).toString('hex');
    const check = detect(file, VERCEL_MAX_BYTES);
    const record = {
      fileId,
      fileName: safeFileName(file.originalname),
      fileType: check.ok ? check.mime : String(file.mimetype || 'application/octet-stream').slice(0, 100),
      size: file.buffer ? file.buffer.length : 0,
      validationStatus: check.ok ? 'VALID' : 'REJECTED',
      rejectionReason: check.ok ? null : check.reason,
      uploader: uploader._id,
      storageProvider: 'vercel-blob',
      storageKey: null,
    };
    if (check.ok) {
      const pathname = `uids/attachments/${crypto.randomBytes(24).toString('hex')}`;
      try {
        await sdk.put(pathname, file.buffer, {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: check.mime,
        });
      } catch (error) {
        logger.warn({ name: error.name }, 'Private attachment upload unavailable');
        throw new AppError(503, 'ATTACHMENT_STORAGE_UNAVAILABLE', 'Attachment storage is unavailable. Please try again later.');
      }
      // Persist only an internal pathname, never a publicly usable URL.
      record.storageKey = pathname;
    }
    try {
      return toMetadata(await StoredFile.create(record));
    } catch (error) {
      // A failed DB write must not leave an uploaded orphan or report success.
      if (record.storageKey) {
        await sdk.del(record.storageKey).catch((cleanupError) => {
          logger.error({ name: cleanupError.name }, 'Failed to remove unattached private blob');
        });
      }
      throw error;
    }
  }

  async function getMetadata(fileId) {
    if (!validFileId(fileId)) return null;
    const doc = await StoredFile.findOne({ fileId }).lean();
    return doc ? toMetadata(doc) : null;
  }

  async function openStream(fileId) {
    if (!validFileId(fileId)) return null;
    const doc = await StoredFile.findOne({ fileId, validationStatus: 'VALID', storageProvider: 'vercel-blob' })
      .select('+storageKey').lean();
    if (!doc || !validPath(doc.storageKey)) return null;
    let result;
    try {
      result = await sdk.get(doc.storageKey, { access: 'private' });
    } catch (error) {
      logger.warn({ name: error.name }, 'Private attachment download unavailable');
      throw new AppError(503, 'ATTACHMENT_STORAGE_UNAVAILABLE', 'Attachment storage is unavailable. Please try again later.');
    }
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return Readable.fromWeb(result.stream);
  }
  return { upload, getMetadata, openStream };
}
module.exports = { createVercelBlobGateway };
