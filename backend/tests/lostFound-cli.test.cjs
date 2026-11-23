'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runCleanupCommand } = require('../scripts/lostFoundCleanup');

function harness() {
  const calls = [];
  return {
    calls,
    dependencies: {
      mongoUri: 'mongodb://127.0.0.1:27017/unused_synthetic_cli_test',
      connect: async () => calls.push('connected'),
      disconnect: async () => calls.push('disconnected'),
      cleanup: async options => { calls.push(options); return { ...options, claims: 2 }; },
      exclusive: async (action, work) => { calls.push(action); return work(); },
    },
  };
}
test('retention CLI defaults to a read-only report', async () => {
  const { calls, dependencies } = harness();
  assert.deepEqual(await runCleanupCommand([], dependencies), { dryRun: true, claims: 2 });
  assert.deepEqual(calls, ['connected', { dryRun: true }, 'disconnected']);
});
test('retention CLI refuses unconfirmed changes before connecting', async () => {
  const { calls, dependencies } = harness();
  await assert.rejects(runCleanupCommand(['--apply'], dependencies), /confirm-stopped/);
  await assert.rejects(runCleanupCommand(['--unknown'], dependencies), /Unknown/);
  assert.deepEqual(calls, []);
});
test('confirmed retention changes use the shared maintenance lock', async () => {
  const { calls, dependencies } = harness();
  assert.deepEqual(await runCleanupCommand(['--apply', '--confirm-stopped'], dependencies), { dryRun: false, claims: 2 });
  assert.deepEqual(calls, ['connected', 'LOST_FOUND_RETENTION', { dryRun: false }, 'disconnected']);
});
test('retention CLI disconnects when cleanup fails', async () => {
  const { calls, dependencies } = harness();
  dependencies.cleanup = async () => { throw new Error('Synthetic failure'); };
  await assert.rejects(runCleanupCommand([], dependencies), /Synthetic failure/);
  assert.deepEqual(calls, ['connected', 'disconnected']);
});
