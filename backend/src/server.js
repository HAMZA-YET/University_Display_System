'use strict';

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { loadEnv } = require('./config/env');
const logger = require('./utils/logger');

let env;
try {
  env = loadEnv();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err.message);
  process.exit(1);
}

const { connectDb } = require('./config/db');
const { createApp } = require('./app');
const { startStatusSync } = require('./jobs/statusSync.job');

async function main() {
  if (!env.MONGO_URI || env.JWT_SECRET.length < 32) {
    logger.warn('Database-backed routes require MONGODB_URI (or MONGO_URI) and a JWT_SECRET of at least 32 characters.');
  } else {
    await connectDb(env.MONGO_URI);
  }
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'UIDS publishing API listening');
  });
  if (env.ENABLE_STATUS_SYNC) startStatusSync();

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
