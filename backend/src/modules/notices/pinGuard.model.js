'use strict';

const mongoose = require('mongoose');

// All capacity-increasing pin transactions write this document before counting.
// MongoDB retries conflicting transactions with a fresh view of the pin count.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  revision: { type: Number, default: 0 },
}, { versionKey: false });

module.exports = mongoose.models.NoticePinGuard || mongoose.model('NoticePinGuard', schema);
