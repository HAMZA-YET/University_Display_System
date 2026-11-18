'use strict';

const path = require('path');
const MAX_BYTES = 10 * 1024 * 1024;
// Leave room for multipart headers below Vercel Functions' 4.5 MB request limit.
const VERCEL_MAX_BYTES = 4 * 1024 * 1024;
const TYPES = {
  pdf: { mime: 'application/pdf', magic: [Buffer.from('%PDF-')] },
  png: { mime: 'image/png', magic: [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])] },
  jpg: { mime: 'image/jpeg', magic: [Buffer.from([0xff, 0xd8, 0xff])] },
  jpeg: { mime: 'image/jpeg', magic: [Buffer.from([0xff, 0xd8, 0xff])] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [Buffer.from([0x50, 0x4b, 0x03, 0x04])] },
};
function maxUploadBytes() {
  return process.env.VERCEL ? VERCEL_MAX_BYTES : MAX_BYTES;
}
function safeFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[^\w.\- ]+/g, '_').trim();
  return base.slice(0, 150) || 'file';
}
function detect(file, maxBytes = maxUploadBytes()) {
  const ext = path.extname(file.originalname || '').slice(1).toLowerCase();
  const type = TYPES[ext];
  if (!type) return { ok: false, reason: 'Only PDF, PNG, JPG and DOCX files are allowed.' };
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) return { ok: false, reason: 'The file is empty or invalid.' };
  if (file.buffer.length > maxBytes) return { ok: false, reason: `The file is larger than ${maxBytes / 1024 / 1024} MB.` };
  const matches = type.magic.some((m) => file.buffer.length >= m.length && file.buffer.subarray(0, m.length).equals(m));
  if (!matches) return { ok: false, reason: 'The file content does not match its extension.' };
  if (ext === 'docx' && !file.buffer.includes(Buffer.from('word/'))) return { ok: false, reason: 'The file is not a valid Word document.' };
  return { ok: true, mime: type.mime };
}
function toMetadata(doc) {
  return {
    fileId: doc.fileId,
    fileName: doc.fileName,
    fileType: doc.fileType,
    size: doc.size,
    validationStatus: doc.validationStatus,
    uploader: doc.uploader,
    rejectionReason: doc.rejectionReason || null,
  };
}
module.exports = { MAX_BYTES, VERCEL_MAX_BYTES, maxUploadBytes, detect, safeFileName, toMetadata };
