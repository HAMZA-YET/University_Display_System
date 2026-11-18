'use strict';

/**
 * Shared schema options: timestamps, strict mode and a toJSON transform that
 * removes __v and passwordHash and exposes "id".
 */
function transform(doc, ret) {
  ret.id = String(ret._id);
  delete ret.__v;
  delete ret.passwordHash;
  return ret;
}

module.exports = {
  timestamps: true,
  strict: true,
  toJSON: { virtuals: false, transform },
  toObject: { virtuals: false, transform },
};
