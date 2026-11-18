'use strict';

const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const Notice = require('../src/modules/notices/notice.model');
const User = require('../src/modules/users/user.model');
const { loadEnv, resetEnvCache } = require('../src/config/env');

const ctx = useTestApp();

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n');

describe('SEC Security', () => {
  test('SEC-1 unknown or forbidden body fields (status, author, role, version) are rejected', async () => {
    const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
    for (const extra of [{ status: 'APPROVED' }, { author: '0123456789abcdef01234567' }, { role: 'ADMIN' }, { version: 99 }, { approvedRevision: 'x' }]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await author.agent.post('/api/notices').send({ ...F.completeNotice(), ...extra });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const draft = await author.agent.post('/api/notices').send(F.completeNotice());
    const patch = await author.agent.patch(`/api/notices/${draft.body.data.id}`).set('If-Match', '1').send({ status: 'APPROVED' });
    expect(patch.status).toBe(400);
    const stored = await Notice.findById(draft.body.data.id).lean();
    expect(stored.status).toBe('DRAFT');
    expect(stored.version).toBe(1);
    expect(String(stored.author)).toBe(String(author.user._id));
  });

  test('SEC-2 self-registration cannot set role', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Sneaky User', email: 'sneaky@kdu-uids.test', password: 'Sneaky123', role: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(await User.countDocuments({ email: 'sneaky@kdu-uids.test' })).toBe(0);
  });

  test('SEC-3 NoSQL operator injection in query or body is rejected', async () => {
    const user = await F.createUser('READER', { email: 'victim@kdu-uids.test' });
    const bodyInjection = await request(ctx.app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(bodyInjection.status).toBe(400);
    const nested = await request(ctx.app).post('/api/auth/login').send({ email: user.email, password: { $ne: null } });
    expect(nested.status).toBe(400);
    const queryInjection = await request(ctx.app).get('/api/public/notices?category[$ne]=EXAM');
    expect(queryInjection.status).toBe(400);
    const dotted = await request(ctx.app).get('/api/professors?department[a.b]=x');
    expect(dotted.status).toBe(400);
    const regexInjection = await request(ctx.app).get('/api/professors').query({ q: '(a+)+$' });
    expect(regexInjection.status).toBe(200);
  });

  test('SEC-4 a status parameter on a public endpoint is rejected with 400', async () => {
    const res = await request(ctx.app).get('/api/public/notices').query({ status: 'DRAFT' });
    expect(res.status).toBe(400);
    const unknown = await request(ctx.app).get('/api/public/notices').query({ foo: 'bar' });
    expect(unknown.status).toBe(400);
  });

  test('SEC-5 public responses never contain reviewer, history, working copy, pending revision or unvalidated attachments', async () => {
    const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
    const reviewer = await F.createUserAndLogin(ctx.app, 'REVIEWER');
    const valid = await author.agent.post('/api/attachments').attach('file', PDF, 'form.pdf');
    const fake = await author.agent.post('/api/attachments').attach('file', Buffer.from('MZ not a pdf at all'), 'evil.pdf');
    expect(valid.body.data.validationStatus).toBe('VALID');
    expect(fake.body.data.validationStatus).toBe('REJECTED');

    const n = await F.createApproved(author.agent, reviewer.agent, {
      title: 'Registration form notice',
      attachments: [{ fileId: valid.body.data.fileId }],
    });
    // Plant a rejected attachment directly into the approved snapshot to prove the filter.
    const Revision = require('../src/modules/notices/revision.model'); // eslint-disable-line global-require
    const stored = await Notice.findById(n.id).lean();
    await Revision.collection.updateOne(
      { _id: stored.approvedRevision },
      { $push: { 'contentSnapshot.attachments': { ...fake.body.data, rejectionReason: undefined } } }
    );
    // Create a pending correction so a pendingRevision exists.
    await author.agent.post(`/api/notices/${n.id}/revisions`).send({
      title: 'Registration form notice (corrected)',
      summary: n.summary,
      body: n.body,
      category: n.category,
      department: n.department,
      audience: n.audience,
      visibility: n.visibility,
      publishingOffice: n.publishingOffice,
      changeNote: 'Corrected the title to mention the revision.',
      baseVersion: n.version,
    });

    const forbidden = ['reviewer', 'reviewHistory', 'pendingRevision', 'approvedRevision', 'version', 'author', 'workingCopy', 'status', 'publicSearch', 'requestedPublicationStart', 'cachedEffectiveStatus'];
    const detail = await request(ctx.app).get(`/api/public/notices/${n.id}`);
    const list = await request(ctx.app).get('/api/public/notices');
    const home = await request(ctx.app).get('/api/public/home');
    for (const item of [detail.body.data, list.body.data[0], home.body.data.latest[0]]) {
      for (const key of forbidden) expect(Object.keys(item)).not.toContain(key);
    }
    expect(detail.body.data.title).toBe('Registration form notice');
    expect(detail.body.data.attachments.map((a) => a.fileId)).toEqual([valid.body.data.fileId]);
    expect(detail.body.data.attachments[0].downloadUrl).toBe(`/api/public/attachments/${valid.body.data.fileId}`);
    expect(JSON.stringify(detail.body)).not.toMatch(/storage|uploads|storageKey/i);
    expect((await request(ctx.app).get(`/api/public/attachments/${fake.body.data.fileId}`)).status).toBe(404);
    const download = await request(ctx.app).get(`/api/public/attachments/${valid.body.data.fileId}`);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
  });

  test('SEC-6 attachment gateway checks extension and magic bytes', async () => {
    const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
    const exe = await author.agent.post('/api/attachments').attach('file', Buffer.from('MZ...'), 'tool.exe');
    expect(exe.body.data.validationStatus).toBe('REJECTED');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const okPng = await author.agent.post('/api/attachments').attach('file', png, 'poster.png');
    expect(okPng.body.data.validationStatus).toBe('VALID');
    const renamed = await author.agent.post('/api/attachments').attach('file', png, 'poster.pdf');
    expect(renamed.body.data.validationStatus).toBe('REJECTED');
    // Another author cannot attach a file they did not upload.
    const other = await F.createUserAndLogin(ctx.app, 'AUTHOR');
    const steal = await other.agent.post('/api/notices').send({ ...F.completeNotice(), attachments: [{ fileId: okPng.body.data.fileId }] });
    expect(steal.status).toBe(400);
    // A draft with a rejected attachment cannot be submitted.
    const draft = await author.agent.post('/api/notices').send({ ...F.completeNotice(), attachments: [{ fileId: exe.body.data.fileId }] });
    const submit = await author.agent.post(`/api/notices/${draft.body.data.id}/submit`).send({});
    expect(submit.status).toBe(400);
  });

  test('SEC-7 the server refuses a JWT_SECRET shorter than 32 characters', () => {
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'too-short';
    resetEnvCache();
    expect(() => loadEnv()).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = original;
    resetEnvCache();
    expect(() => loadEnv()).not.toThrow();
  });

  test('SEC-8 a tampered or forged token is refused', async () => {
    const res = await request(ctx.app).get('/api/auth/me').set('Cookie', 'uids_token=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.');
    expect(res.status).toBe(401);
  });

  test('SEC-9 errors use the standard body with a request ID and no stack trace', async () => {
    const res = await request(ctx.app).get('/api/public/notices/not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR', requestId: expect.any(String) }));
    expect(res.body.error.stack).toBeUndefined();
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });
});
