'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');
const C = require('./lostFound.constants');

const historySchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null },
    action: { type: String, required: true },
    note: { type: String, maxlength: 1000, default: null },
  },
  { _id: false }
);

const handoverSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** Admin confirms they checked identity (no card number is stored). */
    identityChecked: { type: Boolean, required: true },
    recipientName: { type: String, required: true, maxlength: 100 },
    note: { type: String, maxlength: 500, default: null },
  },
  { _id: false }
);

const claimSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'LostFoundItem', required: true, index: true },
    claimant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: C.CLAIM_STATUS, default: 'PENDING', index: true },

    // ---- Private evidence: claimant + admin only ----
    evidenceText: { type: String, required: true, maxlength: 2000 },
    evidenceFileIds: { type: [String], default: [] },
    evidenceRedactedAt: { type: Date, default: null },

    decisionNote: { type: String, maxlength: 1000, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    handover: { type: handoverSchema, default: null },

    /** Hidden from the claimant's and admin's lists (kept for audit). */
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    history: { type: [historySchema], default: [] },
    version: { type: Number, default: 1, min: 1 },
  },
  schemaOptions
);

// A member holds at most one live claim per item (repeated submissions -> 409).
claimSchema.index(
  { item: 1, claimant: 1 },
  { unique: true, name: 'lf_one_active_claim_per_member', partialFilterExpression: { status: { $in: C.ACTIVE_CLAIM_STATUSES } } }
);
// One-collector rule at database level: at most one APPROVED claim per item.
claimSchema.index({ item: 1 }, { unique: true, name: 'lf_one_collector_per_item', partialFilterExpression: { status: 'APPROVED' } });
claimSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.models.LostFoundClaim || mongoose.model('LostFoundClaim', claimSchema);
