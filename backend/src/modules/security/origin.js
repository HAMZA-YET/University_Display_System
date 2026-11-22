'use strict';
const { loadEnv } = require('../../config/env');
const AppError = require('../../utils/AppError');
// New cookie-authenticated mutation routes reject cross-origin browser submissions.
// Requests without Origin remain available to non-browser API clients.
module.exports = function trustedOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.get('Origin')) return next();
  const env = loadEnv();
  let allowed = false;
  try {
    const incoming = new URL(req.get('Origin')); const configured = new URL(env.CLIENT_ORIGIN);
    allowed = req.get('Origin') === incoming.origin && incoming.origin === configured.origin;
    if (!allowed && env.NODE_ENV !== 'production') {
      const loopback = host => ['localhost', '127.0.0.1'].includes(host);
      allowed = req.get('Origin') === incoming.origin && loopback(incoming.hostname) && loopback(configured.hostname)
        && incoming.protocol === configured.protocol && incoming.port === configured.port;
    }
  } catch { allowed = false; }
  if (!allowed) return next(AppError.forbidden('Untrusted request origin.'));
  next();
};
