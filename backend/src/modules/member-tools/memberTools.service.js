'use strict';
const { Bookmark, Follow, Preference, Delivery } = require('./memberTools.models');
const Notice = require('../notices/notice.model');
const Event = require('../events/event.model');
const DomainEvent = require('../domainEvents/domainEvent.model');
const { withEligibility } = require('../notices/visibility');
const { assertDepartment } = require('../departments/department.service');
const { CATEGORIES } = require('../notices/notice.constants');
const { getPaging, buildMeta } = require('../../utils/pagination');
const clock = require('../../utils/clock');
const AppError = require('../../utils/AppError');

async function insertOnce(Model, filter, fields) {
  // Wait for unique indexes before the first production upsert, including cold starts.
  await Model.init();
  const now = clock.now();
  try {
    await Model.updateOne(filter, { $setOnInsert: { ...fields, createdAt: now, updatedAt: now } }, { upsert: true, timestamps: false });
  } catch (error) { if (error.code !== 11000) throw error; }
  return Model.findOne(filter).lean();
}
function safeNotice(notice) {
  return { id: String(notice._id), title: notice.publicSearch.title, summary: notice.publicSearch.summary || '', category: notice.publicSearch.category, department: notice.publicSearch.department, href: `/notices/${notice._id}` };
}
async function visibleNotice(id, user) {
  return Notice.findOne(withEligibility(clock.now(), user, { _id: id })).select('_id publicSearch').lean();
}
async function visibleMap(ids, user) {
  const notices = await Notice.find(withEligibility(clock.now(), user, { _id: { $in: ids } })).select('_id publicSearch').lean();
  return new Map(notices.map((notice) => [String(notice._id), safeNotice(notice)]));
}
async function preferences(user) {
  const p = await insertOnce(Preference, { owner: user._id }, { owner: user._id, inApp: true, notices: true, deliverySince: clock.now() });
  return p;
}
function preferenceView(p) { return { inApp: p.inApp, notices: p.notices }; }
async function updatePreferences(user, changes) {
  const before = await preferences(user);
  const updates = { ...changes, updatedAt: clock.now() };
  // Re-enabling delivery starts now; events that happened while disabled are not replayed.
  if ((!before.inApp && changes.inApp === true) || (!before.notices && changes.notices === true)) updates.deliverySince = clock.now();
  const p = await Preference.findOneAndUpdate({ owner: user._id }, { $set: updates }, { new: true, timestamps: false }).lean();
  return preferenceView(p);
}
async function saveBookmark(user, noticeId) {
  const notice = await visibleNotice(noticeId, user);
  if (!notice) throw AppError.notFound('This notice is not available.');
  await insertOnce(Bookmark, { owner: user._id, notice: noticeId }, { owner: user._id, notice: noticeId });
  return { saved: true, notice: safeNotice(notice) };
}
async function bookmarkStatus(user, noticeId) {
  const notice = await visibleNotice(noticeId, user);
  if (!notice) throw AppError.notFound('This notice is not available.');
  return { saved: Boolean(await Bookmark.exists({ owner: user._id, notice: noticeId })) };
}
async function listBookmarks(user, query) {
  const { page, limit, skip } = getPaging(query);
  const [rows, total] = await Promise.all([Bookmark.find({ owner: user._id }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), Bookmark.countDocuments({ owner: user._id })]);
  const current = await visibleMap(rows.map((row) => row.notice), user);
  return { data: rows.map((row) => ({ id: String(row._id), noticeId: String(row.notice), savedAt: row.createdAt, available: current.has(String(row.notice)), notice: current.get(String(row.notice)) || null })), meta: buildMeta(page, limit, total) };
}
async function removeBookmark(user, noticeId) { await Bookmark.deleteOne({ owner: user._id, notice: noticeId }); return { saved: false }; }
async function listFollows(user) { return (await Follow.find({ owner: user._id }).sort({ kind: 1, target: 1 }).lean()).map((row) => ({ id: String(row._id), kind: row.kind, target: row.target, createdAt: row.createdAt })); }
async function follow(user, body) {
  if (body.kind === 'category' && !CATEGORIES.includes(body.target)) throw AppError.badRequest('Unknown notice category.');
  if (body.kind === 'department') await assertDepartment(body.target, { allowAll: true });
  await preferences(user);
  await insertOnce(Follow, { owner: user._id, kind: body.kind, target: body.target }, { owner: user._id, ...body });
  return listFollows(user);
}
async function unfollow(user, id) {
  const removed = await Follow.deleteOne({ _id: id, owner: user._id });
  if (!removed.deletedCount) throw AppError.notFound();
  return listFollows(user);
}
const NOTIFICATION_TYPES = ['NOTICE_PUBLISHED', 'NOTICE_SCHEDULED', 'NOTICE_CORRECTED', 'EVENT_POSTPONED', 'EVENT_CANCELLED'];
async function syncInbox(user) {
  const p = await preferences(user);
  if (!p.inApp || !p.notices) return;
  const follows = await Follow.find({ owner: user._id }).lean();
  if (!follows.length) return;
  const since = new Date(Math.max(p.deliverySince.getTime(), Math.min(...follows.map((f) => f.createdAt.getTime()))));
  // Stream authentic publishing events rather than trusting caller-supplied events.
  // Scheduled approvals are reconsidered after their publication start, without an external worker.
  const candidates = DomainEvent.find({ type: { $in: NOTIFICATION_TYPES }, $or: [{ timestamp: { $gte: since } }, { type: 'NOTICE_SCHEDULED', 'payload.publicationStart': { $gte: since } }] }).sort({ timestamp: 1, _id: 1 }).lean().cursor();
  for await (const event of candidates) {
    const occurredAt = event.type === 'NOTICE_SCHEDULED' ? new Date(event.payload.publicationStart) : event.timestamp;
    if (!Number.isFinite(occurredAt.getTime()) || occurredAt < since || occurredAt > clock.now()) continue;
    let noticeId = event.entityId;
    if (event.entityType === 'EVENT') {
      const calendarEvent = await Event.findById(event.entityId).select('notice').lean();
      if (!calendarEvent) continue;
      noticeId = calendarEvent.notice;
    }
    const notice = await visibleNotice(noticeId, user);
    if (!notice) continue;
    const topic = { category: event.payload.category || notice.publicSearch.category, department: event.payload.department || notice.publicSearch.department };
    if (!follows.some((f) => f.createdAt <= occurredAt && topic[f.kind] === f.target)) continue;
    await insertOnce(Delivery, { owner: user._id, eventId: event.eventId }, { owner: user._id, eventId: event.eventId, type: event.type, notice: noticeId, occurredAt, read: false, readAt: null });
  }
}
async function unreadCount(user) {
  const ids = await Delivery.distinct('notice', { owner: user._id, read: false });
  const current = await visibleMap(ids, user);
  return Delivery.countDocuments({ owner: user._id, read: false, notice: { $in: [...current.keys()] } });
}
async function listInbox(user, query) {
  await syncInbox(user);
  const { page, limit, skip } = getPaging(query);
  const [rows, total, unread] = await Promise.all([Delivery.find({ owner: user._id }).sort({ occurredAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), Delivery.countDocuments({ owner: user._id }), unreadCount(user)]);
  const current = await visibleMap(rows.map((row) => row.notice), user);
  return { data: rows.map((row) => ({ id: String(row._id), type: row.type, occurredAt: row.occurredAt, read: row.read, readAt: row.readAt, available: current.has(String(row.notice)), notice: current.get(String(row.notice)) || null })), meta: { ...buildMeta(page, limit, total), unread } };
}
async function setRead(user, id, read) {
  const row = await Delivery.findOneAndUpdate({ _id: id, owner: user._id }, { $set: { read, readAt: read ? clock.now() : null } }, { new: true }).lean();
  if (!row) throw AppError.notFound();
  return { id: String(row._id), read: row.read, unread: await unreadCount(user) };
}
async function markAllRead(user) { await Delivery.updateMany({ owner: user._id, read: false }, { $set: { read: true, readAt: clock.now() } }); return { unread: 0 }; }
async function openDelivery(user, id) {
  const row = await Delivery.findOne({ _id: id, owner: user._id }).lean();
  if (!row) throw AppError.notFound();
  const notice = await visibleNotice(row.notice, user);
  if (!notice) throw AppError.notFound('This notice is no longer available.');
  return { href: safeNotice(notice).href };
}
module.exports = { preferences, preferenceView, updatePreferences, saveBookmark, bookmarkStatus, listBookmarks, removeBookmark, listFollows, follow, unfollow, syncInbox, listInbox, setRead, markAllRead, openDelivery };
