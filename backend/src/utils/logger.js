'use strict';

const pino = require('pino');

/**
 * Structured JSON logger. Sensitive values are redacted so passwords, tokens
 * and cookies are never written to the log.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'password',
      'passwordHash',
      'token',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
