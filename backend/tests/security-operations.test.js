'use strict';
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const { createUser, loginAs } = require('./helpers/fixtures');
const ops = require('../src/modules/security/operations');
const { ActionToken } = require('../src/modules/security/models');
const { issue } = require('../src/modules/security/service');
const { Evidence, root } = require('../src/modules/security/evidence');
const clock = require('../src/utils/clock');
const ctx = useTestApp();
let tempRoot, temp, restored, evidenceId;
beforeEach(async () => {
  tempRoot = await fs.realpath(os.tmpdir());
  temp = await fs.mkdtemp(path.join(tempRoot, 'uids-security-'));
  process.env.BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
});
afterEach(async () => {
  delete process.env.BACKUP_ENCRYPTION_KEY;
  if (restored) { await restored.dropDatabase(); await restored.close(); restored = null; }
  if (evidenceId) { await fs.unlink(path.join(root, evidenceId)).catch(() => {}); evidenceId = null; }
  if (temp && path.dirname(temp) === tempRoot && path.basename(temp).startsWith('uids-security-')) await fs.rm(temp, { recursive: true, force: true });
});
test('operations diagnostics require administrator and do not expose keys or database URI', async () => {
  expect((await request(ctx.app).get('/api/operations/status')).status).toBe(401);
  const reader = await loginAs(ctx.app, await createUser('READER'));
  expect((await reader.get('/api/operations/status')).status).toBe(403);
  const admin = await loginAs(ctx.app, await createUser('ADMIN'));
  const res = await admin.get('/api/operations/status'); expect(res.status).toBe(200);
  expect(JSON.stringify(res.body)).not.toContain(process.env.BACKUP_ENCRYPTION_KEY);
  expect(JSON.stringify(res.body)).not.toContain('mongodb://');
});
test('maintenance lock denies API traffic and records job failures without error contents', async () => {
  await ops.exclusive('TEST', async () => {
    expect((await request(ctx.app).get('/api/auth/me')).status).toBe(503);
    await expect(ops.exclusive('OTHER', async () => {})).rejects.toThrow('locked');
  });
  await expect(ops.exclusive('FAILURE_TEST', async () => { throw new Error('secret sentinel'); })).rejects.toThrow();
  const jobs = await mongoose.connection.db.collection('security_jobs').find().toArray();
  expect(jobs.map(x => x.state)).toContain('FAILED'); expect(JSON.stringify(jobs)).not.toContain('secret sentinel');
});
test('cleanup dry-run preserves tokens; apply only removes expired tokens', async () => {
  clock.set(new Date()); const user = await createUser('READER'); await issue(user, 'recovery', 1); await issue(user, 'recovery', 30);
  clock.advance(2 * 60000);
  const dry = await ops.cleanup(); expect(dry.expiredTokens).toBe(1); expect(await ActionToken.countDocuments()).toBe(2);
  const applied = await ops.cleanup({ apply: true }); expect(applied.dryRun).toBe(false); expect(await ActionToken.countDocuments()).toBe(1);
});
test('encrypted backup restores real documents and private bytes into a locked separate target', async () => {
  const user = await createUser('READER'); await issue(user, 'recovery', 30);
  const data = Buffer.from('synthetic private evidence'); evidenceId = crypto.randomBytes(24).toString('hex');
  await fs.mkdir(root, { recursive: true }); await fs.writeFile(path.join(root, evidenceId), data, { flag: 'wx' });
  await Evidence.create({ fileId: evidenceId, caseId: '123456789012345678901234', uploader: user._id, state: 'PRIVATE', size: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') });
  const file = path.join(temp, 'test.uids-backup');
  const backup = await ops.exclusive('BACKUP', () => ops.backup(file)); expect(backup.restoreVerified).toBe(false);
  expect((await fs.readFile(file)).includes(data)).toBe(false);
  const url = new URL(process.env.MONGO_TEST_URI); url.pathname = '/uids_restore_' + crypto.randomBytes(8).toString('hex');
  const target = path.join(temp, 'restored');
  const result = await ops.restore(file, url.toString(), target); expect(result.restoreVerified).toBe(true);
  restored = await mongoose.createConnection(url.toString()).asPromise();
  const account = await restored.db.collection('users').findOne({ _id: user._id });
  expect(account.tokenVersion).toBe(user.tokenVersion + 1); expect(account.email).toBe(user.email);
  expect(await restored.db.collection('actiontokens').countDocuments()).toBe(0);
  expect((await fs.readFile(path.join(target, 'evidence', evidenceId))).equals(data)).toBe(true);
  expect(await restored.db.collection('security_maintenance').findOne({ _id: 'maintenance' })).toMatchObject({ verified: true, action: 'RESTORE_REVIEW_REQUIRED' });
  await expect(ops.restore(file, url.toString(), target)).rejects.toThrow('empty');
  const corrupted = await fs.readFile(file); corrupted[corrupted.length - 1] ^= 1; await fs.writeFile(path.join(temp, 'bad.uids-backup'), corrupted);
  await expect(ops.restore(path.join(temp, 'bad.uids-backup'), url.toString(), target)).rejects.toThrow();
});
(process.platform === 'win32' ? test.skip : test)('restore rejects a symbolic-link target before restoring documents or files', async () => {
  const user = await createUser('READER');
  const file = path.join(temp, 'symlink-check.uids-backup');
  await ops.exclusive('BACKUP', () => ops.backup(file));
  const directory = path.join(temp, 'real-target');
  const link = path.join(temp, 'linked-target');
  await fs.mkdir(directory);
  await fs.symlink(directory, link, 'dir');
  const url = new URL(process.env.MONGO_TEST_URI); url.pathname = '/uids_restore_' + crypto.randomBytes(8).toString('hex');
  restored = await mongoose.createConnection(url.toString()).asPromise();
  await expect(ops.restore(file, url.toString(), link)).rejects.toThrow('Unsafe restore directory');
  expect(await restored.db.listCollections().toArray()).toHaveLength(0);
  expect(await fs.readdir(directory)).toHaveLength(0);
  expect((await mongoose.connection.db.collection('users').findOne({ _id: user._id })).tokenVersion).toBe(user.tokenVersion);
});
