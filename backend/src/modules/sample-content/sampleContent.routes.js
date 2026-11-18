'use strict';
const express = require('express');
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const audit = require('../audit/audit.service');
const service = require('./sampleContent.service');
const router = express.Router();
router.use(authenticate, authorize('ADMIN'), (req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
router.get('/', asyncHandler(async (req, res) => res.json({ data: await service.status() })));
router.post('/', validate({ body: z.object({}).strict() }), asyncHandler(async (req, res) => res.json({ data: await service.install(audit.contextFromRequest(req)) })));
// Removal requires a separate explicit confirmation; installation never removes data.
router.delete('/', validate({ body: z.object({ confirm: z.literal('REMOVE_SAMPLE_CONTENT') }).strict() }), asyncHandler(async (req, res) => res.json({ data: await service.remove(audit.contextFromRequest(req)) })));
module.exports = router;
