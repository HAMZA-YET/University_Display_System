'use strict';

const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const Professor = require('../src/modules/professors/professor.model');
const AuditLog = require('../src/modules/audit/audit.model');
const User = require('../src/modules/users/user.model');
const { signToken } = require('../src/modules/auth/token');
const { resetEnvCache } = require('../src/config/env');

const ctx = useTestApp();

const DEPTS = ['AI', 'IBA', 'BSC', 'IHM', 'KS', 'EAP'];

function professor(overrides = {}) {
  return {
    name: 'Mina Example',
    titlePrefix: 'Dr.',
    department: 'AI',
    position: 'ASSISTANT_PROFESSOR',
    officeRoom: '402',
    officeBuilding: 'Innovation Hall',
    email: `prof.${Math.random().toString(16).slice(2, 8)}@example.edu`,
    phone: '+82 33 000 0000',
    counsellingHours: [{ day: 'MON', startTime: '14:00', endTime: '16:00', location: 'Room 402' }],
    subjects: ['Machine Learning', 'Data Mining'],
    ...overrides,
  };
}

describe('PROF Professor directory', () => {
  test('PROF-1 create, read, update and delete (admin only; others 403)', async () => {
    const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
    const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
    const reader = await F.createUserAndLogin(ctx.app, 'READER');

    const created = await admin.agent.post('/api/professors').send(professor());
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data.version).toBe(1);

    expect((await author.agent.post('/api/professors').send(professor())).status).toBe(403);
    expect((await reader.agent.post('/api/professors').send(professor())).status).toBe(403);
    expect((await request(ctx.app).post('/api/professors').send(professor())).status).toBe(401);

    const read = await request(ctx.app).get(`/api/professors/${id}`);
    expect(read.status).toBe(200);
    expect(read.body.data.officeBuilding).toBe('Innovation Hall');

    const update = await admin.agent
      .put(`/api/professors/${id}`)
      .set('If-Match', '1')
      .send(professor({ email: created.body.data.email, officeRoom: '510' }));
    expect(update.status).toBe(200);
    expect(update.body.data.officeRoom).toBe('510');
    expect(update.body.data.version).toBe(2);
    const stale = await admin.agent
      .put(`/api/professors/${id}`)
      .set('If-Match', '1')
      .send(professor({ email: created.body.data.email }));
    expect(stale.status).toBe(409);
    const noVersion = await admin.agent.put(`/api/professors/${id}`).send(professor({ email: created.body.data.email }));
    expect(noVersion.status).toBe(428);
    expect((await author.agent.put(`/api/professors/${id}`).set('If-Match', '2').send(professor())).status).toBe(403);

    expect((await reader.agent.delete(`/api/professors/${id}`)).status).toBe(403);
    const del = await admin.agent.delete(`/api/professors/${id}`);
    expect(del.status).toBe(200);
    expect((await request(ctx.app).get(`/api/professors/${id}`)).status).toBe(404);
    expect(await AuditLog.countDocuments({ entityType: 'PROFESSOR', entityId: id })).toBe(3);
  });

  test('PROF-2 filter by each of the six departments', async () => {
    const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
    for (const dept of DEPTS) {
      // eslint-disable-next-line no-await-in-loop
      await admin.agent.post('/api/professors').send(professor({ department: dept, name: `Professor ${dept} One` }));
    }
    await admin.agent.post('/api/professors').send(professor({ department: 'AI', name: 'Professor AI Two' }));
    for (const dept of DEPTS) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(ctx.app).get('/api/professors').query({ department: dept });
      expect(res.status).toBe(200);
      expect(res.body.data.every((p) => p.department === dept)).toBe(true);
      expect(res.body.data).toHaveLength(dept === 'AI' ? 2 : 1);
    }
    const all = await request(ctx.app).get('/api/professors');
    expect(all.body.meta.total).toBe(7);
    expect(all.body.meta.departmentCounts.AI).toBe(2);
    expect(all.body.meta.departmentCounts.ALL).toBe(7);
    expect(all.body.data.map((p) => p.name)).toEqual([...all.body.data.map((p) => p.name)].sort((a, b) => a.localeCompare(b)));
  });

  test('PROF-3 search by name and by subject', async () => {
    const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
    await admin.agent.post('/api/professors').send(professor({ name: 'Hana Sample', subjects: ['Hospitality Law', 'Tourism'] , department: 'IHM' }));
    await admin.agent.post('/api/professors').send(professor({ name: 'Joon Demo', subjects: ['Deep Learning', 'Computer Vision'] }));
    const byName = await request(ctx.app).get('/api/professors').query({ q: 'hana' });
    expect(byName.body.data.map((p) => p.name)).toEqual(['Hana Sample']);
    const bySubject = await request(ctx.app).get('/api/professors').query({ q: 'vision' });
    expect(bySubject.body.data.map((p) => p.name)).toEqual(['Joon Demo']);
    const regexSafe = await request(ctx.app).get('/api/professors').query({ q: '.*' });
    expect(regexSafe.body.data).toHaveLength(0);
  });

  test('PROF-4 multiple subjects saved and duplicates removed case-insensitively', async () => {
    const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
    const res = await admin.agent
      .post('/api/professors')
      .send(professor({ subjects: ['  Korean Grammar ', 'korean grammar', 'Korean Literature', 'KOREAN GRAMMAR'] }));
    expect(res.status).toBe(201);
    expect(res.body.data.subjects).toEqual(['Korean Grammar', 'Korean Literature']);
    const empty = await admin.agent.post('/api/professors').send(professor({ subjects: [] }));
    expect(empty.status).toBe(400);
  });

  test('PROF-5 counselling hours: valid saved, end before start rejected, overlaps rejected', async () => {
    const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
    const valid = await admin.agent.post('/api/professors').send(
      professor({
        counsellingHours: [
          { day: 'MON', startTime: '14:00', endTime: '16:00' },
          { day: 'MON', startTime: '16:00', endTime: '17:00' },
          { day: 'WED', startTime: '10:00', endTime: '11:30', note: 'Online by appointment' },
        ],
      })
    );
    expect(valid.status).toBe(201);
    expect(valid.body.data.counsellingHours).toHaveLength(3);

    const backwards = await admin.agent.post('/api/professors').send(professor({ counsellingHours: [{ day: 'TUE', startTime: '15:00', endTime: '14:00' }] }));
    expect(backwards.status).toBe(400);
    expect(backwards.body.error.details.some((d) => d.field.startsWith('counsellingHours'))).toBe(true);

    const overlap = await admin.agent.post('/api/professors').send(
      professor({
        counsellingHours: [
          { day: 'THU', startTime: '13:00', endTime: '15:00' },
          { day: 'THU', startTime: '14:30', endTime: '16:00' },
        ],
      })
    );
    expect(overlap.status).toBe(400);
    expect(overlap.body.error.details[0].message).toMatch(/Overlaps/);
  });

  test('PROF-6 invalid department rejected', async () => {
    const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
    const res = await admin.agent.post('/api/professors').send(professor({ department: 'XYZ' }));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('department');
    expect(await Professor.countDocuments()).toBe(0);
  });

  test('PROF-7 duplicate email rejected with 409 DUPLICATE', async () => {
    const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
    await admin.agent.post('/api/professors').send(professor({ email: 'same@example.edu' }));
    const dup = await admin.agent.post('/api/professors').send(professor({ email: 'same@example.edu' }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE');
  });

  test('inactive professor reads respect privileged MFA without restricting the active public directory', async () => {
    const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
    const hidden = await admin.agent.post('/api/professors').send(professor({ isActive: false }));
    const active = await admin.agent.post('/api/professors').send(professor({ name: 'Active Professor' }));
    expect(hidden.status).toBe(201);
    expect((await admin.agent.get(`/api/professors/${hidden.body.data.id}`)).status).toBe(200);
    const previous = process.env.REQUIRE_PRIVILEGED_MFA;
    try {
      process.env.REQUIRE_PRIVILEGED_MFA = 'true';
      resetEnvCache();
      const list = await admin.agent.get('/api/professors').query({ includeInactive: 'true' });
      expect(list.body.data.map(value => value.id)).toEqual([active.body.data.id]);
      expect((await admin.agent.get(`/api/professors/${hidden.body.data.id}`)).status).toBe(404);
      expect((await request(ctx.app).get(`/api/professors/${active.body.data.id}`)).status).toBe(200);
      const enrolled = await User.findByIdAndUpdate(admin.user._id, { $set: { mfaEnabled: true } }, { new: true }).lean();
      const cookie = `uids_token=${signToken(enrolled, true)}`;
      const permitted = await request(ctx.app).get(`/api/professors/${hidden.body.data.id}`).set('Cookie', cookie);
      expect(permitted.status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.REQUIRE_PRIVILEGED_MFA;
      else process.env.REQUIRE_PRIVILEGED_MFA = previous;
      resetEnvCache();
    }
  });
});
