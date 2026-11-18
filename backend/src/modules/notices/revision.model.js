'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');
const { attachmentRefSchema } = require('./notice.model');

const { Schema } = mongoose;

const contentSnapshotSchema = new Schema(
  {
    title: { type: String, required: true },
    summary: { type: String, required: true },
    body: { type: String, required: true },
    category: { type: String, required: true },
    department: { type: String, required: true },
    audience: { type: String, required: true },
    visibility: { type: String, required: true },
    publishingOffice: { type: String, required: true },
    contactEmail: { type: String, default: null },
    actionDeadline: { type: Date, default: null },
    attachments: { type: [attachmentRefSchema], default: [] },
  },
  { _id: false }
);

const revisionSchema = new Schema(
  {
    notice: { type: Schema.Types.ObjectId, ref: 'Notice', required: true },
    revisionNumber: { type: Number, required: true, min: 1 },
    kind: { type: String, enum: ['INITIAL', 'CORRECTION'], required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    contentSnapshot: { type: contentSnapshotSchema, required: true },
    changeNote: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          return this.kind !== 'CORRECTION' || (typeof value === 'string' && value.trim().length >= 10);
        },
        message: 'A correction requires a change note of at least 10 characters',
      },
    },
    reviewDecision: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'RETURNED'], default: 'PENDING' },
    reviewReason: { type: String, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    approved: { type: Boolean, default: false },
    approvedAt: { type: Date, default: null },
    baseRevisionNumber: { type: Number, default: null },
  },
  schemaOptions
);

revisionSchema.index({ notice: 1, revisionNumber: 1 }, { unique: true });
revisionSchema.index({ reviewDecision: 1, createdAt: 1 });
revisionSchema.index({ 'contentSnapshot.attachments.fileId': 1 });

// Approved revisions are immutable.
revisionSchema.post('init', function rememberApproved(doc) {
  doc.$locals.wasApproved = doc.approved === true;
});

revisionSchema.pre('save', function blockApprovedEdits(next) {
  if (!this.isNew && this.$locals.wasApproved) {
    return next(new Error('Approved revisions are immutable and cannot be changed.'));
  }
  return next();
});

function guardQueryUpdate(next) {
  // Any query-based update can only touch revisions that are not approved.
  this.where({ approved: { $ne: true } });
  next();
}
revisionSchema.pre('updateOne', guardQueryUpdate);
revisionSchema.pre('updateMany', guardQueryUpdate);
revisionSchema.pre('findOneAndUpdate', guardQueryUpdate);
revisionSchema.pre('replaceOne', guardQueryUpdate);

module.exports = mongoose.models.Revision || mongoose.model('Revision', revisionSchema);
