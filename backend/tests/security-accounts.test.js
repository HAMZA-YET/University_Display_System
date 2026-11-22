'use strict';
const request = require('supertest');
const crypto = require('crypto');
const OTPAuth = require('otpauth');
const { useTestApp } = require('./helpers/testApp');
const { createUser, loginAs, PASSWORD } = require('./helpers/fixtures');
const service = require('../src/modules/security/service');
const delivery = require('../src/modules/security/delivery');
const { ActionToken, SecurityFactor } = require('../src/modules/security/models');
const { digest } = require('../src/modules/security/crypto');
const User = require('../src/modules/users/user.model');
const AuditLog = require('../src/modules/audit/audit.model');
const clock = require('../src/utils/clock');
const ctx = useTestApp();
let messages;
beforeEach(() => {
  ctx.app = require('../src/app').createApp();
  process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  process.env.ACCOUNT_DELIVERY = 'local';
  messages = [];
  jest.spyOn(delivery, 'deliver').mockImplementation(async message => { messages.push(message); });
  clock.set(new Date());
});
afterEach(() => { delete process.env.MFA_ENCRYPTION_KEY; delete process.env.ACCOUNT_DELIVERY; });
const codeFor = secret => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), period: 30, digits: 6 }).generate({ timestamp: clock.now().getTime() });
async function enroll(user) {
  const agent = await loginAs(ctx.app, user);
  const started = await agent.post('/api/security/mfa/enroll').send({ password: PASSWORD });
  expect(started.status).toBe(200);
  const confirmed = await agent.post('/api/security/mfa/confirm').send({ code: codeFor(started.body.data.secret) });
  expect(confirmed.status).toBe(200);
  return { agent, secret: started.body.data.secret, codes: confirmed.body.data.recoveryCodes };
}
test('profile only changes the signed-in name and rejects privilege fields', async () => {
  const user = await createUser('READER'); const agent = await loginAs(ctx.app, user);
  expect((await agent.patch('/api/security/profile').send({ name: 'Changed Name', role: 'ADMIN' })).status).toBe(400);
  expect((await agent.patch('/api/security/profile').send({ name: 'Changed Name' })).body.data.role).toBe('READER');
  expect((await request(ctx.app).patch('/api/security/profile').send({ name: 'Intruder' })).status).toBe(401);
});
test('invitation activation is one-use, expiring, and does not affect existing registrations', async () => {
  const admin = await createUser('ADMIN'); const agent = await loginAs(ctx.app, admin);
  const invited = await agent.post('/api/security/invitations').send({ name: 'Invited Student', email: 'invite@example.edu' });
  expect(invited.status).toBe(201); expect(invited.body.data.role).toBe('READER');
  const body = { token: messages[0].token, password: 'NewPassword123' };
  const results = await Promise.all([1, 2].map(() => request(ctx.app).post('/api/security/activation/complete').send(body)));
  expect(results.map(r => r.status).sort()).toEqual([200, 400]);
  expect((await request(ctx.app).post('/api/auth/login').send({ email: 'invite@example.edu', password: body.password })).status).toBe(200);
  const user = await User.findById(invited.body.data.id).lean();
  expect(user.activationPending).toBe(false);
});
test.each(['expired', 'wrong-purpose', 'suspended'])('recovery denies %s tokens without changing a password', async kind => {
  const user = await createUser('READER');
  const token = await service.issue(user, kind === 'wrong-purpose' ? 'activation' : 'recovery', 30);
  if (kind === 'expired') clock.advance(31 * 60000);
  if (kind === 'suspended') await User.updateOne({ _id: user._id }, { isActive: false });
  expect((await request(ctx.app).post('/api/security/recovery/complete').send({ token, password: 'NewPassword123' })).status).toBe(400);
});
test('recovery acknowledgement is generic, consumes once, revokes JWT and preserves MFA', async () => {
  const user = await createUser('ADMIN'); const factor = await enroll(user);
  const a = await request(ctx.app).post('/api/security/recovery/request').send({ email: user.email });
  const b = await request(ctx.app).post('/api/security/recovery/request').send({ email: 'absent@example.edu' });
  expect(a.body).toEqual(b.body); expect(messages).toHaveLength(1);
  expect((await ActionToken.findOne({ purpose: 'recovery' }).lean()).digest).toBe(digest(messages[0].token));
  const body = { token: messages[0].token, password: 'ChangedPassword123' };
  expect((await request(ctx.app).post('/api/security/recovery/complete').send(body)).status).toBe(200);
  expect((await request(ctx.app).post('/api/security/recovery/complete').send(body)).status).toBe(400);
  expect((await factor.agent.get('/api/auth/me')).status).toBe(401);
  const next = await request(ctx.app).post('/api/auth/login').send({ email: user.email, password: body.password });
  expect(next.body).toEqual({ data: { mfaRequired: true } });
});
test('delivery failures do not leak a usable token through HTTP', async () => {
  const user = await createUser('READER');
  delivery.deliver.mockRejectedValue(new Error('Private provider failure'));
  const res = await request(ctx.app).post('/api/security/recovery/request').send({ email: user.email });
  expect(res.status).toBe(503); expect(await ActionToken.countDocuments()).toBe(0);
  expect(JSON.stringify(res.body)).not.toContain('Private provider');
});
test('MFA requires password and confirmation, encrypts secrets, gates protected routes and rejects replay', async () => {
  const user = await createUser('ADMIN'); const old = await loginAs(ctx.app, user);
  expect((await old.post('/api/security/mfa/enroll').send({ password: 'WrongPassword' })).status).toBe(401);
  const factor = await enroll(user);
  const stored = await SecurityFactor.findOne().select('+encryptedSecret +recoveryHashes').lean();
  expect(stored.encryptedSecret).not.toContain(factor.secret);
  expect(stored.recoveryHashes).not.toContain(factor.codes[0]);
  expect((await old.get('/api/auth/me')).status).toBe(401);
  const agent = request.agent(ctx.app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD })).body.data.mfaRequired).toBe(true);
  expect((await agent.get('/api/users')).status).toBe(401);
  expect((await agent.post('/api/security/mfa/verify').send({ code: codeFor(factor.secret) })).status).toBe(400);
  clock.advance(30000);
  expect((await agent.post('/api/security/mfa/verify').send({ code: codeFor(factor.secret) })).status).toBe(200);
  expect((await agent.get('/api/users')).status).toBe(200);
  expect((await agent.post('/api/security/mfa/verify').send({ code: codeFor(factor.secret) })).status).toBe(400);
  const auditText = JSON.stringify(await AuditLog.find().lean());
  expect(auditText).not.toContain(factor.secret); expect(auditText).not.toContain(factor.codes[0]);
});
test('MFA recovery code is single-use across concurrent challenges and revokes earlier JWTs', async () => {
  const user = await createUser('ADMIN'); const factor = await enroll(user);
  const agents = [request.agent(ctx.app), request.agent(ctx.app)];
  for (const agent of agents) await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  const results = await Promise.all(agents.map(agent => agent.post('/api/security/mfa/verify').send({ code: factor.codes[0] })));
  expect(results.map(r => r.status).sort()).toEqual([200, 400]);
  expect((await factor.agent.get('/api/auth/me')).status).toBe(401);
  expect((await User.findById(user._id)).mfaEnabled).toBe(true);
});
test('MFA challenge attempt budget and expiry are enforced', async () => {
  const user = await createUser('ADMIN'); const factor = await enroll(user);
  const agent = request.agent(ctx.app);
  await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  for (let i = 0; i < 5; i++) expect((await agent.post('/api/security/mfa/verify').send({ code: 'invalid' })).status).toBe(400);
  expect((await agent.post('/api/security/mfa/verify').send({ code: factor.codes[0] })).status).toBe(400);
  await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  clock.advance(6 * 60000);
  expect((await agent.post('/api/security/mfa/verify').send({ code: factor.codes[0] })).status).toBe(400);
});
test('suspension blocks pending MFA, old JWTs, recovery and administrator self-change', async () => {
  const admin = await createUser('ADMIN'); const operator = await loginAs(ctx.app, admin);
  expect((await operator.patch('/api/users/' + admin._id + '/status').send({ isActive: false })).status).toBe(403);
  const user = await createUser('AUTHOR'); const factor = await enroll(user);
  const pending = request.agent(ctx.app); await pending.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  expect((await operator.patch('/api/users/' + user._id + '/status').send({ isActive: false })).status).toBe(200);
  expect((await pending.post('/api/security/mfa/verify').send({ code: factor.codes[0] })).status).toBe(400);
  expect((await factor.agent.get('/api/auth/me')).status).toBe(401);
  expect((await request(ctx.app).post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(403);
});

test('copied JWT is revoked after logout without revoking a second login', async () => {
  const user = await createUser('READER');
  const first = await request(ctx.app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  const second = await request(ctx.app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  const cookie = first.headers['set-cookie'][0].split(';')[0];
  expect((await request(ctx.app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(200);
  expect((await request(ctx.app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  expect((await request(ctx.app).get('/api/auth/me').set('Cookie', second.headers['set-cookie'][0].split(';')[0])).status).toBe(200);
});
test('privileged MFA rollout denies staff tools while allowing enrollment', async () => {
  process.env.REQUIRE_PRIVILEGED_MFA = 'true';
  const { resetEnvCache } = require('../src/config/env'); resetEnvCache();
  try {
    const user = await createUser('ADMIN'); const agent = await loginAs(ctx.app, user);
    const denied = await agent.get('/api/users'); expect(denied.status).toBe(403); expect(denied.body.error.code).toBe('MFA_ENROLLMENT_REQUIRED');
    const enrolled = await enroll(user); expect((await enrolled.agent.get('/api/users')).status).toBe(200);
  } finally { delete process.env.REQUIRE_PRIVILEGED_MFA; resetEnvCache(); }
});
test('department updates are admin-only, reject self changes and revoke sessions', async () => {
  const admin = await createUser('ADMIN'); const user = await createUser('AUTHOR');
  const operator = await loginAs(ctx.app, admin); const member = await loginAs(ctx.app, user);
  expect((await member.patch('/api/users/' + user._id + '/department').send({ department: 'BSC' })).status).toBe(403);
  expect((await operator.patch('/api/users/' + admin._id + '/department').send({ department: 'BSC' })).status).toBe(403);
  expect((await operator.patch('/api/users/' + user._id + '/department').send({ department: 'BSC' })).status).toBe(200);
  expect((await member.get('/api/auth/me')).status).toBe(401);
});
test('expired activation links and malformed token values are denied', async () => {
  const user = await createUser('READER', { isActive: false });
  await User.updateOne({ _id: user._id }, { activationPending: true });
  const token = await service.issue(user, 'activation', 1); clock.advance(2 * 60000);
  expect((await request(ctx.app).post('/api/security/activation/complete').send({ token, password: 'NewPassword123' })).status).toBe(400);
  expect((await request(ctx.app).post('/api/security/recovery/complete').send({ token: { $ne: null }, password: 'NewPassword123' })).status).toBe(400);
});
test('actual local delivery writes a private message and token can be consumed', async () => {
  const fs = require('fs/promises'); const path = require('path');
  delivery.deliver.mockRestore();
  const directory = path.resolve(__dirname, '../.local/messages');
  const before = new Set(await fs.readdir(directory).catch(() => []));
  const user = await createUser('READER');
  let created = [];
  try {
    expect((await request(ctx.app).post('/api/security/recovery/request').send({ email: user.email })).status).toBe(200);
    created = (await fs.readdir(directory)).filter(name => !before.has(name)); expect(created).toHaveLength(1);
    const message = JSON.parse(await fs.readFile(path.join(directory, created[0]), 'utf8'));
    expect(message.email).toBe(user.email);
    expect((await request(ctx.app).post('/api/security/recovery/complete').send({ token: message.token, password: 'NewPassword123' })).status).toBe(200);
  } finally { for (const name of created) await fs.unlink(path.join(directory, name)); }
});

test('new account mutations reject foreign browser origins but accept configured local origin', async () => {
  const user = await createUser('READER'); const agent = await loginAs(ctx.app, user);
  expect((await agent.patch('/api/security/profile').set('Origin', 'https://untrusted.example').send({ name: 'Changed Name' })).status).toBe(403);
  expect((await agent.patch('/api/security/profile').set('Origin', 'http://127.0.0.1:5173').send({ name: 'Changed Name' })).status).toBe(200);
  expect((await agent.patch('/api/security/profile').set('Origin', 'http://localhost:9999').send({ name: 'Changed Again' })).status).toBe(403);
});

test('expired JWTs are rejected before resolving a protected account', async () => {
  const user = await createUser('READER');
  const token = require('jsonwebtoken').sign({ sub: String(user._id), tv: user.tokenVersion }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: -1 });
  expect((await request(ctx.app).get('/api/auth/me').set('Cookie', 'uids_token=' + token)).status).toBe(401);
});
test('new security rate limit keeps the standard API error envelope', async () => {
  for (let i = 0; i < 30; i++) expect((await request(ctx.app).post('/api/security/recovery/request').send({})).status).toBe(400);
  const response = await request(ctx.app).post('/api/security/recovery/request').send({});
  expect(response.status).toBe(429); expect(response.body.error.code).toBe('RATE_LIMITED');
});
