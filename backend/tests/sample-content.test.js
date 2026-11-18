'use strict';
const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const clock = require('../src/utils/clock');
const Department = require('../src/modules/departments/department.model');
const Professor = require('../src/modules/professors/professor.model');
const Notice = require('../src/modules/notices/notice.model');
const Revision = require('../src/modules/notices/revision.model');
const Event = require('../src/modules/events/event.model');
const DomainEvent = require('../src/modules/domainEvents/domainEvent.model');
const User = require('../src/modules/users/user.model');
const AuditLog = require('../src/modules/audit/audit.model');
const audit = require('../src/modules/audit/audit.service');
const tools = require('../src/modules/member-tools/memberTools.service');
const { SOURCE, id } = require('../src/modules/sample-content/sampleContent.fixtures');
const ctx = useTestApp();
const URL = '/api/admin/sample-content';
const COUNTS = { departments: 6, professors: 6, notices: 12, events: 6 };
const mark = { sampleContentKey: { $regex: `^${SOURCE}:` } };
beforeEach(async () => { await Department.deleteMany({}); });
const install = (agent) => agent.post(URL).send({});
const remove = (agent) => agent.delete(URL).send({ confirm: 'REMOVE_SAMPLE_CONTENT' });

test('sample status/install/remove are administrator-only and never run on normal public reads', async () => {
  const reader = await F.createUserAndLogin(ctx.app, 'READER');
  for (const [agent, status] of [[request(ctx.app), 401], [reader.agent, 403]]) {
    expect((await agent.get(URL)).status).toBe(status);
    expect((await install(agent)).status).toBe(status);
    expect((await remove(agent)).status).toBe(status);
  }
  expect((await request(ctx.app).get('/api/public/notices')).body.data).toEqual([]);
  expect(await Notice.countDocuments()).toBe(0);
  expect(await Department.countDocuments()).toBe(0);
});

test('installation is idempotent, retains real data and never creates accounts or changes permissions', async () => {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const reader = await F.createUser('READER');
  const realDepartment = await Department.create({ code: 'AI', name: 'Verified University AI Department', displayOrder: 88 });
  const realNotice = await Notice.create({ title: 'Verified real university notice', author: admin.user._id, department: 'AI' });
  const realProfessor = await Professor.create({ name: 'Verified Real Professor', department: 'AI', position: 'PROFESSOR', officeRoom: '101', officeBuilding: 'Real Faculty Hall', email: 'real@example.edu' });
  const first = await install(admin.agent);
  expect(first.status).toBe(200);
  expect(first.body.data).toMatchObject({ installed: true, complete: true, counts: { ...COUNTS, departments: 5 }, created: { ...COUNTS, departments: 5 } });
  expect(first.headers['cache-control']).toBe('private, no-store');
  const sample = await Notice.findById(id('notice', 'course-planning')).lean();
  await Notice.updateOne({ _id: sample._id }, { $set: { title: 'A user edited working copy' }, $inc: { version: 1 } });
  clock.set(new Date(Date.now() + 2 * F.DAY));
  const second = await install(admin.agent);
  expect(second.status).toBe(200);
  expect(second.body.data.created).toEqual({ departments: 0, professors: 0, notices: 0, events: 0 });
  expect((await Notice.findById(sample._id).lean())).toMatchObject({ title: 'A user edited working copy', publicationStart: sample.publicationStart });
  expect((await Department.findById(realDepartment._id).select('+sampleContentKey').lean())).toMatchObject({ name: 'Verified University AI Department', displayOrder: 88 });
  expect((await Department.findById(realDepartment._id).select('+sampleContentKey').lean()).sampleContentKey).toBeUndefined();
  expect(await Notice.exists({ _id: realNotice._id })).toBeTruthy();
  expect(await Professor.exists({ _id: realProfessor._id })).toBeTruthy();
  expect(await User.countDocuments()).toBe(2);
  expect((await User.findById(reader._id).lean()).role).toBe('READER');
  expect(await DomainEvent.countDocuments(mark)).toBe(20);
  expect(await AuditLog.countDocuments({ action: 'SAMPLE_CONTENT_INSTALLED' })).toBe(1);
});

test('samples use approved public snapshots, rich calendar states and safe local avatars', async () => {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  expect((await install(admin.agent)).status).toBe(200);
  const listed = await request(ctx.app).get('/api/public/notices').query({ limit: 50 });
  expect(listed.body.data).toHaveLength(12);
  expect(listed.body.data.every((n) => n.title.startsWith('[Demo]') && n.summary.includes('Fictional'))).toBe(true);
  const search = await request(ctx.app).get('/api/public/notices').query({ q: 'scholarship' });
  expect(search.status).toBe(200);
  expect(search.body.data.length).toBeGreaterThan(0);
  const detail = await request(ctx.app).get(`/api/public/notices/${listed.body.data[0].id}`);
  expect(detail.body.data.body).toContain('not an official university announcement');
  expect(await Revision.countDocuments({ ...mark, approved: true })).toBe(12);
  const events = await request(ctx.app).get('/api/public/events').query({ limit: 50 });
  expect(events.status).toBe(200);
  expect(events.body.data).toHaveLength(6);
  expect(events.body.data.some((e) => e.state === 'POSTPONED' && e.originalStart)).toBe(true);
  expect(events.body.data.some((e) => e.state === 'CANCELLED' && e.cancellationReason.includes('Fictional'))).toBe(true);
  expect(events.body.data.every((e) => new Date(e.start).getUTCHours() === 5)).toBe(true);
  const professors = await request(ctx.app).get('/api/professors');
  expect(professors.body.data).toHaveLength(6);
  expect(professors.body.data.every((p) => p.name.includes('(Demo)') && /^\/assets\/avatars\/professor-[1-6]\.svg$/.test(p.profileImage))).toBe(true);
  const { id: professorId, version, ...profile } = professors.body.data[0];
  const savedProfile = await admin.agent.put(`/api/professors/${professorId}`).set('If-Match', String(version)).send(profile);
  expect(savedProfile.status).toBe(200);
  expect(savedProfile.body.data.profileImage).toBe(profile.profileImage);
  expect((await tools.saveBookmark(admin.user, listed.body.data[0].id)).saved).toBe(true);
});

test('installing samples never sends fake publications to existing follower inboxes', async () => {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const reader = await F.createUser('READER');
  const before = new Date('2026-11-18T01:00:00.000Z');
  clock.set(before);
  await tools.follow(reader, { kind: 'category', target: 'EVENT' });
  clock.set(new Date(before.getTime() + F.HOUR));
  expect((await install(admin.agent)).status).toBe(200);
  const inbox = await tools.listInbox(reader, { page: 1, limit: 50 });
  expect(inbox.data).toEqual([]);
  expect(inbox.meta.unread).toBe(0);
  expect(await DomainEvent.countDocuments(mark)).toBe(20);
});

test('a failed sample audit rolls the entire installation back', async () => {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const failure = jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('forced failure'));
  expect((await install(admin.agent)).status).toBe(500);
  for (const Model of [Department, Professor, Notice, Revision, Event, DomainEvent]) expect(await Model.countDocuments(mark)).toBe(0);
  failure.mockRestore();
  expect((await install(admin.agent)).body.data.created).toEqual(COUNTS);
});

test('removal needs separate confirmation and preserves real records, shared departments and user edits', async () => {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const realDepartment = await Department.create({ code: 'AI', name: 'Real AI', displayOrder: 1 });
  expect((await install(admin.agent)).status).toBe(200);
  const realNotice = await Notice.create({ title: 'A real notice using a sample-created department', department: 'IBA', author: admin.user._id });
  const changedNotice = id('notice', 'course-planning');
  await Notice.updateOne({ _id: changedNotice }, { $set: { title: 'A user revision' }, $inc: { version: 1 } });
  await Professor.updateOne({ _id: id('professor', 'KS') }, { $set: { officeRoom: 'Changed by user' }, $inc: { version: 1 } });
  await Department.updateOne({ code: 'IHM' }, { $set: { name: 'Administrator renamed this department', displayOrder: 99 } });
  expect((await admin.agent.delete(URL).send({})).status).toBe(400);
  const response = await remove(admin.agent);
  expect(response.status).toBe(200);
  expect(response.body.data.removed).toMatchObject({ notices: 11, events: 6, professors: 5 });
  expect(await Notice.exists({ _id: realNotice._id })).toBeTruthy();
  expect(await Notice.exists({ _id: changedNotice })).toBeTruthy();
  expect(await Department.exists({ _id: realDepartment._id })).toBeTruthy();
  expect(await Department.exists({ code: 'IBA' })).toBeTruthy();
  expect(await Department.exists({ code: 'KS' })).toBeTruthy();
  expect(await Department.exists({ code: 'IHM', name: 'Administrator renamed this department', displayOrder: 99 })).toBeTruthy();
  expect(await User.countDocuments()).toBe(1);
  expect(await AuditLog.countDocuments({ action: 'SAMPLE_CONTENT_REMOVED' })).toBe(1);
});

test('concurrent installs create one set of samples with no duplicate publications', async () => {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const responses = await Promise.all([install(admin.agent), install(admin.agent)]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  expect(await Notice.countDocuments(mark)).toBe(12);
  expect(await Event.countDocuments(mark)).toBe(6);
  expect(await DomainEvent.countDocuments(mark)).toBe(20);
  expect(await AuditLog.countDocuments({ action: 'SAMPLE_CONTENT_INSTALLED' })).toBe(1);
});

test('trusted operator installation records maintenance provenance without pretending to use a browser session', async () => {
  const administrator = await F.createUser('ADMIN');
  const service = require('../src/modules/sample-content/sampleContent.service');
  const result = await service.install({ user: administrator, requestId: 'operator-deployment-maintenance-sample-install', ip: null }, { invocationSource: 'deployment-maintenance' });
  expect(result.created).toEqual(COUNTS);
  const entry = await AuditLog.findOne({ action: 'SAMPLE_CONTENT_INSTALLED' }).lean();
  expect(entry.reason).toContain('Operator-invoked deployment maintenance');
  expect(entry.reason).toContain('no browser session was used');
  expect(entry.requestId).toBe('operator-deployment-maintenance-sample-install');
  expect(entry.ip).toBeNull();
});
