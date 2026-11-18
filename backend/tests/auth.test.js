'use strict';

const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const { createUser, loginAs, PASSWORD } = require('./helpers/fixtures');
const { createApp } = require('../src/app');
const User = require('../src/modules/users/user.model');

const ctx = useTestApp();

describe('AUTH - registration, login, logout, me', () => {
  test('register creates a READER and sets an httpOnly SameSite=Strict cookie', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'New Student', email: 'new.student@kdu-uids.test', password: 'Student123' });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('READER');
    expect(res.body.data.passwordHash).toBeUndefined();
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/uids_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    const stored = await User.findOne({ email: 'new.student@kdu-uids.test' }).select('+passwordHash').lean();
    expect(stored.passwordHash).toMatch(/^\$2b\$/);
    expect(stored.passwordHash).not.toContain('Student123');
  });

  test('register rejects weak passwords and duplicate emails', async () => {
    const weak = await request(ctx.app).post('/api/auth/register').send({ name: 'Weak', email: 'w@kdu-uids.test', password: 'abcdefgh' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
    expect(weak.body.error.details.some((d) => d.field === 'password')).toBe(true);

    await createUser('READER', { email: 'dup@kdu-uids.test' });
    const dup = await request(ctx.app).post('/api/auth/register').send({ name: 'Dup', email: 'dup@kdu-uids.test', password: 'Strong123' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE');
  });

  test('register and login reject passwords that bcrypt would silently truncate', async () => {
    const password = `${'a'.repeat(71)}1`;
    const agent = request.agent(ctx.app);
    const registered = await agent.post('/api/auth/register').send({ name: 'Long Password Student', email: 'long@example.edu', password });
    expect(registered.status).toBe(201);
    const truncated = await agent.post('/api/auth/login').send({ email: 'long@example.edu', password: `${password}incorrect-suffix` });
    expect(truncated.status).toBe(400);
    const correct = await agent.post('/api/auth/login').send({ email: 'long@example.edu', password });
    expect(correct.status).toBe(200);
  });

  test('login, me and logout', async () => {
    const user = await createUser('AUTHOR');
    const agent = request.agent(ctx.app);
    const bad = await agent.post('/api/auth/login').send({ email: user.email, password: 'Wrong12345' });
    expect(bad.status).toBe(401);
    const ok = await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data.role).toBe('AUTHOR');
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(user.email);
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(200);
    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('role is loaded from the database on every request (role change takes effect immediately)', async () => {
    const user = await createUser('AUTHOR');
    const agent = await loginAs(ctx.app, user);
    expect((await agent.get('/api/notices')).status).toBe(200);
    await User.updateOne({ _id: user._id }, { $set: { role: 'READER' } });
    expect((await agent.get('/api/notices')).status).toBe(403);
  });

  test('admin role change invalidates the old token via tokenVersion', async () => {
    const admin = await createUser('ADMIN');
    const target = await createUser('READER');
    const adminAgent = await loginAs(ctx.app, admin);
    const targetAgent = await loginAs(ctx.app, target);
    const res = await adminAgent.patch(`/api/users/${target._id}/role`).send({ role: 'AUTHOR' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('AUTHOR');
    expect((await targetAgent.get('/api/auth/me')).status).toBe(401);
  });

  test('deactivated users cannot log in', async () => {
    const user = await createUser('READER', { isActive: false });
    const res = await request(ctx.app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(403);
  });

  test('login is rate limited to 5 attempts per minute per IP and email', async () => {
    const limitedApp = createApp({ loginRateLimit: 5 });
    const user = await createUser('READER');
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(limitedApp).post('/api/auth/login').send({ email: user.email, password: 'Wrong12345' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
