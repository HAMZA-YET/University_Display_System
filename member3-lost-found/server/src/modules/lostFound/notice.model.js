'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');

/**
 * Short on-screen notices for students (the 5-second popup), for example
 * "Your claim was approved". Each notice is shown once, then marked seen.
 * Member 4's notification inbox can replace this later using the case events.
 */
const noticeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['success', 'error', 'info'], default: 'info' },
    text: { type: String, required: true, maxlength: 300 },
    link: { type: String, maxlength: 200, default: null },
    seenAt: { type: Date, default: null },
  },
  schemaOptions
);

noticeSchema.index({ user: 1, seenAt: 1, createdAt: 1 });

module.exports = mongoose.models.LostFoundNotice || mongoose.model('LostFoundNotice', noticeSchema);
