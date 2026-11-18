'use strict';

const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const User = require('../src/modules/users/user.model');
const SetupState = require('../src/modules/setup/setupState.model');
const AuditLog = require('../src/modules/audit/audit.model');
const audit = require('../src/modules/audit/audit.service');
const { resetEnvCache } = require('../src/config/env');

const ctx = useTestApp();
const TOKEN = 'test-only-one-time-token-that-is-longer-than-32-characters';
const originalToken = process.env.BOOTSTRAP_TOKEN;
beforeEach(() => {
  process.env.BOOTSTRAP_TOKEN = TOKEN;
  resetEnvCache();
});
afterEach(() => {
  if (originalToken === undefined) delete process.env.BOOTSTRAP_TOKEN;
  else process.env.BOOTSTRAP_TOKEN = originalToken;
  resetEnvCache();
});

const promote = (agent, token = TOKEN) => agent.post('/api/setup/administrator').set('x-bootstrap-token', token).send({});

test('public setup status exposes only configuration and administrator-existence flags', async () => {
  const configured = await request(ctx.app).get('/api/setup/status');
  expect(configured.status).toBe(200);
  expect(configured.body).toEqual({ data: { bootstrapConfigured: true, administratorExists: false } });
  expect(configured.headers['cache-control']).toBe('private, no-store');
  expect(JSON.stringify(configured.body)).not.toContain(TOKEN);
  delete process.env.BOOTSTRAP_TOKEN;
  resetEnvCache();
  const unset = await request(ctx.app).get('/api/setup/status');
  expect(unset.body.data).toEqual({ bootstrapConfigured: false, administratorExists: false });
});

test('setup requires a real authenticated reader and the correct one-time token', async () => {
  expect((await promote(request(ctx.app))).status).toBe(401);
  const reader = await F.createUserAndLogin(ctx.app, 'READER');
  const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
  expect((await promote(author.agent)).status).toBe(403);
  const incorrect = await promote(reader.agent, 'wrong-token');
  expect(incorrect.status).toBe(403);
  expect(incorrect.body.error.code).toBe('FORBIDDEN');
  expect((await reader.agent.post('/api/setup/administrator').send({})).status).toBe(403);
  expect(await User.countDocuments({ role: 'ADMIN' })).toBe(0);
  expect(await SetupState.countDocuments()).toBe(0);
});

test('an unset token leaves setup unavailable in every environment', async () => {
  const reader = await F.createUserAndLogin(ctx.app, 'READER');
  delete process.env.BOOTSTRAP_TOKEN;
  resetEnvCache();
  const response = await promote(reader.agent);
  expect(response.status).toBe(503);
  expect(response.body.error.code).toBe('SETUP_UNAVAILABLE');
  expect(await User.countDocuments({ role: 'ADMIN' })).toBe(0);
});

test('successful setup promotes only the current reader and rotates their session', async () => {
  const reader = await F.createUserAndLogin(ctx.app, 'READER');
  const other = await F.createUser('READER');
  const login = await reader.agent.post('/api/auth/login').send({ email: reader.user.email, password: F.PASSWORD });
  const oldCookie = login.headers['set-cookie'][0].split(';')[0];
  const response = await promote(reader.agent);
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({ id: String(reader.user._id), role: 'ADMIN', email: reader.user.email });
  expect(response.body.data.passwordHash).toBeUndefined();
  expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  expect((await reader.agent.get('/api/auth/me')).body.data.role).toBe('ADMIN');
  expect((await request(ctx.app).get('/api/auth/me').set('Cookie', oldCookie)).status).toBe(401);
  expect((await User.findById(reader.user._id).lean()).tokenVersion).toBe(1);
  expect((await User.findById(other._id).lean()).role).toBe('READER');
  expect(await SetupState.countDocuments()).toBe(1);
  expect(await AuditLog.countDocuments({ action: 'INITIAL_ADMINISTRATOR_CREATED', entityId: String(reader.user._id) })).toBe(1);
  const status = await request(ctx.app).get('/api/setup/status');
  expect(status.body.data).toEqual({ bootstrapConfigured: false, administratorExists: true });
});

test('an existing administrator permanently disables browser setup', async () => {
  await F.createUser('ADMIN');
  const reader = await F.createUserAndLogin(ctx.app, 'READER');
  const response = await promote(reader.agent);
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('SETUP_COMPLETE');
  expect((await User.findById(reader.user._id).lean()).role).toBe('READER');
  expect(await SetupState.countDocuments()).toBe(0);
});

test('setup rejects supplied account ids, roles and email addresses', async () => {
  const reader = await F.createUserAndLogin(ctx.app, 'READER');
  const other = await F.createUser('READER');
  const response = await reader.agent.post('/api/setup/administrator').set('x-bootstrap-token', TOKEN)
    .send({ id: String(other._id), role: 'ADMIN', email: other.email });
  expect(response.status).toBe(400);
  expect(await User.countDocuments({ role: 'ADMIN' })).toBe(0);
});

test('simultaneous valid setup attempts create exactly one administrator and one claim', async () => {
  const first = await F.createUserAndLogin(ctx.app, 'READER');
  const second = await F.createUserAndLogin(ctx.app, 'READER');
  const responses = await Promise.all([promote(first.agent), promote(second.agent)]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(responses.find((r) => r.status === 409).body.error.code).toBe('SETUP_COMPLETE');
  expect(await User.countDocuments({ role: 'ADMIN' })).toBe(1);
  expect(await SetupState.countDocuments()).toBe(1);
  expect(await AuditLog.countDocuments({ action: 'INITIAL_ADMINISTRATOR_CREATED' })).toBe(1);
});

test('a failed audit write rolls back the role, session version and singleton claim', async () => {
  const reader = await F.createUserAndLogin(ctx.app, 'READER');
  const failure = jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('forced audit failure'));
  const failed = await promote(reader.agent);
  expect(failed.status).toBe(500);
  expect(await SetupState.countDocuments()).toBe(0);
  expect((await User.findById(reader.user._id).lean())).toMatchObject({ role: 'READER', tokenVersion: 0 });
  failure.mockRestore();
  expect((await promote(reader.agent)).status).toBe(200);
});
