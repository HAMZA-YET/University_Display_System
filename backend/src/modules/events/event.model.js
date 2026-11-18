'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');

const { Schema } = mongoose;

function isValidTimeZone(tz) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (err) {
    return false;
  }
}

const scheduleChangeSchema = new Schema(
  {
    previousStart: { type: Date, required: true },
    previousEnd: { type: Date, required: true },
    changedAt: { type: Date, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
  },
  { _id: false }
);

const eventSchema = new Schema(
  {
    sampleContentKey: { type: String, immutable: true, select: false },
    notice: { type: Schema.Types.ObjectId, ref: 'Notice', required: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 150 },
    start: { type: Date, required: true },
    end: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          // Query updates are checked in the service, which knows both values.
          if (!(this instanceof mongoose.Document)) return true;
          return !this.start || value > this.start;
        },
        message: 'End must be after start',
      },
    },
    timezone: { type: String, default: 'Asia/Seoul', validate: { validator: isValidTimeZone, message: 'Unknown time zone' } },
    allDay: { type: Boolean, default: false },
    venue: { type: String, required: true, trim: true, maxlength: 150 },
    venueBuilding: { type: String, trim: true, maxlength: 100, default: null },
    venueRoom: { type: String, trim: true, maxlength: 50, default: null },
    organizer: { type: String, required: true, trim: true, maxlength: 120 },
    state: { type: String, enum: ['SCHEDULED', 'POSTPONED', 'CANCELLED'], default: 'SCHEDULED' },
    cancellationReason: { type: String, default: null },
    postponementReason: { type: String, default: null },
    scheduleHistory: { type: [scheduleChangeSchema], default: [] },
    version: { type: Number, default: 1, min: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  schemaOptions
);

// One event per notice in this MVP (see docs/DECISIONS.md).
eventSchema.index({ notice: 1 }, { unique: true });
eventSchema.index({ start: 1 });
eventSchema.index({ state: 1, start: 1 });

module.exports = mongoose.models.Event || mongoose.model('Event', eventSchema);
module.exports.isValidTimeZone = isValidTimeZone;
