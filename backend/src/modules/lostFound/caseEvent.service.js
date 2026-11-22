'use strict';

const { v5: uuidv5 } = require('uuid');
const CaseEvent = require('./caseEvent.model');
const clock = require('../../utils/clock');
const { getPaging, buildMeta } = require('../../utils/pagination');

/** Fixed namespace for deterministic lost-and-found event IDs. Never change it. */
const NAMESPACE = '3a7d4c1e-9b2f-5c6d-8e0a-1f2b3c4d5e6f';

function buildKey(type, entityId, entityVersion) {
  return `${type}:${String(entityId)}:${entityVersion}`;
}

/**
 * Records a case event once. The same (type, entity, version) produces the
 * same eventId, so a retried request cannot create a second notification.
 * Call inside the same transaction as the state change when one is available.
 */
async function recordOnce(type, entity, { payload, recipients, actor, session } = {}) {
  const idempotencyKey = buildKey(type, entity.entityId, entity.entityVersion);
  const doc = {
    eventId: uuidv5(idempotencyKey, NAMESPACE),
    idempotencyKey,
    type,
    entityType: entity.entityType,
    entityId: String(entity.entityId),
    entityVersion: entity.entityVersion,
    actor: actor ? String(actor) : null,
    recipients: (recipients || []).filter(Boolean).map(String),
    source: 'uids.lost-found',
    timestamp: clock.now(),
    payload: payload || {},
    deliveryStatus: 'PENDING',
  };
  const opts = session ? { session } : {};
  try {
    await CaseEvent.updateOne(
      { idempotencyKey },
      { $setOnInsert: { ...doc, createdAt: clock.now(), updatedAt: clock.now() } },
      { upsert: true, timestamps: false, ...opts }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
}

function toView(e) {
  return {
    eventId: e.eventId,
    type: e.type,
    entityType: e.entityType,
    entityId: e.entityId,
    entityVersion: e.entityVersion,
    actor: e.actor,
    recipients: e.recipients,
    source: e.source,
    timestamp: e.timestamp,
    payload: e.payload,
    deliveryStatus: e.deliveryStatus,
  };
}

async function listCaseEvents(query) {
  const { page, limit, skip } = getPaging(query);
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.entityId) filter.entityId = query.entityId;
  const [items, total] = await Promise.all([
    CaseEvent.find(filter).sort({ timestamp: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    CaseEvent.countDocuments(filter),
  ]);
  return { data: items.map(toView), meta: buildMeta(page, limit, total) };
}

module.exports = { NAMESPACE, buildKey, recordOnce, listCaseEvents, toView };
