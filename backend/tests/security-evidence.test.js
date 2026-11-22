'use strict';
const request = require('supertest');
const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');
const { useTestApp } = require('./helpers/testApp');
const { createUser, loginAs } = require('./helpers/fixtures');
const { createApp } = require('../src/app');
const { Evidence, root } = require('../src/modules/security/evidence');
const { matchesDepartment } = require('../src/modules/security/scope');
const ctx = useTestApp();
const caseId = '123456789012345678901234';
let generated = [];
afterEach(async () => { for (const id of generated) await fs.unlink(path.join(root, id)).catch(() => {}); generated = []; });
async function setup(adapter = () => true, role = 'READER') {
  const app = createApp({ authorizeEvidence: adapter });
  const user = await createUser(role); const agent = await loginAs(app, user);
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
  return { agent, image, user };
}
async function upload(agent, image, filename = 'photo.png', contentType = 'image/png') {
  const res = await agent.post('/api/private-evidence/' + caseId).attach('file', image, { filename, contentType });
  if (res.body.data?.fileId) generated.push(res.body.data.fileId);
  return res;
}
test('missing case adapter denies everyone, including administrators, before storage', async () => {
  const admin = await createUser('ADMIN'); const agent = await loginAs(ctx.app, admin);
  expect((await agent.post('/api/private-evidence/' + caseId)).status).toBe(403);
  expect((await request(ctx.app).post('/api/private-evidence/' + caseId)).status).toBe(401);
  expect(await Evidence.countDocuments()).toBe(0);
});
test.each([false, 'true', 'throws'])('unverified adapter decision %s denies access', async decision => {
  const { agent, image } = await setup(() => { if (decision === 'throws') throw new Error('Unavailable'); return decision; });
  expect((await upload(agent, image)).status).toBe(403);
  expect(await Evidence.countDocuments()).toBe(0);
});
test('valid evidence remains private, downloads with authorization, and logical deletion denies future access', async () => {
  let allowed = true; const { agent, image } = await setup(() => allowed);
  const uploaded = await upload(agent, image); expect(uploaded.status).toBe(201);
  const id = uploaded.body.data.fileId;
  const url = '/api/private-evidence/' + caseId + '/' + id;
  const file = await agent.get(url); expect(file.status).toBe(200); expect(file.body.equals(image)).toBe(true);
  expect(file.headers['cache-control']).toContain('no-store');
  expect((await agent.get('/api/public/attachments/' + id)).status).not.toBe(200);
  expect((await agent.get('/.local/evidence/' + id)).status).toBe(404);
  allowed = false; expect((await agent.get(url)).status).toBe(403); expect((await agent.delete(url)).status).toBe(403);
  allowed = true; expect((await agent.delete(url)).status).toBe(200); expect((await agent.get(url)).status).toBe(404);
});
test.each(['signature', 'malformed', 'type', 'oversized'])('rejects %s upload', async kind => {
  const { agent, image } = await setup();
  const bytes = kind === 'signature' ? Buffer.from('not an image') : kind === 'malformed' ? image.subarray(0, 30) : kind === 'oversized' ? Buffer.alloc(5 * 1024 * 1024 + 1) : image;
  const res = await upload(agent, bytes, kind === 'type' ? 'photo.pdf' : 'photo.png');
  expect(res.status).toBe(400); expect(await Evidence.countDocuments()).toBe(0);
});
test('quarantine, guessed file IDs, traversal and unrelated cases do not yield evidence', async () => {
  const { agent, image } = await setup(); const uploaded = await upload(agent, image, '../../private.png');
  expect(uploaded.status).toBe(201); expect(uploaded.body.data.name).not.toContain('/');
  const id = uploaded.body.data.fileId;
  expect((await agent.get('/api/private-evidence/' + caseId + '/..%2fsecret')).status).toBe(404);
  expect((await agent.get('/api/private-evidence/aaaaaaaaaaaaaaaaaaaaaaaa/' + id)).status).toBe(404);
  await Evidence.updateOne({ fileId: id }, { state: 'QUARANTINED' });
  expect((await agent.get('/api/private-evidence/' + caseId + '/' + id)).status).toBe(404);
});
test('trusted department helper denies missing and cross-department context without admin bypass', () => {
  expect(matchesDepartment({ role: 'ADMIN', department: 'SCI' }, { department: 'ART' })).toBe(false);
  expect(matchesDepartment({ department: 'SCI' }, { department: 'SCI' })).toBe(true);
  expect(matchesDepartment({ department: null }, { department: null })).toBe(false);
  expect(matchesDepartment({ department: 'SCI' }, null)).toBe(false);
});

test('foreign-origin multipart submissions are denied before storage', async () => {
  const { agent, image } = await setup();
  const res = await agent.post('/api/private-evidence/' + caseId).set('Origin', 'https://untrusted.example').attach('file', image, { filename: 'photo.png', contentType: 'image/png' });
  expect(res.status).toBe(403); expect(await Evidence.countDocuments()).toBe(0);
});
