'use strict';

const express = require('express');
const authenticate = require('../../middleware/authenticate');
const optionalAuth = require('../../middleware/optionalAuth');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const audit = require('../audit/audit.service');
const { requireExpectedVersion } = require('../../utils/ifMatch');
const s = require('./professor.schemas');
const service = require('./professor.service');

const router = express.Router();
const ctx = (req) => audit.contextFromRequest(req);
const isAdmin = (req) => Boolean(req.user && req.user.role === 'ADMIN');

router.get(
  '/',
  optionalAuth,
  validate({ query: s.listQuery }),
  asyncHandler(async (req, res) => {
    const includeInactive = isAdmin(req) && req.query.includeInactive === 'true';
    res.json(await service.listProfessors(req.query, { includeInactive }));
  })
);

router.get(
  '/departments',
  asyncHandler(async (req, res) => res.json({ data: await service.departmentsWithCounts() }))
);

router.get(
  '/:id',
  optionalAuth,
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.getProfessor(req.params.id, { includeInactive: isAdmin(req) }) }))
);

router.post(
  '/',
  authenticate,
  authorize('ADMIN'),
  validate({ body: s.professorBody }),
  asyncHandler(async (req, res) => res.status(201).json({ data: await service.createProfessor(ctx(req), req.body) }))
);

router.put(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  validate({ params: s.idParams, body: s.updateBody }),
  asyncHandler(async (req, res) => {
    const expected = requireExpectedVersion(req);
    res.json({ data: await service.updateProfessor(ctx(req), req.params.id, req.body, expected) });
  })
);

router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json({ data: await service.deleteProfessor(ctx(req), req.params.id) }))
);

module.exports = router;
