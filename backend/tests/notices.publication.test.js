'use strict';

const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const Notice = require('../src/modules/notices/notice.model');
const DomainEvent = require('../src/modules/domainEvents/domainEvent.model');
const AuditLog = require('../src/modules/audit/audit.model');

const ctx = useTestApp();

async function setup() {
  const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
  const reviewer = await F.createUserAndLogin(ctx.app, 'REVIEWER');
  const reader = await F.createUserAndLogin(ctx.app, 'READER');
  return { author, reviewer, reader };
}

describe('T03 Publication workflow', () => {
  test('T03-1 author creates and submits; reviewer approves with publish now; reader sees it', async () => {
    const { author, reviewer, reader } = await setup();
    const draft = await author.agent.post('/api/notices').send(F.completeNotice({ title: 'Scholarship applications open' }));
    expect(draft.status).toBe(201);
    expect(draft.body.data.status).toBe('DRAFT');
    expect(draft.body.data.version).toBe(1);

    const submitted = await author.agent.post(`/api/notices/${draft.body.data.id}/submit`).send({});
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('SUBMITTED');
    expect(submitted.body.data.submittedAt).toBeTruthy();

    const queue = await reviewer.agent.get('/api/notices/review-queue');
    expect(queue.body.data.map((r) => r.noticeId)).toContain(draft.body.data.id);

    const approved = await reviewer.agent.post(`/api/notices/${draft.body.data.id}/approve`).send({ mode: 'NOW', priority: 'HIGH' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('APPROVED');
    expect(approved.body.data.effectiveStatus).toBe('PUBLISHED');
    expect(approved.body.domainEvent.type).toBe('NOTICE_PUBLISHED');

    const list = await reader.agent.get('/api/public/notices');
    expect(list.status).toBe(200);
    expect(list.body.data.map((n) => n.id)).toContain(draft.body.data.id);
    expect(list.body.meta).toEqual(expect.objectContaining({ page: 1, limit: 20, total: 1, totalPages: 1 }));

    const anon = await request(ctx.app).get(`/api/public/notices/${draft.body.data.id}`);
    expect(anon.status).toBe(200);
    expect(anon.body.data.title).toBe('Scholarship applications open');
    expect(anon.body.data.priority).toBe('HIGH');
  });

  test('T03-2 a draft is not returned by public list, detail (404) or search', async () => {
    const { author } = await setup();
    const draft = await author.agent.post('/api/notices').send(F.completeNotice({ title: 'Secret draft about library hours' }));
    const id = draft.body.data.id;
    const list = await request(ctx.app).get('/api/public/notices');
    expect(list.body.data).toHaveLength(0);
    const detail = await request(ctx.app).get(`/api/public/notices/${id}`);
    expect(detail.status).toBe(404);
    expect(detail.body.error.code).toBe('NOT_FOUND');
    const search = await request(ctx.app).get('/api/public/notices').query({ q: 'library' });
    expect(search.body.data).toHaveLength(0);
    const shortSearch = await request(ctx.app).get('/api/public/notices').query({ q: 'Se' });
    expect(shortSearch.body.data).toHaveLength(0);
  });

  test('T03-3 a forced database write failure returns 500, no success message, status unchanged', async () => {
    const { author, reviewer } = await setup();
    const submitted = await F.createSubmitted(author.agent);
    const spy = jest.spyOn(Notice, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error('Simulated database write failure');
    });
    const res = await reviewer.agent.post(`/api/notices/${submitted.id}/approve`).send({ mode: 'NOW' });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/approved|published|success/i);
    expect(res.body.error.stack).toBeUndefined();
    const stored = await Notice.findById(submitted.id).lean();
    expect(stored.status).toBe('SUBMITTED');
    expect(stored.approvedRevision).toBeNull();
    expect(await DomainEvent.countDocuments({ entityId: submitted.id })).toBe(0);
    const pub = await request(ctx.app).get(`/api/public/notices/${submitted.id}`);
    expect(pub.status).toBe(404);
  });

  test('T03-4 author sees the reviewer decision and reason', async () => {
    const { author, reviewer } = await setup();
    const submitted = await F.createSubmitted(author.agent);
    const reason = 'Please add the exam room numbers for each department.';
    const returned = await reviewer.agent.post(`/api/notices/${submitted.id}/return`).send({ reason });
    expect(returned.status).toBe(200);
    expect(returned.body.data.status).toBe('RETURNED');

    const view = await author.agent.get(`/api/notices/${submitted.id}`);
    const last = view.body.data.reviewHistory[view.body.data.reviewHistory.length - 1];
    expect(last.decision).toBe('RETURNED');
    expect(last.reason).toBe(reason);
    expect(last.reviewer.name).toBe(reviewer.user.name);

    const list = await author.agent.get('/api/notices');
    expect(list.body.data[0].lastReview).toEqual(expect.objectContaining({ decision: 'RETURNED', reason }));

    // Editing a RETURNED notice moves it back to DRAFT, history stays visible.
    const edited = await author.agent
      .patch(`/api/notices/${submitted.id}`)
      .set('If-Match', String(view.body.data.version))
      .send({ body: 'Rooms: AI 301, IBA 204, BSC 110. Students must check the room before the exam week begins.' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.status).toBe('DRAFT');
    expect(edited.body.data.reviewHistory.some((h) => h.reason === reason)).toBe(true);
    const resubmitted = await author.agent.post(`/api/notices/${submitted.id}/submit`).send({});
    expect(resubmitted.body.data.status).toBe('SUBMITTED');

    // Reject is terminal and keeps the reason.
    const rejectReason = 'This duplicates the notice already published by the registrar.';
    const rejected = await reviewer.agent.post(`/api/notices/${submitted.id}/reject`).send({ reason: rejectReason });
    expect(rejected.body.data.status).toBe('REJECTED');
    const again = await author.agent.post(`/api/notices/${submitted.id}/submit`).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('T03-5 a reviewer cannot approve, return or reject their own notice (403)', async () => {
    const { reviewer } = await setup();
    // A reviewer cannot create notices, so the notice is planted directly as theirs.
    const notice = await Notice.create({
      ...F.completeNotice(),
      requestedPublicationStart: new Date(),
      author: reviewer.user._id,
      status: 'SUBMITTED',
    });
    for (const [action, body] of [
      ['approve', { mode: 'NOW' }],
      ['return', { reason: 'Returning my own notice is not allowed.' }],
      ['reject', { reason: 'Rejecting my own notice is not allowed.' }],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await reviewer.agent.post(`/api/notices/${notice._id}/${action}`).send(body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect((await Notice.findById(notice._id).lean()).status).toBe('SUBMITTED');
  });

  test('T03-5b admin may approve their own notice and the override is audited', async () => {
    const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
    const submitted = await F.createSubmitted(admin.agent);
    const res = await admin.agent.post(`/api/notices/${submitted.id}/approve`).send({ mode: 'NOW' });
    expect(res.status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'NOTICE_APPROVED_ADMIN_OVERRIDE', entityId: submitted.id })).toBe(1);
  });

  test('T03-6 reader cannot submit or approve (403); anonymous user gets 401', async () => {
    const { author, reader } = await setup();
    const submitted = await F.createSubmitted(author.agent);
    const asReaderSubmit = await reader.agent.post(`/api/notices/${submitted.id}/submit`).send({});
    expect(asReaderSubmit.status).toBe(403);
    const asReaderApprove = await reader.agent.post(`/api/notices/${submitted.id}/approve`).send({ mode: 'NOW' });
    expect(asReaderApprove.status).toBe(403);
    const anonApprove = await request(ctx.app).post(`/api/notices/${submitted.id}/approve`).send({ mode: 'NOW' });
    expect(anonApprove.status).toBe(401);
    const anonSubmit = await request(ctx.app).post(`/api/notices/${submitted.id}/submit`).send({});
    expect(anonSubmit.status).toBe(401);
    expect(await AuditLog.countDocuments({ action: 'AUTHORIZATION_FAILED' })).toBeGreaterThanOrEqual(2);
  });

  test('T03-7 reader cannot reach any management API directly', async () => {
    const { author, reader } = await setup();
    const submitted = await F.createSubmitted(author.agent);
    const id = submitted.id;
    const calls = [
      ['get', '/api/notices'],
      ['post', '/api/notices'],
      ['get', `/api/notices/${id}`],
      ['patch', `/api/notices/${id}`],
      ['get', `/api/notices/${id}/preview`],
      ['get', '/api/notices/review-queue'],
      ['post', `/api/notices/${id}/withdraw`],
      ['post', `/api/notices/${id}/archive`],
      ['patch', `/api/notices/${id}/placement`],
      ['get', `/api/notices/${id}/revisions`],
      ['get', '/api/events'],
      ['post', '/api/events'],
      ['get', '/api/users'],
      ['get', '/api/domain-events'],
      ['get', '/api/audit-logs'],
      ['get', '/api/admin/summary'],
      ['post', '/api/professors'],
      ['post', '/api/attachments'],
    ];
    for (const [method, url] of calls) {
      // eslint-disable-next-line no-await-in-loop
      const res = await reader.agent[method](url).send({});
      expect({ url, status: res.status }).toEqual({ url, status: 403 });
    }
  });

  test('T03-8 submit runs full validation and lists every missing field', async () => {
    const { author } = await setup();
    const draft = await author.agent.post('/api/notices').send({ title: 'Only a title for now' });
    expect(draft.status).toBe(201);
    const res = await author.agent.post(`/api/notices/${draft.body.data.id}/submit`).send({});
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d) => d.field).sort();
    expect(fields).toEqual(
      ['audience', 'body', 'category', 'department', 'publishingOffice', 'requestedPublicationStart', 'summary', 'visibility'].sort()
    );
    expect((await Notice.findById(draft.body.data.id).lean()).status).toBe('DRAFT');
  });

  test('T03-9 preview renders the public shape and changes nothing', async () => {
    const { author } = await setup();
    const draft = await author.agent.post('/api/notices').send(F.completeNotice());
    const before = await Notice.findById(draft.body.data.id).lean();
    const preview = await author.agent.get(`/api/notices/${draft.body.data.id}/preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.preview).toBe(true);
    expect(preview.body.data.title).toBe(before.title);
    expect(preview.body.data.reviewHistory).toBeUndefined();
    const after = await Notice.findById(draft.body.data.id).lean();
    expect(after.version).toBe(before.version);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.status).toBe('DRAFT');
  });

  test('T03-10 public sort: pinned first, then priority, then newest; pin limit is enforced', async () => {
    const { author, reviewer } = await setup();
    const normal = await F.createApproved(author.agent, reviewer.agent, { title: 'Normal notice one' });
    const urgent = await F.createApproved(author.agent, reviewer.agent, { title: 'Urgent notice two' }, { mode: 'NOW', priority: 'URGENT' });
    const pinned = await F.createApproved(author.agent, reviewer.agent, { title: 'Pinned notice three' }, { mode: 'NOW', pinned: true });
    const list = await request(ctx.app).get('/api/public/notices');
    expect(list.body.data.map((n) => n.id)).toEqual([pinned.id, urgent.id, normal.id]);

    // Change placement: pin the normal notice and raise its priority.
    const current = await reviewer.agent.get(`/api/notices/${normal.id}`);
    const placed = await reviewer.agent
      .patch(`/api/notices/${normal.id}/placement`)
      .set('If-Match', String(current.body.data.version))
      .send({ pinned: true, priority: 'URGENT' });
    expect(placed.status).toBe(200);
    const reordered = await request(ctx.app).get('/api/public/notices');
    expect(reordered.body.data[0].id).toBe(normal.id);

    // Placement without If-Match is refused with 428.
    const noVersion = await reviewer.agent.patch(`/api/notices/${urgent.id}/placement`).send({ pinned: true });
    expect(noVersion.status).toBe(428);

    // Fill up to the limit (5) and check the sixth pin is refused.
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await F.createApproved(author.agent, reviewer.agent, { title: `Pinned filler ${i + 1}` }, { mode: 'NOW', pinned: true });
    }
    const sixth = await F.createSubmitted(author.agent, { title: 'One pin too many' });
    const refused = await reviewer.agent.post(`/api/notices/${sixth.id}/approve`).send({ mode: 'NOW', pinned: true });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('PIN_LIMIT_REACHED');
  });

  test('T03-11 authors cannot set priority, pinned or status', async () => {
    const { author } = await setup();
    const res = await author.agent.post('/api/notices').send({ ...F.completeNotice(), pinned: true, priority: 'URGENT' });
    expect(res.status).toBe(400);
    const draft = await author.agent.post('/api/notices').send(F.completeNotice());
    const placement = await author.agent.patch(`/api/notices/${draft.body.data.id}/placement`).set('If-Match', '1').send({ pinned: true });
    expect(placement.status).toBe(403);
  });

  test('T03-12 CAMPUS notices are visible only to logged-in users', async () => {
    const { author, reviewer, reader } = await setup();
    const campus = await F.createApproved(author.agent, reviewer.agent, { title: 'Campus only parking notice', visibility: 'CAMPUS', audience: 'ALL' });
    expect((await request(ctx.app).get(`/api/public/notices/${campus.id}`)).status).toBe(404);
    expect((await request(ctx.app).get('/api/public/notices')).body.data).toHaveLength(0);
    expect((await reader.agent.get(`/api/public/notices/${campus.id}`)).status).toBe(200);
  });

  test('T03-13 home page data uses the same eligibility rule', async () => {
    const { author, reviewer } = await setup();
    const published = await F.createApproved(author.agent, reviewer.agent, { title: 'Published notice for home' }, { mode: 'NOW', priority: 'URGENT' });
    await F.createSubmitted(author.agent, { title: 'Submitted notice not for home' });
    const home = await request(ctx.app).get('/api/public/home');
    expect(home.status).toBe(200);
    expect(home.body.data.latest.map((n) => n.id)).toEqual([published.id]);
    expect(home.body.data.important.map((n) => n.id)).toEqual([published.id]);
  });
});
