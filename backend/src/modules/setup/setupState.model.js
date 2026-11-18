'use strict';

const mongoose = require('mongoose');

// MongoDB's built-in unique _id index is the global first-admin lock.
const setupStateSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  administrator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, select: false },
  completedAt: { type: Date, default: Date.now, required: true },
}, { versionKey: false });

module.exports = mongoose.models.SetupState || mongoose.model('SetupState', setupStateSchema);
