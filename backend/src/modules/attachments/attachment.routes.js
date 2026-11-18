'use strict';

const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const optionalAuth = require('../../middleware/optionalAuth');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const clock = require('../../utils/clock');
const { getGateway } = require('./attachmentGateway');
const { maxUploadBytes } = require('./attachment.validation');
const Notice = require('../notices/notice.model');
const Revision = require('../notices/revision.model');
const { buildPublicEligibilityFilter } = require('../notices/visibility');

const fileParams = z.object({ fileId: z.string().regex(/^[a-f0-9]{32}$/, 'Invalid file id') }).strict();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes(), files: 1 } });

function contentDisposition(fileName) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function streamFile(res, meta) {
  const stream = await getGateway().openStream(meta.fileId);
  if (!stream) throw AppError.notFound();
  res.setHeader('Content-Type', meta.fileType);
  res.setHeader('Content-Disposition', contentDisposition(meta.fileName));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  await new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
}

/** Staff routes: /api/attachments */
const managementRouter = express.Router();

managementRouter.post(
  '/',
  authenticate,
  authorize('AUTHOR', 'ADMIN'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw AppError.badRequest('Choose a file to upload.', [{ location: 'body', field: 'file', message: 'File is required' }]);
    }
    const meta = await getGateway().upload(req.file, req.user);
    res.status(201).json({
      data: {
        fileId: meta.fileId,
        fileName: meta.fileName,
        fileType: meta.fileType,
        size: meta.size,
        validationStatus: meta.validationStatus,
        rejectionReason: meta.rejectionReason || null,
      },
    });
  })
);

managementRouter.get(
  '/:fileId',
  authenticate,
  authorize('AUTHOR', 'REVIEWER', 'ADMIN'),
  validate({ params: fileParams }),
  asyncHandler(async (req, res) => {
    const meta = await getGateway().getMetadata(req.params.fileId);
    if (!meta || meta.validationStatus !== 'VALID') throw AppError.notFound();
    const isUploader = String(meta.uploader) === String(req.user._id);
    if (req.user.role === 'AUTHOR' && !isUploader) throw AppError.notFound();
    await streamFile(res, meta);
  })
);

/** Public route: /api/public/attachments */
const publicRouter = express.Router();

publicRouter.get(
  '/:fileId',
  optionalAuth,
  validate({ params: fileParams }),
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    const now = clock.now();
    // The file must be VALID and part of an approved snapshot...
    const revisionIds = await Revision.find({
      approved: true,
      contentSnapshot: { $exists: true },
      'contentSnapshot.attachments': { $elemMatch: { fileId, validationStatus: 'VALID' } },
    }).distinct('_id');
    if (!revisionIds.length) throw AppError.notFound();
    // ...that is the current approved revision of a publicly visible notice (D2).
    const visible = await Notice.exists({
      $and: [buildPublicEligibilityFilter(now, req.user), { approvedRevision: { $in: revisionIds } }],
    });
    if (!visible) throw AppError.notFound();
    const meta = await getGateway().getMetadata(fileId);
    if (!meta || meta.validationStatus !== 'VALID') throw AppError.notFound();
    await streamFile(res, meta);
  })
);

module.exports = { managementRouter, publicRouter };
