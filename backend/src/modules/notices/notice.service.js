'use strict';

const Notice = require('./notice.model');
const Revision = require('./revision.model');
const Event = require('../events/event.model');
const AppError = require('../../utils/AppError');
const clock = require('../../utils/clock');
const { withTransaction } = require('../../utils/transaction');
const { getPaging, buildMeta } = require('../../utils/pagination');
const { containsRegex } = require('../../utils/regex');
const { assertDepartment } = require('../departments/department.service');
const audit = require('../audit/audit.service');
const domainEvents = require('../domainEvents/domainEvent.service');
const { applyTransition, isOwner } = require('./stateMachine');
const { getEffectiveStatus, effectiveStatusFilter, withEligibility } = require('./visibility');
const { submitValidation } = require('./notice.schemas');
const { PRIORITY_RANK } = require('./notice.constants');
const S = require('./notice.serializers');
const H = require('./notice.helpers');

// ---------------------------------------------------------------------------
// Loading helpers
// ---------------------------------------------------------------------------

async function loadNotice(id, session) {
  const notice = await Notice.findById(id).session(session || null).lean();
  if (!notice) throw AppError.notFound();
  return notice;
}

/** Staff may see a notice only if they are reviewer/admin or its author. */
function assertStaffCanView(notice, user) {
  if (user.role === 'REVIEWER' || user.role === 'ADMIN') return;
  if (user.role === 'AUTHOR' && isOwner(notice, user)) return;
  throw AppError.notFound();
}

async function loadManagementView(id, now) {
  const notice = await Notice.findById(id).populate(H.MANAGEMENT_POPULATE).lean();
  if (!notice) throw AppError.notFound();
  const event = await Event.findOne({ notice: id }).lean();
  return S.toManagementNotice(notice, { now, event });
}

function staleOrInvalid(current, expectedVersion, message) {
  if (current && expectedVersion !== null && expectedVersion !== undefined && current.version !== expectedVersion) {
    return AppError.versionConflict(current.version);
  }
  return AppError.invalidTransition(message || 'The notice changed state before your action was saved. Reload and try again.');
}

function versionFilter(expectedVersion) {
  return expectedVersion !== null && expectedVersion !== undefined ? { version: expectedVersion } : {};
}

function cleanDraftInput(body) {
  const out = { ...body };
  delete out.expectedVersion;
  if (out.contactEmail === '') out.contactEmail = null;
  return out;
}

function historyEntry(decision, user, now, extra = {}) {
  return { decision, reviewer: user ? user._id : null, decidedAt: now, reason: null, revisionNumber: null, ...extra };
}

// ---------------------------------------------------------------------------
// Author actions
// ---------------------------------------------------------------------------

async function createNotice(ctx, body) {
  const now = clock.now();
  applyTransition({ notice: null, action: 'create', user: ctx.user, now });
  const input = cleanDraftInput(body);
  await assertDepartment(input.department, { allowAll: true });
  H.assertWindow(input.requestedPublicationStart, input.requestedPublicationEnd);
  if (input.attachments) input.attachments = await H.resolveAttachments(input.attachments, ctx.user);
  const created = await withTransaction(async (session) => {
    const [doc] = await Notice.create(
      [{ ...input, author: ctx.user._id, status: 'DRAFT', version: 1 }],
      H.sessionOpts(session)
    );
    await audit.record(ctx, { action: 'NOTICE_CREATED', entityType: 'NOTICE', entityId: doc._id, toStatus: 'DRAFT' }, session);
    return doc;
  });
  return loadManagementView(created._id, now);
}

async function getNoticeForStaff(ctx, id) {
  const notice = await loadNotice(id);
  assertStaffCanView(notice, ctx.user);
  return loadManagementView(id, clock.now());
}

async function updateNotice(ctx, id, body, expectedVersion) {
  const now = clock.now();
  const notice = await loadNotice(id);
  assertStaffCanView(notice, ctx.user);
  const { from, to } = applyTransition({ notice, action: 'update', user: ctx.user, now });
  if (notice.version !== expectedVersion) throw AppError.versionConflict(notice.version);

  const changes = cleanDraftInput(body);
  await assertDepartment(changes.department, { allowAll: true });
  const start = changes.requestedPublicationStart !== undefined ? changes.requestedPublicationStart : notice.requestedPublicationStart;
  const end = changes.requestedPublicationEnd !== undefined ? changes.requestedPublicationEnd : notice.requestedPublicationEnd;
  H.assertWindow(start, end);
  if (changes.attachments) changes.attachments = await H.resolveAttachments(changes.attachments, ctx.user, notice.attachments);

  await withTransaction(async (session) => {
    const updated = await Notice.findOneAndUpdate(
      { _id: id, version: expectedVersion, status: { $in: ['DRAFT', 'RETURNED'] } },
      { $set: { ...changes, status: to }, $inc: { version: 1 } },
      { new: true, runValidators: true, ...H.sessionOpts(session) }
    ).lean();
    if (!updated) {
      const current = await Notice.findById(id).session(session || null).lean();
      throw staleOrInvalid(current, expectedVersion);
    }
    await audit.record(
      ctx,
      { action: 'NOTICE_UPDATED', entityType: 'NOTICE', entityId: id, fromStatus: from, toStatus: to },
      session
    );
  });
  return loadManagementView(id, now);
}

async function deleteDraft(ctx, id) {
  const notice = await loadNotice(id);
  if (!isOwner(notice, ctx.user)) throw AppError.notFound();
  if (!['DRAFT', 'RETURNED'].includes(notice.status) || notice.approvedRevision) {
    throw AppError.invalidTransition('Only drafts that were never approved can be deleted.');
  }
  await withTransaction(async (session) => {
    const res = await Notice.deleteOne(
      { _id: id, status: { $in: ['DRAFT', 'RETURNED'] }, approvedRevision: null },
      H.sessionOpts(session)
    );
    if (!res.deletedCount) throw AppError.invalidTransition('The notice changed before it could be deleted.');
    await Event.deleteMany({ notice: id }, H.sessionOpts(session));
    await audit.record(ctx, { action: 'NOTICE_DELETED', entityType: 'NOTICE', entityId: id, fromStatus: notice.status }, session);
  });
  return { deleted: true, id: String(id) };
}

async function previewNotice(ctx, id) {
  const notice = await loadNotice(id);
  assertStaffCanView(notice, ctx.user);
  const event = await Event.findOne({ notice: id }).lean();
  return S.toPreviewNotice(notice, { now: clock.now(), event });
}

function validateForSubmit(notice) {
  const result = submitValidation.safeParse({
    title: notice.title,
    summary: notice.summary,
    body: notice.body,
    category: notice.category,
    department: notice.department,
    audience: notice.audience,
    visibility: notice.visibility,
    publishingOffice: notice.publishingOffice,
    contactEmail: notice.contactEmail,
    actionDeadline: notice.actionDeadline ? new Date(notice.actionDeadline) : null,
    requestedPublicationStart: notice.requestedPublicationStart ? new Date(notice.requestedPublicationStart) : undefined,
    requestedPublicationEnd: notice.requestedPublicationEnd ? new Date(notice.requestedPublicationEnd) : null,
  });
  const details = [];
  if (!result.success) {
    for (const issue of result.error.issues) {
      details.push({ location: 'notice', field: issue.path.join('.'), message: issue.message });
    }
  }
  (notice.attachments || []).forEach((a, i) => {
    if (a.validationStatus !== 'VALID') {
      details.push({ location: 'notice', field: `attachments.${i}`, message: `Attachment "${a.fileName}" was rejected; remove it` });
    }
  });
  if (details.length) {
    throw AppError.badRequest('The notice is not complete. Fix the listed fields before submitting.', details);
  }
}

async function submitNotice(ctx, id, expectedVersion) {
  const now = clock.now();
  const notice = await loadNotice(id);
  assertStaffCanView(notice, ctx.user);
  const { from, to } = applyTransition({ notice, action: 'submit', user: ctx.user, now });
  if (expectedVersion !== null && expectedVersion !== undefined && notice.version !== expectedVersion) {
    throw AppError.versionConflict(notice.version);
  }
  validateForSubmit(notice);
  await assertDepartment(notice.department, { allowAll: true });

  await withTransaction(async (session) => {
    const updated = await Notice.findOneAndUpdate(
      { _id: id, status: from, version: notice.version },
      {
        $set: { status: to, submittedAt: now },
        $push: { reviewHistory: historyEntry('SUBMITTED', ctx.user, now) },
        $inc: { version: 1 },
      },
      { new: true, ...H.sessionOpts(session) }
    ).lean();
    if (!updated) throw staleOrInvalid(await Notice.findById(id).session(session || null).lean(), notice.version);
    await audit.record(ctx, { action: 'NOTICE_SUBMITTED', entityType: 'NOTICE', entityId: id, fromStatus: from, toStatus: to }, session);
  });
  return loadManagementView(id, now);
}

// ---------------------------------------------------------------------------
// Reviewer actions
// ---------------------------------------------------------------------------

async function decide(ctx, id, action, reason, expectedVersion) {
  const now = clock.now();
  const notice = await loadNotice(id);
  const { from, to, adminOverride } = applyTransition({ notice, action, user: ctx.user, now, reason });
  const decision = action === 'return' ? 'RETURNED' : 'REJECTED';
  await withTransaction(async (session) => {
    const updated = await Notice.findOneAndUpdate(
      { _id: id, status: from, ...versionFilter(expectedVersion) },
      {
        $set: { status: to, reviewer: ctx.user._id },
        $push: { reviewHistory: historyEntry(decision, ctx.user, now, { reason: reason.trim() }) },
        $inc: { version: 1 },
      },
      { new: true, ...H.sessionOpts(session) }
    ).lean();
    if (!updated) throw staleOrInvalid(await Notice.findById(id).session(session || null).lean(), expectedVersion);
    await audit.record(
      ctx,
      {
        action: adminOverride ? `NOTICE_${decision}_ADMIN_OVERRIDE` : `NOTICE_${decision}`,
        entityType: 'NOTICE',
        entityId: id,
        fromStatus: from,
        toStatus: to,
        reason: reason.trim(),
      },
      session
    );
  });
  return loadManagementView(id, now);
}

function returnNotice(ctx, id, reason, expectedVersion) {
  return decide(ctx, id, 'return', reason, expectedVersion);
}

function rejectNotice(ctx, id, reason, expectedVersion) {
  return decide(ctx, id, 'reject', reason, expectedVersion);
}

/** Works out and validates the approved publication window. */
function resolveWindow(notice, body, now) {
  let start;
  let end = body.publicationEnd !== undefined ? body.publicationEnd : notice.requestedPublicationEnd;
  if (body.mode === 'NOW') {
    start = now;
  } else {
    start = body.publicationStart || notice.requestedPublicationStart;
    if (!start) {
      throw AppError.badRequest('A publication start is required to schedule.', [
        { location: 'body', field: 'publicationStart', message: 'Required for SCHEDULE' },
      ]);
    }
    start = new Date(start);
    if (start.getTime() <= now.getTime()) {
      throw AppError.badRequest('A scheduled publication start must be in the future.', [
        { location: 'body', field: 'publicationStart', message: 'Must be in the future' },
      ]);
    }
  }
  end = end ? new Date(end) : null;
  if (end && end.getTime() <= start.getTime()) {
    throw AppError.badRequest('The publication end must be after the publication start.', [
      { location: 'body', field: 'publicationEnd', message: 'Must be after the start' },
    ]);
  }
  return { start, end };
}

async function approveNotice(ctx, id, body, expectedVersion) {
  const now = clock.now();
  const notice = await loadNotice(id);
  const { from, to, adminOverride } = applyTransition({ notice, action: 'approve', user: ctx.user, now });
  if (expectedVersion !== null && expectedVersion !== undefined && notice.version !== expectedVersion) {
    throw AppError.versionConflict(notice.version);
  }
  const { start, end } = resolveWindow(notice, body, now);
  const priority = body.priority || notice.priority || 'NORMAL';
  const pinned = body.pinned !== undefined ? body.pinned : Boolean(notice.pinned);
  const snapshot = H.snapshotFrom(notice);
  const isPublishedNow = start.getTime() <= now.getTime();

  const result = await withTransaction(async (session) => {
    if (pinned) await H.assertPinCapacity(now, id, session);
    const revisionCount = await Revision.countDocuments({ notice: id }).session(session || null);
    const [revision] = await Revision.create(
      [
        {
          notice: id,
          revisionNumber: revisionCount + 1,
          kind: 'INITIAL',
          author: notice.author,
          contentSnapshot: snapshot,
          reviewDecision: 'APPROVED',
          reviewedBy: ctx.user._id,
          reviewedAt: now,
          approved: true,
          approvedAt: now,
        },
      ],
      H.sessionOpts(session)
    );
    let updated;
    try {
      updated = await Notice.findOneAndUpdate(
        { _id: id, status: from, version: notice.version },
        {
          $set: {
            status: to,
            reviewer: ctx.user._id,
            approvedRevision: revision._id,
            approvedVersionNumber: revision.revisionNumber,
            publicationStart: start,
            publicationEnd: end,
            priority,
            priorityRank: PRIORITY_RANK[priority],
            pinned,
            approvedAt: now,
            publishedAt: start,
            publicSearch: H.publicSearchFrom(snapshot),
          },
          $push: { reviewHistory: historyEntry('APPROVED', ctx.user, now, { revisionNumber: revision.revisionNumber }) },
          $inc: { version: 1 },
        },
        { new: true, ...H.sessionOpts(session) }
      ).lean();
    } catch (err) {
      if (!session) await Revision.collection.deleteOne({ _id: revision._id });
      throw err;
    }
    if (!updated) {
      if (!session) await Revision.collection.deleteOne({ _id: revision._id });
      throw staleOrInvalid(await Notice.findById(id).session(session || null).lean(), notice.version);
    }

    // Domain events are recorded only after the state change is saved (D7).
    const type = isPublishedNow ? 'NOTICE_PUBLISHED' : 'NOTICE_SCHEDULED';
    const domainEvent = await domainEvents.recordOnce(
      type,
      { entityType: 'NOTICE', entityId: id, entityVersion: revision.revisionNumber },
      domainEvents.noticePayload(updated, snapshot),
      { actor: ctx.user._id, action: 'approve', timestamp: now, session }
    );
    const event = await Event.findOne({ notice: id }).session(session || null).lean();
    if (event && event.state !== 'CANCELLED') {
      await domainEvents.recordOnce(
        'EVENT_CREATED',
        { entityType: 'EVENT', entityId: event._id, entityVersion: 1 },
        domainEvents.eventPayload(event, updated),
        { actor: ctx.user._id, action: 'approve-notice', timestamp: now, session }
      );
    }
    await audit.record(
      ctx,
      {
        action: adminOverride ? 'NOTICE_APPROVED_ADMIN_OVERRIDE' : 'NOTICE_APPROVED',
        entityType: 'NOTICE',
        entityId: id,
        fromStatus: from,
        toStatus: isPublishedNow ? 'PUBLISHED' : 'SCHEDULED',
        reason: `Window ${start.toISOString()} to ${end ? end.toISOString() : 'open'}`,
      },
      session
    );
    return { domainEvent };
  });
  const view = await loadManagementView(id, now);
  return { notice: view, domainEvent: domainEvents.toDomainEventView(result.domainEvent) };
}

async function simpleTransition(ctx, id, action, { reason, expectedVersion, eventType }) {
  const now = clock.now();
  const notice = await loadNotice(id);
  const { from, to } = applyTransition({ notice, action, user: ctx.user, now, reason });
  const set = { status: to };
  const historyExtra = {};
  if (action === 'withdraw') {
    set.withdrawnAt = now;
    set.withdrawalReason = reason.trim();
    historyExtra.reason = reason.trim();
  }
  if (action === 'archive') set.archivedAt = now;
  const fromEffective = getEffectiveStatus(notice, now);

  const result = await withTransaction(async (session) => {
    const updated = await Notice.findOneAndUpdate(
      { _id: id, status: from, ...versionFilter(expectedVersion) },
      {
        $set: set,
        $push: { reviewHistory: historyEntry(to, ctx.user, now, historyExtra) },
        $inc: { version: 1 },
      },
      { new: true, ...H.sessionOpts(session) }
    ).lean();
    if (!updated) throw staleOrInvalid(await Notice.findById(id).session(session || null).lean(), expectedVersion);
    const snapshot = updated.publicSearch || H.snapshotFrom(updated);
    const domainEvent = await domainEvents.recordOnce(
      eventType,
      { entityType: 'NOTICE', entityId: id, entityVersion: updated.version },
      domainEvents.noticePayload(updated, snapshot),
      { actor: ctx.user._id, action, timestamp: now, session }
    );
    await audit.record(
      ctx,
      {
        action: `NOTICE_${to}`,
        entityType: 'NOTICE',
        entityId: id,
        fromStatus: fromEffective,
        toStatus: to,
        reason: reason ? reason.trim() : null,
      },
      session
    );
    return { domainEvent };
  });
  const view = await loadManagementView(id, now);
  return { notice: view, domainEvent: domainEvents.toDomainEventView(result.domainEvent) };
}

function withdrawNotice(ctx, id, reason, expectedVersion) {
  return simpleTransition(ctx, id, 'withdraw', { reason, expectedVersion, eventType: 'NOTICE_WITHDRAWN' });
}

function archiveNotice(ctx, id, expectedVersion) {
  return simpleTransition(ctx, id, 'archive', { expectedVersion, eventType: 'NOTICE_ARCHIVED' });
}

async function updatePlacement(ctx, id, body, expectedVersion) {
  const now = clock.now();
  const notice = await loadNotice(id);
  if (notice.status !== 'APPROVED' || getEffectiveStatus(notice, now) === 'EXPIRED') {
    throw AppError.invalidTransition('Priority and pinning can be changed only on scheduled or published notices.');
  }
  if (notice.version !== expectedVersion) throw AppError.versionConflict(notice.version);
  const set = {};
  if (body.priority) {
    set.priority = body.priority;
    set.priorityRank = PRIORITY_RANK[body.priority];
  }
  if (body.pinned !== undefined) set.pinned = body.pinned;
  await withTransaction(async (session) => {
    if (body.pinned === true && !notice.pinned) await H.assertPinCapacity(now, id, session);
    const updated = await Notice.findOneAndUpdate(
      { _id: id, version: expectedVersion, status: 'APPROVED' },
      { $set: set, $inc: { version: 1 } },
      { new: true, ...H.sessionOpts(session) }
    ).lean();
    if (!updated) throw staleOrInvalid(await Notice.findById(id).session(session || null).lean(), expectedVersion);
    await audit.record(
      ctx,
      {
        action: 'NOTICE_PLACEMENT_CHANGED',
        entityType: 'NOTICE',
        entityId: id,
        fromStatus: `${notice.priority}${notice.pinned ? ' PINNED' : ''}`,
        toStatus: `${updated.priority}${updated.pinned ? ' PINNED' : ''}`,
      },
      session
    );
  });
  return loadManagementView(id, now);
}

// ---------------------------------------------------------------------------
// Management lists
// ---------------------------------------------------------------------------

async function listManagement(ctx, query) {
  const now = clock.now();
  const { page, limit, skip } = getPaging(query);
  const parts = [];
  if (ctx.user.role === 'AUTHOR') parts.push({ author: ctx.user._id });
  else if (query.author) parts.push({ author: query.author });
  if (query.status) parts.push(effectiveStatusFilter(query.status, now));
  if (query.archived !== true && query.status !== 'ARCHIVED') parts.push({ status: { $ne: 'ARCHIVED' } });
  if (query.department) parts.push({ department: query.department });
  if (query.category) parts.push({ category: query.category });
  if (query.q) parts.push({ title: containsRegex(query.q) });
  const filter = parts.length ? { $and: parts } : {};
  const [items, total] = await Promise.all([
    Notice.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name email')
      .populate('reviewHistory.reviewer', 'name email')
      .lean(),
    Notice.countDocuments(filter),
  ]);
  return { data: items.map((n) => S.toManagementListItem(n, now)), meta: buildMeta(page, limit, total) };
}

/** SUBMITTED notices and PENDING corrections, oldest first. */
async function reviewQueue(ctx, query) {
  const now = clock.now();
  const { page, limit, skip } = getPaging(query);
  const [submitted, withCorrections] = await Promise.all([
    Notice.find({ status: 'SUBMITTED' }).populate('author', 'name email').lean(),
    Notice.find({ status: 'APPROVED', pendingRevision: { $ne: null } })
      .populate('author', 'name email')
      .populate({ path: 'pendingRevision', populate: { path: 'author', select: 'name email' } })
      .lean(),
  ]);
  const rows = [
    ...submitted.map((n) => ({
      type: 'NEW',
      noticeId: String(n._id),
      revisionId: null,
      title: n.title,
      author: { id: String(n.author._id), name: n.author.name },
      department: n.department,
      category: n.category,
      submittedAt: n.submittedAt,
      requestedPublicationStart: n.requestedPublicationStart,
      requestedPublicationEnd: n.requestedPublicationEnd,
      effectiveStatus: getEffectiveStatus(n, now),
      version: n.version,
      ownNotice: String(n.author._id) === String(ctx.user._id),
    })),
    ...withCorrections
      .filter((n) => n.pendingRevision && n.pendingRevision.reviewDecision === 'PENDING')
      .map((n) => ({
        type: 'CORRECTION',
        noticeId: String(n._id),
        revisionId: String(n.pendingRevision._id),
        title: n.pendingRevision.contentSnapshot.title,
        author: n.pendingRevision.author
          ? { id: String(n.pendingRevision.author._id), name: n.pendingRevision.author.name }
          : null,
        department: n.pendingRevision.contentSnapshot.department,
        category: n.pendingRevision.contentSnapshot.category,
        submittedAt: n.pendingRevision.createdAt,
        requestedPublicationStart: n.publicationStart,
        requestedPublicationEnd: n.publicationEnd,
        effectiveStatus: getEffectiveStatus(n, now),
        version: n.version,
        ownNotice: n.pendingRevision.author && String(n.pendingRevision.author._id) === String(ctx.user._id),
      })),
  ].sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  return { data: rows.slice(skip, skip + limit), meta: buildMeta(page, limit, rows.length) };
}

async function countPendingReviews() {
  const [a, b] = await Promise.all([
    Notice.countDocuments({ status: 'SUBMITTED' }),
    Notice.countDocuments({ status: 'APPROVED', pendingRevision: { $ne: null } }),
  ]);
  return a + b;
}

// ---------------------------------------------------------------------------
// Public reads (always through the D2 eligibility rule)
// ---------------------------------------------------------------------------

function publicUserFilters(query) {
  const filters = [];
  if (query.category) filters.push({ 'publicSearch.category': query.category });
  if (query.department) filters.push({ 'publicSearch.department': query.department });
  if (query.audience) filters.push({ 'publicSearch.audience': query.audience });
  if (query.pinned !== undefined) filters.push({ pinned: query.pinned });
  if (query.from) filters.push({ publicationStart: { $gte: query.from } });
  if (query.to) filters.push({ publicationStart: { $lte: query.to } });
  if (query.q) {
    if (query.q.length >= 3) {
      filters.push({ $text: { $search: query.q } });
    } else {
      const rx = containsRegex(query.q);
      filters.push({ $or: [{ 'publicSearch.title': rx }, { 'publicSearch.summary': rx }] });
    }
  }
  return filters;
}

const PUBLIC_SORT = { pinned: -1, priorityRank: -1, publicationStart: -1, _id: -1 };

async function listPublic(viewer, query) {
  const now = clock.now();
  const { page, limit, skip } = getPaging(query);
  const filter = withEligibility(now, viewer, ...publicUserFilters(query));
  const sort = query.sort === 'newest' ? { publicationStart: -1, _id: -1 } : PUBLIC_SORT;
  const [items, total] = await Promise.all([
    Notice.find(filter).sort(sort).skip(skip).limit(limit).populate('approvedRevision').lean(),
    Notice.countDocuments(filter),
  ]);
  return {
    data: items.filter((n) => n.approvedRevision).map((n) => S.toPublicNotice(n, n.approvedRevision, { now, includeBody: false })),
    meta: buildMeta(page, limit, total),
  };
}

async function getPublic(viewer, id) {
  const now = clock.now();
  const notice = await Notice.findOne(withEligibility(now, viewer, { _id: id })).populate('approvedRevision').lean();
  if (!notice || !notice.approvedRevision) throw AppError.notFound();
  const event = await Event.findOne({ notice: id }).lean();
  return S.toPublicNotice(notice, notice.approvedRevision, { now, event });
}

async function publicHome(viewer) {
  const now = clock.now();
  const [important, latest] = await Promise.all([
    Notice.find(withEligibility(now, viewer, { $or: [{ pinned: true }, { priorityRank: { $gte: 1 } }] }))
      .sort(PUBLIC_SORT)
      .limit(6)
      .populate('approvedRevision')
      .lean(),
    Notice.find(withEligibility(now, viewer)).sort({ publicationStart: -1, _id: -1 }).limit(6).populate('approvedRevision').lean(),
  ]);
  const map = (n) => S.toPublicNotice(n, n.approvedRevision, { now, includeBody: false });
  return { important: important.map(map), latest: latest.map(map) };
}

module.exports = {
  loadNotice,
  assertStaffCanView,
  loadManagementView,
  createNotice,
  getNoticeForStaff,
  updateNotice,
  deleteDraft,
  previewNotice,
  submitNotice,
  returnNotice,
  rejectNotice,
  approveNotice,
  withdrawNotice,
  archiveNotice,
  updatePlacement,
  listManagement,
  reviewQueue,
  countPendingReviews,
  listPublic,
  getPublic,
  publicHome,
  staleOrInvalid,
};
