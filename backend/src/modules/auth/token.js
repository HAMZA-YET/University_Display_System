'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { loadEnv } = require('../../config/env');
const AppError = require('../../utils/AppError');

const COOKIE_NAME = 'uids_token';
const CHALLENGE_COOKIE = 'uids_mfa';

function expiresInMs(expr) {
  const n = Number(expr.slice(0, -1));
  return expr.endsWith('h') ? n * 3600 * 1000 : n * 60 * 1000;
}

/** JWT claims identify the user, token version, unique session and MFA verification. Role is loaded from the DB. */
function signToken(user, mfaVerified = false) {
  const env = loadEnv();
  if (env.JWT_SECRET.length < 32) throw new AppError(503, 'SETUP_REQUIRED', 'Authentication is not configured.');
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion, jti: crypto.randomUUID(), ...(mfaVerified ? { mfa: true } : {}) }, env.JWT_SECRET, {
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

function setAuthCookie(res, user, mfaVerified = false) {
  res.cookie(COOKIE_NAME, signToken(user, mfaVerified), cookieOptions());
}

function clearAuthCookie(res) {
  const { maxAge, ...opts } = cookieOptions(); // eslint-disable-line no-unused-vars
  res.clearCookie(COOKIE_NAME, opts);
}

function setChallengeCookie(res, token) {
  res.cookie(CHALLENGE_COOKIE, token, { ...cookieOptions(), maxAge: 5 * 60000 });
}
function clearChallengeCookie(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(CHALLENGE_COOKIE, options);
}
module.exports = { CHALLENGE_COOKIE, setChallengeCookie, clearChallengeCookie, COOKIE_NAME, signToken, verifyToken, setAuthCookie, clearAuthCookie };
