'use strict';
const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { password, email } = require('../auth/auth.schemas');
const { toAuthUser } = require('../auth/auth.service');
const { setAuthCookie, clearChallengeCookie, CHALLENGE_COOKIE } = require('../auth/token');
const User = require('../users/user.model');
const service = require('./service');
const audit = require('../audit/audit.service');
function createSecurityRouter() {
const router = express.Router();
router.use(require('./origin'));
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.use(rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.')) }));
const codeBody = z.object({ code: z.string().min(6).max(64) }).strict();
const tokenBody = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }).strict();
const event = (req, action, user = req.user) => audit.recordSafe({ ...audit.contextFromRequest(req), user },
  { action, entityType: 'USER', entityId: user ? user._id : null });
router.post('/recovery/request', validate({ body: z.object({ email }).strict() }), asyncHandler(async (req, res) => {
  await service.requestRecovery(req.body.email);
  await event(req, 'RECOVERY_REQUESTED');
  res.json({ data: { accepted: true } });
}));
for (const purpose of ['activation', 'recovery']) {
  router.post('/' + purpose + '/complete', validate({ body: tokenBody }), asyncHandler(async (req, res) => {
    try { await service.consumePassword(req.body.token, purpose, req.body.password); }
    catch (error) { await event(req, purpose === 'activation' ? 'ACTIVATION_FAILED' : 'RECOVERY_FAILED'); throw error; }
    await event(req, purpose === 'activation' ? 'ACCOUNT_ACTIVATED' : 'PASSWORD_RECOVERED');
    res.json({ data: { completed: true } });
  }));
}
router.post('/invitations', authenticate, authorize('ADMIN'), validate({ body: z.object({
  name: z.string().trim().min(2).max(80), email,
  department: z.string().trim().toUpperCase().regex(/^[A-Z]{2,10}$/).optional(),
}).strict() }), asyncHandler(async (req, res) => {
  const user = await service.invite(req.body);
  await audit.recordSafe(audit.contextFromRequest(req), { action: 'ACCOUNT_INVITED', entityType: 'USER', entityId: user._id });
  res.status(201).json({ data: toAuthUser(user) });
}));
router.patch('/profile', authenticate, validate({ body: z.object({ name: z.string().trim().min(2).max(80) }).strict() }), asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user._id, { $set: { name: req.body.name } }, { new: true, runValidators: true }).lean();
  await event(req, 'PROFILE_UPDATED');
  res.json({ data: toAuthUser(user) });
}));
router.get('/mfa', authenticate, (req, res) => res.json({ data: { enabled: Boolean(req.user.mfaEnabled) } }));
router.post('/mfa/enroll', authenticate, validate({ body: z.object({ password: z.string().min(1).max(128) }).strict() }), asyncHandler(async (req, res) => {
  const data = await service.beginEnrollment(req.user, req.body.password);
  await event(req, 'MFA_ENROLLMENT_STARTED');
  res.json({ data });
}));
router.post('/mfa/confirm', authenticate, validate({ body: codeBody }), asyncHandler(async (req, res) => {
  const result = await service.confirmEnrollment(req.user, req.body.code);
  setAuthCookie(res, result.user, true);
  await event(req, 'MFA_ENABLED');
  res.json({ data: { recoveryCodes: result.recoveryCodes } });
}));
router.post('/mfa/verify', validate({ body: codeBody }), asyncHandler(async (req, res) => {
  try {
    const user = await service.verifyChallenge(req.cookies[CHALLENGE_COOKIE] || '', req.body.code);
    setAuthCookie(res, user, true);
    clearChallengeCookie(res);
    await event(req, 'MFA_VERIFIED', user);
    await event(req, 'LOGIN_SUCCESS', user);
    res.json({ data: toAuthUser(user) });
  } catch (error) {
    await event(req, 'MFA_FAILED');
    throw error;
  }
}));
return router;
}
module.exports = createSecurityRouter;
