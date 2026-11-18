'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');

const ROLES = ['ADMIN', 'AUTHOR', 'REVIEWER', 'READER'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email format is not valid'],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'READER' },
    department: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
  },
  schemaOptions
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
