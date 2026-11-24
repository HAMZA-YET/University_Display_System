'use strict';
// TEST HARNESS ONLY. Fresh replica set + synthetic fixtures; never external databases.
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
for (const key of ['MONGO_URI', 'MONGODB_URI', 'MONGO_TEST_URI', 'JWT_SECRET', 'BOOTSTRAP_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'VERCEL', 'VERCEL_OIDC_TOKEN', 'MFA_ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY', 'ACCOUNT_DELIVERY', 'RESEND_API_KEY', 'ACCOUNT_MESSAGE_FROM', 'REQUIRE_PRIVILEGED_MFA']) delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: crypto.randomBytes(48).toString('hex'), JWT_EXPIRES_IN: '1h', BCRYPT_ROUNDS: '4', CLIENT_ORIGIN: 'http://127.0.0.1:5187', ENABLE_STATUS_SYNC: 'false', AUTH_LOGIN_RATE_LIMIT: '1000', AUTH_RATE_LIMIT: '10000', ATTACHMENT_STORAGE: 'local', MONGOMS_DOWNLOAD_DIR: path.join(root, 'node_modules/.cache/mongodb-binaries'), MONGOMS_RESUME_DOWNLOAD: 'true' });
process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
let repl, server, filesRoot;
async function stop() {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (repl) await repl.stop();
  if (filesRoot && path.basename(filesRoot).startsWith('uids-isolated-preview-')) await fs.rm(filesRoot, { recursive: true, force: true });
}
async function main() {
  filesRoot = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'uids-isolated-preview-'));
  process.env.UPLOAD_DIR = path.join(filesRoot, 'notices');
  process.env.EVIDENCE_STORAGE_ROOT = path.join(filesRoot, 'evidence');
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
  // Keep domain time aligned with MongoDB's real TTL clock for MFA challenges.
  clock.reset();
  const F = require('../../backend/tests/helpers/fixtures');
  const reader = await F.createUserAndLogin(app, 'READER', { email: 'member4.reader@kdu-uids.test', name: 'Fictional Member Four' });
  await F.createUserAndLogin(app, 'READER', { email: 'member4.other@kdu-uids.test', name: 'Fictional Other Member' });
  const author = await F.createUserAndLogin(app, 'AUTHOR');
  const reviewer = await F.createUserAndLogin(app, 'REVIEWER');
  const admin = await F.createUserAndLogin(app, 'ADMIN', { email: 'member3.admin@kdu-uids.test', name: 'Fictional Lost Found Admin' });
  const professor = await admin.agent.post('/api/professors').send({
    name: 'Fictional Learning Professor (Demo)', titlePrefix: 'Dr.', department: 'AI',
    position: 'ASSISTANT_PROFESSOR', officeRoom: 'TEST', officeBuilding: 'Fictional test building',
    email: 'fictional.professor@kdu-uids.test', subjects: ['Fictional Machine Learning'], counsellingHours: [],
  });
  if (professor.status !== 201) throw Error('Synthetic professor fixture creation failed');
  const mfaReader = await F.createUserAndLogin(app, 'READER', { email: 'member4.mfa@kdu-uids.test', name: 'Fictional MFA Member' });
  const enrollment = await mfaReader.agent.post('/api/security/mfa/enroll').send({ password: F.PASSWORD });
  if (enrollment.status !== 200) throw Error('Synthetic MFA enrollment failed');
  const OTPAuth = require('otpauth');
  const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(enrollment.body.data.secret), period: 30, digits: 6 }).generate({ timestamp: clock.now().getTime() });
  const confirmed = await mfaReader.agent.post('/api/security/mfa/confirm').send({ code });
  if (confirmed.status !== 200) throw Error('Synthetic MFA confirmation failed');
  await reader.agent.post('/api/member-tools/follows').send({ kind: 'category', target: 'EXAM' });
  const common = { summary: 'Fictional integration test record. Not real university information.', body: 'This is fictional local test content. No university event or requirement is established.' };
  const publicNotice = await F.createApproved(author.agent, reviewer.agent, { ...common, title: '[Sample] Integration exam' });
  const campusNotice = await F.createApproved(author.agent, reviewer.agent, { ...common, title: '[Sample] Campus-only integration', visibility: 'CAMPUS', audience: 'ALL' });
  const withdrawn = await F.createApproved(author.agent, reviewer.agent, { ...common, title: '[Sample] Withdrawn integration' });
  await require('../../backend/src/modules/notices/notice.model').updateOne({ _id: withdrawn.id }, { $set: { status: 'WITHDRAWN' } });
  const draft = await author.agent.post('/api/notices').send(F.completeNotice({ ...common, title: '[Sample] Private draft sentinel' }));
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(publicNotice.publicationStart)).map(part => [part.type, part.value]));
  const publicationDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  const fixture = { baseURL: 'http://127.0.0.1:5017', publicationDate, publicNoticeId: publicNotice.id, campusNoticeId: campusNotice.id, withdrawnId: withdrawn.id, draftId: draft.body.data.id, readerEmail: 'member4.reader@kdu-uids.test', otherEmail: 'member4.other@kdu-uids.test', adminEmail: admin.user.email, mfaEmail: 'member4.mfa@kdu-uids.test', mfaRecoveryCodes: confirmed.body.data.recoveryCodes, password: F.PASSWORD, fictional: true };
  const output = path.join(root, 'node_modules/.cache/member4-e2e-fixtures.json');
  await fs.writeFile(output, JSON.stringify(fixture, null, 2), { mode: 0o600 });
  server = await new Promise((resolve, reject) => { const listener = app.listen(5017, '127.0.0.1', () => resolve(listener)); listener.on('error', reject); });
  console.log('ISOLATED_TEST_PREVIEW_READY ' + output);
}
process.on('SIGINT', () => stop().finally(() => process.exit(0)));
process.on('SIGTERM', () => stop().finally(() => process.exit(0)));
main().catch(async (error) => { console.error(error.message); await stop(); process.exit(1); });
