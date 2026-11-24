'use strict';

const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const User = require('../src/modules/users/user.model');
const AuditLog = require('../src/modules/audit/audit.model');

const ctx = useTestApp();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n');

test('only administrators assign trusted audiences; assignments audit, reject self changes and revoke existing sessions', async () => {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const member = await F.createUserAndLogin(ctx.app, 'READER');
  const url = `/api/users/${member.user._id}/audiences`;
  expect((await member.agent.patch(url).send({ audienceGroups: ['FACULTY'] })).status).toBe(403);
  expect((await admin.agent.patch(`/api/users/${admin.user._id}/audiences`).send({ audienceGroups: ['STAFF'] })).status).toBe(403);
  expect((await admin.agent.patch(url).set('Origin', 'https://foreign.example').send({ audienceGroups: ['FACULTY'] })).status).toBe(403);
  expect((await admin.agent.patch(url).send({ audienceGroups: ['ALL'] })).status).toBe(400);
  expect((await admin.agent.patch(url).send({ audienceGroups: ['FACULTY'], role: 'ADMIN' })).status).toBe(400);
  const changed = await admin.agent.patch(url).send({ audienceGroups: ['FACULTY', 'STUDENTS'] });
  expect(changed.status).toBe(200);
  expect(changed.body.data.audienceGroups).toEqual(['FACULTY', 'STUDENTS']);
  expect((await member.agent.get('/api/auth/me')).status).toBe(401);
  expect((await User.findById(member.user._id).lean()).role).toBe('READER');
  const entry = await AuditLog.findOne({ action: 'USER_AUDIENCES_CHANGED', entityId: String(member.user._id) }).lean();
  expect(entry.actor.toString()).toBe(String(admin.user._id));
  expect(entry.toStatus).toBe('FACULTY,STUDENTS');
});

test('registration and own-profile updates cannot assert trusted group membership', async () => {
  const rejected = await request(ctx.app).post('/api/auth/register').send({
    name: 'Unverified Student', email: 'unverified@example.edu', password: F.PASSWORD, audienceGroups: ['STAFF'],
  });
  expect(rejected.status).toBe(400);
  expect(await User.exists({ email: 'unverified@example.edu' })).toBeNull();
  const account = await F.createUserAndLogin(ctx.app, 'READER');
  expect((await User.findById(account.user._id).lean()).audienceGroups).toEqual([]);
  expect((await account.agent.patch('/api/security/profile').send({ name: 'Staff Pretender', audienceGroups: ['STAFF'] })).status).toBe(400);
});

test('campus audience access is consistent across notices, search, home, events and attachment downloads', async () => {
  const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
  const reviewer = await F.createUserAndLogin(ctx.app, 'REVIEWER');
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const student = await F.createUserAndLogin(ctx.app, 'READER');
  const faculty = await F.createUserAndLogin(ctx.app, 'READER');
  const unassigned = await F.createUserAndLogin(ctx.app, 'READER');
  await User.updateOne({ _id: student.user._id }, { $set: { audienceGroups: ['STUDENTS'] } });
  await User.updateOne({ _id: faculty.user._id }, { $set: { audienceGroups: ['FACULTY'] } });
  const broad = await F.createApproved(author.agent, reviewer.agent, { title: 'Public notice with faculty targeting', visibility: 'PUBLIC', audience: 'FACULTY' });
  const allCampus = await F.createApproved(author.agent, reviewer.agent, { title: 'All campus notice', visibility: 'CAMPUS', audience: 'ALL' });
  const uploaded = await author.agent.post('/api/attachments').attach('file', PDF, 'faculty.pdf');
  expect(uploaded.status).toBe(201);
  const draft = await author.agent.post('/api/notices').send(F.completeNotice({
    title: 'Restricted faculty audienceproof notice', visibility: 'CAMPUS', audience: 'FACULTY',
    attachments: [{ fileId: uploaded.body.data.fileId }],
  }));
  const noticeId = draft.body.data.id;
  const event = await author.agent.post('/api/events').send({
    noticeId, start: F.iso(F.inMs(2 * F.HOUR)), end: F.iso(F.inMs(3 * F.HOUR)),
    venue: 'Faculty meeting room', organizer: 'Faculty office',
  });
  expect(event.status).toBe(201);
  expect((await author.agent.post(`/api/notices/${noticeId}/submit`).send({})).status).toBe(200);
  expect((await reviewer.agent.post(`/api/notices/${noticeId}/approve`).send({ mode: 'NOW' })).status).toBe(200);

  const publicClient = request(ctx.app);
  expect((await publicClient.get(`/api/public/notices/${broad.id}`)).status).toBe(200);
  expect((await student.agent.get(`/api/public/notices/${broad.id}`)).status).toBe(200);
  expect((await unassigned.agent.get(`/api/public/notices/${allCampus.id}`)).status).toBe(200);
  expect((await publicClient.get(`/api/public/notices/${allCampus.id}`)).status).toBe(404);
  for (const client of [publicClient, student.agent, unassigned.agent]) {
    expect((await client.get(`/api/public/notices/${noticeId}`)).status).toBe(404);
    expect((await client.get('/api/public/notices').query({ q: 'audienceproof' })).body.data).toEqual([]);
    expect((await client.get('/api/public/home')).body.data.latest.map(notice => notice.id)).not.toContain(noticeId);
    expect((await client.get('/api/public/events')).body.data).toEqual([]);
    expect((await client.get(`/api/public/events/${event.body.data.id}`)).status).toBe(404);
    expect((await client.get(`/api/public/attachments/${uploaded.body.data.fileId}`)).status).toBe(404);
  }
  expect((await faculty.agent.get(`/api/public/notices/${noticeId}`)).status).toBe(200);
  expect((await faculty.agent.get('/api/public/notices').query({ q: 'audienceproof' })).body.data.map(notice => notice.id)).toEqual([noticeId]);
  expect((await faculty.agent.get('/api/public/home')).body.data.latest.map(notice => notice.id)).toContain(noticeId);
  expect((await faculty.agent.get(`/api/public/events/${event.body.data.id}`)).status).toBe(200);
  expect((await faculty.agent.get(`/api/public/attachments/${uploaded.body.data.fileId}`)).status).toBe(200);

  expect((await admin.agent.patch(`/api/users/${faculty.user._id}/audiences`).send({ audienceGroups: [] })).status).toBe(200);
  expect((await faculty.agent.get('/api/auth/me')).status).toBe(401);
  const fresh = await F.loginAs(ctx.app, faculty.user);
  expect((await fresh.get(`/api/public/notices/${noticeId}`)).status).toBe(404);
  expect((await fresh.get(`/api/public/attachments/${uploaded.body.data.fileId}`)).status).toBe(404);
});
