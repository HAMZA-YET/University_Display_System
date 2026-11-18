'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');
const C = require('./notice.constants');

const { Schema } = mongoose;

const attachmentRefSchema = new Schema(
  {
    fileId: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    size: { type: Number, required: true },
    validationStatus: { type: String, enum: ['VALID', 'REJECTED', 'PENDING'], required: true },
  },
  { _id: false }
);

const reviewEntrySchema = new Schema(
  {
    decision: {
      type: String,
      enum: ['SUBMITTED', 'RETURNED', 'REJECTED', 'APPROVED', 'CORRECTION_APPROVED', 'CORRECTION_REJECTED', 'WITHDRAWN', 'ARCHIVED'],
      required: true,
    },
    reason: { type: String, default: null },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, required: true },
    revisionNumber: { type: Number, default: null },
  },
  { _id: false }
);

/**
 * Denormalized copy of the approved snapshot used for public filtering and
 * text search, so public queries never touch the working copy (5.4).
 */
const publicSearchSchema = new Schema(
  {
    title: String,
    summary: String,
    body: String,
    category: String,
    department: String,
    audience: String,
    visibility: String,
  },
  { _id: false }
);

const noticeSchema = new Schema(
  {
    sampleContentKey: { type: String, immutable: true, select: false },
    // Working copy. Drafts may be incomplete; full validation runs at submit.
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 150 },
    summary: { type: String, trim: true, maxlength: 300, default: null },
    body: { type: String, maxlength: 20000, default: null },
    category: { type: String, enum: [...C.CATEGORIES, null], default: null },
    department: { type: String, default: null },
    audience: { type: String, enum: [...C.AUDIENCES, null], default: null },
    visibility: { type: String, enum: [...C.VISIBILITIES, null], default: null },
    publishingOffice: { type: String, trim: true, maxlength: 120, default: null },
    contactEmail: { type: String, trim: true, lowercase: true, default: null },
    actionDeadline: { type: Date, default: null },
    requestedPublicationStart: { type: Date, default: null },
    requestedPublicationEnd: { type: Date, default: null },
    attachments: { type: [attachmentRefSchema], default: [] },

    // Controlled fields (reviewer/admin only).
    priority: { type: String, enum: C.PRIORITIES, default: 'NORMAL' },
    priorityRank: { type: Number, default: 0 },
    pinned: { type: Boolean, default: false },
    publicationStart: { type: Date, default: null },
    publicationEnd: { type: Date, default: null },

    // Workflow and tracking.
    status: { type: String, enum: C.WORKFLOW_STATUSES, default: 'DRAFT', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    version: { type: Number, default: 1, min: 1 },
    approvedRevision: { type: Schema.Types.ObjectId, ref: 'Revision', default: null },
    approvedVersionNumber: { type: Number, default: null },
    pendingRevision: { type: Schema.Types.ObjectId, ref: 'Revision', default: null },
    reviewHistory: { type: [reviewEntrySchema], default: [] },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
    withdrawalReason: { type: String, default: null },
    archivedAt: { type: Date, default: null },
    lastPublicUpdateAt: { type: Date, default: null },
    publicSearch: { type: publicSearchSchema, default: null },

    // Written only by the optional status-sync job; never read by public APIs.
    cachedEffectiveStatus: { type: String, default: null },
  },
  schemaOptions
);

noticeSchema.index({ status: 1, publicationStart: 1, publicationEnd: 1 });
noticeSchema.index({ department: 1, category: 1 });
noticeSchema.index({ pinned: -1, priorityRank: -1, publicationStart: -1 });
noticeSchema.index({ author: 1, updatedAt: -1 });
noticeSchema.index({ 'publicSearch.department': 1, 'publicSearch.category': 1 });
noticeSchema.index(
  { 'publicSearch.title': 'text', 'publicSearch.summary': 'text', 'publicSearch.body': 'text' },
  { name: 'public_search_text', weights: { 'publicSearch.title': 5, 'publicSearch.summary': 3, 'publicSearch.body': 1 } }
);

noticeSchema.pre('validate', function setRank(next) {
  this.priorityRank = C.PRIORITY_RANK[this.priority] || 0;
  next();
});

module.exports = mongoose.models.Notice || mongoose.model('Notice', noticeSchema);
module.exports.attachmentRefSchema = attachmentRefSchema;
