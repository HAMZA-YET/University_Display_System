'use strict';

/**
 * Attachment gateway interface (Section 15).
 *
 * In the full project, attachments are owned by Member 1 (A). This module
 * defines the contract that the publishing module depends on. Any adapter
 * must implement:
 *
 *   upload(file, uploader)  -> Promise<{ fileId, fileName, fileType, size, validationStatus }>
 *       file = { originalname, mimetype, size, buffer }
 *   getMetadata(fileId)     -> Promise<{ fileId, fileName, fileType, size, validationStatus, uploader } | null>
 *   openStream(fileId)      -> Promise<ReadableStream | null>
 *
 * The MVP uses localAttachmentGateway. Replace it by calling setGateway()
 * with Member 1's implementation at start-up.
 */

const { loadEnv } = require('../../config/env');
const AppError = require('../../utils/AppError');
const REQUIRED_METHODS = ['upload', 'getMetadata', 'openStream'];

const unavailableGateway = Object.fromEntries(REQUIRED_METHODS.map((method) => [method, async () => {
  throw new AppError(503, 'ATTACHMENT_STORAGE_UNAVAILABLE',
    'Attachment storage is not configured. An administrator must connect persistent object storage before uploading or downloading files.');
}]));

let activeGateway = null;

function setGateway(gateway) {
  for (const method of REQUIRED_METHODS) {
    if (!gateway || typeof gateway[method] !== 'function') {
      throw new Error(`Attachment gateway must implement ${method}()`);
    }
  }
  activeGateway = gateway;
}

function getGateway() {
  if (!activeGateway) {
    // Serverless filesystems are ephemeral. Never claim an upload was saved there.
    const env = loadEnv();
    if (env.ATTACHMENT_STORAGE === 'vercel-blob') {
      if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) return unavailableGateway;
      // eslint-disable-next-line global-require
      setGateway(require('./vercelBlobGateway').createVercelBlobGateway());
      return activeGateway;
    }
    if (process.env.VERCEL || env.ATTACHMENT_STORAGE === 'disabled') return unavailableGateway;
    // eslint-disable-next-line global-require
    setGateway(require('./localAttachmentGateway'));
  }
  return activeGateway;
}

module.exports = { setGateway, getGateway, REQUIRED_METHODS };
