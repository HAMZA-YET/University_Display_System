'use strict';

const AppError = require('../utils/AppError');

function formatIssues(issues, location) {
  return issues.map((issue) => {
    let field = issue.path.join('.');
    let message = issue.message;
    if (issue.code === 'unrecognized_keys') {
      field = issue.keys.join(', ');
      message = `Field not allowed: ${issue.keys.join(', ')}`;
    }
    return { location, field: field || location, message };
  });
}

/**
 * validate({ body, query, params }) runs a zod schema per location and
 * replaces the request value with the parsed (and transformed) result.
 */
module.exports = function validate(schemas) {
  return function validateMiddleware(req, res, next) {
    const details = [];
    for (const location of ['params', 'query', 'body']) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location] === undefined ? {} : req[location]);
      if (!result.success) {
        details.push(...formatIssues(result.error.issues, location));
      } else if (location === 'query') {
        // Express 4 allows reassigning req.query. Keep a parsed copy too.
        req.validatedQuery = result.data;
        req.query = result.data;
      } else {
        req[location] = result.data;
      }
    }
    if (details.length) {
      return next(AppError.badRequest('Some fields are not valid.', details));
    }
    return next();
  };
};
