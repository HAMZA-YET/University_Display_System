'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { run, failureMessage } = require('../scripts/install-sample-content');
const ARGS = ['--confirm', 'INSTALL_FICTIONAL_SAMPLE_CONTENT'];
const ENV = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://test.invalid/university', JWT_SECRET: 'test-only-production-secret-longer-than-32-characters' };
const COUNTS = { departments: 6, professors: 6, notices: 12, events: 6 };

function adapters(overrides = {}) {
  const calls = [];
  const administrator = { _id: 'existing-administrator', role: 'ADMIN', isActive: true };
  const dependencies = {
    loadEnv: () => ({ MONGO_URI: ENV.MONGODB_URI }),
    connectDb: async () => { calls.push('connect'); },
    disconnectDb: async () => { calls.push('disconnect'); },
    oldestAdministrator: async () => { calls.push('administrator'); return administrator; },
    install: async (ctx, options) => {
      calls.push('install');
      assert.equal(ctx.user, administrator);
      assert.equal(ctx.ip, null);
      assert.equal(ctx.requestId, 'operator-deployment-maintenance-sample-install');
      assert.equal(options.invocationSource, 'deployment-maintenance');
      return { created: COUNTS, counts: COUNTS, privateEmail: 'private@example.edu', connectionString: 'private-credential' };
    },
    ...overrides,
  };
  return { calls, dependencies };
}

test('CLI requires exact confirmation and production credentials before loading database code', async () => {
  const invalid = [
    [[], ENV], [['--confirm', 'wrong'], ENV], [[...ARGS, '--extra'], ENV],
    [ARGS, { ...ENV, NODE_ENV: 'development' }], [ARGS, { ...ENV, NODE_ENV: undefined }],
    [ARGS, { ...ENV, MONGODB_URI: '' }], [ARGS, { ...ENV, MONGODB_URI: 'https://example.invalid' }],
    [ARGS, { ...ENV, JWT_SECRET: 'short' }],
  ];
  for (const [argv, environment] of invalid) {
    let loaded = false;
    await assert.rejects(run(argv, environment, () => { loaded = true; throw new Error('must not load'); }));
    assert.equal(loaded, false);
  }
});

test('confirmed maintenance reuses an existing administrator and prints only count fields', async () => {
  const { calls, dependencies } = adapters();
  const result = await run(ARGS, ENV, () => dependencies);
  assert.deepEqual(result, { created: COUNTS, counts: COUNTS });
  assert.deepEqual(calls, ['connect', 'administrator', 'install', 'disconnect']);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('an existing active administrator is mandatory; no account creation fallback exists', async () => {
  const { calls, dependencies } = adapters({ oldestAdministrator: async () => null });
  await assert.rejects(run(ARGS, ENV, () => dependencies), /administrator/);
  assert.deepEqual(calls, ['connect', 'disconnect']);
});

test('installer failures disconnect and are safe to report without driver secrets', async () => {
  const { calls, dependencies } = adapters({ install: async () => { throw new Error('mongodb://private-user:private-password@private-host/db'); } });
  let error;
  try { await run(ARGS, ENV, () => dependencies); } catch (failure) { error = failure; }
  assert.ok(error);
  assert.equal(calls.at(-1), 'disconnect');
  const message = failureMessage(error);
  assert.equal(message.includes('private-password'), false);
  assert.equal(message.includes('private-user'), false);
});

test('connection failures still disconnect and fail rather than claiming installation success', async () => {
  const { calls, dependencies } = adapters({ connectDb: async () => { calls.push('connect-failed'); throw new Error('driver error'); } });
  await assert.rejects(run(ARGS, ENV, () => dependencies));
  assert.deepEqual(calls, ['connect-failed', 'disconnect']);
});

test('invalid installer output cannot leak extra fields or report unverified counts', async () => {
  const { calls, dependencies } = adapters({ install: async () => ({ created: { secret: 'private' }, counts: COUNTS }) });
  await assert.rejects(run(ARGS, ENV, () => dependencies), /count/);
  assert.equal(calls.at(-1), 'disconnect');
});
