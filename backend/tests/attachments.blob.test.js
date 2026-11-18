'use strict';

const request = require('supertest');
const { Readable } = require('stream');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const StoredFile = require('../src/modules/attachments/storedFile.model');
const { createVercelBlobGateway } = require('../src/modules/attachments/vercelBlobGateway');
const { setGateway } = require('../src/modules/attachments/attachmentGateway');
const { VERCEL_MAX_BYTES } = require('../src/modules/attachments/attachment.validation');

const ctx = useTestApp();
const PDF = Buffer.from('%PDF-1.4\nexample file\n%%EOF');
let sdk;
let gateway;
beforeEach(() => {
  sdk = {
    put: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockImplementation(async () => ({ statusCode: 200, stream: Readable.toWeb(Readable.from([PDF])) })),
    del: jest.fn().mockResolvedValue(undefined),
  };
  gateway = createVercelBlobGateway(sdk);
  setGateway(gateway);
});

function file(buffer = PDF, name = 'notice.pdf') {
  return { originalname: name, mimetype: 'application/pdf', size: buffer.length, buffer };
}

test('private Blob upload persists metadata without disclosing object path or store URL', async () => {
  const author = await F.createUser('AUTHOR');
  const meta = await gateway.upload(file(), author);
  expect(meta.validationStatus).toBe('VALID');
  expect(sdk.put).toHaveBeenCalledWith(expect.stringMatching(/^uids\/attachments\/[a-f0-9]{48}$/), PDF,
    expect.objectContaining({ access: 'private', allowOverwrite: false, contentType: 'application/pdf' }));
  expect(meta.storageKey).toBeUndefined();
  expect(meta.storageProvider).toBeUndefined();
  expect(meta.url).toBeUndefined();
  const stored = await StoredFile.findOne({ fileId: meta.fileId }).select('+storageKey +storageProvider').lean();
  expect(stored.storageProvider).toBe('vercel-blob');
  expect(stored.storageKey).toBe(sdk.put.mock.calls[0][0]);
  expect(await gateway.getMetadata(meta.fileId)).toMatchObject({ fileId: meta.fileId, size: PDF.length });
});

test('rejected or oversized files never reach private storage', async () => {
  const author = await F.createUser('AUTHOR');
  const spoofed = await gateway.upload(file(Buffer.from('this is not a PDF')), author);
  expect(spoofed.validationStatus).toBe('REJECTED');
  const big = Buffer.alloc(VERCEL_MAX_BYTES + 1);
  PDF.copy(big);
  const oversized = await gateway.upload(file(big), author);
  expect(oversized.validationStatus).toBe('REJECTED');
  expect(oversized.rejectionReason).toContain('4 MB');
  expect(sdk.put).not.toHaveBeenCalled();
});

test('a metadata write failure deletes the uploaded Blob and reports failure', async () => {
  const author = await F.createUser('AUTHOR');
  const fail = jest.spyOn(StoredFile, 'create').mockRejectedValueOnce(new Error('write failed'));
  await expect(gateway.upload(file(), author)).rejects.toThrow('write failed');
  expect(sdk.del).toHaveBeenCalledWith(sdk.put.mock.calls[0][0]);
  expect(await StoredFile.countDocuments()).toBe(0);
  fail.mockRestore();
});

test('storage service failures expose a retryable error without upstream credentials', async () => {
  const author = await F.createUser('AUTHOR');
  sdk.put.mockRejectedValueOnce(new Error('private-token-secret'));
  await expect(gateway.upload(file(), author)).rejects.toMatchObject({ status: 503, code: 'ATTACHMENT_STORAGE_UNAVAILABLE' });
  expect(await StoredFile.countDocuments()).toBe(0);
});

test('private file reads enforce ownership and approval visibility before requesting Blob content', async () => {
  const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
  const otherAuthor = await F.createUserAndLogin(ctx.app, 'AUTHOR');
  const reviewer = await F.createUserAndLogin(ctx.app, 'REVIEWER');
  const uploaded = await author.agent.post('/api/attachments').attach('file', PDF, 'private-notice.pdf');
  expect(uploaded.status).toBe(201);
  const fileId = uploaded.body.data.fileId;

  expect((await request(ctx.app).get(`/api/attachments/${fileId}`)).status).toBe(401);
  expect((await otherAuthor.agent.get(`/api/attachments/${fileId}`)).status).toBe(404);
  expect((await request(ctx.app).get(`/api/public/attachments/${fileId}`)).status).toBe(404);
  expect(sdk.get).not.toHaveBeenCalled();
  const own = await author.agent.get(`/api/attachments/${fileId}`);
  expect(own.status).toBe(200);
  expect(own.headers['cache-control']).toBe('private, no-store');
  expect(sdk.get).toHaveBeenCalledWith(sdk.put.mock.calls[0][0], { access: 'private' });

  const published = await F.createApproved(author.agent, reviewer.agent, { attachments: [{ fileId }] });
  const publicRead = await request(ctx.app).get(`/api/public/attachments/${fileId}`);
  expect(publicRead.status).toBe(200);
  expect(publicRead.body.equals(PDF)).toBe(true);
  expect(publicRead.headers['cache-control']).toBe('private, no-store');
  const reads = sdk.get.mock.calls.length;
  const withdrawn = await author.agent.post(`/api/notices/${published.id}/withdraw`).send({ reason: 'Remove outdated guidance' });
  expect(withdrawn.status).toBe(200);
  expect((await request(ctx.app).get(`/api/public/attachments/${fileId}`)).status).toBe(404);
  expect(sdk.get).toHaveBeenCalledTimes(reads);
});
