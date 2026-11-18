'use strict';

const jwt = require('jsonwebtoken');
const { loadEnv } = require('../../config/env');
const AppError = require('../../utils/AppError');

const COOKIE_NAME = 'uids_token';

function expiresInMs(expr) {
  const n = Number(expr.slice(0, -1));
  return expr.endsWith('h') ? n * 3600 * 1000 : n * 60 * 1000;
}

/** The JWT holds only the user ID and tokenVersion. Role is loaded from the DB. */
function signToken(user) {
  const env = loadEnv();
  if (env.JWT_SECRET.length < 32) throw new AppError(503, 'SETUP_REQUIRED', 'Authentication is not configured.');
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

function verifyToken(token) {
  const env = loadEnv();
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}

function cookieOptions() {
  const env = loadEnv();
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: expiresInMs(env.JWT_EXPIRES_IN),
  };
}

function setAuthCookie(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
}

function clearAuthCookie(res) {
  const { maxAge, ...opts } = cookieOptions(); // eslint-disable-line no-unused-vars
  res.clearCookie(COOKIE_NAME, opts);
}

module.exports = { COOKIE_NAME, signToken, verifyToken, setAuthCookie, clearAuthCookie };
