'use strict';

const crypto = require('crypto');

/** Gives every request an ID that appears in logs, audit entries and error bodies. */
module.exports = function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  const id = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
};
