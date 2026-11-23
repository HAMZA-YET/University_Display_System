'use strict';

const mongoose = require('mongoose');

/** Per-year references and per-reporter transaction serialization counters. */
const counterSchema = new mongoose.Schema(
  { _id: { type: String, required: true }, seq: { type: Number, default: 0 } },
  { versionKey: false }
);

module.exports = mongoose.models.LostFoundCounter || mongoose.model('LostFoundCounter', counterSchema);
