'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('../../config/env');
const AppError = require('../../utils/AppError');

const root = path.resolve(process.env.EVIDENCE_STORAGE_ROOT || path.join(__dirname, '../../../.local/evidence'));
const repository = path.resolve(__dirname, '../../../..');
const MAX_FILES_PER_CLAIM = 10;
const validId = value => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const unavailable = () => new AppError(503, 'PRIVATE_STORAGE_UNAVAILABLE', 'Private proof storage is unavailable. Your written claim can still be reviewed.');

function capabilities() {
  const env = loadEnv();
  const configuredLimit = Number(process.env.EVIDENCE_MAX_BYTES || 5 * 1024 * 1024);
  if (!Number.isSafeInteger(configuredLimit) || configuredLimit < 1 || configuredLimit > 5 * 1024 * 1024) throw new Error('Invalid evidence size limit');
  const provider = env.ATTACHMENT_STORAGE === 'vercel-blob' ? 'vercel-blob' : 'local';
  const available = provider === 'vercel-blob'
    ? Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN)
    : !process.env.VERCEL && env.ATTACHMENT_STORAGE !== 'disabled';
  // Multipart headers also count against the serverless request-body limit.
  return { available, provider, maxFilesPerClaim: MAX_FILES_PER_CLAIM,
    maxBytes: Math.min(configuredLimit, process.env.VERCEL ? 4 * 1024 * 1024 : 5 * 1024 * 1024) };
}

async function directory() {
  for (const publicRoot of ['frontend/public', 'frontend/dist', 'backend/public']) {
    const exposed = path.join(repository, publicRoot);
    if (root === exposed || root.startsWith(exposed + path.sep)) throw new Error('Evidence storage must be private');
  }
  if (process.env.VERCEL) throw unavailable();
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  if (await fs.realpath(root) !== root || (await fs.lstat(root)).isSymbolicLink()) throw new Error('Unsafe private storage');
  return root;
}

function createStorage(sdk = require('@vercel/blob')) {
  async function write(record, buffer) {
    const config = capabilities();
    if (!config.available || !validId(record.fileId)) throw unavailable();
    if (config.provider === 'vercel-blob') {
      const storageKey = `uids/evidence/${record.fileId}`;
      // Persist the opaque internal path while quarantined so failed finalization
      // remains visible to reconciliation. Never persist or return a Blob URL.
      record.storageProvider = 'vercel-blob';
      record.storageKey = storageKey;
      await record.save();
      try {
        await sdk.put(storageKey, buffer, { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: record.mime });
      } catch { throw unavailable(); }
    } else {
      record.storageProvider = 'local';
      record.storageKey = null;
      await fs.writeFile(path.join(await directory(), record.fileId), buffer, { flag: 'wx', mode: 0o600 });
    }
  }

  async function bytes(record) {
    if (!validId(record.fileId) || !Number.isSafeInteger(record.size) || record.size < 1 || record.size > 5 * 1024 * 1024) throw AppError.notFound();
    let data;
    if (record.storageProvider === 'vercel-blob') {
      if (record.storageKey !== `uids/evidence/${record.fileId}`) throw AppError.notFound();
      let result;
      try { result = await sdk.get(record.storageKey, { access: 'private', useCache: false }); }
      catch { throw unavailable(); }
      if (!result || result.statusCode !== 200 || !result.stream) throw AppError.notFound();
      const chunks = [];
      let size = 0;
      try {
        for await (const chunk of result.stream) {
          size += chunk.length;
          if (size > record.size) throw AppError.notFound();
          chunks.push(Buffer.from(chunk));
        }
      } catch (error) { if (error instanceof AppError) throw error; throw unavailable(); }
      data = Buffer.concat(chunks);
    } else if (!record.storageProvider || record.storageProvider === 'local') {
      const file = path.join(await directory(), record.fileId);
      const stat = await fs.lstat(file).catch(() => null);
      if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.size !== record.size) throw AppError.notFound();
      data = await fs.readFile(file);
    } else { throw AppError.notFound(); }
    if (data.length !== record.size || hash(data) !== record.sha256) throw AppError.notFound();
    return data;
  }
  return { write, bytes };
}

module.exports = { root, capabilities, createStorage, MAX_FILES_PER_CLAIM };
