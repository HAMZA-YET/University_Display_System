'use strict';
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');
const path = require('path');
const crypto = require('crypto');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const audit = require('../audit/audit.service');
const { root, capabilities, createStorage, MAX_FILES_PER_CLAIM } = require('./evidenceStorage');
const storage = createStorage();
const schema = new mongoose.Schema({
  fileId: { type: String, unique: true, required: true },
  caseId: { type: String, required: true },
  uploader: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: String, mime: String, size: Number, sha256: String,
  storageProvider: { type: String, enum: ['local', 'vercel-blob'], default: 'local' },
  storageKey: { type: String, default: null },
  state: { type: String, enum: ['QUARANTINED', 'PRIVATE', 'DELETED'], default: 'QUARANTINED' },
}, { timestamps: true });
const Evidence = mongoose.models.PrivateEvidence || mongoose.model('PrivateEvidence', schema);
const quotaSchema = new mongoose.Schema({ _id: String, version: { type: Number, default: 0 } }, { versionKey: false });
const EvidenceQuota = mongoose.models.PrivateEvidenceQuota || mongoose.model('PrivateEvidenceQuota', quotaSchema);
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const bytes = record => storage.bytes(record);
const metadata = record => ({ fileId: record.fileId, name: record.name, mime: record.mime, size: record.size, createdAt: record.createdAt });
async function reserveEvidence(values) {
  if (!(await require('../../utils/transaction').supportsTransactions())) {
    throw new AppError(503, 'SECURITY_TRANSACTIONS_REQUIRED', 'Private proof storage requires transactional database support.');
  }
  // Create a unique per-case serialization document before starting the
  // transaction. Concurrent first uploads may both attempt this safe upsert.
  try { await EvidenceQuota.updateOne({ _id: values.caseId }, { $setOnInsert: { version: 0 } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  let record;
  await mongoose.connection.transaction(async session => {
    await EvidenceQuota.updateOne({ _id: values.caseId }, { $inc: { version: 1 } }, { session });
    // Include retained deleted/quarantined metadata, including legacy rows.
    // A failed provider call retains its reservation; deletion never frees it.
    const count = await Evidence.countDocuments({ caseId: values.caseId }).session(session);
    if (count >= MAX_FILES_PER_CLAIM) throw new AppError(409, 'EVIDENCE_LIMIT_REACHED',
      `This claim has reached its limit of ${MAX_FILES_PER_CLAIM} proof files. Removing a file does not free a slot. Contact an administrator for help.`);
    [record] = await Evidence.create([values], { session });
  });
  return record;
}
function createEvidenceRouter(authorizeEvidence) {
  const router = express.Router();
  router.use(require('./origin'), authenticate);
  const permit = async (req, action, attachment) => {
    let allowed = false;
    try { allowed = typeof authorizeEvidence === 'function' && await authorizeEvidence({ actor: req.user, caseId: req.params.caseId, action, attachment }); }
    catch { allowed = false; }
    if (allowed !== true) {
      await audit.recordSafe(audit.contextFromRequest(req), { action: 'EVIDENCE_ACCESS_DENIED', entityType: 'ROUTE' });
      throw AppError.forbidden('Case authorization is unavailable or access was denied.');
    }
  };
  router.get('/capabilities', asyncHandler(async (req, res) => {
    const config = capabilities();
    config.available = config.available && await require('../../utils/transaction').supportsTransactions();
    res.json({ data: config });
  }));
  router.use('/:caseId', (req, res, next) => {
    if (!/^[a-f0-9]{24}$/.test(req.params.caseId)) return next(AppError.badRequest('Invalid case id.'));
    next();
  });
  const { maxBytes } = capabilities();
  const uploadLimit = rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.')) });
  let activeUploads = 0;
  function capacity(req, res, next) {
    if (activeUploads >= 2) return next(new AppError(429, 'UPLOAD_BUSY', 'Uploads are busy. Try again shortly.'));
    activeUploads++;
    let released = false;
    const release = () => { if (!released) { released = true; activeUploads--; } };
    res.once('finish', release); res.once('close', release); next();
  }
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 1 } });
  router.post('/:caseId', asyncHandler(async (req, res, next) => {
    await permit(req, 'upload', null);
    if (!capabilities().available) throw new AppError(503, 'PRIVATE_STORAGE_UNAVAILABLE', 'Private proof storage is unavailable. Your written claim can still be reviewed.');
    next();
  }), uploadLimit, capacity, (req, res, next) => upload.single('file')(req, res, error => next(error ? AppError.badRequest('Upload must contain one image within the configured size limit.') : undefined)), asyncHandler(async (req, res) => {
    if (!req.file) throw AppError.badRequest('Choose one JPEG or PNG image.');
    const ext = path.extname(req.file.originalname).toLowerCase();
    const image = sharp(req.file.buffer, { limitInputPixels: 16000000, failOn: 'warning' });
    let metadata;
    try { metadata = await image.metadata(); await image.raw().toBuffer(); }
    catch { throw AppError.badRequest('Malformed or oversized image content.'); }
    const mime = metadata.format === 'png' ? 'image/png' : metadata.format === 'jpeg' ? 'image/jpeg' : null;
    if (!mime || metadata.pages > 1 || req.file.mimetype !== mime || !(mime === 'image/png' ? ext === '.png' : ['.jpg', '.jpeg'].includes(ext))) {
      throw AppError.badRequest('File extension, type and image content must agree.');
    }
    const record = await reserveEvidence({ fileId: crypto.randomBytes(24).toString('hex'), caseId: req.params.caseId,
      uploader: req.user._id, name: path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 100),
      mime, size: req.file.buffer.length, sha256: hash(req.file.buffer) });
    await storage.write(record, req.file.buffer);
    // Recheck current identity and domain permission after processing; a failed recheck leaves quarantine.
    const current = await authenticate.resolveUser(req);
    if (!current) throw AppError.unauthenticated();
    req.user = current;
    await permit(req, 'upload', record.toObject());
    record.state = 'PRIVATE'; await record.save();
    await audit.recordSafe(audit.contextFromRequest(req), { action: 'EVIDENCE_UPLOADED', entityType: 'ROUTE', entityId: record.fileId });
    res.status(201).json({ data: { fileId: record.fileId, name: record.name, state: record.state } });
  }));
  router.get('/:caseId', asyncHandler(async (req, res) => {
    await permit(req, 'download', null);
    const files = await Evidence.find({ caseId: req.params.caseId, state: 'PRIVATE' }).sort({ createdAt: 1 }).limit(MAX_FILES_PER_CLAIM).lean();
    res.set('Cache-Control', 'private, no-store').json({ data: files.map(metadata) });
  }));
  async function load(req) {
    if (!/^[a-f0-9]{48}$/.test(req.params.fileId)) throw AppError.notFound();
    const record = await Evidence.findOne({ fileId: req.params.fileId, caseId: req.params.caseId, state: 'PRIVATE' }).lean();
    if (!record) throw AppError.notFound();
    return record;
  }
  router.get('/:caseId/:fileId', asyncHandler(async (req, res) => {
    const record = await load(req); await permit(req, 'download', record);
    const data = await bytes(record);
    await audit.recordSafe(audit.contextFromRequest(req), { action: 'EVIDENCE_DOWNLOADED', entityType: 'ROUTE', entityId: record.fileId });
    res.set({ 'Content-Type': record.mime, 'Content-Disposition': 'attachment', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(data);
  }));
  router.delete('/:caseId/:fileId', asyncHandler(async (req, res) => {
    const record = await load(req); await permit(req, 'delete', record);
    await Evidence.updateOne({ _id: record._id }, { state: 'DELETED' });
    // Logical deletion immediately denies reads. Physical retention awaits C's policy.
    await audit.recordSafe(audit.contextFromRequest(req), { action: 'EVIDENCE_DELETED', entityType: 'ROUTE', entityId: record.fileId });
    res.json({ data: { deleted: true } });
  }));
  return router;
}
module.exports = { createEvidenceRouter, Evidence, root, bytes };
