'use strict';

const Notice = require('./notice.model');
const Revision = require('./revision.model');
const AppError = require('../../utils/AppError');
const clock = require('../../utils/clock');
const { withTransaction } = require('../../utils/transaction');
const { assertDepartment } = require('../departments/department.service');
const audit = require('../audit/audit.service');
const domainEvents = require('../domainEvents/domainEvent.service');
const { isOwner } = require('./stateMachine');
const { CONTENT_FIELDS, REASON_MIN } = require('./notice.constants');
const S = require('./notice.serializers');
const H = require('./notice.helpers');
const noticeService = require('./notice.service');

/**
 * Correction (revision) flow, Section 10.8.
 * An approved notice keeps showing its approved snapshot while a PENDING
 * correction is reviewed. Only one pending correction per notice.
 */

async function createCorrection(ctx, id, body) {
  const now = clock.now();
  const notice = await noticeService.loadNotice(id);
  const owner = isOwner(notice, ctx.user);
  if (ctx.user.role === 'AUTHOR' && !owner) throw AppError.notFound();
  if (!['AUTHOR', 'ADMIN'].includes(ctx.user.role)) throw AppError.forbidden('Only the author or an administrator can create a correction.');
  if (notice.status !== 'APPROVED' || !notice.approvedRevision) {
    throw AppError.invalidTransition('Corrections can be created only for approved notices.');
  }
  if (notice.pendingRevision) {
    throw new AppError(409, 'CORRECTION_PENDING', 'A correction for this notice is already waiting for review.');
  }
  if (notice.version !== body.baseVersion) throw AppError.versionConflict(notice.version);

  const approved = await Revision.findById(notice.approvedRevision).lean();
  await assertDepartment(body.department, { allowAll: true });
  const attachments =
    body.attachments !== undefined
      ? await H.resolveAttachments(body.attachments, ctx.user, approved.contentSnapshot.attachments)
      : approved.contentSnapshot.attachments;
  if (attachments.some((a) => a.validationStatus !== 'VALID')) {
    throw AppError.badRequest('Remove rejected attachments before submitting the correction.', [
      { location: 'body', field: 'attachments', message: 'Contains a rejected file' },
    ]);
  }
  const snapshot = H.snapshotFrom({
    ...body,
    contactEmail: body.contactEmail || null,
    actionDeadline: body.actionDeadline !== undefined ? body.actionDeadline : approved.contentSnapshot.actionDeadline,
    attachments,
  });

  const revision = await withTransaction(async (session) => {
    const last = await Revision.findOne({ notice: id }).sort({ revisionNumber: -1 }).session(session || null).lean();
    const [rev] = await Revision.create(
      [
        {
          notice: id,
          revisionNumber: (last ? last.revisionNumber : 0) + 1,
          kind: 'CORRECTION',
          author: ctx.user._id,
          contentSnapshot: snapshot,
          changeNote: body.changeNote,
          reviewDecision: 'PENDING',
          baseRevisionNumber: notice.approvedVersionNumber,
        },
      ],
      H.sessionOpts(session)
    );
    const updated = await Notice.findOneAndUpdate(
      { _id: id, version: body.baseVersion, status: 'APPROVED', pendingRevision: null },
      { $set: { pendingRevision: rev._id }, $inc: { version: 1 } },
      { new: true, ...H.sessionOpts(session) }
    ).lean();
    if (!updated) {
      if (!session) await Revision.deleteOne({ _id: rev._id });
      const current = await Notice.findById(id).session(session || null).lean();
      if (current && current.pendingRevision) {
        throw new AppError(409, 'CORRECTION_PENDING', 'A correction for this notice is already waiting for review.');
      }
      throw noticeService.staleOrInvalid(current, body.baseVersion);
    }
    await audit.record(
      ctx,
      { action: 'CORRECTION_SUBMITTED', entityType: 'NOTICE', entityId: id, toStatus: 'PENDING', reason: body.changeNote },
      session
    );
    return rev;
  });
  return { revision: S.revisionSummary(revision.toObject()), notice: await noticeService.loadManagementView(id, now) };
}

async function listRevisions(ctx, id) {
  const notice = await noticeService.loadNotice(id);
  noticeService.assertStaffCanView(notice, ctx.user);
  const revisions = await Revision.find({ notice: id })
    .sort({ revisionNumber: -1 })
    .populate('author', 'name email')
    .populate('reviewedBy', 'name email')
    .lean();
  return revisions.map((r) => ({ ...S.revisionSummary(r), isCurrent: String(r._id) === String(notice.approvedRevision) }));
}

function comparable(field, value) {
  if (field === 'attachments') {
    return JSON.stringify((value || []).map((a) => ({ fileId: a.fileId, fileName: a.fileName })));
  }
  if (value instanceof Date) return value.toISOString();
  if (value === undefined || value === '') return null;
  return value === null ? null : JSON.stringify(value);
}

async function diffRevision(ctx, id, revId) {
  const notice = await noticeService.loadNotice(id);
  noticeService.assertStaffCanView(notice, ctx.user);
  const revision = await Revision.findOne({ _id: revId, notice: id }).populate('author', 'name email').lean();
  if (!revision) throw AppError.notFound();
  const base = notice.approvedRevision ? await Revision.findById(notice.approvedRevision).lean() : null;
  const before = base ? base.contentSnapshot : {};
  const after = revision.contentSnapshot;
  const fields = CONTENT_FIELDS.map((field) => ({
    field,
    before: before[field] === undefined ? null : before[field],
    after: after[field] === undefined ? null : after[field],
    changed: comparable(field, before[field]) !== comparable(field, after[field]),
  }));
  return {
    base: base ? { id: String(base._id), revisionNumber: base.revisionNumber } : null,
    revision: S.revisionSummary(revision),
    fields,
    changedCount: fields.filter((f) => f.changed).length,
  };
}

async function loadPendingForDecision(ctx, id, revId) {
  if (!['REVIEWER', 'ADMIN'].includes(ctx.user.role)) throw AppError.forbidden();
  const notice = await noticeService.loadNotice(id);
  const revision = await Revision.findOne({ _id: revId, notice: id });
  if (!revision) throw AppError.notFound();
  if (revision.reviewDecision !== 'PENDING' || String(notice.pendingRevision) !== String(revId)) {
    throw AppError.invalidTransition('This correction is not waiting for review.');
  }
  if (notice.status !== 'APPROVED') {
    throw AppError.invalidTransition(`Cannot review a correction while the notice is ${notice.status}.`);
  }
  const ownWork = String(revision.author) === String(ctx.user._id) || isOwner(notice, ctx.user);
  let adminOverride = false;
  if (ownWork) {
    if (ctx.user.role === 'ADMIN') adminOverride = true;
    else throw AppError.forbidden('You cannot review a correction you authored.');
  }
  return { notice, revision, adminOverride };
}

async function approveCorrection(ctx, id, revId) {
  const now = clock.now();
  const { notice, revision, adminOverride } = await loadPendingForDecision(ctx, id, revId);
  const snapshot = revision.contentSnapshot.toObject ? revision.contentSnapshot.toObject() : revision.contentSnapshot;

  const result = await withTransaction(async (session) => {
    // Update the notice first (conditional), then make the revision immutable.
    const updated = await Notice.findOneAndUpdate(
      { _id: id, status: 'APPROVED', pendingRevision: revision._id },
      {
        $set: {
          approvedRevision: revision._id,
          approvedVersionNumber: revision.revisionNumber,
          pendingRevision: null,
          lastPublicUpdateAt: now,
          reviewer: ctx.user._id,
          publicSearch: H.publicSearchFrom(snapshot),
          // Keep the working copy aligned with the newly approved content.
          title: snapshot.title,
          summary: snapshot.summary,
          body: snapshot.body,
          category: snapshot.category,
          department: snapshot.department,
          audience: snapshot.audience,
          visibility: snapshot.visibility,
          publishingOffice: snapshot.publishingOffice,
          contactEmail: snapshot.contactEmail,
          actionDeadline: snapshot.actionDeadline,
          attachments: snapshot.attachments,
        },
        $push: {
          reviewHistory: { decision: 'CORRECTION_APPROVED', reviewer: ctx.user._id, decidedAt: now, reason: null, revisionNumber: revision.revisionNumber },
        },
        $inc: { version: 1 },
      },
      { new: true, ...H.sessionOpts(session) }
    ).lean();
    if (!updated) throw AppError.invalidTransition('The notice changed before the correction could be approved.');

    revision.reviewDecision = 'APPROVED';
    revision.reviewedBy = ctx.user._id;
    revision.reviewedAt = now;
    revision.approved = true;
    revision.approvedAt = now;
    await revision.save(H.sessionOpts(session));

    const domainEvent = await domainEvents.recordOnce(
      'NOTICE_CORRECTED',
      { entityType: 'NOTICE', entityId: id, entityVersion: revision.revisionNumber },
      domainEvents.noticePayload(updated, snapshot),
      { actor: ctx.user._id, action: 'approve-correction', timestamp: now, session }
    );
    await audit.record(
      ctx,
      {
        action: adminOverride ? 'CORRECTION_APPROVED_ADMIN_OVERRIDE' : 'CORRECTION_APPROVED',
        entityType: 'NOTICE',
        entityId: id,
        fromStatus: `REVISION ${notice.approvedVersionNumber}`,
        toStatus: `REVISION ${revision.revisionNumber}`,
        reason: revision.changeNote,
      },
      session
    );
    return { domainEvent };
  });
  return { notice: await noticeService.loadManagementView(id, now), domainEvent: domainEvents.toDomainEventView(result.domainEvent) };
}

async function rejectCorrection(ctx, id, revId, reason) {
  const now = clock.now();
  if (typeof reason !== 'string' || reason.trim().length < REASON_MIN) {
    throw AppError.badRequest(`A reason of at least ${REASON_MIN} characters is required.`, [
      { location: 'body', field: 'reason', message: `Reason must be at least ${REASON_MIN} characters` },
    ]);
  }
  const { revision, adminOverride } = await loadPendingForDecision(ctx, id, revId);
  await withTransaction(async (session) => {
    const updated = await Notice.findOneAndUpdate(
      { _id: id, pendingRevision: revision._id },
      {
        $set: { pendingRevision: null },
        $push: {
          reviewHistory: { decision: 'CORRECTION_REJECTED', reviewer: ctx.user._id, decidedAt: now, reason: reason.trim(), revisionNumber: revision.revisionNumber },
        },
        $inc: { version: 1 },
      },
      { new: true, ...H.sessionOpts(session) }
    ).lean();
    if (!updated) throw AppError.invalidTransition('The notice changed before the correction could be rejected.');
    revision.reviewDecision = 'REJECTED';
    revision.reviewReason = reason.trim();
    revision.reviewedBy = ctx.user._id;
    revision.reviewedAt = now;
    await revision.save(H.sessionOpts(session));
    await audit.record(
      ctx,
      {
        action: adminOverride ? 'CORRECTION_REJECTED_ADMIN_OVERRIDE' : 'CORRECTION_REJECTED',
        entityType: 'NOTICE',
        entityId: id,
        fromStatus: 'PENDING',
        toStatus: 'REJECTED',
        reason: reason.trim(),
      },
      session
    );
  });
  return { notice: await noticeService.loadManagementView(id, now) };
}

module.exports = { createCorrection, listRevisions, diffRevision, approveCorrection, rejectCorrection };
