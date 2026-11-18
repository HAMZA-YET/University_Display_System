'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');

const departmentSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    displayOrder: { type: Number, default: 0 },
  },
  schemaOptions
);

module.exports = mongoose.models.Department || mongoose.model('Department', departmentSchema);
