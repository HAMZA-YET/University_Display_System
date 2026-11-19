'use strict';
// TEST HARNESS ONLY. Fresh replica set + synthetic fixtures; never external databases.
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
for (const key of ['MONGO_URI', 'MONGODB_URI', 'MONGO_TEST_URI', 'JWT_SECRET', 'BOOTSTRAP_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'VERCEL']) delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: crypto.randomBytes(48).toString('hex'), JWT_EXPIRES_IN: '1h', BCRYPT_ROUNDS: '4', CLIENT_ORIGIN: 'http://127.0.0.1:5186', ENABLE_STATUS_SYNC: 'false', AUTH_LOGIN_RATE_LIMIT: '1000', AUTH_RATE_LIMIT: '10000', ATTACHMENT_STORAGE: 'disabled', MONGOMS_DOWNLOAD_DIR: path.join(root, 'node_modules/.cache/mongodb-binaries'), MONGOMS_RESUME_DOWNLOAD: 'true', UPLOAD_DIR: path.join(os.tmpdir(), 'uids-member4-test-only') });
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
let repl, server;
async function stop() { if (server) await new Promise((resolve) => server.close(resolve)); await mongoose.disconnect(); if (repl) await repl.stop(); }
async function main() {
  repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' } });
  const db = 'uids_member4_e2e_' + crypto.randomBytes(6).toString('hex');
  process.env.MONGO_URI = repl.getUri(db);
  if (!/^mongodb:\/\/127\.0\.0\.1:/.test(process.env.MONGO_URI)) throw Error('Test database must be loopback');
  const { createApp } = require('../../backend/src/app');
  const app = createApp();
  await mongoose.connect(process.env.MONGO_URI);
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  await require('../../backend/src/modules/departments/department.service').ensureDefaultDepartments();
  const clock = require('../../backend/src/utils/clock');
  clock.set(new Date('2026-11-19T01:00:00Z'));
  const F = require('../../backend/tests/helpers/fixtures');
  const reader = await F.createUserAndLogin(app, 'READER', { email: 'member4.reader@kdu-uids.test', name: 'Fictional Member Four' });
  await F.createUserAndLogin(app, 'READER', { email: 'member4.other@kdu-uids.test', name: 'Fictional Other Member' });
  const author = await F.createUserAndLogin(app, 'AUTHOR');
  const reviewer = await F.createUserAndLogin(app, 'REVIEWER');
  await reader.agent.post('/api/member-tools/follows').send({ kind: 'category', target: 'EXAM' });
  clock.advance(1000);
  const common = { summary: 'Fictional integration test record. Not real university information.', body: 'This is fictional local test content. No university event or requirement is established.' };
  const publicNotice = await F.createApproved(author.agent, reviewer.agent, { ...common, title: '[Sample] Integration exam' });
  const campusNotice = await F.createApproved(author.agent, reviewer.agent, { ...common, title: '[Sample] Campus-only integration', visibility: 'CAMPUS' });
  const withdrawn = await F.createApproved(author.agent, reviewer.agent, { ...common, title: '[Sample] Withdrawn integration' });
  await require('../../backend/src/modules/notices/notice.model').updateOne({ _id: withdrawn.id }, { $set: { status: 'WITHDRAWN' } });
  const draft = await author.agent.post('/api/notices').send(F.completeNotice({ ...common, title: '[Sample] Private draft sentinel' }));
  const fixture = { baseURL: 'http://127.0.0.1:5000', publicNoticeId: publicNotice.id, campusNoticeId: campusNotice.id, withdrawnId: withdrawn.id, draftId: draft.body.data.id, readerEmail: 'member4.reader@kdu-uids.test', otherEmail: 'member4.other@kdu-uids.test', password: F.PASSWORD, fictional: true };
  const output = path.join(root, 'node_modules/.cache/member4-e2e-fixtures.json');
  await fs.writeFile(output, JSON.stringify(fixture, null, 2));
  server = await new Promise((resolve, reject) => { const listener = app.listen(5000, '127.0.0.1', () => resolve(listener)); listener.on('error', reject); });
  console.log('ISOLATED_TEST_PREVIEW_READY ' + output);
}
process.on('SIGINT', () => stop().finally(() => process.exit(0)));
process.on('SIGTERM', () => stop().finally(() => process.exit(0)));
main().catch(async (error) => { console.error(error.message); await stop(); process.exit(1); });
