'use strict';

/**
 * ==========================================================================
 * TEMPORARY EXTERNAL INTEGRATION BOUNDARY - replace with Member 1 gateway
 * ==========================================================================
 * Local MVP adapter for attachments. It implements the attachmentGateway
 * interface so it can be swapped without touching the publishing module.
 *
 * - Accepts PDF, PNG, JPG and DOCX only, maximum 10 MB.
 * - Checks both the file extension and the magic bytes.
 * - Stores files outside any public folder (UPLOAD_DIR) under random names.
 * - Sets validationStatus VALID or REJECTED. Rejected files are not stored.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const StoredFile = require('./storedFile.model');
const { loadEnv } = require('../../config/env');

const { MAX_BYTES, detect, safeFileName, toMetadata } = require('./attachment.validation');

function uploadDir() {
  const dir = path.resolve(process.cwd(), loadEnv().UPLOAD_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function upload(file, uploader) {
  const fileId = crypto.randomBytes(16).toString('hex');
  const check = detect(file);
  const record = {
    fileId,
    fileName: safeFileName(file.originalname),
    fileType: check.ok ? check.mime : String(file.mimetype || 'application/octet-stream').slice(0, 100),
    size: file.buffer ? file.buffer.length : 0,
    validationStatus: check.ok ? 'VALID' : 'REJECTED',
    rejectionReason: check.ok ? null : check.reason,
    uploader: uploader._id,
    storageKey: null,
    storageProvider: 'local',
  };
  if (check.ok) {
    const storageKey = crypto.randomBytes(24).toString('hex');
    await fs.promises.writeFile(path.join(uploadDir(), storageKey), file.buffer, { flag: 'wx' });
    record.storageKey = storageKey;
  }
  try {
    const doc = await StoredFile.create(record);
    return toMetadata(doc);
  } catch (error) {
    if (record.storageKey) await fs.promises.unlink(path.join(uploadDir(), record.storageKey)).catch(() => {});
    throw error;
  }
}

async function getMetadata(fileId) {
  if (typeof fileId !== 'string' || !/^[a-f0-9]{32}$/.test(fileId)) return null;
  const doc = await StoredFile.findOne({ fileId }).lean();
  return doc ? toMetadata(doc) : null;
}

async function openStream(fileId) {
  if (typeof fileId !== 'string' || !/^[a-f0-9]{32}$/.test(fileId)) return null;
  const doc = await StoredFile.findOne({ fileId, validationStatus: 'VALID', storageProvider: 'local' }).select('+storageKey').lean();
  if (!doc || !doc.storageKey || !/^[a-f0-9]{48}$/.test(doc.storageKey)) return null;
  const full = path.join(uploadDir(), doc.storageKey);
  try {
    await fs.promises.access(full, fs.constants.R_OK);
  } catch (err) {
    return null;
  }
  return fs.createReadStream(full);
}

module.exports = { upload, getMetadata, openStream, MAX_BYTES };
