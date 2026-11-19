'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');
const C = require('./lostFound.constants');

/** Append-only history entry (shown to the admin). Never contains claim evidence. */
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

const itemSchema = new mongoose.Schema(
  {
    /** Human-readable unique reference, e.g. LF-2026-00042. */
    reference: { type: String, required: true, unique: true },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: C.ITEM_TYPES, required: true },

    // ---- Public fields ----
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 1500 },
    category: { type: String, enum: C.CATEGORIES, required: true },
    location: { type: String, required: true, trim: true, maxlength: 120 },
    /** Set automatically when the report is submitted (no date picker). */
    postedAt: { type: Date, required: true },
    /** FOUND items: where the item is now. */
    custodyNote: { type: String, trim: true, maxlength: 300, default: null },

    // ---- Contact (public only when the reporter chooses EVERYONE) ----
    contactDetails: { type: String, trim: true, maxlength: 200, default: null },
    contactVisibility: { type: String, enum: C.CONTACT_VISIBILITY, default: 'ADMIN' },

    // ---- Private (LOST items only; reporter + admin) ----
    privateDetails: { type: String, trim: true, maxlength: 1500, default: null },

    // ---- Lifecycle ----
    status: { type: String, enum: C.ITEM_STATUS, default: 'OPEN', index: true },
    /** The single claim allowed to collect. Set atomically with COLLECTION_APPROVED. */
    activeClaim: { type: mongoose.Schema.Types.ObjectId, ref: 'LostFoundClaim', default: null },
    returnedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** Attachment-gateway file IDs. */
    photoIds: { type: [String], default: [] },

    history: { type: [historySchema], default: [] },
    version: { type: Number, default: 1, min: 1 },
  },
  schemaOptions
);

itemSchema.index({ deletedAt: 1, status: 1, postedAt: -1 });
itemSchema.index({ reporter: 1, createdAt: -1 });

module.exports = mongoose.models.LostFoundItem || mongoose.model('LostFoundItem', itemSchema);
