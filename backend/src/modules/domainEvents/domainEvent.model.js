'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');

const TYPES = [
  'NOTICE_PUBLISHED',
  'NOTICE_SCHEDULED',
  'NOTICE_CORRECTED',
  'NOTICE_WITHDRAWN',
  'NOTICE_ARCHIVED',
  'EVENT_CREATED',
  'EVENT_POSTPONED',
  'EVENT_CANCELLED',
];

const domainEventSchema = new mongoose.Schema(
  {
    sampleContentKey: { type: String, immutable: true, select: false },
    eventId: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true, unique: true },
    type: { type: String, enum: TYPES, required: true },
    entityType: { type: String, enum: ['NOTICE', 'EVENT'], required: true },
    entityId: { type: String, required: true },
    entityVersion: { type: Number, required: true },
    action: { type: String, required: true },
    actor: { type: String, default: null },
    source: { type: String, default: 'uids.publishing' },
    timestamp: { type: Date, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    deliveryStatus: { type: String, enum: ['PENDING', 'DELIVERED'], default: 'PENDING' },
  },
  schemaOptions
);

domainEventSchema.index({ type: 1, timestamp: -1 });
domainEventSchema.index({ entityId: 1, timestamp: -1 });

module.exports = mongoose.models.DomainEvent || mongoose.model('DomainEvent', domainEventSchema);
module.exports.TYPES = TYPES;
