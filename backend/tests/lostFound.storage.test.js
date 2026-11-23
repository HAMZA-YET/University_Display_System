'use strict';

const request = require('supertest');
const sharp = require('sharp');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const Item = require('../src/modules/lostFound/item.model');
const StoredFile = require('../src/modules/attachments/storedFile.model');
const { getGateway, setGateway } = require('../src/modules/attachments/attachmentGateway');
const { authorizeEvidence } = require('../src/modules/lostFound/lostFound.evidence');
const { resetEnvCache } = require('../src/config/env');

const ctx = useTestApp();
let png;
beforeAll(async () => {
  png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#224466' } }).png().toBuffer();
});
beforeEach(() => setGateway(require('../src/modules/attachments/localAttachmentGateway')));

async function withEnvironment(changes, run) {
  const previous = Object.fromEntries(Object.keys(changes).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvCache();
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvCache();
  }
}

async function report(type = 'FOUND') {
  const owner = await F.createUserAndLogin(ctx.app, 'READER');
  const created = await owner.agent.post('/api/lost-found/items').send({
    type, title: 'Blue umbrella', description: 'Blue umbrella with a wooden handle.',
    category: 'UMBRELLA', location: 'Library entrance', contactVisibility: 'ADMIN',
  });
  expect(created.status).toBe(201);
  return { ...owner, item: created.body.data, uploadUrl: `/api/lost-found/me/items/${created.body.data.id}/photos` };
}

test('photo capabilities advertise the shared local, private Blob/OIDC and disabled storage limits', async () => {
  await withEnvironment({ VERCEL: undefined, ATTACHMENT_STORAGE: 'local' }, async () => {
    const response = await request(ctx.app).get('/api/public/lost-found/capabilities');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toEqual({ maxPhotoBytes: 5 * 1024 * 1024, maxPhotos: 3, photosAvailable: true });
  });
  await withEnvironment({ VERCEL: '1', ATTACHMENT_STORAGE: 'vercel-blob', BLOB_STORE_ID: 'test-private-store', BLOB_READ_WRITE_TOKEN: undefined }, async () => {
    expect((await request(ctx.app).get('/api/public/lost-found/capabilities')).body.data)
      .toEqual({ maxPhotoBytes: 4 * 1024 * 1024, maxPhotos: 3, photosAvailable: true });
  });
  await withEnvironment({ VERCEL: '1', ATTACHMENT_STORAGE: 'disabled' }, async () => {
    expect((await request(ctx.app).get('/api/public/lost-found/capabilities')).body.data.photosAvailable).toBe(false);
  });
});

test('lost-found JSON and multipart mutations reject foreign origins before storing photos', async () => {
  const owner = await report();
  const upload = jest.spyOn(getGateway(), 'upload');
  expect((await owner.agent.post('/api/lost-found/items').set('Origin', 'https://foreign.example').send({})).status).toBe(403);
  expect((await owner.agent.post(owner.uploadUrl).set('Origin', 'https://foreign.example').attach('photo', png, 'umbrella.png')).status).toBe(403);
  expect(upload).not.toHaveBeenCalled();
  expect(await StoredFile.countDocuments()).toBe(0);
  const allowed = await owner.agent.post(owner.uploadUrl).set('Origin', 'http://localhost:5173').attach('photo', png, 'umbrella.png');
  expect(allowed.status).toBe(201);
});

test('truncated images, mismatched MIME types and oversized decoded dimensions never reach storage', async () => {
  const owner = await report();
  const upload = jest.spyOn(getGateway(), 'upload');
  const truncated = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  expect((await owner.agent.post(owner.uploadUrl).attach('photo', truncated, 'broken.png')).status).toBe(400);
  expect((await owner.agent.post(owner.uploadUrl).attach('photo', png, { filename: 'mismatch.png', contentType: 'image/jpeg' })).status).toBe(400);
  const oversized = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: '#224466' } }).png().toBuffer();
  expect((await owner.agent.post(owner.uploadUrl).attach('photo', oversized, 'huge.png')).status).toBe(400);
  expect(upload).not.toHaveBeenCalled();
  expect(await StoredFile.countDocuments()).toBe(0);
});

test('public and private photo responses cannot be cached and removal immediately denies public reads', async () => {
  const owner = await report();
  const uploaded = await owner.agent.post(owner.uploadUrl).attach('photo', png, 'umbrella.png');
  expect(uploaded.status).toBe(201);
  const photoId = uploaded.body.data.photoIds[0];
  const publicUrl = `/api/public/lost-found/items/${owner.item.id}/photos/${photoId}`;
  const publicRead = await request(ctx.app).get(publicUrl);
  expect(publicRead.status).toBe(200);
  expect(publicRead.headers['cache-control']).toBe('private, no-store');
  expect(publicRead.body.equals(png)).toBe(true);
  const privateRead = await owner.agent.get(`/api/lost-found/items/${owner.item.id}/photos/${photoId}`);
  expect(privateRead.status).toBe(200);
  expect(privateRead.headers['cache-control']).toBe('private, no-store');
  expect((await owner.agent.delete(`${owner.uploadUrl}/${photoId}`)).status).toBe(200);
  expect((await request(ctx.app).get(publicUrl)).status).toBe(404);
});

test('a report that closes during photo storage cannot acquire the uploaded photo', async () => {
  const owner = await report('LOST');
  jest.spyOn(getGateway(), 'upload').mockImplementationOnce(async () => {
    await Item.updateOne({ _id: owner.item.id }, { $set: { status: 'RESOLVED' } });
    return { fileId: 'a'.repeat(32), fileType: 'image/png', validationStatus: 'VALID' };
  });
  expect((await owner.agent.post(owner.uploadUrl).attach('photo', png, 'umbrella.png')).status).toBe(409);
  expect((await Item.findById(owner.item.id).lean()).photoIds).toEqual([]);
});

test('deployed photo intake refuses files over the shared four-MiB request cap before storage', async () => {
  const owner = await report();
  const upload = jest.spyOn(getGateway(), 'upload');
  await withEnvironment({ VERCEL: '1', ATTACHMENT_STORAGE: 'vercel-blob', BLOB_STORE_ID: 'test-private-store' }, async () => {
    const tooLarge = Buffer.alloc(4 * 1024 * 1024 + 1);
    const response = await owner.agent.post(owner.uploadUrl).attach('photo', tooLarge, 'large.png');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('4 MB');
    expect(upload).not.toHaveBeenCalled();
  });
});

test('privileged MFA rollout gates administrator evidence and private-photo access while preserving claimant ownership', async () => {
  const owner = await report();
  const claimant = await F.createUserAndLogin(ctx.app, 'READER');
  const admin = await F.createUser('ADMIN');
  const claim = await claimant.agent.post(`/api/lost-found/items/${owner.item.id}/claims`).send({ evidenceText: 'Private identifying detail inside the handle.' });
  expect(claim.status).toBe(201);
  const caseId = claim.body.data.id;
  const uploaded = await owner.agent.post(owner.uploadUrl).attach('photo', png, 'umbrella.png');
  expect(uploaded.status).toBe(201);
  const photoId = uploaded.body.data.photoIds[0];
  await withEnvironment({ REQUIRE_PRIVILEGED_MFA: 'true' }, async () => {
    for (const action of ['download', 'delete']) {
      expect(await authorizeEvidence({ actor: admin, caseId, action })).toBe(false);
      expect(await authorizeEvidence({ actor: { ...admin, mfaEnabled: true }, caseId, action })).toBe(true);
      expect(await authorizeEvidence({ actor: claimant.user, caseId, action })).toBe(true);
    }
    const photos = require('../src/modules/lostFound/lostFound.photos');
    await expect(photos.privatePhotoMeta(admin, owner.item.id, photoId)).rejects.toMatchObject({ status: 404 });
    await expect(photos.privatePhotoMeta({ ...admin, mfaEnabled: true }, owner.item.id, photoId)).resolves.toMatchObject({ fileId: photoId });
  });
});
