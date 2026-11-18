'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');

const auditSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null },
    action: { type: String, required: true },
    entityType: { type: String, default: null },
    entityId: { type: String, default: null },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    reason: { type: String, default: null },
    requestId: { type: String, default: null },
    ip: { type: String, default: null },
    timestamp: { type: Date, required: true },
  },
  schemaOptions
);

auditSchema.index({ timestamp: -1 });
auditSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema);
