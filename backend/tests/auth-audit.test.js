'use strict';

const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const { createUser, PASSWORD } = require('./helpers/fixtures');
const AuditLog = require('../src/modules/audit/audit.model');
const authenticate = require('../src/middleware/authenticate');
const User = require('../src/modules/users/user.model');
const logger = require('../src/utils/logger');
const { signToken } = require('../src/modules/auth/token');

const ctx = useTestApp();

async function login(user) {
  return request(ctx.app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
}

test('successful login keeps response and cookie contract and records the actor', async () => {
  const user = await createUser('AUTHOR');
  const res = await login(user);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ data: {
    id: String(user._id), name: user.name, email: user.email, role: 'AUTHOR', department: null,
  } });
  const cookie = res.headers['set-cookie'][0];
  expect(cookie).toMatch(/HttpOnly/);
  expect(cookie).toMatch(/SameSite=Strict/);
  expect((await request(ctx.app).get('/api/auth/me').set('Cookie', cookie.split(';')[0])).status).toBe(200);
  const events = await AuditLog.find().lean();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ action: 'LOGIN_SUCCESS', actorRole: 'AUTHOR', entityType: 'USER', entityId: String(user._id) });
  expect(String(events[0].actor)).toBe(String(user._id));
  expect(events[0].timestamp).toBeInstanceOf(Date);
  expect(events[0].requestId).toBe(res.headers['x-request-id']);
  expect(JSON.stringify(events)).not.toContain(PASSWORD);
  expect(JSON.stringify(events)).not.toContain(cookie.split(';')[0].split('=')[1]);
});

test.each(['wrong-password', 'unknown-user', 'inactive-user'])('failed login records no trusted identity: %s', async (kind) => {
  const user = await createUser('READER', { isActive: kind !== 'inactive-user' });
  const res = await request(ctx.app).post('/api/auth/login').send({
    email: kind === 'unknown-user' ? 'unknown@example.edu' : user.email,
    password: kind === 'wrong-password' ? 'WrongPassword123' : PASSWORD,
  });
  expect(res.status).toBe(kind === 'inactive-user' ? 403 : 401);
  expect(res.body.error.code).toBe(kind === 'inactive-user' ? 'FORBIDDEN' : 'UNAUTHENTICATED');
  expect(res.headers['set-cookie']).toBeUndefined();
  const events = await AuditLog.find().lean();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ action: 'LOGIN_FAILED', actor: null, actorRole: null, entityId: null, reason: null });
  expect(JSON.stringify(events)).not.toContain(user.email);
  expect(JSON.stringify(events)).not.toContain(PASSWORD);
  expect(JSON.stringify(events)).not.toContain('WrongPassword123');
});

test('logout records verified actor, clears cookie and keeps logout/me responses', async () => {
  const user = await createUser('READER');
  const agent = request.agent(ctx.app);
  await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  const res = await agent.post('/api/auth/logout');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ data: { loggedOut: true } });
  expect(res.headers['set-cookie'][0]).toMatch(/uids_token=;/);
  expect((await agent.get('/api/auth/me')).status).toBe(401);
  const event = await AuditLog.findOne({ action: 'LOGOUT' }).lean();
  expect(String(event.actor)).toBe(String(user._id));
  expect(event.entityId).toBe(String(user._id));
});

test.each(['missing', 'invalid', 'revoked', 'inactive'])('logout remains successful with %s authentication', async (kind) => {
  const user = await createUser('READER');
  const token = signToken(user);
  if (kind === 'revoked') await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  if (kind === 'inactive') await User.updateOne({ _id: user._id }, { isActive: false });
  let req = request(ctx.app).post('/api/auth/logout');
  if (kind !== 'missing') req = req.set('Cookie', `uids_token=${kind === 'invalid' ? 'invalid-token' : token}`);
  const res = await req;
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ data: { loggedOut: true } });
  expect(res.headers['set-cookie'][0]).toMatch(/uids_token=;/);
  expect(await AuditLog.findOne({ action: 'LOGOUT' }).lean()).toMatchObject({ actor: null, actorRole: null, entityId: null });
});

test('logout ignores secret-bearing input fields and headers in its audit payload', async () => {
  const secrets = ['password-marker', 'token-marker', 'mfa-marker', 'recovery-marker', 'cookie-marker'];
  await request(ctx.app).post('/api/auth/logout')
    .set('Authorization', `Bearer ${secrets[1]}`).set('Cookie', `uids_token=${secrets[4]}`)
    .send({ password: secrets[0], token: secrets[1], mfaSecret: secrets[2], recoveryCodes: [secrets[3]] });
  const events = await AuditLog.find().lean();
  expect(events).toHaveLength(1);
  for (const secret of secrets) expect(JSON.stringify(events)).not.toContain(secret);
  expect(Object.keys(events[0]).sort()).toEqual([
    '__v', '_id', 'action', 'actor', 'actorRole', 'createdAt', 'entityId', 'entityType', 'fromStatus', 'ip',
    'reason', 'requestId', 'timestamp', 'toStatus', 'updatedAt',
  ].sort());
});

test('audit persistence failure does not change successful/failed login or logout', async () => {
  const user = await createUser('READER');
  jest.spyOn(AuditLog, 'create').mockRejectedValue(new Error('Audit unavailable'));
  jest.spyOn(logger, 'warn').mockImplementation(() => {});
  expect((await login(user)).status).toBe(200);
  expect((await request(ctx.app).post('/api/auth/login').send({ email: user.email, password: 'Wrong123' })).status).toBe(401);
  const res = await request(ctx.app).post('/api/auth/logout');
  expect(res.status).toBe(200);
  expect(res.headers['set-cookie'][0]).toMatch(/uids_token=;/);
});

test('logout still clears cookie when audit actor lookup fails', async () => {
  jest.spyOn(authenticate, 'resolveUser').mockRejectedValue(new Error('Lookup unavailable'));
  const res = await request(ctx.app).post('/api/auth/logout');
  expect(res.status).toBe(200);
  expect(res.headers['set-cookie'][0]).toMatch(/uids_token=;/);
  expect(await AuditLog.findOne({ action: 'LOGOUT' }).lean()).toMatchObject({ actor: null });
});

test('authentication audit records remain restricted to administrators', async () => {
  const reader = await createUser('READER');
  const admin = await createUser('ADMIN');
  expect((await request(ctx.app).get('/api/audit-logs')).status).toBe(401);
  const readerLogin = await login(reader);
  expect((await request(ctx.app).get('/api/audit-logs').set('Cookie', readerLogin.headers['set-cookie'][0].split(';')[0])).status).toBe(403);
  const adminLogin = await login(admin);
  const res = await request(ctx.app).get('/api/audit-logs?action=LOGIN_SUCCESS').set('Cookie', adminLogin.headers['set-cookie'][0].split(';')[0]);
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(2);
});
