'use strict';
const mongoose = require('mongoose');
const tokenSchema = new mongoose.Schema({
  digest: { type: String, unique: true, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  purpose: { type: String, enum: ['activation', 'recovery', 'mfa'], required: true },
  version: { type: Number, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});
const factorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  encryptedSecret: { type: String, required: true, select: false },
  enabled: { type: Boolean, default: false },
  expiresAt: Date,
  lastStep: { type: Number, default: -1 },
  attempts: { type: Number, default: 0 },
  recoveryHashes: { type: [String], select: false },
});
const revocationSchema = new mongoose.Schema({
  digest: { type: String, unique: true, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});
const deliveryThrottleSchema = new mongoose.Schema({
  _id: String,
  nextAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { versionKey: false });
module.exports = {
  AccountDeliveryThrottle: mongoose.models.AccountDeliveryThrottle || mongoose.model('AccountDeliveryThrottle', deliveryThrottleSchema),
  RevokedToken: mongoose.models.RevokedToken || mongoose.model('RevokedToken', revocationSchema),
  ActionToken: mongoose.models.ActionToken || mongoose.model('ActionToken', tokenSchema),
  SecurityFactor: mongoose.models.SecurityFactor || mongoose.model('SecurityFactor', factorSchema),
};
