'use strict';

const AppError = require('./AppError');

/**
 * Reads the expected version for optimistic concurrency (D6).
 * Accepts If-Match: 3, If-Match: "3" or W/"3", or body.expectedVersion.
 * Returns a number, or null when none was sent.
 */
function readExpectedVersion(req) {
  const header = req.get('If-Match');
  if (header !== undefined && header !== null && header !== '') {
    const cleaned = String(header).replace(/^W\//, '').replace(/"/g, '').trim();
    const value = Number(cleaned);
    if (!Number.isInteger(value) || value < 1) {
      throw AppError.badRequest('If-Match must be a positive integer version.', [
        { field: 'If-Match', message: 'Must be a positive integer version' },
      ]);
    }
    return value;
  }
  if (req.body && req.body.expectedVersion !== undefined) {
    return req.body.expectedVersion;
  }
  return null;
}

/** Same as readExpectedVersion but returns 428 when the version is missing. */
function requireExpectedVersion(req) {
  const value = readExpectedVersion(req);
  if (value === null) throw AppError.preconditionRequired();
  return value;
}

module.exports = { readExpectedVersion, requireExpectedVersion };
