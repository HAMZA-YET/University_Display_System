'use strict';

const mongoose = require('mongoose');
const { loadEnv } = require('./env');
const { connectDb } = require('./db');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { maxUploadBytes } = require('../modules/attachments/attachment.validation');

function missingConfiguration() {
  const env = loadEnv();
  const missing = [];
  if (!/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI)) missing.push('MONGO_URI');
  if (env.JWT_SECRET.length < 32) missing.push('JWT_SECRET');
  return missing;
}

async function readiness({ connect = false } = {}) {
  const env = loadEnv();
  const missing = missingConfiguration();
  let database = !missing.includes('MONGO_URI') ? 'not_connected' : 'unconfigured';
  if (missing.length === 0 && connect) {
    try {
      await connectDb(env.MONGO_URI);
    } catch (error) {
      // Do not log connection strings or driver errors that can include credentials.
      logger.warn({ name: error.name }, 'Database connection unavailable');
      database = 'unavailable';
    }
  }
  if (mongoose.connection.readyState === 1) database = 'connected';
  const ready = missing.length === 0 && database === 'connected';
  const evidence = require('../modules/security/evidenceStorage').capabilities();
  return {
    status: ready ? 'ok' : (missing.length ? 'setup_required' : 'unavailable'),
    ready,
    database,
    missingConfiguration: missing,
    features: {
      attachments: (env.ATTACHMENT_STORAGE === 'vercel-blob' && Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN))
        || (!process.env.VERCEL && env.ATTACHMENT_STORAGE === 'local'),
      attachmentMaxBytes: env.ATTACHMENT_STORAGE === 'vercel-blob' ? 4 * 1024 * 1024 : maxUploadBytes(),
      security: {
        mfaConfigured: /^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || ''),
        privilegedMfaRequired: env.REQUIRE_PRIVILEGED_MFA,
        accountMessagesConfigured: require('../modules/security/delivery').status().available,
        privateEvidenceConfigured: evidence.available,
        privateEvidenceMaxBytes: evidence.maxBytes,
      },
    },
  };
}

async function requireDatabase(req, res, next) {
  try {
    const missing = missingConfiguration();
    if (missing.length) {
      throw new AppError(503, 'SETUP_REQUIRED',
        'The university service needs administrator configuration before it can load or save data.',
        missing.map((field) => ({ field, message: field === 'MONGO_URI' ? 'Configure MONGODB_URI (or MONGO_URI) in Vercel.' : 'Configure this environment variable in Vercel.' })));
    }
    try {
      await connectDb(loadEnv().MONGO_URI);
    } catch (error) {
      logger.warn({ name: error.name }, 'Database connection unavailable');
      throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The university database is unavailable. Please try again later.');
    }
    return next();
  } catch (error) {
    res.setHeader('Retry-After', '30');
    return next(error);
  }
}

module.exports = { readiness, requireDatabase, missingConfiguration };
