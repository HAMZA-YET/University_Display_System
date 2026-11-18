'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../../middleware/validate');
const authenticate = require('../../middleware/authenticate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { registerBody, loginBody } = require('./auth.schemas');
const authService = require('./auth.service');
const { setAuthCookie, clearAuthCookie } = require('./token');

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
      const user = await authService.login(req.body);
      setAuthCookie(res, user);
      res.json({ data: authService.toAuthUser(user) });
    })
  );

  router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    res.json({ data: { loggedOut: true } });
  });

  router.get('/me', authenticate, (req, res) => {
    res.json({ data: authService.toAuthUser(req.user) });
  });

  return router;
}

module.exports = createAuthRouter;
