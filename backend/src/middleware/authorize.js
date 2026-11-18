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
    if (roles.includes(req.user.role)) return next();
    await audit.recordSafe(audit.contextFromRequest(req), {
      action: 'AUTHORIZATION_FAILED',
      entityType: 'ROUTE',
      entityId: `${req.method} ${req.originalUrl.split('?')[0]}`,
      reason: `Role ${req.user.role} is not allowed`,
    });
    return next(AppError.forbidden());
  };
};
