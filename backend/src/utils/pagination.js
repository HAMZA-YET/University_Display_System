'use strict';

const { z } = require('zod');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** zod fragments shared by every list endpoint. */
const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
};

function getPaging(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

function buildMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { paginationQuery, getPaging, buildMeta, DEFAULT_LIMIT, MAX_LIMIT };
