'use strict';
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const audit = require('../audit/audit.service');
const root = path.resolve(process.env.EVIDENCE_STORAGE_ROOT || path.join(__dirname, '../../../.local/evidence'));
const repository = path.resolve(__dirname, '../../../..');
const schema = new mongoose.Schema({
  fileId: { type: String, unique: true, required: true },
  caseId: { type: String, required: true },
  uploader: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: String, mime: String, size: Number, sha256: String,
  state: { type: String, enum: ['QUARANTINED', 'PRIVATE', 'DELETED'], default: 'QUARANTINED' },
}, { timestamps: true });
const Evidence = mongoose.models.PrivateEvidence || mongoose.model('PrivateEvidence', schema);
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
async function directory() {
  for (const publicRoot of ['frontend/public', 'frontend/dist', 'backend/public']) {
    const exposed = path.join(repository, publicRoot);
    if (root === exposed || root.startsWith(exposed + path.sep)) throw new Error('Evidence storage must be private');
  }
  if (process.env.VERCEL) throw new AppError(503, 'PRIVATE_STORAGE_UNAVAILABLE', 'Persistent private evidence storage is required.');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  if (await fs.realpath(root) !== root || (await fs.lstat(root)).isSymbolicLink()) throw new Error('Unsafe private storage');
  return root;
}
async function bytes(record) {
  if (!/^[a-f0-9]{48}$/.test(record.fileId)) throw AppError.notFound();
  const file = path.join(await directory(), record.fileId);
  const stat = await fs.lstat(file).catch(() => null);
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.size !== record.size) throw AppError.notFound();
  const data = await fs.readFile(file);
  if (hash(data) !== record.sha256) throw AppError.notFound();
  return data;
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
  router.use('/:caseId', (req, res, next) => {
    if (!/^[a-f0-9]{24}$/.test(req.params.caseId)) return next(AppError.badRequest('Invalid case id.'));
    next();
  });
  const maxBytes = Number(process.env.EVIDENCE_MAX_BYTES || 5 * 1024 * 1024);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 5 * 1024 * 1024) throw new Error('Invalid evidence size limit');
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
  router.post('/:caseId', asyncHandler(async (req, res, next) => { await permit(req, 'upload', null); next(); }), uploadLimit, capacity, (req, res, next) => upload.single('file')(req, res, error => next(error ? AppError.badRequest('Upload must contain one image within the configured size limit.') : undefined)), asyncHandler(async (req, res) => {
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
    const record = await Evidence.create({ fileId: crypto.randomBytes(24).toString('hex'), caseId: req.params.caseId,
      uploader: req.user._id, name: path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 100),
      mime, size: req.file.buffer.length, sha256: hash(req.file.buffer) });
    await fs.writeFile(path.join(await directory(), record.fileId), req.file.buffer, { flag: 'wx', mode: 0o600 });
    // Recheck current identity and domain permission after processing; a failed recheck leaves quarantine.
    const current = await authenticate.resolveUser(req);
    if (!current) throw AppError.unauthenticated();
    req.user = current;
    await permit(req, 'upload', record.toObject());
    record.state = 'PRIVATE'; await record.save();
    await audit.recordSafe(audit.contextFromRequest(req), { action: 'EVIDENCE_UPLOADED', entityType: 'ROUTE', entityId: record.fileId });
    res.status(201).json({ data: { fileId: record.fileId, name: record.name, state: record.state } });
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
