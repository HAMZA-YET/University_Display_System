'use strict';

const AuditLog = require('./audit.model');
const clock = require('../../utils/clock');
const logger = require('../../utils/logger');
const { getPaging, buildMeta } = require('../../utils/pagination');

/**
 * Records one audit entry. `ctx` carries actor, request ID and IP.
 * Accepts an optional MongoDB session so the entry commits with the change.
 */
async function record(ctx, entry, session) {
  const doc = {
    actor: ctx.user ? ctx.user._id : null,
    actorRole: ctx.user ? ctx.user.role : null,
    requestId: ctx.requestId || null,
    ip: ctx.ip || null,
    timestamp: entry.timestamp || clock.now(),
    action: entry.action,
    entityType: entry.entityType || null,
    entityId: entry.entityId ? String(entry.entityId) : null,
    fromStatus: entry.fromStatus || null,
    toStatus: entry.toStatus || null,
    reason: entry.reason || null,
  };
  const [created] = await AuditLog.create([doc], session ? { session } : undefined);
  return created;
}

/** Audit write that never throws (used for failed-authorization records). */
async function recordSafe(ctx, entry) {
  try {
    await record(ctx, entry);
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not write audit entry');
  }
}

function contextFromRequest(req) {
  return { user: req.user || null, requestId: req.id, ip: req.ip };
}

async function listAuditLogs(query) {
  const { page, limit, skip } = getPaging(query);
  const filter = {};
  if (query.action) filter.action = query.action;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.entityId) filter.entityId = query.entityId;
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ timestamp: -1, _id: -1 }).skip(skip).limit(limit).populate('actor', 'name email role').lean(),
    AuditLog.countDocuments(filter),
  ]);
  return {
    data: items.map((a) => ({
      id: String(a._id),
      actor: a.actor ? { id: String(a.actor._id), name: a.actor.name, email: a.actor.email } : null,
      actorRole: a.actorRole,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      fromStatus: a.fromStatus,
      toStatus: a.toStatus,
      reason: a.reason,
      requestId: a.requestId,
      ip: a.ip,
      timestamp: a.timestamp,
    })),
    meta: buildMeta(page, limit, total),
  };
}

module.exports = { record, recordSafe, contextFromRequest, listAuditLogs };
