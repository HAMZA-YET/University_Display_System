'use strict';

const { getEffectiveStatus } = require('./visibility');
const { toPublicEvent, toManagementEvent } = require('../events/event.serializers');

/**
 * Explicit response contracts (D8). Each serializer builds its output from an
 * allowlist of fields. Public serializers never include reviewer identity,
 * review reasons, working-copy content, version history or attachments that
 * are not VALID.
 */

function idOf(value) {
  if (!value) return null;
  return String(value._id ? value._id : value);
}

function publicAttachments(list, urlBase) {
  return (list || [])
    .filter((a) => a && a.validationStatus === 'VALID')
    .map((a) => ({
      fileId: a.fileId,
      fileName: a.fileName,
      fileType: a.fileType,
      size: a.size,
      downloadUrl: `${urlBase}/${a.fileId}`,
    }));
}

/**
 * Public notice built from the approved revision snapshot (D3).
 * `revision` must be the approved Revision document (or a preview stand-in).
 */
function toPublicNotice(notice, revision, { now, event, includeBody = true, attachmentUrlBase = '/api/public/attachments' } = {}) {
  const s = revision.contentSnapshot;
  const out = {
    id: idOf(notice),
    title: s.title,
    summary: s.summary,
    category: s.category,
    department: s.department,
    audience: s.audience,
    visibility: s.visibility,
    publishingOffice: s.publishingOffice,
    contactEmail: s.contactEmail || null,
    actionDeadline: s.actionDeadline || null,
    priority: notice.priority,
    pinned: Boolean(notice.pinned),
    publishedAt: notice.publicationStart || null,
    publicationEnd: notice.publicationEnd || null,
    updatedAt: notice.lastPublicUpdateAt || null,
    attachments: publicAttachments(s.attachments, attachmentUrlBase),
  };
  if (includeBody) out.body = s.body;
  if (event !== undefined) out.event = event ? toPublicEvent(event, now, notice) : null;
  return out;
}

/** Preview: the working copy rendered in the public shape. Changes nothing. */
function toPreviewNotice(notice, { now, event = null }) {
  const pseudoRevision = {
    contentSnapshot: {
      title: notice.title,
      summary: notice.summary,
      body: notice.body,
      category: notice.category,
      department: notice.department,
      audience: notice.audience,
      visibility: notice.visibility,
      publishingOffice: notice.publishingOffice,
      contactEmail: notice.contactEmail,
      actionDeadline: notice.actionDeadline,
      attachments: notice.attachments,
    },
  };
  const view = toPublicNotice(
    { ...notice, publicationStart: notice.requestedPublicationStart, publicationEnd: notice.requestedPublicationEnd, lastPublicUpdateAt: null },
    pseudoRevision,
    { now, event, attachmentUrlBase: '/api/attachments' }
  );
  return { ...view, preview: true };
}

function userRef(u) {
  if (!u) return null;
  if (!u.name) return { id: idOf(u) };
  return { id: idOf(u), name: u.name, email: u.email };
}

function revisionSummary(rev) {
  if (!rev || !rev.contentSnapshot) return rev ? { id: idOf(rev) } : null;
  return {
    id: idOf(rev),
    revisionNumber: rev.revisionNumber,
    kind: rev.kind,
    author: userRef(rev.author),
    changeNote: rev.changeNote,
    reviewDecision: rev.reviewDecision,
    reviewReason: rev.reviewReason,
    reviewedBy: userRef(rev.reviewedBy),
    reviewedAt: rev.reviewedAt,
    approved: rev.approved,
    approvedAt: rev.approvedAt,
    createdAt: rev.createdAt,
    contentSnapshot: rev.contentSnapshot,
  };
}

/** Management view: working copy, controlled fields, history and review feedback. */
function toManagementNotice(notice, { now, event = null } = {}) {
  return {
    id: idOf(notice),
    title: notice.title,
    summary: notice.summary,
    body: notice.body,
    category: notice.category,
    department: notice.department,
    audience: notice.audience,
    visibility: notice.visibility,
    publishingOffice: notice.publishingOffice,
    contactEmail: notice.contactEmail,
    actionDeadline: notice.actionDeadline,
    requestedPublicationStart: notice.requestedPublicationStart,
    requestedPublicationEnd: notice.requestedPublicationEnd,
    attachments: notice.attachments || [],
    priority: notice.priority,
    pinned: notice.pinned,
    publicationStart: notice.publicationStart,
    publicationEnd: notice.publicationEnd,
    status: notice.status,
    effectiveStatus: getEffectiveStatus(notice, now),
    author: userRef(notice.author),
    reviewer: userRef(notice.reviewer),
    version: notice.version,
    approvedRevision: revisionSummary(notice.approvedRevision),
    approvedVersionNumber: notice.approvedVersionNumber,
    pendingRevision: revisionSummary(notice.pendingRevision),
    reviewHistory: (notice.reviewHistory || []).map((h) => ({
      decision: h.decision,
      reason: h.reason,
      reviewer: userRef(h.reviewer),
      decidedAt: h.decidedAt,
      revisionNumber: h.revisionNumber,
    })),
    submittedAt: notice.submittedAt,
    approvedAt: notice.approvedAt,
    publishedAt: notice.publishedAt,
    withdrawnAt: notice.withdrawnAt,
    withdrawalReason: notice.withdrawalReason,
    archivedAt: notice.archivedAt,
    lastPublicUpdateAt: notice.lastPublicUpdateAt,
    createdAt: notice.createdAt,
    updatedAt: notice.updatedAt,
    event: event ? toManagementEvent(event, now) : null,
  };
}

/** Compact management row for lists and the review queue. */
function toManagementListItem(notice, now) {
  return {
    id: idOf(notice),
    title: notice.title,
    department: notice.department,
    category: notice.category,
    status: notice.status,
    effectiveStatus: getEffectiveStatus(notice, now),
    priority: notice.priority,
    pinned: notice.pinned,
    author: userRef(notice.author),
    version: notice.version,
    requestedPublicationStart: notice.requestedPublicationStart,
    requestedPublicationEnd: notice.requestedPublicationEnd,
    publicationStart: notice.publicationStart,
    publicationEnd: notice.publicationEnd,
    submittedAt: notice.submittedAt,
    hasPendingCorrection: Boolean(notice.pendingRevision),
    lastReview: (() => {
      const decisions = (notice.reviewHistory || []).filter((h) => h.decision !== 'SUBMITTED');
      if (!decisions.length) return null;
      const h = decisions[decisions.length - 1];
      return { decision: h.decision, reason: h.reason, decidedAt: h.decidedAt, reviewer: userRef(h.reviewer) };
    })(),
    updatedAt: notice.updatedAt,
  };
}

module.exports = {
  toPublicNotice,
  toPreviewNotice,
  toManagementNotice,
  toManagementListItem,
  revisionSummary,
  publicAttachments,
};
