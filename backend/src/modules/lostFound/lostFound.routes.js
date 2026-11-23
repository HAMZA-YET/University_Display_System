'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const audit = require('../audit/audit.service');
const { requireExpectedVersion } = require('../../utils/ifMatch');
const { VERIFIER_ROLES, MAX_PHOTOS, maxPhotoBytes } = require('./lostFound.constants');
const s = require('./lostFound.schemas');
const S = require('./lostFound.serializers');
const service = require('./lostFound.service');
const photos = require('./lostFound.photos');
const caseEvents = require('./caseEvent.service');

const ctx = (req) => audit.contextFromRequest(req);

/** Limits repeated claim submissions per member. The unique index already blocks duplicates. */
const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? String(req.user._id) : req.ip),
  handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many claims. Please wait before trying again.')),
});

function singlePhoto(req, res, next) {
  const maxBytes = maxPhotoBytes();
  const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 1 } });
  photoUpload.single('photo')(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      const limit = `${maxBytes / 1024 / 1024} MB`;
      return next(AppError.badRequest(`The photo is larger than ${limit}.`, [{ location: 'body', field: 'photo', message: `Maximum ${limit}` }]));
    }
    return next(err);
  });
}

// ------------------------------------------------------------ campus listing (Member 4 can consume these)
// Mounted at /api/public/lost-found. The path is kept for compatibility, but
// item listings, details and photos are for signed-in university members only:
// visitors who are not logged in get 401. Only /capabilities stays open.
const publicRouter = express.Router();

publicRouter.get('/capabilities', asyncHandler(async (req, res) => {
  const status = await require('../../config/readiness').readiness();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: { maxPhotoBytes: maxPhotoBytes(), maxPhotos: MAX_PHOTOS, photosAvailable: status.features.attachments } });
}));

publicRouter.use('/items', authenticate);

publicRouter.get(
  '/items',
  validate({ query: s.publicListQuery }),
  asyncHandler(async (req, res) => res.json(await service.listPublicItems(req.query)))
);

publicRouter.get(
  '/items/:id',
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.getPublicItem(req.params.id) }))
);

publicRouter.get(
  '/items/:id/photos/:photoId',
  validate({ params: s.photoParams }),
  asyncHandler(async (req, res) =>
    photos.streamPhoto(res, await photos.publicPhotoMeta(req.params.id, req.params.photoId), { isPublic: true })
  )
);

// ------------------------------------------------------------ signed-in members
// Mounted at /api/lost-found
const router = express.Router();
router.use(require('../security/origin'), authenticate);

// Reports
router.post(
  '/items',
  validate({ body: s.createItemBody }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await service.createItem(ctx(req), req.body) }))
);

router.get(
  '/me/items',
  validate({ query: s.mineItemsQuery }),
  asyncHandler(async (req, res) => res.json(await service.listMyItems(ctx(req), req.query)))
);

router.get(
  '/me/items/:id',
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.getMyItem(ctx(req), req.params.id) }))
);

router.patch(
  '/me/items/:id',
  validate({ params: s.idParams, body: s.updateItemBody }),
  asyncHandler(async (req, res) =>
    res.json({ data: await service.updateMyItem(ctx(req), req.params.id, req.body, requireExpectedVersion(req)) })
  )
);

router.post(
  '/me/items/:id/resolve',
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.resolveMyItem(ctx(req), req.params.id) }))
);

router.delete(
  '/me/items/:id',
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.deleteMyItem(ctx(req), req.params.id) }))
);

// Photos: the reporter uploads/removes; reporter and admin can view
router.post(
  '/me/items/:id/photos',
  validate({ params: s.idParams }),
  singlePhoto,
  asyncHandler(async (req, res) => res.status(201).json({ data: S.ownerItem(await photos.addPhoto(ctx(req), req.params.id, req.file)) }))
);

router.delete(
  '/me/items/:id/photos/:photoId',
  validate({ params: s.photoParams }),
  asyncHandler(async (req, res) => res.json({ data: S.ownerItem(await photos.removePhoto(ctx(req), req.params.id, req.params.photoId)) }))
);

router.get(
  '/items/:id/photos/:photoId',
  validate({ params: s.photoParams }),
  asyncHandler(async (req, res) =>
    photos.streamPhoto(res, await photos.privatePhotoMeta(req.user, req.params.id, req.params.photoId), { isPublic: false })
  )
);

// Claims (found items only)
router.post(
  '/items/:id/claims',
  claimLimiter,
  validate({ params: s.idParams, body: s.claimBody }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await service.submitClaim(ctx(req), req.params.id, req.body) }))
);

router.get(
  '/me/claims',
  validate({ query: s.mineQuery }),
  asyncHandler(async (req, res) => res.json(await service.listMyClaims(ctx(req), req.query)))
);

router.get(
  '/me/claims/:id',
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.getMyClaim(ctx(req), req.params.id) }))
);

router.delete(
  '/me/claims/:id',
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.deleteMyClaim(ctx(req), req.params.id) }))
);

// 5-second popups: returns unseen notices once
router.get(
  '/me/notices',
  asyncHandler(async (req, res) => res.json({ data: await service.takeMyNotices(ctx(req)) }))
);

// ------------------------------------------------------------ admin only
const admin = express.Router();
admin.use(authorize(...VERIFIER_ROLES));

admin.get(
  '/stats',
  asyncHandler(async (req, res) => res.json({ data: await service.adminStats() }))
);

admin.get(
  '/items',
  validate({ query: s.adminItemQuery }),
  asyncHandler(async (req, res) => res.json(await service.listAdminItems(req.query)))
);

admin.get(
  '/items/:id',
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.getAdminItem(req.params.id) }))
);

admin.delete(
  '/items/:id',
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.adminDeleteItem(ctx(req), req.params.id) }))
);

admin.get(
  '/claims',
  validate({ query: s.adminClaimQuery }),
  asyncHandler(async (req, res) => res.json(await service.adminClaimsByItem(req.query)))
);

admin.post(
  '/claims/:id/decision',
  validate({ params: s.idParams, body: s.decisionBody }),
  asyncHandler(async (req, res) => res.json({ data: await service.decideClaim(ctx(req), req.params.id, req.body) }))
);

admin.post(
  '/claims/:id/release',
  validate({ params: s.idParams, body: s.releaseBody }),
  asyncHandler(async (req, res) => res.json({ data: await service.releaseClaim(ctx(req), req.params.id, req.body) }))
);

admin.post(
  '/claims/:id/handover',
  validate({ params: s.idParams, body: s.handoverBody }),
  asyncHandler(async (req, res) => res.json({ data: await service.recordHandover(ctx(req), req.params.id, req.body) }))
);

admin.delete(
  '/claims/:id',
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.adminDeleteClaim(ctx(req), req.params.id) }))
);

admin.get(
  '/case-events',
  validate({ query: s.caseEventQuery }),
  asyncHandler(async (req, res) => res.json(await caseEvents.listCaseEvents(req.query)))
);

router.use('/admin', admin);

module.exports = { publicRouter, router };
