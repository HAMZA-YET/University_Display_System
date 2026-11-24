'use strict';
const mongoose = require('mongoose');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { ActionToken } = require('./models');
const { Evidence, root: evidenceRoot } = require('./evidence');
const clock = require('../../utils/clock');
const { loadEnv } = require('../../config/env');
const locks = () => mongoose.connection.db.collection('security_maintenance');
const jobs = () => mongoose.connection.db.collection('security_jobs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function guard(req, res, next) {
  try {
    if (await locks().findOne({ _id: 'maintenance' })) throw new AppError(503, 'MAINTENANCE', 'Maintenance or restore verification is in progress.');
    next();
  } catch (error) { next(error); }
}
async function exclusive(action, work) {
  try { await locks().insertOne({ _id: 'maintenance', action, startedAt: new Date() }); }
  catch { throw new Error('Maintenance is already locked'); }
  const job = await jobs().insertOne({ action, state: 'RUNNING', startedAt: new Date() });
  try {
    const result = await work();
    await jobs().updateOne({ _id: job.insertedId }, { $set: { state: 'SUCCEEDED', finishedAt: new Date() } });
    await require('../audit/audit.service').recordSafe({ user: null }, { action: 'MAINTENANCE_SUCCEEDED', entityType: 'ROUTE', entityId: action });
    return result;
  } catch (error) {
    await jobs().updateOne({ _id: job.insertedId }, { $set: { state: 'FAILED', finishedAt: new Date() } });
    await require('../audit/audit.service').recordSafe({ user: null }, { action: 'MAINTENANCE_FAILED', entityType: 'ROUTE', entityId: action });
    throw error;
  } finally { await locks().deleteOne({ _id: 'maintenance' }); }
}
async function cleanup({ apply = false } = {}) {
  const hours = Number(process.env.SECURITY_RETENTION_HOURS || 168);
  if (!Number.isInteger(hours) || hours < 1 || hours > 8760) throw new Error('Invalid retention hours');
  const expired = { expiresAt: { $lte: clock.now() } };
  const stale = { state: 'QUARANTINED', createdAt: { $lt: new Date(clock.now().getTime() - hours * 3600000) } };
  const report = { dryRun: !apply, expiredTokens: await ActionToken.countDocuments(expired), abandonedQuarantine: await Evidence.countDocuments(stale), missingFiles: 0, orphanFiles: 0 };
  const records = await Evidence.find().lean();
  const names = new Set(records.map(row => row.fileId));
  for (const record of records.filter(row => row.state === 'PRIVATE')) {
    try { await require('./evidence').bytes(record); } catch { report.missingFiles++; }
  }
  for (const name of await fs.readdir(evidenceRoot).catch(() => [])) {
    if (/^[a-f0-9]{48}$/.test(name) && !names.has(name)) report.orphanFiles++;
  }
  if (apply) {
    await ActionToken.deleteMany(expired);
    await Evidence.updateMany(stale, { $set: { state: 'DELETED' } });
  }
  // Never delete domain files without C's retention decision. Missing files already deny reads.
  return report;
}
function encryptionKey() {
  if (!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY || '')) throw new Error('Backup key is not configured');
  return Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'hex');
}
async function readPrivate(directory, name) {
  const file = path.join(directory, name);
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('Unsafe backup file');
  if (await fs.realpath(directory) !== path.resolve(directory)) throw new Error('Unsafe backup directory');
  return fs.readFile(file);
}
const omitted = new Set(['actiontokens', 'revokedtokens', 'accountdeliverythrottles', 'security_maintenance', 'security_jobs']);
async function backup(destination) {
  const key = encryptionKey();
  const bundle = { version: 1, collections: [], files: [] };
  let bytes = 0;
  for (const { name } of await mongoose.connection.db.listCollections().toArray()) {
    if (omitted.has(name) || name.startsWith('system.')) continue;
    const collection = mongoose.connection.db.collection(name);
    const docs = await collection.find().toArray();
    const encoded = mongoose.mongo.BSON.serialize({ docs });
    bytes += encoded.length;
    if (bytes > 64 * 1024 * 1024) throw new Error('Local backup size limit exceeded');
    bundle.collections.push({ name, data: encoded.toString('base64'), indexes: await collection.indexes() });
  }
  const records = await Evidence.find({ state: 'PRIVATE' }).lean();
  for (const record of records) {
    // Do not create an archive whose metadata would point to an old cloud store
    // after local restore. A coordinated cloud export/restore is still required.
    if (record.storageProvider === 'vercel-blob') throw new Error('Remote evidence backup requires provider-coordinated export');
    const data = await require('./evidence').bytes(record);
    bundle.files.push({ area: 'evidence', name: record.fileId, hash: hash(data), data: data.toString('base64') });
    bytes += data.length;
  }
  const StoredFile = require('../attachments/storedFile.model');
  for (const record of await StoredFile.find({ validationStatus: 'VALID' }).select('+storageKey +storageProvider').lean()) {
    if (record.storageProvider !== 'local') throw new Error('Remote attachment backup requires provider integration');
    if (!/^[a-f0-9]{48}$/.test(record.storageKey || '')) throw new Error('Unsafe stored file key');
    const data = await readPrivate(path.resolve(loadEnv().UPLOAD_DIR), record.storageKey);
    bundle.files.push({ area: 'notices', name: record.storageKey, hash: hash(data), data: data.toString('base64') });
    bytes += data.length;
  }
  if (bytes > 64 * 1024 * 1024) throw new Error('Local backup size limit exceeded');
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(bundle)), cipher.final()]);
  await fs.writeFile(destination, Buffer.concat([Buffer.from('UIDS1'), iv, cipher.getAuthTag(), encrypted]), { flag: 'wx', mode: 0o600 });
  return { collections: bundle.collections.length, files: bundle.files.length, restoreVerified: false };
}
async function restore(source, targetUri, targetFiles) {
  const stat = await fs.stat(source);
  if (stat.size > 100 * 1024 * 1024) throw new Error('Backup too large');
  const data = await fs.readFile(source);
  if (data.subarray(0, 5).toString() !== 'UIDS1') throw new Error('Invalid backup');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(5, 17));
  decipher.setAuthTag(data.subarray(17, 33));
  const bundle = JSON.parse(Buffer.concat([decipher.update(data.subarray(33)), decipher.final()]).toString());
  if (bundle.version !== 1 || !Array.isArray(bundle.collections) || !Array.isArray(bundle.files)) throw new Error('Invalid backup');
  const target = await mongoose.createConnection(targetUri).asPromise();
  let touched = false;
  try {
    // Conservative: require a distinct database name even when servers differ.
    if (target.name === mongoose.connection.name || (await target.db.listCollections().toArray()).length) throw new Error('Target database must be new and empty');
    targetFiles = path.resolve(targetFiles);
    for (const existing of [evidenceRoot, path.resolve(loadEnv().UPLOAD_DIR)]) {
      if (targetFiles === existing || targetFiles.startsWith(existing + path.sep) || existing.startsWith(targetFiles + path.sep)) throw new Error('Restore files must be separate from source files');
    }
    if ((await fs.readdir(targetFiles).catch(error => { if (error.code === 'ENOENT') return []; throw error; })).length) throw new Error('Target file directory must be empty');
    await fs.mkdir(targetFiles, { recursive: true, mode: 0o700 });
    if (await fs.realpath(targetFiles) !== targetFiles) throw new Error('Unsafe restore directory');
    for (const entry of bundle.files) {
      if (!['notices', 'evidence'].includes(entry.area) || !/^[a-f0-9]{48}$/.test(entry.name) || hash(Buffer.from(entry.data, 'base64')) !== entry.hash) throw new Error('Invalid file manifest');
    }
    await target.db.collection('security_maintenance').insertOne({ _id: 'maintenance', action: 'RESTORE_REVIEW_REQUIRED', verified: false });
    touched = true;
    for (const entry of bundle.collections) {
      if (!/^[a-zA-Z0-9_-]+$/.test(entry.name) || omitted.has(entry.name)) throw new Error('Invalid collection manifest');
      const { docs } = mongoose.mongo.BSON.deserialize(Buffer.from(entry.data, 'base64'));
      if (entry.name === 'users') for (const user of docs) user.tokenVersion = (user.tokenVersion || 0) + 1;
      if (entry.name === 'privateevidences') for (const evidence of docs) if (evidence.state === 'QUARANTINED') evidence.state = 'DELETED';
      await target.db.createCollection(entry.name);
      const collection = target.db.collection(entry.name);
      if (docs.length) await collection.insertMany(docs);
      for (const index of entry.indexes) {
        if (index.name === '_id_') continue;
        const { v, ns, key: indexKey, ...options } = index;
        await collection.createIndex(indexKey, options);
      }
      const actual = await collection.find().toArray();
      const serialize = value => mongoose.mongo.BSON.serialize({ value }).toString('hex');
      if (actual.length !== docs.length || actual.some((doc, i) => serialize(doc) !== serialize(docs[i]))) throw new Error('Restored document verification failed');
    }
    for (const entry of bundle.files) {
      const folder = path.join(targetFiles, entry.area); await fs.mkdir(folder, { recursive: true, mode: 0o700 });
      const file = path.join(folder, entry.name); await fs.writeFile(file, Buffer.from(entry.data, 'base64'), { flag: 'wx', mode: 0o600 });
      if (hash(await fs.readFile(file)) !== entry.hash) throw new Error('Restored file verification failed');
    }
    await target.db.collection('security_maintenance').updateOne({ _id: 'maintenance' }, { $set: { verified: true } });
    return { restoreVerified: true, reviewRequired: true, collections: bundle.collections.length, files: bundle.files.length };
  } catch (error) {
    // An incomplete target remains locked; never erase source or partially restored data.
    if (touched) await target.db.collection('security_maintenance').updateOne({ _id: 'maintenance' }, { $set: { failed: true } });
    throw error;
  } finally { await target.close(); }
}
const router = express.Router();
router.use(authenticate, authorize('ADMIN'));
router.get('/status', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: { databaseReady: mongoose.connection.readyState === 1,
    mfaConfigured: /^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || ''),
    localDeliveryEnabled: process.env.ACCOUNT_DELIVERY === 'local' && process.env.NODE_ENV !== 'production',
    accountMessagesConfigured: require('./delivery').status().available,
    privateEvidenceConfigured: require('./evidenceStorage').capabilities().available,
    cloudBackupSupported: false,
    jobs: await jobs().find({}, { projection: { _id: 0, action: 1, state: 1, startedAt: 1, finishedAt: 1 } }).sort({ startedAt: -1 }).limit(10).toArray() } });
}));
module.exports = { guard, exclusive, cleanup, backup, restore, router };
