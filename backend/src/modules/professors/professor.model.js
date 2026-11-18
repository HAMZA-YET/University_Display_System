'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');

const POSITIONS = ['PROFESSOR', 'ASSOCIATE_PROFESSOR', 'ASSISTANT_PROFESSOR', 'LECTURER', 'VISITING_PROFESSOR', 'ADJUNCT'];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const slotSchema = new mongoose.Schema(
  {
    day: { type: String, enum: DAYS, required: true },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    location: { type: String, trim: true, maxlength: 100, default: null },
    note: { type: String, trim: true, maxlength: 200, default: null },
  },
  { _id: false }
);

const professorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    titlePrefix: { type: String, trim: true, maxlength: 20, default: null },
    department: { type: String, required: true },
    position: { type: String, enum: POSITIONS, required: true },
    officeRoom: { type: String, required: true, trim: true, maxlength: 50 },
    officeBuilding: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: null },
    counsellingHours: { type: [slotSchema], default: [] },
    subjects: { type: [String], default: [] },
    profileImage: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    version: { type: Number, default: 1, min: 1 },
  },
  schemaOptions
);

professorSchema.index({ department: 1, name: 1 });
professorSchema.index({ name: 'text', subjects: 'text' }, { name: 'professor_text' });

module.exports = mongoose.models.Professor || mongoose.model('Professor', professorSchema);
module.exports.POSITIONS = POSITIONS;
module.exports.DAYS = DAYS;
