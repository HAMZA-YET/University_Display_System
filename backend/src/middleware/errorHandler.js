'use strict';

const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { maxUploadBytes } = require('../modules/attachments/attachment.validation');

/** Central error handler. Produces the standard error body from Section 6. */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let error = err;

  if (!(error instanceof AppError)) {
    if (error && error.type === 'entity.parse.failed') {
      error = AppError.badRequest('The request body is not valid JSON.');
    } else if (error && error.type === 'entity.too.large') {
      error = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    } else if (error && error.code === 11000) {
      const fields = Object.keys(error.keyValue || error.keyPattern || {});
      error = new AppError(
        409,
        'DUPLICATE',
        fields.length ? `A record with this ${fields.join(', ')} already exists.` : 'Duplicate record.',
        fields.map((f) => ({ field: f, message: 'Already exists' }))
      );
    } else if (error && error.name === 'ValidationError' && error.errors) {
      error = AppError.badRequest(
        'Some fields are not valid.',
        Object.values(error.errors).map((e) => ({ location: 'body', field: e.path, message: e.message }))
      );
    } else if (error && error.name === 'CastError') {
      error = AppError.notFound();
    } else if (error && error.name === 'MulterError') {
      const message = error.code === 'LIMIT_FILE_SIZE' ? `The file is larger than ${maxUploadBytes() / 1024 / 1024} MB.` : error.message;
      error = AppError.badRequest(message, [{ location: 'body', field: 'file', message }]);
    } else {
      logger.error({ err: error, requestId: req.id }, 'Unhandled error');
      const isDev = process.env.NODE_ENV === 'development';
      error = new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred. Nothing was saved.');
      if (isDev && err && err.stack) error.extra = { stack: err.stack };
    }
  }

  const body = {
    error: {
      code: error.code,
      message: error.message,
      details: error.details || [],
      requestId: req.id,
      ...error.extra,
    },
  };
  if (error.status >= 500) {
    logger.error({ requestId: req.id, code: error.code }, 'Request failed');
  }
  res.status(error.status || 500).json(body);
};
