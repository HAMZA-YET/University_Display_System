'use strict';

const mongoose = require('mongoose');
const schemaOptions = require('../../utils/schemaOptions');

/**
 * Metadata kept by the local attachment adapter. Part of the TEMPORARY
 * EXTERNAL INTEGRATION BOUNDARY: Member 1's gateway will own this data.
 * storageKey is internal and never returned by any API.
 */
const storedFileSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true, unique: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    size: { type: Number, required: true },
    validationStatus: { type: String, enum: ['VALID', 'REJECTED'], required: true },
    rejectionReason: { type: String, default: null },
    storageKey: { type: String, default: null, select: false },
    storageProvider: { type: String, enum: ['local', 'vercel-blob'], default: 'local', select: false },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  schemaOptions
);

module.exports = mongoose.models.StoredFile || mongoose.model('StoredFile', storedFileSchema);
