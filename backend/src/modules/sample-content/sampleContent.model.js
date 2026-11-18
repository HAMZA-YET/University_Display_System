'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({ _id: String, baseDate: Date, generation: { type: Number, default: 0 } }, { versionKey: false });
module.exports = mongoose.models.SampleContentState || mongoose.model('SampleContentState', schema);
