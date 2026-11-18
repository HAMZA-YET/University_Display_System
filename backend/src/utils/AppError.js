'use strict';

class AppError extends Error {
  constructor(status, code, message, details, extra) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details || [];
    this.extra = extra || {};
  }

  static badRequest(message, details) {
    return new AppError(400, 'VALIDATION_ERROR', message || 'The request is not valid.', details);
  }

  static unauthenticated(message) {
    return new AppError(401, 'UNAUTHENTICATED', message || 'You must be logged in.');
  }

  static forbidden(message) {
    return new AppError(403, 'FORBIDDEN', message || 'You do not have permission to do this.');
  }

  static notFound(message) {
    return new AppError(404, 'NOT_FOUND', message || 'The requested item was not found.');
  }

  static invalidTransition(message) {
    return new AppError(409, 'INVALID_TRANSITION', message || 'This action is not allowed in the current state.');
  }

  static versionConflict(currentVersion, entity) {
    return new AppError(
      409,
      'VERSION_CONFLICT',
      `This ${entity || 'notice'} has been modified by another user. Please reload the latest version before saving.`,
      [],
      { currentVersion }
    );
  }

  static preconditionRequired() {
    return new AppError(
      428,
      'PRECONDITION_REQUIRED',
      'This update requires the expected version in the If-Match header or as expectedVersion.'
    );
  }
}

module.exports = AppError;
