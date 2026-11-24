'use strict';
const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const { createUser } = require('./helpers/fixtures');
const { resetEnvCache } = require('../src/config/env');
const delivery = require('../src/modules/security/delivery');
const { ActionToken } = require('../src/modules/security/models');
const { createApp } = require('../src/app');

useTestApp();
const keys = ['NODE_ENV', 'BCRYPT_ROUNDS', 'CLIENT_ORIGIN', 'ACCOUNT_DELIVERY', 'RESEND_API_KEY', 'ACCOUNT_MESSAGE_FROM', 'MFA_ENCRYPTION_KEY'];
let previous;
beforeEach(() => {
  previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.NODE_ENV = 'production'; process.env.BCRYPT_ROUNDS = '12';
  process.env.CLIENT_ORIGIN = 'https://university.example';
  process.env.ACCOUNT_DELIVERY = 'resend';
  process.env.RESEND_API_KEY = 'synthetic-resend-api-key';
  process.env.ACCOUNT_MESSAGE_FROM = 'accounts@university.example';
  delete process.env.MFA_ENCRYPTION_KEY;
  resetEnvCache();
});
afterEach(() => {
  for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  resetEnvCache();
});
test('production email adapter uses fixed verified-provider endpoint and does not put a token in the link', async () => {
  const send = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 'synthetic-message-id' }) });
  const token = 'a'.repeat(64);
  await delivery.deliver({ email: 'reader@example.edu', purpose: 'recovery', token });
  expect(send).toHaveBeenCalledTimes(1);
  const [url, options] = send.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(options.headers.Authorization).toBe('Bearer synthetic-resend-api-key');
  expect(options.headers['Idempotency-Key']).not.toContain(token);
  const payload = JSON.parse(options.body);
  expect(payload).toMatchObject({ from: 'accounts@university.example', to: ['reader@example.edu'] });
  expect(payload.text).toContain('https://university.example/account-recovery');
  expect(payload.text).toContain(token);
  expect(payload.text).not.toContain('?token=');
});
test.each(['missing-key', 'invalid-sender', 'insecure-origin', 'local-production'])('production adapter refuses %s before sending', async kind => {
  if (kind === 'missing-key') delete process.env.RESEND_API_KEY;
  if (kind === 'invalid-sender') process.env.ACCOUNT_MESSAGE_FROM = 'bad\r\nBcc: victim@example.edu';
  if (kind === 'insecure-origin') process.env.CLIENT_ORIGIN = 'http://university.example';
  if (kind === 'local-production') process.env.ACCOUNT_DELIVERY = 'local';
  resetEnvCache();
  const send = jest.spyOn(globalThis, 'fetch');
  expect(delivery.status().available).toBe(false);
  await expect(delivery.deliver({ email: 'reader@example.edu', purpose: 'recovery', token: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'DELIVERY_UNAVAILABLE' });
  expect(send).not.toHaveBeenCalled();
});
test('failed provider response is sanitized and unusable recovery token is removed', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({ message: 'private-provider-body' }) });
  const app = createApp();
  const user = await createUser('READER');
  const failed = await request(app).post('/api/security/recovery/request').send({ email: user.email });
  expect(failed.status).toBe(503);
  expect(failed.body.error.code).toBe('DELIVERY_UNAVAILABLE');
  expect(JSON.stringify(failed.body)).not.toMatch(/private-provider|synthetic-resend-api-key/);
  expect(await ActionToken.countDocuments()).toBe(0);
});
test('public account capabilities are safe and hide unavailable enrollment/delivery paths', async () => {
  delete process.env.RESEND_API_KEY;
  const capabilities = await request(createApp()).get('/api/security/capabilities');
  expect(capabilities.status).toBe(200);
  expect(capabilities.body.data).toEqual({ mfaEnrollmentAvailable: false, accountMessagesAvailable: false, accountCompletionAvailable: true, deliveryChannel: 'disabled' });
  expect(JSON.stringify(capabilities.body)).not.toMatch(/KEY|@|mongodb/);
});
test('parallel recovery requests share one recipient cooldown without revealing account existence', async () => {
  const send = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 'synthetic-message-id' }) });
  const app = createApp();
  const user = await createUser('READER');
  const known = await Promise.all(Array.from({ length: 6 }, () => request(app).post('/api/security/recovery/request').send({ email: user.email })));
  const unknown = await Promise.all(Array.from({ length: 6 }, () => request(app).post('/api/security/recovery/request').send({ email: 'unknown@example.edu' })));
  expect([...known, ...unknown].every(result => result.status === 200)).toBe(true);
  expect([...known, ...unknown].every(result => JSON.stringify(result.body) === JSON.stringify({ data: { accepted: true } }))).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await ActionToken.countDocuments({ purpose: 'recovery' })).toBe(1);
});
