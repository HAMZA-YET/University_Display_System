'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const Professor = require('../src/modules/professors/professor.model');
const AuditLog = require('../src/modules/audit/audit.model');
const audit = require('../src/modules/audit/audit.service');
const catalog = require('../src/data/kdu-faculty.json');
const { buildProfiles, importFaculty, ensureFacultyIndexes, run, failureMessage } = require('../src/cli/import-kdu-faculty');
const { fixtures } = require('../src/modules/sample-content/sampleContent.fixtures');

const ctx = useTestApp();
const subset = (profiles) => ({ ...catalog, profiles, profileCount: profiles.length });
const smallCatalog = () => subset(catalog.profiles.slice(0, 2));
const missingEmailCatalog = () => subset(catalog.profiles.filter(profile => profile.email === null).slice(0, 2));
const editable = (profile) => Object.fromEntries([
  'name', 'titlePrefix', 'department', 'position', 'officeRoom', 'officeBuilding', 'email',
  'phone', 'counsellingHours', 'subjects', 'profileImage', 'isActive',
].map(key => [key, profile[key]]));
const localProfile = (extra = {}) => ({
  name: 'Fictional Custom Professor', department: 'AI', position: 'LECTURER',
  officeRoom: '101', officeBuilding: 'Fictional Hall', email: 'custom@faculty.example',
  subjects: ['Web Development'], counsellingHours: [], ...extra,
});
const sample = () => fixtures(new mongoose.Types.ObjectId(), new Date()).professors[0];

test('official catalog maps all 58 identities without inventing subjects, offices, departments or schedules', () => {
  const profiles = buildProfiles(catalog);
  expect(profiles).toHaveLength(58);
  expect(new Set(profiles.map(profile => profile._id)).size).toBe(58);
  expect(profiles.filter(profile => profile.email)).toHaveLength(43);
  expect(profiles.filter(profile => profile.position === 'INSTRUCTOR')).toHaveLength(7);
  expect(profiles.filter(profile => profile.position === 'VISITING_FACULTY')).toHaveLength(9);
  profiles.forEach((profile, index) => {
    expect(profile).toMatchObject({
      name: catalog.profiles[index].name, positionLabel: catalog.profiles[index].positionLabel,
      roles: catalog.profiles[index].roles, qualifications: catalog.profiles[index].qualifications,
      department: null, officeRoom: null, officeBuilding: null, phone: null, subjects: [], counsellingHours: [],
      profileImage: catalog.profiles[index].profileImage, sourceUrl: catalog.sourceUrl,
    });
    expect(profile.sourceRetrievedAt.toISOString()).toBe(new Date(catalog.retrievedAt).toISOString());
  });
});

test('only sourced models allow missing required facts, with multiple null emails but unique published emails', async () => {
  const noEmail = buildProfiles(missingEmailCatalog());
  await Professor.create(noEmail);
  expect(await Professor.countDocuments({ email: null })).toBe(2);
  const unsourced = { ...noEmail[0] };
  delete unsourced._id;
  delete unsourced.sourceKey;
  const validation = new Professor(unsourced).validateSync();
  expect(validation.errors.department).toBeDefined();
  expect(validation.errors.officeRoom).toBeDefined();
  expect(validation.errors.email).toBeDefined();
  const [published] = buildProfiles(smallCatalog());
  await Professor.create(published);
  await expect(Professor.create(localProfile({ email: published.email }))).rejects.toMatchObject({ code: 11000 });
});

test('dry run is read-only and apply builds the partial index before removing the old email uniqueness index', async () => {
  await Professor.collection.dropIndex('professor_email_nonempty_unique');
  await Professor.collection.createIndex({ email: 1 }, { unique: true, name: 'email_1' });
  try {
    const before = await Professor.collection.indexes();
    const dry = await importFaculty({ catalog: missingEmailCatalog() });
    expect(dry).toMatchObject({ mode: 'dry-run', wouldInsert: 2, inserted: 0, canApply: true });
    expect(await Professor.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
    expect(await Professor.collection.indexes()).toEqual(before);
    const applied = await importFaculty({ catalog: missingEmailCatalog(), apply: true });
    expect(applied).toMatchObject({ inserted: 2, legacyEmailIndexRemoved: true });
    const indexes = await Professor.collection.indexes();
    expect(indexes.some(index => index.name === 'email_1')).toBe(false);
    expect(indexes.find(index => index.name === 'professor_email_nonempty_unique')).toMatchObject({
      unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } },
    });
    expect(await Professor.countDocuments({ email: null })).toBe(2);
  } finally {
    await ensureFacultyIndexes(Professor);
  }
});

test('repeat import preserves administrator edits, inactivity, versions and timestamps verbatim', async () => {
  await importFaculty({ catalog: smallCatalog(), apply: true });
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const [record] = (await request(ctx.app).get('/api/professors')).body.data;
  const changed = await admin.agent.put('/api/professors/' + record.id).set('If-Match', '1').send({
    ...editable(record), name: 'Administrator corrected display name', officeRoom: 'Verified room', isActive: false,
  });
  expect(changed.status).toBe(200);
  expect(changed.body.data).toMatchObject({ version: 2, department: null, email: record.email, sourceKey: record.sourceKey });
  const before = await Professor.findById(record.id).lean();
  const repeated = await importFaculty({ catalog: smallCatalog(), apply: true });
  expect(repeated).toMatchObject({ existingOfficial: 2, inserted: 0, archivedSamples: 0 });
  expect(await Professor.findById(record.id).lean()).toEqual(before);
  expect(await AuditLog.countDocuments({ action: 'KDU_FACULTY_IMPORTED' })).toBe(1);
});

test('email collision is visible in dry run and blocks the entire import and optional sample archive', async () => {
  await Professor.create(localProfile({ email: catalog.profiles[0].email }));
  const installed = await Professor.create(sample());
  const dry = await importFaculty({ catalog: smallCatalog(), archiveSamples: true });
  expect(dry).toMatchObject({ canApply: false, emailCollisions: 1, inserted: 0, wouldArchiveSamples: 1 });
  await expect(importFaculty({ catalog: smallCatalog(), apply: true, archiveSamples: true })).rejects.toThrow(/collisions/);
  expect(await Professor.countDocuments()).toBe(2);
  expect(await Professor.countDocuments({ sourceKey: { $exists: true } })).toBe(0);
  expect(await Professor.findById(installed._id).lean()).toMatchObject({ isActive: true, version: 1 });
  expect(await AuditLog.countDocuments()).toBe(0);
});

test('a custom record occupying a stable import identifier is never replaced', async () => {
  const [first] = buildProfiles(smallCatalog());
  const custom = await Professor.create({ ...localProfile(), _id: first._id });
  const dry = await importFaculty({ catalog: smallCatalog() });
  expect(dry).toMatchObject({ canApply: false, emailCollisions: 0, identifierCollisions: 1, inserted: 0 });
  await expect(importFaculty({ catalog: smallCatalog(), apply: true })).rejects.toThrow(/collisions/);
  expect(await Professor.findById(custom._id).lean()).toMatchObject({ name: custom.name, email: custom.email, version: 1 });
  expect(await Professor.countDocuments()).toBe(1);
});

test('new and unsourced admin profiles retain strict validation; sourced metadata is never client writable', async () => {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const local = await admin.agent.post('/api/professors').send(localProfile());
  expect(local.status).toBe(201);
  const missing = { ...localProfile(), department: null, officeRoom: null, officeBuilding: null, email: null, subjects: [] };
  expect((await admin.agent.post('/api/professors').send(missing)).status).toBe(400);
  const invalidUpdate = await admin.agent.put('/api/professors/' + local.body.data.id).set('If-Match', '1').send(missing);
  expect(invalidUpdate.status).toBe(400);
  expect(invalidUpdate.body.error.details.map(detail => detail.field)).toEqual(expect.arrayContaining(['department', 'officeRoom', 'officeBuilding', 'email', 'subjects']));
  expect((await admin.agent.put('/api/professors/' + local.body.data.id).set('If-Match', '1').send({ ...localProfile(), subjects: [] })).status).toBe(400);
  await importFaculty({ catalog: missingEmailCatalog(), apply: true });
  const record = await Professor.findOne({ sourceKey: { $exists: true } }).lean();
  const view = (await request(ctx.app).get('/api/professors/' + record._id)).body.data;
  for (const metadata of [{ sourceKey: 'kdu-global:replacement' }, { sourceUrl: 'https://example.com' }, { positionLabel: 'Fabricated rank' }, { roles: ['Fabricated role'] }, { qualifications: ['Fabricated degree'] }]) {
    const response = await admin.agent.put('/api/professors/' + record._id).set('If-Match', '1').send({ ...editable(view), ...metadata });
    expect(response.status).toBe(400);
  }
  const saved = await admin.agent.put('/api/professors/' + record._id).set('If-Match', '1').send(editable(view));
  expect(saved.status).toBe(200);
  expect(saved.body.data).toMatchObject({ department: null, officeRoom: null, officeBuilding: null, email: null, subjects: [], version: 2 });
});

test('public serializer and both searches expose sourced identity and roles without claiming qualifications are taught subjects', async () => {
  await importFaculty({ catalog: smallCatalog(), apply: true });
  const directory = await request(ctx.app).get('/api/professors').query({ q: 'Development Policy' });
  expect(directory.status).toBe(200);
  expect(directory.body.data).toHaveLength(1);
  expect(directory.body.data[0]).toMatchObject({
    name: catalog.profiles[0].name, department: null, subjects: [], counsellingHours: [],
    sourceUrl: catalog.sourceUrl, positionLabel: catalog.profiles[0].positionLabel,
    qualifications: catalog.profiles[0].qualifications,
  });
  expect(directory.body.meta.departmentCounts).toEqual({ ALL: 1 });
  const byRole = await request(ctx.app).get('/api/professors').query({ q: 'Dean of International Faculty' });
  expect(byRole.body.data.map(profile => profile.name)).toEqual([catalog.profiles[0].name]);
  const combined = await request(ctx.app).get('/api/member-tools/search').query({ q: 'Development Policy' });
  expect(combined.status).toBe(200);
  expect(combined.body.data).toEqual([expect.objectContaining({
    source: 'professor', title: catalog.profiles[0].name, summary: catalog.profiles[0].positionLabel,
    sourceUrl: catalog.sourceUrl, roles: catalog.profiles[0].roles,
  })]);
  expect(combined.body.data[0].summary).not.toContain('Development Policy');
  expect((await request(ctx.app).get('/api/professors').query({ q: '.*' })).body.data).toHaveLength(0);
  expect((await request(ctx.app).get('/api/member-tools/search').query({ q: '.*' })).body.data).toHaveLength(0);
});

test('optional archive touches only exact installed sample identities and records a system operator audit', async () => {
  const installed = await Professor.create(sample());
  const custom = await Professor.create(localProfile());
  const otherMarked = await Professor.create({ ...localProfile({ name: 'Other marked sample', email: 'other@faculty.example' }), sampleContentKey: 'uids-sample-v1:professor:UNOWNED' });
  const result = await importFaculty({ catalog: smallCatalog(), apply: true, archiveSamples: true });
  expect(result).toMatchObject({ inserted: 2, archivedSamples: 1 });
  expect(await Professor.findById(installed._id).lean()).toMatchObject({ isActive: false, version: 2 });
  expect(await Professor.findById(custom._id).lean()).toMatchObject({ isActive: true, version: 1 });
  expect(await Professor.findById(otherMarked._id).lean()).toMatchObject({ isActive: true, version: 1 });
  const entries = await AuditLog.find({ entityType: 'FACULTY_CATALOG' }).lean();
  expect(entries).toHaveLength(2);
  expect(entries.every(entry => entry.actor === null && entry.actorRole === null && entry.requestId === 'operator-kdu-faculty-import')).toBe(true);
  expect((await importFaculty({ catalog: smallCatalog(), apply: true, archiveSamples: true })).archivedSamples).toBe(0);
});

test('optional archive preserves administrator-edited installed samples even when their ownership marker is unchanged', async () => {
  const installedSamples = fixtures(new mongoose.Types.ObjectId(), new Date()).professors;
  const pristine = await Professor.create(installedSamples[0]);
  const edited = await Professor.create({ ...installedSamples[1], name: 'Administrator corrected sample', version: 2 });
  const before = await Professor.findById(edited._id).select('+sampleContentKey').lean();
  const dry = await importFaculty({ catalog: smallCatalog(), archiveSamples: true });
  expect(dry.wouldArchiveSamples).toBe(1);
  const applied = await importFaculty({ catalog: smallCatalog(), apply: true, archiveSamples: true });
  expect(applied.archivedSamples).toBe(1);
  expect(await Professor.findById(pristine._id).lean()).toMatchObject({ isActive: false, version: 2 });
  expect(await Professor.findById(edited._id).select('+sampleContentKey').lean()).toEqual(before);
});

test('failed audit rolls back the entire profile import and sample archive', async () => {
  const installed = await Professor.create(sample());
  jest.spyOn(audit, 'record').mockRejectedValue(new Error('Isolated audit failure'));
  await expect(importFaculty({ catalog: smallCatalog(), apply: true, archiveSamples: true })).rejects.toThrow('Isolated audit failure');
  expect(await Professor.countDocuments({ sourceKey: { $exists: true } })).toBe(0);
  expect(await Professor.findById(installed._id).lean()).toMatchObject({ isActive: true, version: 1 });
});

test('CLI defaults to dry run, rejects unknown flags before connecting and redacts unexpected driver errors', async () => {
  const calls = [];
  const dependencies = () => ({
    loadEnv: () => ({ MONGO_URI: 'mongodb://127.0.0.1:27017/disposable-faculty-test' }),
    connectDb: async () => calls.push('connected'),
    disconnectDb: async () => calls.push('disconnected'),
    importFaculty: async options => { calls.push(options); return { mode: 'dry-run' }; },
  });
  expect(await run([], dependencies)).toEqual({ mode: 'dry-run' });
  expect(calls).toEqual(['connected', { apply: false, archiveSamples: false }, 'disconnected']);
  const factory = jest.fn(dependencies);
  await expect(run(['--unknown'], factory)).rejects.toThrow(/read-only dry run/);
  expect(factory).not.toHaveBeenCalled();
  expect(failureMessage(new Error('mongodb://secret-user:secret-password@private-host'))).not.toMatch(/secret-user|secret-password|private-host/);
});
