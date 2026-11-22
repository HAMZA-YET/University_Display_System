'use strict';

const mongoose = require('mongoose');

/** Per-year sequence for item references (LF-2026-00001). */
const counterSchema = new mongoose.Schema(
  { _id: { type: String, required: true }, seq: { type: Number, default: 0 } },
  { versionKey: false }
);

module.exports = mongoose.models.LostFoundCounter || mongoose.model('LostFoundCounter', counterSchema);
