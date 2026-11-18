'use strict';

const request = require('supertest');
const { useTestApp } = require('./helpers/testApp');
const F = require('./helpers/fixtures');
const clock = require('../src/utils/clock');
const Event = require('../src/modules/events/event.model');
const DomainEvent = require('../src/modules/domainEvents/domainEvent.model');
const AuditLog = require('../src/modules/audit/audit.model');
const domainEvents = require('../src/modules/domainEvents/domainEvent.service');

const ctx = useTestApp();

const T0 = new Date('2026-12-01T00:00:00.000Z');

async function setup() {
  clock.set(T0);
  const author = await F.createUserAndLogin(ctx.app, 'AUTHOR');
  const reviewer = await F.createUserAndLogin(ctx.app, 'REVIEWER');
  return { author, reviewer };
}

const eventBody = (noticeId, overrides = {}) => ({
  noticeId,
  start: '2026-12-10T10:00:00+09:00',
  end: '2026-12-10T12:00:00+09:00',
  venue: 'Main Auditorium',
  venueBuilding: 'Global Hall',
  venueRoom: '101',
  organizer: 'Student Affairs Office',
  ...overrides,
});

/** Creates a published notice that carries an event. */
async function publishedWithEvent(author, reviewer, title = 'Career fair announcement', ev = {}) {
  const draft = await author.agent.post('/api/notices').send(F.completeNotice({ title, category: 'EVENT', requestedPublicationStart: T0.toISOString() }));
  const created = await author.agent.post('/api/events').send(eventBody(draft.body.data.id, ev));
  expect(created.status).toBe(201);
  await author.agent.post(`/api/notices/${draft.body.data.id}/submit`).send({});
  const approved = await reviewer.agent.post(`/api/notices/${draft.body.data.id}/approve`).send({ mode: 'NOW' });
  expect(approved.status).toBe(200);
  return { noticeId: draft.body.data.id, eventId: created.body.data.id };
}

describe('T12 Events', () => {
  test('T12-1 event creation is linked to a notice; an event without a notice is rejected', async () => {
    const { author } = await setup();
    const draft = await author.agent.post('/api/notices').send(F.completeNotice());
    const ok = await author.agent.post('/api/events').send(eventBody(draft.body.data.id, { title: 'Career fair' }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.noticeId).toBe(draft.body.data.id);
    expect(ok.body.data.timezone).toBe('Asia/Seoul');
    expect(ok.body.data.state).toBe('SCHEDULED');

    const { noticeId, ...withoutNotice } = eventBody(draft.body.data.id); // eslint-disable-line no-unused-vars
    const missing = await author.agent.post('/api/events').send(withoutNotice);
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.some((d) => d.field === 'noticeId')).toBe(true);
    const unknown = await author.agent.post('/api/events').send(eventBody('0123456789abcdef01234567'));
    expect(unknown.status).toBe(400);
    const badTimes = await author.agent.post('/api/events').send(eventBody(draft.body.data.id, { end: '2026-12-10T09:00:00+09:00' }));
    expect(badTimes.status).toBe(400);
  });

  test('T12-2 list and calendar-range queries return the same events with the same states', async () => {
    const { author, reviewer } = await setup();
    const a = await publishedWithEvent(author, reviewer, 'Career fair event', { start: '2026-12-10T10:00:00+09:00', end: '2026-12-10T12:00:00+09:00' });
    const b = await publishedWithEvent(author, reviewer, 'Sports day event', { start: '2026-12-20T09:00:00+09:00', end: '2026-12-20T17:00:00+09:00' });
    await reviewer.agent.post(`/api/events/${b.eventId}/cancel`).send({ reason: 'Weather warning issued for the whole region.' });
    const list = await request(ctx.app).get('/api/public/events');
    const calendar = await request(ctx.app)
      .get('/api/public/events')
      .query({ from: '2026-12-01T00:00:00+09:00', to: '2027-01-01T00:00:00+09:00' });
    const pick = (res) => res.body.data.map((e) => ({ id: e.id, state: e.state })).sort((x, y) => x.id.localeCompare(y.id));
    expect(pick(list)).toEqual(pick(calendar));
    expect(pick(list)).toHaveLength(2);
    expect(pick(list).find((e) => e.id === a.eventId).state).toBe('SCHEDULED');
    expect(pick(list).find((e) => e.id === b.eventId).state).toBe('CANCELLED');
  });

  test('T12-3 cancellation stores the reason, keeps the same _id, stays visible as CANCELLED and cannot be postponed', async () => {
    const { author, reviewer } = await setup();
    const { eventId } = await publishedWithEvent(author, reviewer);
    const noReason = await reviewer.agent.post(`/api/events/${eventId}/cancel`).send({});
    expect(noReason.status).toBe(400);
    const reason = 'The auditorium is closed for emergency repairs.';
    const res = await reviewer.agent.post(`/api/events/${eventId}/cancel`).send({ reason });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(eventId);
    expect(res.body.data.state).toBe('CANCELLED');
    expect(res.body.domainEvent.type).toBe('EVENT_CANCELLED');

    const pub = await request(ctx.app).get(`/api/public/events/${eventId}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.state).toBe('CANCELLED');
    expect(pub.body.data.cancellationReason).toBe(reason);
    const tab = await request(ctx.app).get('/api/public/events').query({ state: 'CANCELLED' });
    expect(tab.body.data.map((e) => e.id)).toEqual([eventId]);

    const postpone = await reviewer.agent
      .post(`/api/events/${eventId}/postpone`)
      .send({ newStart: '2026-12-12T10:00:00+09:00', newEnd: '2026-12-12T12:00:00+09:00', reason: 'Trying to move a cancelled event.' });
    expect(postpone.status).toBe(409);
    expect(postpone.body.error.code).toBe('INVALID_TRANSITION');
    expect(await Event.countDocuments()).toBe(1);
  });

  test('T12-4 postponement keeps the same _id, records history and the new times', async () => {
    const { author, reviewer } = await setup();
    const { eventId } = await publishedWithEvent(author, reviewer);
    const reason = 'The guest speaker flight was rescheduled.';
    const res = await reviewer.agent
      .post(`/api/events/${eventId}/postpone`)
      .send({ newStart: '2026-12-15T14:00:00+09:00', newEnd: '2026-12-15T16:00:00+09:00', reason });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(eventId);
    expect(res.body.data.state).toBe('POSTPONED');
    expect(res.body.data.scheduleHistory).toHaveLength(1);
    expect(new Date(res.body.data.scheduleHistory[0].previousStart).toISOString()).toBe('2026-12-10T01:00:00.000Z');
    expect(res.body.data.scheduleHistory[0].reason).toBe(reason);

    const pub = await request(ctx.app).get(`/api/public/events/${eventId}`);
    expect(new Date(pub.body.data.start).toISOString()).toBe('2026-12-15T05:00:00.000Z');
    expect(new Date(pub.body.data.originalStart).toISOString()).toBe('2026-12-10T01:00:00.000Z');
    expect(pub.body.data.postponementReason).toBe(reason);
    const postponedTab = await request(ctx.app).get('/api/public/events').query({ state: 'POSTPONED' });
    expect(postponedTab.body.data.map((e) => e.id)).toEqual([eventId]);
    expect(await Event.countDocuments()).toBe(1);
  });

  test('T12-5 COMPLETED is computed after the end time', async () => {
    const { author, reviewer } = await setup();
    const { eventId } = await publishedWithEvent(author, reviewer);
    clock.set(new Date('2026-12-10T02:59:59.999Z'));
    expect((await request(ctx.app).get(`/api/public/events/${eventId}`)).body.data.state).toBe('SCHEDULED');
    clock.set(new Date('2026-12-10T03:00:00.000Z'));
    expect((await request(ctx.app).get(`/api/public/events/${eventId}`)).body.data.state).toBe('COMPLETED');
    const completed = await request(ctx.app).get('/api/public/events').query({ state: 'COMPLETED' });
    expect(completed.body.data.map((e) => e.id)).toEqual([eventId]);
    const upcoming = await request(ctx.app).get('/api/public/events').query({ state: 'UPCOMING' });
    expect(upcoming.body.data).toHaveLength(0);
    expect((await Event.findById(eventId).lean()).state).toBe('SCHEDULED');
  });

  test('T12-6 the event of a hidden notice is hidden', async () => {
    const { author } = await setup();
    const draft = await author.agent.post('/api/notices').send(F.completeNotice());
    const ev = await author.agent.post('/api/events').send(eventBody(draft.body.data.id));
    expect((await request(ctx.app).get(`/api/public/events/${ev.body.data.id}`)).status).toBe(404);
    expect((await request(ctx.app).get('/api/public/events')).body.data).toHaveLength(0);
  });

  test('T12-7 event details are editable only while the notice is a draft; edits need If-Match', async () => {
    const { author, reviewer } = await setup();
    const draft = await author.agent.post('/api/notices').send(F.completeNotice());
    const ev = await author.agent.post('/api/events').send(eventBody(draft.body.data.id));
    const noVersion = await author.agent.patch(`/api/events/${ev.body.data.id}`).send({ venue: 'Room 205' });
    expect(noVersion.status).toBe(428);
    const edit = await author.agent.patch(`/api/events/${ev.body.data.id}`).set('If-Match', '1').send({ venue: 'Room 205' });
    expect(edit.status).toBe(200);
    const stale = await author.agent.patch(`/api/events/${ev.body.data.id}`).set('If-Match', '1').send({ venue: 'Room 999' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    await author.agent.post(`/api/notices/${draft.body.data.id}/submit`).send({});
    await reviewer.agent.post(`/api/notices/${draft.body.data.id}/approve`).send({ mode: 'NOW' });
    const afterApproval = await author.agent.patch(`/api/events/${ev.body.data.id}`).set('If-Match', '2').send({ venue: 'Room 300' });
    expect(afterApproval.status).toBe(409);
    const authorPostpone = await author.agent
      .post(`/api/events/${ev.body.data.id}/postpone`)
      .send({ newStart: '2026-12-12T10:00:00+09:00', newEnd: '2026-12-12T12:00:00+09:00', reason: 'Authors may not do this.' });
    expect(authorPostpone.status).toBe(403);
  });
});

describe('T12 Domain events and audit', () => {
  test('T12-8 one document per logical action; repeating returns the same eventId and the count stays 1', async () => {
    const { author, reviewer } = await setup();
    const submitted = await F.createSubmitted(author.agent);
    const first = await reviewer.agent.post(`/api/notices/${submitted.id}/approve`).send({ mode: 'NOW' });
    expect(first.status).toBe(200);
    const eventId = first.body.domainEvent.eventId;
    expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(eventId).toBe(domainEvents.buildEventId('NOTICE_PUBLISHED', submitted.id, 1));

    // Repeating the same HTTP request does not create a second event.
    const repeat = await reviewer.agent.post(`/api/notices/${submitted.id}/approve`).send({ mode: 'NOW' });
    expect(repeat.status).toBe(409);
    expect(await DomainEvent.countDocuments({ type: 'NOTICE_PUBLISHED', entityId: submitted.id })).toBe(1);

    // Re-recording the same logical operation (a retry) returns the same eventId.
    const retried = await domainEvents.recordOnce(
      'NOTICE_PUBLISHED',
      { entityType: 'NOTICE', entityId: submitted.id, entityVersion: 1 },
      { id: submitted.id },
      { actor: reviewer.user._id, timestamp: new Date('2030-01-01T00:00:00Z') }
    );
    expect(retried.eventId).toBe(eventId);
    expect(new Date(retried.timestamp).toISOString()).toBe(T0.toISOString());
    expect(await DomainEvent.countDocuments({ type: 'NOTICE_PUBLISHED', entityId: submitted.id })).toBe(1);

    const stored = await DomainEvent.findOne({ eventId }).lean();
    expect(stored.source).toBe('uids.publishing');
    expect(stored.deliveryStatus).toBe('PENDING');
    expect(Object.keys(stored.payload).sort()).toEqual(
      ['category', 'department', 'id', 'publicationEnd', 'publicationStart', 'state', 'title', 'visibility'].sort()
    );

    const listed = await reviewer.agent.get('/api/domain-events').query({ entityId: submitted.id });
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
  });

  test('T12-9 approving a notice with an event emits EVENT_CREATED; postpone emits EVENT_POSTPONED once', async () => {
    const { author, reviewer } = await setup();
    const { eventId } = await publishedWithEvent(author, reviewer);
    expect(await DomainEvent.countDocuments({ type: 'EVENT_CREATED', entityId: eventId })).toBe(1);
    const body = { newStart: '2026-12-15T14:00:00+09:00', newEnd: '2026-12-15T16:00:00+09:00', reason: 'Speaker travel delay confirmed.' };
    const p = await reviewer.agent.post(`/api/events/${eventId}/postpone`).set('If-Match', '1').send(body);
    expect(p.status).toBe(200);
    const again = await reviewer.agent.post(`/api/events/${eventId}/postpone`).set('If-Match', '1').send(body);
    expect(again.status).toBe(409);
    expect(await DomainEvent.countDocuments({ type: 'EVENT_POSTPONED', entityId: eventId })).toBe(1);
  });

  test('T12-10 audit log entries exist with actor, action, time and reason', async () => {
    const { author, reviewer } = await setup();
    const submitted = await F.createSubmitted(author.agent);
    const reason = 'Please attach the official registration form.';
    await reviewer.agent.post(`/api/notices/${submitted.id}/return`).send({ reason });
    const entry = await AuditLog.findOne({ action: 'NOTICE_RETURNED', entityId: submitted.id }).lean();
    expect(String(entry.actor)).toBe(String(reviewer.user._id));
    expect(entry.actorRole).toBe('REVIEWER');
    expect(entry.fromStatus).toBe('SUBMITTED');
    expect(entry.toStatus).toBe('RETURNED');
    expect(entry.reason).toBe(reason);
    expect(entry.timestamp.toISOString()).toBe(T0.toISOString());
    expect(entry.requestId).toBeTruthy();

    const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
    const logs = await admin.agent.get('/api/audit-logs').query({ entityId: submitted.id });
    expect(logs.status).toBe(200);
    expect(logs.body.data.map((l) => l.action)).toEqual(expect.arrayContaining(['NOTICE_CREATED', 'NOTICE_SUBMITTED', 'NOTICE_RETURNED']));
    expect((await reviewer.agent.get('/api/audit-logs')).status).toBe(403);
  });

  test('T12-11 admin summary counts by effective status', async () => {
    const { author, reviewer } = await setup();
    await F.createApproved(author.agent, reviewer.agent);
    await F.createSubmitted(author.agent);
    const admin = await F.createUserAndLogin(ctx.app, 'ADMIN');
    const res = await admin.agent.get('/api/admin/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.countsByEffectiveStatus.PUBLISHED).toBe(1);
    expect(res.body.data.countsByEffectiveStatus.SUBMITTED).toBe(1);
    expect(res.body.data.pendingReviews).toBe(1);
  });
});
