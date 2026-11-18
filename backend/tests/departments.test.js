'use strict';

const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const Department = require('../src/modules/departments/department.model');
const { ensureDefaultDepartments } = require('../src/modules/departments/department.service');
const Professor = require('../src/modules/professors/professor.model');
const Notice = require('../src/modules/notices/notice.model');
const Revision = require('../src/modules/notices/revision.model');
const AuditLog = require('../src/modules/audit/audit.model');

const ctx = useTestApp();
beforeEach(async () => {
  await Department.deleteMany({});
  await ensureDefaultDepartments();
});
const body = (overrides = {}) => ({ code: 'NS', name: 'Natural Sciences', displayOrder: 20, ...overrides });

async function adminDepartment() {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const response = await admin.agent.post('/api/departments').send(body());
  expect(response.status).toBe(201);
  return { admin, department: response.body.data };
}

test('departments remain publicly readable while all writes require an administrator', async () => {
  const department = await Department.findOne({ code: 'AI' }).lean();
  const agents = [request(ctx.app)];
  for (const role of ['READER', 'AUTHOR', 'REVIEWER']) agents.push((await F.createUserAndLogin(ctx.app, role)).agent);
  for (const [index, agent] of agents.entries()) {
    const expected = index === 0 ? 401 : 403;
    expect((await agent.post('/api/departments').send(body())).status).toBe(expected);
    expect((await agent.patch(`/api/departments/${department._id}`).send({ name: 'Changed' })).status).toBe(expected);
    expect((await agent.delete(`/api/departments/${department._id}`)).status).toBe(expected);
  }
  const list = await request(ctx.app).get('/api/departments');
  expect(list.status).toBe(200);
  expect(list.body.data.every((d) => typeof d.id === 'string' && typeof d.code === 'string')).toBe(true);
  expect((await Department.findById(department._id).lean()).name).toBe(department.name);
});

test('an administrator can populate an empty database and update department metadata', async () => {
  await Department.deleteMany({});
  const { admin, department } = await adminDepartment();
  expect(department).toEqual({ id: expect.stringMatching(/^[a-f0-9]{24}$/), ...body() });
  const list = await request(ctx.app).get('/api/departments');
  expect(list.body.data).toEqual([department]);
  const update = await admin.agent.patch(`/api/departments/${department.id}`)
    .send({ name: 'School of Natural Sciences', displayOrder: 0 });
  expect(update.status).toBe(200);
  expect(update.body.data).toEqual({ ...department, name: 'School of Natural Sciences', displayOrder: 0 });
  expect(await AuditLog.countDocuments({ entityType: 'DEPARTMENT', entityId: department.id })).toBe(2);
});

test('creation normalizes uppercase codes, rejects duplicates and preserves immutable codes', async () => {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  const created = await admin.agent.post('/api/departments').send(body({ code: ' ns ' }));
  expect(created.status).toBe(201);
  expect(created.body.data.code).toBe('NS');
  const duplicate = await admin.agent.post('/api/departments').send(body({ code: 'ns', name: 'Other name' }));
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.error.code).toBe('DUPLICATE');
  const immutable = await admin.agent.patch(`/api/departments/${created.body.data.id}`).send({ code: 'NEW', name: 'Renamed' });
  expect(immutable.status).toBe(400);
  expect((await Department.findById(created.body.data.id).lean()).code).toBe('NS');
});

test.each([
  { code: 'ALL' }, { code: 'A' }, { code: 'TOOLONGCODE' }, { code: 'AI1' },
  { name: 'x' }, { displayOrder: -1 }, { displayOrder: 0.5 }, { displayOrder: 10001 },
])('invalid department data is rejected: %j', async (changes) => {
  const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
  expect((await admin.agent.post('/api/departments').send(body(changes))).status).toBe(400);
});

test.each(['inactive professor', 'draft notice', 'archived notice', 'approved search snapshot', 'revision snapshot'])
  ('deletion is blocked by a referenced %s', async (type) => {
    const { admin, department } = await adminDepartment();
    if (type === 'inactive professor') {
      await Professor.create({
        name: 'Real Record Example', department: department.code, position: 'PROFESSOR',
        officeRoom: '101', officeBuilding: 'Science Hall', email: 'professor@example.edu', isActive: false,
      });
    } else if (type === 'revision snapshot') {
      const notice = await Notice.create({ title: 'Notice with historic department', department: 'BSC', author: admin.user._id });
      await Revision.create({
        notice: notice._id, revisionNumber: 1, kind: 'INITIAL', author: admin.user._id,
        contentSnapshot: F.completeNotice({ department: department.code }), approved: true,
      });
    } else {
      await Notice.create({
        title: 'A notice that uses this department', author: admin.user._id,
        department: type === 'approved search snapshot' ? 'BSC' : department.code,
        status: type === 'archived notice' ? 'ARCHIVED' : 'DRAFT',
        ...(type === 'approved search snapshot' ? { publicSearch: { department: department.code } } : {}),
      });
    }
    const response = await admin.agent.delete(`/api/departments/${department.id}`);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DEPARTMENT_IN_USE');
    expect(await Department.exists({ _id: department.id })).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: 'DEPARTMENT_DELETED', entityId: department.id })).toBe(0);
  });

test('unused departments can be deleted and no longer appear in lists', async () => {
  const { admin, department } = await adminDepartment();
  const response = await admin.agent.delete(`/api/departments/${department.id}`);
  expect(response.status).toBe(200);
  expect(response.body.data).toEqual({ deleted: true, id: department.id });
  expect(await Department.exists({ _id: department.id })).toBeNull();
  expect((await request(ctx.app).get('/api/departments')).body.data.some((d) => d.id === department.id)).toBe(false);
  expect((await admin.agent.delete(`/api/departments/${department.id}`)).status).toBe(404);
  expect((await admin.agent.patch(`/api/departments/${department.id}`).send({ name: 'Missing department' })).status).toBe(404);
  expect(await AuditLog.countDocuments({ action: 'DEPARTMENT_DELETED', entityId: department.id })).toBe(1);
});
