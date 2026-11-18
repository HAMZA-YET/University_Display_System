'use strict';

const Event = require('./event.model');
const Notice = require('../notices/notice.model');
const AppError = require('../../utils/AppError');
const clock = require('../../utils/clock');
const { withTransaction } = require('../../utils/transaction');
const { getPaging, buildMeta } = require('../../utils/pagination');
const audit = require('../audit/audit.service');
const domainEvents = require('../domainEvents/domainEvent.service');
const { isOwner } = require('../notices/stateMachine');
const { withEligibility } = require('../notices/visibility');
const { getEventState, eventStateFilter } = require('./eventState');
const { toPublicEvent, toManagementEvent } = require('./event.serializers');

const EDITABLE_NOTICE_STATES = ['DRAFT', 'RETURNED'];

function sessionOpts(session) {
  return session ? { session } : {};
}

async function loadEventWithNotice(id) {
  const event = await Event.findById(id).lean();
  if (!event) throw AppError.notFound();
  const notice = await Notice.findById(event.notice).lean();
  if (!notice) throw AppError.notFound();
  return { event, notice };
}

function assertCanEditDraftEvent(notice, user) {
  if (!['AUTHOR', 'ADMIN'].includes(user.role)) throw AppError.forbidden();
  if (!isOwner(notice, user)) {
    if (user.role === 'AUTHOR') throw AppError.notFound();
    throw AppError.forbidden('Only the author of the notice can edit its event while it is a draft.');
  }
  if (!EDITABLE_NOTICE_STATES.includes(notice.status)) {
    throw AppError.invalidTransition(
      'Event details can be edited only while the notice is a draft. After approval use postpone or cancel.'
    );
  }
}

function assertStaffCanView(notice, user) {
  if (user.role === 'REVIEWER' || user.role === 'ADMIN') return;
  if (user.role === 'AUTHOR' && isOwner(notice, user)) return;
  throw AppError.notFound();
}

async function createEvent(ctx, body) {
  const now = clock.now();
  const notice = await Notice.findById(body.noticeId).lean();
  if (!notice) {
    throw AppError.badRequest('An event must belong to an existing notice.', [
      { location: 'body', field: 'noticeId', message: 'Notice not found' },
    ]);
  }
  assertCanEditDraftEvent(notice, ctx.user);
  if (await Event.exists({ notice: notice._id })) {
    throw new AppError(409, 'DUPLICATE', 'This notice already has an event. Edit the existing event instead.');
  }
  const { noticeId, ...details } = body;
  const event = await withTransaction(async (session) => {
    const [doc] = await Event.create(
      [
        {
          ...details,
          notice: noticeId,
          title: details.title || String(notice.title).slice(0, 150),
          timezone: details.timezone || 'Asia/Seoul',
          state: 'SCHEDULED',
          version: 1,
          createdBy: ctx.user._id,
        },
      ],
      sessionOpts(session)
    );
    await audit.record(ctx, { action: 'EVENT_CREATED', entityType: 'EVENT', entityId: doc._id, toStatus: 'SCHEDULED' }, session);
    return doc;
  });
  return toManagementEvent(event.toObject(), now);
}

async function updateEvent(ctx, id, body, expectedVersion) {
  const now = clock.now();
  const { event, notice } = await loadEventWithNotice(id);
  assertCanEditDraftEvent(notice, ctx.user);
  if (event.state === 'CANCELLED') throw AppError.invalidTransition('A cancelled event cannot be edited.');
  if (event.version !== expectedVersion) throw AppError.versionConflict(event.version, 'event');
  const changes = { ...body };
  delete changes.expectedVersion;
  const start = changes.start || event.start;
  const end = changes.end || event.end;
  if (new Date(end) <= new Date(start)) {
    throw AppError.badRequest('End must be after start.', [{ location: 'body', field: 'end', message: 'End must be after start' }]);
  }
  const updated = await withTransaction(async (session) => {
    const doc = await Event.findOneAndUpdate(
      { _id: id, version: expectedVersion, state: { $ne: 'CANCELLED' } },
      { $set: changes, $inc: { version: 1 } },
      { new: true, runValidators: true, ...sessionOpts(session) }
    ).lean();
    if (!doc) {
      const current = await Event.findById(id).session(session || null).lean();
      if (current && current.version !== expectedVersion) throw AppError.versionConflict(current.version, 'event');
      throw AppError.invalidTransition('The event changed before your edit was saved.');
    }
    await audit.record(ctx, { action: 'EVENT_UPDATED', entityType: 'EVENT', entityId: id }, session);
    return doc;
  });
  return toManagementEvent(updated, now);
}

async function deleteEvent(ctx, id) {
  const { notice } = await loadEventWithNotice(id);
  assertCanEditDraftEvent(notice, ctx.user);
  await withTransaction(async (session) => {
    await Event.deleteOne({ _id: id }, sessionOpts(session));
    await audit.record(ctx, { action: 'EVENT_DELETED', entityType: 'EVENT', entityId: id }, session);
  });
  return { deleted: true, id: String(id) };
}

async function reviewedChange(ctx, id, kind, body, expectedVersion) {
  const now = clock.now();
  if (!['REVIEWER', 'ADMIN'].includes(ctx.user.role)) throw AppError.forbidden();
  const { event, notice } = await loadEventWithNotice(id);
  if (notice.status !== 'APPROVED') {
    throw AppError.invalidTransition('Events can be postponed or cancelled only when their notice is approved.');
  }
  const current = getEventState(event, now);
  if (current === 'CANCELLED') throw AppError.invalidTransition('A cancelled event cannot be changed.');
  if (current === 'COMPLETED') throw AppError.invalidTransition('A completed event cannot be changed.');
  if (expectedVersion !== null && expectedVersion !== undefined && event.version !== expectedVersion) {
    throw AppError.versionConflict(event.version, 'event');
  }

  let update;
  let type;
  if (kind === 'postpone') {
    if (body.newEnd <= now) {
      throw AppError.badRequest('The new time must be in the future.', [
        { location: 'body', field: 'newEnd', message: 'Must be in the future' },
      ]);
    }
    type = 'EVENT_POSTPONED';
    update = {
      $set: { start: body.newStart, end: body.newEnd, state: 'POSTPONED', postponementReason: body.reason },
      $push: {
        scheduleHistory: {
          previousStart: event.start,
          previousEnd: event.end,
          changedAt: now,
          changedBy: ctx.user._id,
          reason: body.reason,
        },
      },
      $inc: { version: 1 },
    };
  } else {
    type = 'EVENT_CANCELLED';
    update = { $set: { state: 'CANCELLED', cancellationReason: body.reason }, $inc: { version: 1 } };
  }

  const result = await withTransaction(async (session) => {
    const updated = await Event.findOneAndUpdate(
      { _id: id, version: event.version, state: { $ne: 'CANCELLED' } },
      update,
      { new: true, ...sessionOpts(session) }
    ).lean();
    if (!updated) {
      const latest = await Event.findById(id).session(session || null).lean();
      if (latest && latest.state === 'CANCELLED') throw AppError.invalidTransition('A cancelled event cannot be changed.');
      throw AppError.versionConflict(latest ? latest.version : null, 'event');
    }
    const domainEvent = await domainEvents.recordOnce(
      type,
      { entityType: 'EVENT', entityId: id, entityVersion: updated.version },
      domainEvents.eventPayload(updated, notice),
      { actor: ctx.user._id, action: kind, timestamp: now, session }
    );
    await audit.record(
      ctx,
      { action: type, entityType: 'EVENT', entityId: id, fromStatus: event.state, toStatus: updated.state, reason: body.reason },
      session
    );
    return { updated, domainEvent };
  });
  return { event: toManagementEvent(result.updated, now), domainEvent: domainEvents.toDomainEventView(result.domainEvent) };
}

function postponeEvent(ctx, id, body, expectedVersion) {
  return reviewedChange(ctx, id, 'postpone', body, expectedVersion);
}

function cancelEvent(ctx, id, body, expectedVersion) {
  return reviewedChange(ctx, id, 'cancel', body, expectedVersion);
}

// ---------------------------------------------------------------------------
// Public reads: an event is public only when its parent notice is (D2).
// ---------------------------------------------------------------------------

async function listPublic(viewer, query) {
  const now = clock.now();
  const { page, limit, skip } = getPaging(query);
  const noticeFilter = query.department ? { 'publicSearch.department': query.department } : {};
  const notices = await Notice.find(withEligibility(now, viewer, noticeFilter)).select('_id publicSearch').lean();
  const byId = new Map(notices.map((n) => [String(n._id), n]));
  const filter = { notice: { $in: notices.map((n) => n._id) }, ...eventStateFilter(query.state, now) };
  if (query.from || query.to) {
    // Range overlap: the event intersects [from, to).
    const range = {};
    if (query.to) range.start = { $lt: query.to };
    if (query.from) range.end = { $gt: query.from };
    Object.assign(filter, { $and: [range] });
  }
  const sort = query.state === 'COMPLETED' || query.state === 'CANCELLED' ? { start: -1, _id: 1 } : { start: 1, _id: 1 };
  const [items, total] = await Promise.all([
    Event.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Event.countDocuments(filter),
  ]);
  return {
    data: items.map((e) => toPublicEvent(e, now, byId.get(String(e.notice)))),
    meta: buildMeta(page, limit, total),
  };
}

async function getPublic(viewer, id) {
  const now = clock.now();
  const event = await Event.findById(id).lean();
  if (!event) throw AppError.notFound();
  const notice = await Notice.findOne(withEligibility(now, viewer, { _id: event.notice })).select('_id publicSearch').lean();
  if (!notice) throw AppError.notFound();
  return toPublicEvent(event, now, notice);
}

async function listManagement(ctx, query) {
  const now = clock.now();
  const { page, limit, skip } = getPaging(query);
  const filter = { ...eventStateFilter(query.state, now) };
  if (query.noticeId) filter.notice = query.noticeId;
  if (ctx.user.role === 'AUTHOR') {
    const own = await Notice.find({ author: ctx.user._id }).distinct('_id');
    filter.notice = query.noticeId ? { $in: own.filter((n) => String(n) === query.noticeId) } : { $in: own };
  }
  const [items, total] = await Promise.all([
    Event.find(filter).sort({ start: 1 }).skip(skip).limit(limit).lean(),
    Event.countDocuments(filter),
  ]);
  return { data: items.map((e) => toManagementEvent(e, now)), meta: buildMeta(page, limit, total) };
}

async function getManagement(ctx, id) {
  const { event, notice } = await loadEventWithNotice(id);
  assertStaffCanView(notice, ctx.user);
  return toManagementEvent(event, clock.now());
}

async function countUpcomingPublic() {
  const now = clock.now();
  const ids = await Notice.find(withEligibility(now, null)).distinct('_id');
  return Event.countDocuments({ notice: { $in: ids }, ...eventStateFilter('UPCOMING', now) });
}

module.exports = {
  createEvent,
  updateEvent,
  deleteEvent,
  postponeEvent,
  cancelEvent,
  listPublic,
  getPublic,
  listManagement,
  getManagement,
  countUpcomingPublic,
};
