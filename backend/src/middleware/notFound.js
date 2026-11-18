'use strict';

const AppError = require('../utils/AppError');

module.exports = function notFound(req, res, next) {
  next(AppError.notFound(`No route for ${req.method} ${req.path}`));
};
