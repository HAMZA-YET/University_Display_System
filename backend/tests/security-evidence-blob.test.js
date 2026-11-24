'use strict';

jest.mock('@vercel/blob', () => ({ put: jest.fn(), get: jest.fn() }));
const sdk = require('@vercel/blob');
const { ReadableStream } = require('stream/web');
const request = require('supertest');
const sharp = require('sharp');
const { useTestApp } = require('./helpers/testApp');
const { createUser, loginAs } = require('./helpers/fixtures');
const { createApp } = require('../src/app');
const { Evidence } = require('../src/modules/security/evidence');
const { resetEnvCache } = require('../src/config/env');

useTestApp();
const caseId = '123456789012345678901234';
const keys = ['ATTACHMENT_STORAGE', 'BLOB_STORE_ID', 'BLOB_READ_WRITE_TOKEN', 'VERCEL'];
let previous, stored;
beforeEach(() => {
  previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.ATTACHMENT_STORAGE = 'vercel-blob';
  process.env.BLOB_STORE_ID = 'synthetic-private-store';
  process.env.VERCEL = '1';
  delete process.env.BLOB_READ_WRITE_TOKEN;
  resetEnvCache();
  stored = new Map();
  sdk.put.mockReset().mockImplementation(async (key, data) => {
    stored.set(key, Buffer.from(data));
    return { url: 'https://do-not-expose.example/private-proof' };
  });
  sdk.get.mockReset().mockImplementation(async key => stored.has(key)
    ? { statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(stored.get(key)); controller.close(); } }) }
    : null);
});
afterEach(() => {
  for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  resetEnvCache();
});
async function fixture(adapter = () => true) {
  const app = createApp({ authorizeEvidence: adapter });
  const user = await createUser('READER');
  const agent = await loginAs(app, user);
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
  const upload = () => agent.post(`/api/private-evidence/${caseId}`).attach('file', image, { filename: 'proof.png', contentType: 'image/png' });
  return { app, agent, upload, image, user };
}
test('serverless evidence uses private Blob, exposes metadata only and rechecks permission on list/download/delete', async () => {
  let allowed = true;
  const { app, agent, upload, image } = await fixture(() => allowed);
  const uploaded = await upload();
  expect(uploaded.status).toBe(201);
  const fileId = uploaded.body.data.fileId;
  expect(sdk.put).toHaveBeenCalledWith(`uids/evidence/${fileId}`, image, expect.objectContaining({ access: 'private', allowOverwrite: false }));
  const row = await Evidence.findOne({ fileId }).lean();
  expect(row.storageProvider).toBe('vercel-blob');
  const listed = await agent.get(`/api/private-evidence/${caseId}`);
  expect(listed.status).toBe(200);
  expect(listed.body.data[0]).toMatchObject({ fileId, name: 'proof.png' });
  expect(JSON.stringify(listed.body)).not.toMatch(/storageKey|https:|uids\/evidence/);
  const url = `/api/private-evidence/${caseId}/${fileId}`;
  const downloaded = await agent.get(url);
  expect(downloaded.status).toBe(200);
  expect(downloaded.body.equals(image)).toBe(true);
  expect(downloaded.headers['cache-control']).toContain('no-store');
  expect((await request(app).get(url)).status).toBe(401);
  allowed = false;
  expect((await agent.get(`/api/private-evidence/${caseId}`)).status).toBe(403);
  expect((await agent.get(url)).status).toBe(403);
  expect((await agent.delete(url)).status).toBe(403);
  allowed = true;
  expect((await agent.delete(url)).status).toBe(200);
  expect((await agent.get(url)).status).toBe(404);
});
test('unconfigured cloud storage refuses upload before persistence, and serverless limit leaves multipart room', async () => {
  delete process.env.BLOB_STORE_ID;
  const { agent, upload } = await fixture();
  expect((await agent.get('/api/private-evidence/capabilities')).body.data).toMatchObject({ available: false, maxBytes: 4 * 1024 * 1024 });
  expect((await upload()).status).toBe(503);
  expect(sdk.put).not.toHaveBeenCalled();
  expect(await Evidence.countDocuments()).toBe(0);
});
test('provider failures do not return URLs or secrets and never make quarantine downloadable', async () => {
  sdk.put.mockRejectedValueOnce(new Error('private-provider-detail'));
  const { agent, upload } = await fixture();
  const failed = await upload();
  expect(failed.status).toBe(503);
  expect(JSON.stringify(failed.body)).not.toContain('private-provider-detail');
  const record = await Evidence.findOne().lean();
  expect(record.state).toBe('QUARANTINED');
  expect((await agent.get(`/api/private-evidence/${caseId}/${record.fileId}`)).status).toBe(404);
  expect((await agent.get(`/api/private-evidence/${caseId}`)).body.data).toEqual([]);
});
test('cloud evidence rejects altered bytes, oversized reads and forged storage paths', async () => {
  const { agent, upload } = await fixture();
  const uploaded = await upload();
  const fileId = uploaded.body.data.fileId;
  const url = `/api/private-evidence/${caseId}/${fileId}`;
  const key = `uids/evidence/${fileId}`;
  stored.set(key, Buffer.alloc(stored.get(key).length, 1));
  expect((await agent.get(url)).status).toBe(404);
  stored.set(key, Buffer.alloc(6 * 1024 * 1024));
  expect((await agent.get(url)).status).toBe(404);
  await Evidence.updateOne({ fileId }, { storageKey: 'uids/attachments/forged' });
  sdk.get.mockClear();
  expect((await agent.get(url)).status).toBe(404);
  expect(sdk.get).not.toHaveBeenCalled();
});
test('permission revoked during upload leaves a quarantined private blob', async () => {
  let count = 0;
  const { agent, upload } = await fixture(() => ++count === 1);
  expect((await upload()).status).toBe(403);
  expect((await Evidence.findOne().lean()).state).toBe('QUARANTINED');
  expect(sdk.put).toHaveBeenCalledTimes(1);
});
test('parallel uploads share a persistent claim cap and retained deleted/quarantined records keep their slots', async () => {
  const { agent, upload, image, user } = await fixture();
  // Separate app instances bypass the intentional two-active-upload local
  // capacity guard, proving the MongoDB quota works across warm instances.
  const agents = await Promise.all(Array.from({ length: 12 }, () => loginAs(createApp({ authorizeEvidence: () => true }), user)));
  const results = await Promise.all(agents.map(client => client.post(`/api/private-evidence/${caseId}`)
    .attach('file', image, { filename: 'proof.png', contentType: 'image/png' })));
  expect(results.filter(result => result.status === 201)).toHaveLength(10);
  expect(results.filter(result => result.status === 409)).toHaveLength(2);
  expect(await Evidence.countDocuments({ caseId })).toBe(10);
  expect(sdk.put).toHaveBeenCalledTimes(10);
  const first = await Evidence.findOne({ caseId }).lean();
  expect((await agent.delete(`/api/private-evidence/${caseId}/${first.fileId}`)).status).toBe(200);
  await Evidence.updateMany({ caseId, state: 'PRIVATE' }, { state: 'QUARANTINED' });
  const denied = await upload();
  expect(denied.status).toBe(409);
  expect(denied.body.error.code).toBe('EVIDENCE_LIMIT_REACHED');
  expect(sdk.put).toHaveBeenCalledTimes(10);
});
