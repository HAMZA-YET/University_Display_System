'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');
const { CASE_EVENT_TYPES } = require('./lostFound.constants');

/**
 * Lost-and-found outbox for Member 4's notification jobs (D06).
 * Same envelope as Member 2's DomainEvent (eventId, idempotencyKey,
 * deliveryStatus) plus `recipients`: the member IDs that should be notified.
 * Payloads never contain claim evidence or private item details.
 */
const caseEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true, unique: true },
    type: { type: String, enum: CASE_EVENT_TYPES, required: true },
    entityType: { type: String, enum: ['LF_ITEM', 'LF_CLAIM'], required: true },
    entityId: { type: String, required: true },
    entityVersion: { type: Number, required: true },
    actor: { type: String, default: null },
    recipients: { type: [String], default: [] },
    source: { type: String, default: 'uids.lost-found' },
    timestamp: { type: Date, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    deliveryStatus: { type: String, enum: ['PENDING', 'DELIVERED'], default: 'PENDING' },
  },
  schemaOptions
);

caseEventSchema.index({ deliveryStatus: 1, timestamp: 1 });
caseEventSchema.index({ recipients: 1, timestamp: -1 });

module.exports = mongoose.models.LostFoundCaseEvent || mongoose.model('LostFoundCaseEvent', caseEventSchema);
