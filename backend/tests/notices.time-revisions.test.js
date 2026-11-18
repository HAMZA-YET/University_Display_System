'use strict';

const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const clock = require('../src/utils/clock');
const Notice = require('../src/modules/notices/notice.model');
const Revision = require('../src/modules/notices/revision.model');

const ctx = useTestApp();

const T0 = new Date('2026-12-01T00:00:00.000Z');
const START = new Date('2026-12-02T00:00:00.000Z');
const END = new Date('2026-12-04T00:00:00.000Z');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

async function setup() {
  const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
  const reviewer = await F.createUserAndLogin(ctx.app, 'REVIEWER');
  return { author, reviewer };
}

/** Builds a scheduled notice with an event and a VALID attachment. */
async function scheduledNotice(author, reviewer, title = 'Graduation ceremony rehearsal schedule') {
  clock.set(T0);
  const upload = await author.agent.post('/api/attachments').attach('file', PDF, 'rehearsal-plan.pdf');
  expect(upload.status).toBe(201);
  expect(upload.body.data.validationStatus).toBe('VALID');
  const draft = await author.agent.post('/api/notices').send(
    F.completeNotice({
      title,
      requestedPublicationStart: START.toISOString(),
      requestedPublicationEnd: END.toISOString(),
      attachments: [{ fileId: upload.body.data.fileId }],
    })
  );
  expect(draft.status).toBe(201);
  const id = draft.body.data.id;
  const event = await author.agent.post('/api/events').send({
    noticeId: id,
    start: '2026-12-10T10:00:00+09:00',
    end: '2026-12-10T12:00:00+09:00',
    venue: 'Main Auditorium',
    organizer: 'Student Affairs Office',
  });
  expect(event.status).toBe(201);
  await author.agent.post(`/api/notices/${id}/submit`).send({});
  const approved = await reviewer.agent.post(`/api/notices/${id}/approve`).send({ mode: 'SCHEDULE' });
  expect(approved.status).toBe(200);
  expect(approved.body.data.effectiveStatus).toBe('SCHEDULED');
  expect(approved.body.domainEvent.type).toBe('NOTICE_SCHEDULED');
  return { id, fileId: upload.body.data.fileId, eventId: event.body.data.id };
}

/** Checks all five public paths at the current clock time. */
async function visibilityEverywhere({ id, fileId, eventId }, searchWord = 'rehearsal') {
  const app = ctx.app;
  const [list, detail, search, events, eventDetail, file] = await Promise.all([
    request(app).get('/api/public/notices'),
    request(app).get(`/api/public/notices/${id}`),
    request(app).get('/api/public/notices').query({ q: searchWord }),
    request(app).get('/api/public/events'),
    request(app).get(`/api/public/events/${eventId}`),
    request(app).get(`/api/public/attachments/${fileId}`),
  ]);
  return {
    list: list.body.data.some((n) => n.id === id),
    detail: detail.status === 200,
    search: search.body.data.some((n) => n.id === id),
    events: events.body.data.some((e) => e.id === eventId),
    eventDetail: eventDetail.status === 200,
    attachment: file.status === 200,
  };
}

const ALL_VISIBLE = { list: true, detail: true, search: true, events: true, eventDetail: true, attachment: true };
const ALL_HIDDEN = { list: false, detail: false, search: false, events: false, eventDetail: false, attachment: false };

describe('T04 Time boundaries (list, detail, search, events, attachment download)', () => {
  const cases = [
    ['1 ms before publicationStart: hidden', new Date(START.getTime() - 1), ALL_HIDDEN],
    ['exactly at publicationStart: visible', START, ALL_VISIBLE],
    ['after publicationStart: visible', new Date(START.getTime() + 60 * 1000), ALL_VISIBLE],
    ['1 ms before publicationEnd: visible', new Date(END.getTime() - 1), ALL_VISIBLE],
    ['exactly at publicationEnd: hidden', END, ALL_HIDDEN],
    ['after publicationEnd: hidden', new Date(END.getTime() + 60 * 1000), ALL_HIDDEN],
  ];

  test.each(cases)('T04 %s', async (label, at, expected) => {
    const { author, reviewer } = await setup();
    const handles = await scheduledNotice(author, reviewer);
    clock.set(at);
    expect(await visibilityEverywhere(handles)).toEqual(expected);
    const staff = await reviewer.agent.get(`/api/notices/${handles.id}`);
    const effective = at < START ? 'SCHEDULED' : at >= END ? 'EXPIRED' : 'PUBLISHED';
    expect(staff.body.data.effectiveStatus).toBe(effective);
  });

  test('T04 visibility does not depend on any background job (stored status stays APPROVED)', async () => {
    const { author, reviewer } = await setup();
    const handles = await scheduledNotice(author, reviewer);
    const stored = await Notice.findById(handles.id).lean();
    expect(stored.status).toBe('APPROVED');
    expect(stored.cachedEffectiveStatus).toBeNull();
    clock.set(START);
    expect((await visibilityEverywhere(handles)).detail).toBe(true);
  });

  test('T04 an action deadline in the past does not hide a notice whose window is open', async () => {
    const { author, reviewer } = await setup();
    clock.set(T0);
    const n = await F.createApproved(author.agent, reviewer.agent, {
      title: 'Apply for the exchange programme',
      actionDeadline: new Date(T0.getTime() - F.DAY).toISOString(),
    });
    const res = await request(ctx.app).get(`/api/public/notices/${n.id}`);
    expect(res.status).toBe(200);
    expect(new Date(res.body.data.actionDeadline).getTime()).toBe(T0.getTime() - F.DAY);
  });

  test('T04 schedule validation: start must be in the future and end after start', async () => {
    const { author, reviewer } = await setup();
    clock.set(T0);
    const s = await F.createSubmitted(author.agent, { requestedPublicationStart: T0.toISOString() });
    const past = await reviewer.agent
      .post(`/api/notices/${s.id}/approve`)
      .send({ mode: 'SCHEDULE', publicationStart: new Date(T0.getTime() - 1000).toISOString() });
    expect(past.status).toBe(400);
    const badEnd = await reviewer.agent
      .post(`/api/notices/${s.id}/approve`)
      .send({ mode: 'SCHEDULE', publicationStart: START.toISOString(), publicationEnd: START.toISOString() });
    expect(badEnd.status).toBe(400);
  });
});

describe('T04 Corrections (revisions)', () => {
  async function published(author, reviewer) {
    clock.set(T0);
    return F.createApproved(author.agent, reviewer.agent, {
      title: 'Library opening hours',
      summary: 'The library opens at 09:00 during the exam period.',
      body: 'During the exam period the library opens at 09:00 and closes at 22:00 every day.',
    });
  }

  function correctionBody(base, overrides = {}) {
    return {
      title: base.title,
      summary: 'The library opens at 08:00 during the exam period.',
      body: 'During the exam period the library opens at 08:00 and closes at 23:00 every day, including weekends.',
      category: base.category,
      department: base.department,
      audience: base.audience,
      visibility: base.visibility,
      publishingOffice: base.publishingOffice,
      contactEmail: base.contactEmail,
      changeNote: 'Opening time moved one hour earlier after the library committee decision.',
      baseVersion: base.version,
      ...overrides,
    };
  }

  test('T04 approved correction: old content visible during review, new content after approval, lastPublicUpdateAt set', async () => {
    const { author, reviewer } = await setup();
    const n = await published(author, reviewer);
    const created = await author.agent.post(`/api/notices/${n.id}/revisions`).send(correctionBody(n));
    expect(created.status).toBe(201);
    expect(created.body.data.reviewDecision).toBe('PENDING');

    const during = await request(ctx.app).get(`/api/public/notices/${n.id}`);
    expect(during.body.data.summary).toBe('The library opens at 09:00 during the exam period.');
    expect(during.body.data.updatedAt).toBeNull();
    const searchNew = await request(ctx.app).get('/api/public/notices').query({ q: 'weekends' });
    expect(searchNew.body.data).toHaveLength(0);

    // Only one pending correction at a time.
    const second = await author.agent.post(`/api/notices/${n.id}/revisions`).send(correctionBody(created.body.notice));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CORRECTION_PENDING');

    const diff = await reviewer.agent.get(`/api/notices/${n.id}/revisions/${created.body.data.id}/diff`);
    expect(diff.status).toBe(200);
    const changed = diff.body.data.fields.filter((f) => f.changed).map((f) => f.field);
    expect(changed.sort()).toEqual(['body', 'summary']);

    const queue = await reviewer.agent.get('/api/notices/review-queue');
    expect(queue.body.data.find((r) => r.type === 'CORRECTION').revisionId).toBe(created.body.data.id);

    clock.set(new Date(T0.getTime() + F.HOUR));
    const approved = await reviewer.agent.post(`/api/notices/${n.id}/revisions/${created.body.data.id}/approve`).send({});
    expect(approved.status).toBe(200);
    expect(approved.body.domainEvent.type).toBe('NOTICE_CORRECTED');

    const after = await request(ctx.app).get(`/api/public/notices/${n.id}`);
    expect(after.body.data.summary).toBe('The library opens at 08:00 during the exam period.');
    expect(new Date(after.body.data.updatedAt).getTime()).toBe(T0.getTime() + F.HOUR);
    const searchAfter = await request(ctx.app).get('/api/public/notices').query({ q: 'weekends' });
    expect(searchAfter.body.data.map((x) => x.id)).toContain(n.id);

    // The approved revision is immutable.
    const rev = await Revision.findById(created.body.data.id);
    rev.contentSnapshot.title = 'Tampered title';
    await expect(rev.save()).rejects.toThrow(/immutable/);
    const upd = await Revision.updateOne({ _id: created.body.data.id }, { $set: { 'contentSnapshot.title': 'Tampered' } });
    expect(upd.modifiedCount).toBe(0);
  });

  test('T04 rejected correction: old content stays, rejection reason saved', async () => {
    const { author, reviewer } = await setup();
    const n = await published(author, reviewer);
    const created = await author.agent.post(`/api/notices/${n.id}/revisions`).send(correctionBody(n));
    const reason = 'The committee decision has not been confirmed yet.';
    const rejected = await reviewer.agent.post(`/api/notices/${n.id}/revisions/${created.body.data.id}/reject`).send({ reason });
    expect(rejected.status).toBe(200);
    const pub = await request(ctx.app).get(`/api/public/notices/${n.id}`);
    expect(pub.body.data.summary).toBe('The library opens at 09:00 during the exam period.');
    expect(pub.body.data.updatedAt).toBeNull();
    const rev = await Revision.findById(created.body.data.id).lean();
    expect(rev.reviewDecision).toBe('REJECTED');
    expect(rev.reviewReason).toBe(reason);
    const view = await author.agent.get(`/api/notices/${n.id}`);
    expect(view.body.data.pendingRevision).toBeNull();
    expect(view.body.data.reviewHistory.some((h) => h.decision === 'CORRECTION_REJECTED' && h.reason === reason)).toBe(true);
  });

  test('T04 a correction requires a change note and the current base version', async () => {
    const { author, reviewer } = await setup();
    const n = await published(author, reviewer);
    const noNote = await author.agent.post(`/api/notices/${n.id}/revisions`).send(correctionBody(n, { changeNote: 'short' }));
    expect(noNote.status).toBe(400);
    const stale = await author.agent.post(`/api/notices/${n.id}/revisions`).send(correctionBody(n, { baseVersion: n.version - 1 }));
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });
});

describe('T04 Concurrent editing (optimistic locking)', () => {
  test('T04 second save with a stale version returns 409; first save is intact', async () => {
    const { author } = await setup();
    const draft = await author.agent.post('/api/notices').send(F.completeNotice({ title: 'Dormitory maintenance notice' }));
    const id = draft.body.data.id;
    // Bring the notice to version 3.
    await author.agent.patch(`/api/notices/${id}`).set('If-Match', '1').send({ summary: 'Maintenance in Dormitory A next week.' });
    const v3 = await author.agent.patch(`/api/notices/${id}`).set('If-Match', '2').send({ summary: 'Maintenance in Dormitory A and B next week.' });
    expect(v3.body.data.version).toBe(3);

    // Users A and B both loaded version 3.
    const userA = await author.agent.patch(`/api/notices/${id}`).set('If-Match', '3').send({ title: 'Dormitory A maintenance (A edit)' });
    expect(userA.status).toBe(200);
    expect(userA.body.data.version).toBe(4);
    const userB = await author.agent.patch(`/api/notices/${id}`).set('If-Match', '3').send({ title: 'Dormitory B maintenance (B edit)' });
    expect(userB.status).toBe(409);
    expect(userB.body.error.code).toBe('VERSION_CONFLICT');
    expect(userB.body.error.message).toBe(
      'This notice has been modified by another user. Please reload the latest version before saving.'
    );
    expect(userB.body.error.currentVersion).toBe(4);
    const stored = await Notice.findById(id).lean();
    expect(stored.title).toBe('Dormitory A maintenance (A edit)');
    expect(stored.version).toBe(4);
  });

  test('T04 expectedVersion in the body works and a missing If-Match returns 428', async () => {
    const { author } = await setup();
    const draft = await author.agent.post('/api/notices').send(F.completeNotice());
    const id = draft.body.data.id;
    const missing = await author.agent.patch(`/api/notices/${id}`).send({ title: 'No version sent here' });
    expect(missing.status).toBe(428);
    expect(missing.body.error.code).toBe('PRECONDITION_REQUIRED');
    const ok = await author.agent.patch(`/api/notices/${id}`).send({ title: 'Version sent in body', expectedVersion: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.version).toBe(2);
  });

  test('T04 only the owner can edit a draft', async () => {
    const { author } = await setup();
    const other = await F.createUserAndLogin(ctx.app, 'AUTHOR');
    const draft = await author.agent.post('/api/notices').send(F.completeNotice());
    const res = await other.agent.patch(`/api/notices/${draft.body.data.id}`).set('If-Match', '1').send({ title: 'Hijacked title text' });
    expect(res.status).toBe(404);
  });
});

describe('T04 Withdrawal and archive', () => {
  test('T04 withdrawal removes the notice from list, detail, search and attachment download immediately', async () => {
    const { author, reviewer } = await setup();
    const handles = await scheduledNotice(author, reviewer, 'Graduation rehearsal to withdraw');
    clock.set(new Date(START.getTime() + F.HOUR));
    expect(await visibilityEverywhere(handles)).toEqual(ALL_VISIBLE);
    const noReason = await reviewer.agent.post(`/api/notices/${handles.id}/withdraw`).send({ reason: 'short' });
    expect(noReason.status).toBe(400);
    const res = await reviewer.agent
      .post(`/api/notices/${handles.id}/withdraw`)
      .send({ reason: 'The ceremony venue has changed and a new notice will follow.' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('WITHDRAWN');
    expect(res.body.domainEvent.type).toBe('NOTICE_WITHDRAWN');
    expect(await visibilityEverywhere(handles)).toEqual(ALL_HIDDEN);
  });

  test('T04 an author may withdraw only their own published notice', async () => {
    const { author, reviewer } = await setup();
    const other = await F.createUserAndLogin(ctx.app, 'AUTHOR');
    const n = await F.createApproved(author.agent, reviewer.agent);
    const reason = 'Posted by mistake, the information is out of date.';
    expect((await other.agent.post(`/api/notices/${n.id}/withdraw`).send({ reason })).status).toBe(403);
    const ok = await author.agent.post(`/api/notices/${n.id}/withdraw`).send({ reason });
    expect(ok.status).toBe(200);
  });

  test('T04 archive works for WITHDRAWN or EXPIRED notices only and archived notices are never public', async () => {
    const { author, reviewer } = await setup();
    clock.set(T0);
    const live = await F.createApproved(author.agent, reviewer.agent, { title: 'Live notice not expired' }, { mode: 'NOW', publicationEnd: START.toISOString() });
    const early = await reviewer.agent.post(`/api/notices/${live.id}/archive`).send({});
    expect(early.status).toBe(409);
    clock.set(END);
    const archived = await reviewer.agent.post(`/api/notices/${live.id}/archive`).send({});
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe('ARCHIVED');
    clock.set(T0);
    expect((await request(ctx.app).get(`/api/public/notices/${live.id}`)).status).toBe(404);
    const list = await reviewer.agent.get('/api/notices');
    expect(list.body.data.map((x) => x.id)).not.toContain(live.id);
    const withArchived = await reviewer.agent.get('/api/notices').query({ archived: 'true' });
    expect(withArchived.body.data.map((x) => x.id)).toContain(live.id);
  });

  test('T04 staff list filters by computed effective status', async () => {
    const { author, reviewer } = await setup();
    clock.set(T0);
    const pub = await F.createApproved(author.agent, reviewer.agent, { title: 'Published filter check' });
    await F.createSubmitted(author.agent, { title: 'Submitted filter check' });
    const sched = await F.createApproved(
      author.agent,
      reviewer.agent,
      { title: 'Scheduled filter check', requestedPublicationStart: START.toISOString() },
      { mode: 'SCHEDULE' }
    );
    const published = await reviewer.agent.get('/api/notices').query({ status: 'PUBLISHED' });
    expect(published.body.data.map((x) => x.id)).toEqual([pub.id]);
    const scheduled = await reviewer.agent.get('/api/notices').query({ status: 'SCHEDULED' });
    expect(scheduled.body.data.map((x) => x.id)).toEqual([sched.id]);
  });
});
