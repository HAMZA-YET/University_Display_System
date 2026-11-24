'use strict';
const mongoose = require('mongoose');
const options = require('../../utils/schemaOptions');
const { Schema } = mongoose;
const owner = { type: Schema.Types.ObjectId, ref: 'User', required: true };
const bookmarkSchema = new Schema({ owner, notice: { type: Schema.Types.ObjectId, ref: 'Notice', required: true } }, options);
bookmarkSchema.index({ owner: 1, notice: 1 }, { unique: true });
const itemBookmarkSchema = new Schema({ owner, item: { type: Schema.Types.ObjectId, ref: 'LostFoundItem', required: true } }, options);
itemBookmarkSchema.index({ owner: 1, item: 1 }, { unique: true });
const followSchema = new Schema({ owner, kind: { type: String, enum: ['category', 'department'], required: true }, target: { type: String, required: true } }, options);
followSchema.index({ owner: 1, kind: 1, target: 1 }, { unique: true });
const preferenceSchema = new Schema({ owner, inApp: { type: Boolean, default: true }, notices: { type: Boolean, default: true }, deliverySince: { type: Date, required: true }, caseDeliverySince: { type: Date, default: null } }, options);
preferenceSchema.index({ owner: 1 }, { unique: true });
// Store references only. Titles, snippets and URLs are resolved against current visibility on every read.
const deliverySchema = new Schema({
  owner, eventId: { type: String, required: true }, type: { type: String, required: true },
  source: { type: String, enum: ['NOTICE', 'LOST_FOUND'], default: 'NOTICE' },
  notice: { type: Schema.Types.ObjectId, ref: 'Notice', required() { return this.source !== 'LOST_FOUND'; } },
  caseEvent: { type: Schema.Types.ObjectId, ref: 'LostFoundCaseEvent', required() { return this.source === 'LOST_FOUND'; } },
  occurredAt: { type: Date, required: true }, read: { type: Boolean, default: false }, readAt: { type: Date, default: null },
}, options);
deliverySchema.index({ owner: 1, eventId: 1 }, { unique: true });
deliverySchema.index({ owner: 1, occurredAt: -1, _id: -1 });
module.exports = {
  Bookmark: mongoose.models.MemberBookmark || mongoose.model('MemberBookmark', bookmarkSchema),
  ItemBookmark: mongoose.models.MemberItemBookmark || mongoose.model('MemberItemBookmark', itemBookmarkSchema),
  Follow: mongoose.models.MemberFollow || mongoose.model('MemberFollow', followSchema),
  Preference: mongoose.models.MemberPreference || mongoose.model('MemberPreference', preferenceSchema),
  Delivery: mongoose.models.MemberDelivery || mongoose.model('MemberDelivery', deliverySchema),
};
