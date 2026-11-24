'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');

const POSITIONS = ['PROFESSOR', 'ASSOCIATE_PROFESSOR', 'ASSISTANT_PROFESSOR', 'LECTURER', 'VISITING_PROFESSOR', 'ADJUNCT', 'INSTRUCTOR', 'VISITING_FACULTY'];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Imported official profiles may omit facts the university has not published.
// Update queries carry the existing immutable source key in their predicate.
function requiredForLocalProfile() {
  return !(this.sourceKey || (typeof this.getFilter === 'function' && this.getFilter().sourceKey));
}

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
    sampleContentKey: { type: String, immutable: true, select: false },
    sourceKey: { type: String, immutable: true, match: /^kdu-global:[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    sourceUrl: { type: String, immutable: true, maxlength: 500 },
    sourceRetrievedAt: { type: Date, immutable: true },
    positionLabel: { type: String, immutable: true, trim: true, maxlength: 100 },
    roles: { type: [{ type: String, maxlength: 200 }], immutable: true, default: undefined },
    qualifications: { type: [{ type: String, maxlength: 300 }], immutable: true, default: undefined },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    titlePrefix: { type: String, trim: true, maxlength: 20, default: null },
    department: { type: String, required: requiredForLocalProfile, default: null },
    position: { type: String, enum: POSITIONS, required: requiredForLocalProfile, default: null },
    officeRoom: { type: String, required: requiredForLocalProfile, trim: true, maxlength: 50, default: null },
    officeBuilding: { type: String, required: requiredForLocalProfile, trim: true, maxlength: 100, default: null },
    email: { type: String, required: requiredForLocalProfile, lowercase: true, trim: true, default: null },
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
professorSchema.index({ email: 1 }, { name: 'professor_email_nonempty_unique', unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } });
professorSchema.index({ sourceKey: 1 }, { name: 'professor_source_key_unique', unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } });

module.exports = mongoose.models.Professor || mongoose.model('Professor', professorSchema);
module.exports.POSITIONS = POSITIONS;
module.exports.DAYS = DAYS;
