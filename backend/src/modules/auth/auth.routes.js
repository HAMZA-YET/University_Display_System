'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { registerBody, loginBody } = require('./auth.schemas');
const authService = require('./auth.service');
const auditService = require('../audit/audit.service');
const { setAuthCookie, clearAuthCookie, setChallengeCookie, clearChallengeCookie, COOKIE_NAME, CHALLENGE_COOKIE, verifyToken } = require('./token');

function rateLimitHandler(req, res, next) {
  next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a minute and try again.'));
}

function createAuthRouter({ loginLimit, generalLimit }) {
  const router = express.Router();

  router.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: generalLimit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: rateLimitHandler,
    })
  );

  const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: loginLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const email = req.body && typeof req.body.email === 'string' ? req.body.email.toLowerCase() : '';
      return `${req.ip}|${email}`;
    },
    handler: rateLimitHandler,
  });

  router.post(
    '/register',
    validate({ body: registerBody }),
    asyncHandler(async (req, res) => {
      const user = await authService.register(req.body);
      setAuthCookie(res, user);
      res.status(201).json({ data: authService.toAuthUser(user) });
    })
  );

  router.post(
    '/login',
    loginLimiter,
    validate({ body: loginBody }),
    asyncHandler(async (req, res) => {
      let user;
      try {
        user = await authService.login(req.body);
      } catch (err) {
        if (err.status === 401 || err.status === 403) {
          // Failed credentials never identify a trusted actor or enter the audit payload.
          await auditService.recordSafe({ ...auditService.contextFromRequest(req), user: null }, {
            action: 'LOGIN_FAILED', entityType: 'USER',
          });
        }
        throw err;
      }
      if (user.mfaEnabled) {
        const security = require('../security/service');
        const challenge = await security.issue(user, 'mfa', 5);
        clearAuthCookie(res);
        setChallengeCookie(res, challenge);
        return res.json({ data: { mfaRequired: true } });
      }
      setAuthCookie(res, user);
      clearChallengeCookie(res);
      await auditService.recordSafe({ ...auditService.contextFromRequest(req), user }, {
        action: 'LOGIN_SUCCESS', entityType: 'USER', entityId: user._id,
      });
      res.json({ data: authService.toAuthUser(user) });
    })
  );

  router.post('/logout', asyncHandler(async (req, res) => {
    let user = null;
    try {
      user = await authenticate.resolveUser(req);
    } catch {
      // Audit attribution must not prevent clearing the cookie if lookup fails.
    }
    const { ActionToken, RevokedToken } = require('../security/models');
    const { digest } = require('../security/crypto');
    if (user) {
      const token = req.cookies[COOKIE_NAME];
      let payload;
      try { payload = verifyToken(token); } catch { /* An already expired cookie still needs clearing. */ }
      if (payload) await RevokedToken.updateOne({ digest: digest(token) }, { $setOnInsert: { expiresAt: new Date(payload.exp * 1000) } }, { upsert: true });
    }
    if (req.cookies[CHALLENGE_COOKIE]) await ActionToken.deleteOne({ digest: digest(req.cookies[CHALLENGE_COOKIE]), purpose: 'mfa' });
    clearAuthCookie(res);
    clearChallengeCookie(res);
    await auditService.recordSafe({ ...auditService.contextFromRequest(req), user }, {
      action: 'LOGOUT', entityType: 'USER', entityId: user ? user._id : null,
    });
    res.json({ data: { loggedOut: true } });
  }));

  router.get('/me', authenticate, (req, res) => {
    res.json({ data: authService.toAuthUser(req.user) });
  });

  return router;
}

module.exports = createAuthRouter;
