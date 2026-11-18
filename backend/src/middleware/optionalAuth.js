'use strict';

const { resolveUser } = require('./authenticate');

/** For public routes that adapt to logged-in users (for example CAMPUS notices). */
module.exports = async function optionalAuth(req, res, next) {
  try {
    req.user = (await resolveUser(req)) || null;
    next();
  } catch (err) {
    next(err);
  }
};
