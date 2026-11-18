'use strict';

const express = require('express');
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { paginationQuery } = require('../../utils/pagination');
const { TYPES } = require('./domainEvent.model');
const service = require('./domainEvent.service');

const router = express.Router();

const listQuery = z
  .object({
    ...paginationQuery,
    type: z.enum(TYPES).optional(),
    entityId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id').optional(),
  })
  .strict();

router.get(
  '/',
  authenticate,
  authorize('REVIEWER', 'ADMIN'),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => res.json(await service.listDomainEvents(req.query)))
);

module.exports = router;
