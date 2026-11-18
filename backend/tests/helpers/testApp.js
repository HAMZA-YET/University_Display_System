'use strict';

const { createApp } = require('../../src/app');
const testDb = require('./testDb');
const clock = require('../../src/utils/clock');

/**
 * Standard lifecycle for a test file: own database, data cleared between
 * tests, clock reset after each test. No background job runs in tests.
 */
function useTestApp(options) {
  const ctx = { app: null };
  beforeAll(async () => {
    await testDb.connect();
    ctx.app = createApp(options);
  });
  afterEach(async () => {
    clock.reset();
    jest.restoreAllMocks();
    await testDb.clear();
  });
  afterAll(async () => {
    await testDb.disconnect();
  });
  return ctx;
}

module.exports = { useTestApp };
