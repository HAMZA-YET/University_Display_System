'use strict';

const express = require('express');
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const audit = require('../audit/audit.service');
const { toAuthUser } = require('../auth/auth.service');
const { setAuthCookie } = require('../auth/token');
const service = require('./setup.service');

const router = express.Router();
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});
router.get('/status', asyncHandler(async (req, res) => res.json({ data: await service.status() })));
router.post('/administrator',
  authenticate,
  authorize('READER'),
  validate({ body: z.object({}).strict() }),
  asyncHandler(async (req, res) => {
    const user = await service.promoteCurrentReader(audit.contextFromRequest(req), req.get('x-bootstrap-token'));
    // Rotation invalidates earlier reader sessions; the current browser gets a
    // fresh session containing only the user id and new token version.
    setAuthCookie(res, user);
    res.json({ data: toAuthUser(user) });
  }));
module.exports = router;
