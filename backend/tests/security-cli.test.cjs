'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const setup = path.resolve(__dirname, '../scripts/security-setup.js');
const ops = path.resolve(__dirname, '../scripts/security-operations.js');
test('security setup generates missing private keys and preserves existing keys without printing them', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uids-setup-check-'));
  try {
    const file = path.join(directory, '.env');
    await fs.writeFile(file, 'MFA_ENCRYPTION_KEY=\nBACKUP_ENCRYPTION_KEY=\nJWT_SECRET=preserve-existing-fixture\n');
    const first = spawnSync(process.execPath, [setup, file], { encoding: 'utf8' }); assert.equal(first.status, 0);
    const text = await fs.readFile(file, 'utf8');
    const keys = [...text.matchAll(/(?:MFA|BACKUP)_ENCRYPTION_KEY=([a-f0-9]{64})/g)].map(match => match[1]);
    assert.equal(keys.length, 2); for (const key of keys) assert.equal(first.stdout.includes(key), false);
    const second = spawnSync(process.execPath, [setup, file], { encoding: 'utf8' }); assert.equal(second.status, 0);
    assert.equal(await fs.readFile(file, 'utf8'), text);
    assert.ok(text.includes('JWT_SECRET=preserve-existing-fixture'));
  } finally { if (directory.startsWith(path.join(os.tmpdir(), 'uids-setup-check-'))) await fs.rm(directory, { recursive: true, force: true }); }
});
test('security setup restricts an existing readable configuration before adding keys', { skip: process.platform === 'win32' }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uids-setup-check-'));
  try {
    const file = path.join(directory, '.env');
    const existingKey = 'a'.repeat(64);
    await fs.writeFile(file, `MFA_ENCRYPTION_KEY=${existingKey}\nBACKUP_ENCRYPTION_KEY=\nJWT_SECRET=preserve-existing-fixture\n`);
    await fs.chmod(file, 0o644);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o644);
    const first = spawnSync(process.execPath, [setup, file], { encoding: 'utf8' });
    assert.equal(first.status, 0);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    const contents = await fs.readFile(file, 'utf8');
    assert.ok(contents.includes(`MFA_ENCRYPTION_KEY=${existingKey}\n`));
    assert.equal(first.stdout.includes(existingKey), false);
    const second = spawnSync(process.execPath, [setup, file], { encoding: 'utf8' });
    assert.equal(second.status, 0);
    assert.equal(await fs.readFile(file, 'utf8'), contents);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  } finally { if (directory.startsWith(path.join(os.tmpdir(), 'uids-setup-check-'))) await fs.rm(directory, { recursive: true, force: true }); }
});
test('security setup rejects a symbolic-link destination without changing its target', { skip: process.platform === 'win32' }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uids-setup-check-'));
  try {
    const target = path.join(directory, 'original.env');
    const file = path.join(directory, '.env');
    const contents = 'MFA_ENCRYPTION_KEY=\nBACKUP_ENCRYPTION_KEY=\n';
    await fs.writeFile(target, contents);
    await fs.chmod(target, 0o644);
    await fs.symlink(target, file);
    const result = spawnSync(process.execPath, [setup, file], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /symbolic link/);
    assert.equal(await fs.readFile(target, 'utf8'), contents);
    assert.equal((await fs.stat(target)).mode & 0o777, 0o644);
  } finally { if (directory.startsWith(path.join(os.tmpdir(), 'uids-setup-check-'))) await fs.rm(directory, { recursive: true, force: true }); }
});
test('operations CLI refuses missing offline confirmation before connecting or restoring', () => {
  const result = spawnSync(process.execPath, [ops, 'restore'], { encoding: 'utf8', env: { ...process.env, MONGO_URI: '', MONGODB_URI: '' } });
  assert.equal(result.status, 1); assert.match(result.stderr, /Operation failed/);
  assert.equal(result.stdout.includes('restoreVerified'), false);
});
