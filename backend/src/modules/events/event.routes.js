'use strict';

const express = require('express');
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const optionalAuth = require('../../middleware/optionalAuth');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const audit = require('../audit/audit.service');
const { readExpectedVersion, requireExpectedVersion } = require('../../utils/ifMatch');
const s = require('./event.schemas');
const service = require('./event.service');

const ctx = (req) => audit.contextFromRequest(req);

/** Public: /api/public/events */
const publicRouter = express.Router();
publicRouter.use(optionalAuth);
publicRouter.get(
  '/',
  validate({ query: s.publicListQuery }),
  asyncHandler(async (req, res) => res.json(await service.listPublic(req.user, req.query)))
);
publicRouter.get(
  '/:id',
  validate({ params: s.idParams, query: z.object({}).strict() }),
  asyncHandler(async (req, res) => res.json({ data: await service.getPublic(req.user, req.params.id) }))
);

/** Management: /api/events */
const router = express.Router();
router.use(authenticate, authorize('AUTHOR', 'REVIEWER', 'ADMIN'));

router.get(
  '/',
  validate({ query: s.managementListQuery }),
  asyncHandler(async (req, res) => res.json(await service.listManagement(ctx(req), req.query)))
);
router.post(
  '/',
  authorize('AUTHOR', 'ADMIN'),
  validate({ body: s.createBody }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await service.createEvent(ctx(req), req.body) }))
);
router.get(
  '/:id',
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.getManagement(ctx(req), req.params.id) }))
);
router.patch(
  '/:id',
  authorize('AUTHOR', 'ADMIN'),
  validate({ params: s.idParams, body: s.updateBody }),
  asyncHandler(async (req, res) => {
    const expected = requireExpectedVersion(req);
    res.json({ data: await service.updateEvent(ctx(req), req.params.id, req.body, expected) });
  })
);
router.delete(
  '/:id',
  authorize('AUTHOR', 'ADMIN'),
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.deleteEvent(ctx(req), req.params.id) }))
);
router.post(
  '/:id/postpone',
  authorize('REVIEWER', 'ADMIN'),
  validate({ params: s.idParams, body: s.postponeBody }),
  asyncHandler(async (req, res) => {
    const result = await service.postponeEvent(ctx(req), req.params.id, req.body, readExpectedVersion(req));
    res.json({ data: result.event, domainEvent: result.domainEvent });
  })
);
router.post(
  '/:id/cancel',
  authorize('REVIEWER', 'ADMIN'),
  validate({ params: s.idParams, body: s.cancelBody }),
  asyncHandler(async (req, res) => {
    const result = await service.cancelEvent(ctx(req), req.params.id, req.body, readExpectedVersion(req));
    res.json({ data: result.event, domainEvent: result.domainEvent });
  })
);

module.exports = { router, publicRouter };
