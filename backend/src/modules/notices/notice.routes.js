'use strict';

const express = require('express');
const authenticate = require('../../middleware/authenticate');
const optionalAuth = require('../../middleware/optionalAuth');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const c = require('./notice.controller');
const s = require('./notice.schemas');
const { z } = require('zod');

const STAFF = ['AUTHOR', 'REVIEWER', 'ADMIN'];
const REVIEWERS = ['REVIEWER', 'ADMIN'];
const WRITERS = ['AUTHOR', 'ADMIN'];

/** Public routes: /api/public/notices. No status filter exists here. */
const publicRouter = express.Router();
publicRouter.use(optionalAuth);
publicRouter.get('/', validate({ query: s.publicListQuery }), asyncHandler(c.listPublic));
publicRouter.get('/:id', validate({ params: s.idParams, query: z.object({}).strict() }), asyncHandler(c.getPublic));

/** Public home page data: /api/public/home */
const homeRouter = express.Router();
homeRouter.get('/', optionalAuth, validate({ query: z.object({}).strict() }), asyncHandler(c.home));

/** Management routes: /api/notices (authenticated staff). */
const router = express.Router();
router.use(authenticate, authorize(...STAFF));

router.get('/', validate({ query: s.managementListQuery }), asyncHandler(c.list));
router.get('/review-queue', authorize(...REVIEWERS), validate({ query: s.reviewQueueQuery }), asyncHandler(c.reviewQueue));
router.post('/', authorize(...WRITERS), validate({ body: s.createBody }), asyncHandler(c.create));
router.get('/:id', validate({ params: s.idParams }), asyncHandler(c.get));
router.patch('/:id', authorize(...WRITERS), validate({ params: s.idParams, body: s.updateBody }), asyncHandler(c.update));
router.delete('/:id', authorize(...WRITERS), validate({ params: s.idParams }), asyncHandler(c.remove));
router.get('/:id/preview', validate({ params: s.idParams }), asyncHandler(c.preview));
router.post('/:id/submit', authorize(...WRITERS), validate({ params: s.idParams, body: s.emptyBody }), asyncHandler(c.submit));
router.post('/:id/approve', authorize(...REVIEWERS), validate({ params: s.idParams, body: s.approveBody }), asyncHandler(c.approve));
router.post('/:id/reject', authorize(...REVIEWERS), validate({ params: s.idParams, body: s.reasonBody }), asyncHandler(c.reject));
router.post('/:id/return', authorize(...REVIEWERS), validate({ params: s.idParams, body: s.reasonBody }), asyncHandler(c.return));
router.post('/:id/withdraw', validate({ params: s.idParams, body: s.reasonBody }), asyncHandler(c.withdraw));
router.post('/:id/archive', authorize(...REVIEWERS), validate({ params: s.idParams, body: s.emptyBody }), asyncHandler(c.archive));
router.patch('/:id/placement', authorize(...REVIEWERS), validate({ params: s.idParams, body: s.placementBody }), asyncHandler(c.placement));
router.get('/:id/revisions', validate({ params: s.idParams }), asyncHandler(c.listRevisions));
router.post('/:id/revisions', authorize(...WRITERS), validate({ params: s.idParams, body: s.correctionBody }), asyncHandler(c.createRevision));
router.get('/:id/revisions/:revId/diff', validate({ params: s.revisionParams }), asyncHandler(c.diff));
router.post(
  '/:id/revisions/:revId/approve',
  authorize(...REVIEWERS),
  validate({ params: s.revisionParams, body: z.object({}).strict() }),
  asyncHandler(c.approveRevision)
);
router.post(
  '/:id/revisions/:revId/reject',
  authorize(...REVIEWERS),
  validate({ params: s.revisionParams, body: s.reasonBody }),
  asyncHandler(c.rejectRevision)
);

module.exports = { router, publicRouter, homeRouter };
