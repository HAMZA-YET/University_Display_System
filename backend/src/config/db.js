'use strict';

const mongoose = require('mongoose');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);
// Routes connect before querying. Allow model initialization to wait for the
// first connection, while keeping transient query buffering bounded.
mongoose.set('bufferTimeoutMS', 5000);
let connectionPromise = null;

/** One connection attempt/pool per warm serverless instance. */
async function connectDb(uri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;
  connectionPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    maxPoolSize: 10,
    minPoolSize: 0,
  }).then(() => {
    logger.info('MongoDB connected');
    return mongoose.connection;
  }).finally(() => {
    connectionPromise = null;
  });
  return connectionPromise;
}

async function disconnectDb() {
  await mongoose.disconnect();
  connectionPromise = null;
}

module.exports = { connectDb, disconnectDb };
