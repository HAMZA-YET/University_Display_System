'use strict';

const { v5: uuidv5 } = require('uuid');
const DomainEvent = require('./domainEvent.model');
const clock = require('../../utils/clock');
const { getPaging, buildMeta } = require('../../utils/pagination');

/** Fixed namespace for deterministic event IDs (D7). Never change it. */
const NAMESPACE = '6f1c2b8e-4d3a-5e7f-9a10-b2c3d4e5f601';

function buildKey(type, entityId, entityVersion) {
  return `${type}:${String(entityId)}:${entityVersion}`;
}

function buildEventId(type, entityId, entityVersion) {
  return uuidv5(buildKey(type, entityId, entityVersion), NAMESPACE);
}

/**
 * recordOnce(type, entity, payload, options)
 * entity = { entityType, entityId, entityVersion }
 * options = { actor, action, timestamp, session }
 *
 * Upserts with $setOnInsert on the unique idempotencyKey, so the same logical
 * operation recorded twice produces one document and the same eventId.
 * Must be called only after the state change is saved.
 */
async function recordOnce(type, entity, payload, options = {}) {
  const idempotencyKey = buildKey(type, entity.entityId, entity.entityVersion);
  const eventId = buildEventId(type, entity.entityId, entity.entityVersion);
  const doc = {
    eventId,
    idempotencyKey,
    type,
    entityType: entity.entityType,
    entityId: String(entity.entityId),
    entityVersion: entity.entityVersion,
    action: options.action || type,
    actor: options.actor ? String(options.actor) : null,
    source: 'uids.publishing',
    timestamp: options.timestamp || clock.now(),
    payload: payload || {},
    deliveryStatus: 'PENDING',
  };
  const sessionOpt = options.session ? { session: options.session } : {};
  try {
    await DomainEvent.updateOne(
      { idempotencyKey },
      { $setOnInsert: { ...doc, createdAt: clock.now(), updatedAt: clock.now() } },
      { upsert: true, timestamps: false, ...sessionOpt }
    );
  } catch (err) {
    // Two concurrent upserts can race on the unique index; the loser just reads.
    if (err.code !== 11000) throw err;
  }
  return DomainEvent.findOne({ idempotencyKey }, null, sessionOpt).lean();
}

function toDomainEventView(e) {
  return {
    eventId: e.eventId,
    idempotencyKey: e.idempotencyKey,
    type: e.type,
    entityType: e.entityType,
    entityId: e.entityId,
    entityVersion: e.entityVersion,
    action: e.action,
    actor: e.actor,
    source: e.source,
    timestamp: e.timestamp,
    payload: e.payload,
    deliveryStatus: e.deliveryStatus,
  };
}

async function listDomainEvents(query) {
  const { page, limit, skip } = getPaging(query);
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.entityId) filter.entityId = query.entityId;
  const [items, total] = await Promise.all([
    DomainEvent.find(filter).sort({ timestamp: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    DomainEvent.countDocuments(filter),
  ]);
  return { data: items.map(toDomainEventView), meta: buildMeta(page, limit, total) };
}

/** Public-safe payload for notice events (CONTRACTS.md). */
function noticePayload(notice, snapshot) {
  return {
    id: String(notice._id),
    title: snapshot.title,
    department: snapshot.department,
    category: snapshot.category,
    visibility: snapshot.visibility,
    publicationStart: notice.publicationStart || null,
    publicationEnd: notice.publicationEnd || null,
    state: notice.status,
  };
}

/** Public-safe payload for event (calendar) domain events. */
function eventPayload(event, notice) {
  return {
    id: String(event._id),
    noticeId: String(event.notice && event.notice._id ? event.notice._id : event.notice),
    title: event.title,
    department: notice && notice.publicSearch ? notice.publicSearch.department : null,
    start: event.start,
    end: event.end,
    timezone: event.timezone,
    venue: event.venue,
    state: event.state,
  };
}

module.exports = {
  NAMESPACE,
  buildKey,
  buildEventId,
  recordOnce,
  listDomainEvents,
  toDomainEventView,
  noticePayload,
  eventPayload,
};
