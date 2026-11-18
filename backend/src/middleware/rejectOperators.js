'use strict';

const mongoSanitize = require('express-mongo-sanitize');
const AppError = require('../utils/AppError');

/**
 * Blocks NoSQL operator injection. express-mongo-sanitize strips keys that
 * start with "$" or contain "."; when it finds one we reject the request with
 * 400 instead of silently continuing with altered input.
 */
const sanitizer = mongoSanitize({
  onSanitize: ({ req, key }) => {
    req.operatorInjection = req.operatorInjection || [];
    req.operatorInjection.push(key);
  },
});

function rejectIfSanitized(req, res, next) {
  if (req.operatorInjection && req.operatorInjection.length) {
    return next(
      AppError.badRequest(
        'The request contains characters that are not allowed.',
        req.operatorInjection.map((key) => ({
          location: key,
          field: key,
          message: 'Keys starting with "$" or containing "." are not allowed',
        }))
      )
    );
  }
  return next();
}

module.exports = [sanitizer, rejectIfSanitized];
