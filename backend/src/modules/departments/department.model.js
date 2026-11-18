'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');

const departmentSchema = new mongoose.Schema(
  {
    sampleContentKey: { type: String, immutable: true, select: false },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, immutable: true, match: /^[A-Z]{2,10}$/ },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
    displayOrder: { type: Number, default: 0, min: 0, max: 10000, validate: Number.isInteger },
  },
  schemaOptions
);

module.exports = mongoose.models.Department || mongoose.model('Department', departmentSchema);
