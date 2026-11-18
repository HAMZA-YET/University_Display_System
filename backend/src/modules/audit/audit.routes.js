'use strict';

const express = require('express');
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const { paginationQuery } = require('../../utils/pagination');
const service = require('./audit.service');

const router = express.Router();

const listQuery = z
  .object({
    ...paginationQuery,
    action: z.string().regex(/^[A-Z_]{2,60}$/, 'Invalid action').optional(),
    entityType: z.enum(['NOTICE', 'EVENT', 'USER', 'PROFESSOR', 'ROUTE']).optional(),
    entityId: z.string().max(200).optional(),
  })
  .strict();

router.get(
  '/',
  authenticate,
  authorize('ADMIN'),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => res.json(await service.listAuditLogs(req.query)))
);

module.exports = router;
