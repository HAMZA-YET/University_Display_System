'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');

const ROLES = ['ADMIN', 'AUTHOR', 'REVIEWER', 'READER'];
const AUDIENCE_GROUPS = ['STUDENTS', 'FACULTY', 'STAFF'];

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
    audienceGroups: {
      type: [{ type: String, enum: AUDIENCE_GROUPS }],
      default: [],
      validate: {
        validator: groups => groups.length <= AUDIENCE_GROUPS.length && new Set(groups).size === groups.length,
        message: 'Audience groups must be unique trusted account groups.',
      },
    },
    isActive: { type: Boolean, default: true },
    activationPending: { type: Boolean, default: false },
    mfaEnabled: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0 },
  },
  schemaOptions
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.AUDIENCE_GROUPS = AUDIENCE_GROUPS;
