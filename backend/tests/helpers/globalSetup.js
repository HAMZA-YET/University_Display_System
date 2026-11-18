'use strict';

const { MongoMemoryReplSet } = require('mongodb-memory-server');

/**
 * Starts one in-memory MongoDB replica set for the whole test run, so
 * transactions work in tests. Each test file uses its own database.
 * MONGOMS_SYSTEM_BINARY can point at a local mongod when downloads are blocked.
 */
module.exports = async function globalSetup() {
  const binary = {};
  if (process.env.MONGOMS_SYSTEM_BINARY) binary.systemBinary = process.env.MONGOMS_SYSTEM_BINARY;
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    binary,
  });
  await replSet.waitUntilRunning();
  globalThis.__MONGO_REPLSET__ = replSet;
  process.env.MONGO_TEST_URI = replSet.getUri();
};
