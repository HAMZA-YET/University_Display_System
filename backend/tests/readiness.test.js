'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const { loadEnv, resetEnvCache } = require('../src/config/env');
const { getGateway } = require('../src/modules/attachments/attachmentGateway');
const { registerBody, loginBody } = require('../src/modules/auth/auth.schemas');
const { signToken } = require('../src/modules/auth/token');

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
  resetEnvCache();
  jest.restoreAllMocks();
});

test('unconfigured deployment serves health and explains unavailable data without connecting', async () => {
  delete process.env.MONGO_URI;
  delete process.env.MONGODB_URI;
  delete process.env.JWT_SECRET;
  resetEnvCache();
  const connect = jest.spyOn(mongoose, 'connect');
  const app = createApp();
  const health = await request(app).get('/api/health');
  expect(health.status).toBe(200);
  expect(health.body.data).toMatchObject({ ready: false, status: 'setup_required', database: 'unconfigured' });
  expect(health.body.data.missingConfiguration).toEqual(['MONGO_URI', 'JWT_SECRET']);
  const ready = await request(app).get('/api/ready');
  expect(ready.status).toBe(503);
  const data = await request(app).get('/api/public/notices');
  expect(data.status).toBe(503);
  expect(data.body.error.code).toBe('SETUP_REQUIRED');
  expect(connect).not.toHaveBeenCalled();
});

test('MongoDB connection failures return a retryable 503 and never expose credentials', async () => {
  const secret = 'private-runtime-secret-that-is-at-least-32-characters';
  const uri = 'mongodb://private-user:private-password@database.invalid/university';
  process.env.JWT_SECRET = secret;
  process.env.MONGO_URI = uri;
  resetEnvCache();
  jest.spyOn(mongoose, 'connect').mockRejectedValue(new Error(`Could not connect to ${uri}`));
  const app = createApp();
  const health = await request(app).get('/api/health');
  expect(health.status).toBe(200);
  expect(health.body.data).toMatchObject({ ready: false, database: 'unavailable' });
  const data = await request(app).get('/api/professors');
  expect(data.status).toBe(503);
  expect(data.headers['retry-after']).toBe('30');
  expect(data.body.error.code).toBe('DATABASE_UNAVAILABLE');
  for (const response of [health, data]) {
    const text = JSON.stringify(response.body);
    expect(text).not.toContain('private-password');
    expect(text).not.toContain(secret);
    expect(text).not.toContain('stack');
  }
});

test('Vercel attachment adapter refuses ephemeral uploads and downloads', async () => {
  process.env.VERCEL = '1';
  resetEnvCache();
  const gateway = getGateway();
  for (const method of ['upload', 'getMetadata', 'openStream']) {
    await expect(gateway[method]({ buffer: Buffer.from('file') }, {}))
      .rejects.toMatchObject({ status: 503, code: 'ATTACHMENT_STORAGE_UNAVAILABLE' });
  }
});

test('password validation rejects bcrypt byte truncation for registration and login', () => {
  const valid = `${'a'.repeat(71)}1`;
  const tooLong = `${valid}different-password`;
  expect(registerBody.safeParse({ name: 'Student', email: 'student@example.edu', password: valid }).success).toBe(true);
  expect(registerBody.safeParse({ name: 'Student', email: 'student@example.edu', password: tooLong }).success).toBe(false);
  expect(loginBody.safeParse({ email: 'student@example.edu', password: tooLong }).success).toBe(false);
  expect(loginBody.safeParse({ email: 'student@example.edu', password: `${'가'.repeat(24)}1` }).success).toBe(false);
});

test('missing signing secret cannot silently create a session', () => {
  delete process.env.JWT_SECRET;
  resetEnvCache();
  expect(() => signToken({ _id: '123456789012345678901234', tokenVersion: 0 }))
    .toThrow('Authentication is not configured.');
});

test('Vercel Atlas MONGODB_URI alias is accepted while legacy MONGO_URI takes precedence', () => {
  delete process.env.MONGO_URI;
  process.env.MONGODB_URI = 'mongodb://atlas.invalid/university';
  resetEnvCache();
  expect(loadEnv().MONGO_URI).toBe(process.env.MONGODB_URI);
  process.env.MONGO_URI = 'mongodb://legacy.invalid/university';
  resetEnvCache();
  expect(loadEnv().MONGO_URI).toBe(process.env.MONGO_URI);
});
