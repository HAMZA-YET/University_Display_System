'use strict';

const AppError = require('../utils/AppError');
const audit = require('../modules/audit/audit.service');

/**
 * authorize(...roles) allows the request only for the listed roles.
 * Failed authorization on management routes is written to the audit log.
 */
module.exports = function authorize(...roles) {
  return async function authorizeMiddleware(req, res, next) {
    if (!req.user) return next(AppError.unauthenticated());
    if (roles.includes(req.user.role)) {
      if (require('../config/env').loadEnv().REQUIRE_PRIVILEGED_MFA && ['ADMIN', 'AUTHOR', 'REVIEWER'].includes(req.user.role) && !req.user.mfaEnabled) {
        return next(new AppError(403, 'MFA_ENROLLMENT_REQUIRED', 'Enroll MFA from Account security before using staff tools.'));
      }
      return next();
    }
    await audit.recordSafe(audit.contextFromRequest(req), {
      action: 'AUTHORIZATION_FAILED',
      entityType: 'ROUTE',
      entityId: `${req.method} ${req.originalUrl.split('?')[0]}`,
      reason: `Role ${req.user.role} is not allowed`,
    });
    return next(AppError.forbidden());
  };
};
