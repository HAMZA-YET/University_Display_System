'use strict';

const User = require('../modules/users/user.model');
const { COOKIE_NAME, verifyToken } = require('../modules/auth/token');
const AppError = require('../utils/AppError');

/**
 * Loads the user for the token in the cookie. Returns null when there is no
 * valid token. The role always comes from the database, never the token.
 */
async function resolveUser(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token || typeof token !== 'string') return null;
  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return null;
  }
  if (!payload || typeof payload.sub !== 'string' || !/^[a-f0-9]{24}$/.test(payload.sub)) return null;
  const { RevokedToken } = require('../modules/security/models');
  const { digest } = require('../modules/security/crypto');
  if (await RevokedToken.exists({ digest: digest(token) })) return null;
  const user = await User.findById(payload.sub).lean();
  if (!user || !user.isActive) return null;
  if (user.tokenVersion !== payload.tv) return null;
  if (user.mfaEnabled && payload.mfa !== true) return null;
  return user;
}

async function authenticate(req, res, next) {
  try {
    const user = await resolveUser(req);
    if (!user) return next(AppError.unauthenticated());
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticate;
module.exports.resolveUser = resolveUser;
