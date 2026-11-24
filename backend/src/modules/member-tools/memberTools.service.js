'use strict';
const { Bookmark, ItemBookmark, Follow, Preference, Delivery } = require('./memberTools.models');
const Notice = require('../notices/notice.model');
const Event = require('../events/event.model');
const DomainEvent = require('../domainEvents/domainEvent.model');
const Item = require('../lostFound/item.model');
const Claim = require('../lostFound/claim.model');
const CaseEvent = require('../lostFound/caseEvent.model');
const { PUBLIC_STATUSES, CASE_EVENT_TYPES } = require('../lostFound/lostFound.constants');
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
  const p = await insertOnce(Preference, { owner: user._id }, { owner: user._id, inApp: true, notices: true, deliverySince: clock.now(), caseDeliverySince: user.createdAt || clock.now() });
  return p;
}
function preferenceView(p) { return { inApp: p.inApp, notices: p.notices }; }
async function updatePreferences(user, changes) {
  const before = await preferences(user);
  const updates = { ...changes, updatedAt: clock.now() };
  // Re-enabling delivery starts now; events that happened while disabled are not replayed.
  if ((!before.inApp && changes.inApp === true) || (!before.notices && changes.notices === true)) updates.deliverySince = clock.now();
  if (!before.inApp && changes.inApp === true) updates.caseDeliverySince = clock.now();
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
function safeItem(item) {
  return { id: String(item._id), title: item.title, summary: item.description || '', category: item.category, type: item.type, reference: item.reference, href: `/items/${item._id}` };
}
async function visibleItems(ids, user) {
  if (!user) return new Map();
  const items = await Item.find({ _id: { $in: ids }, deletedAt: null, status: { $in: PUBLIC_STATUSES } }).select('title description category type reference').lean();
  return new Map(items.map((item) => [String(item._id), safeItem(item)]));
}
async function saveItemBookmark(user, itemId) {
  const item = (await visibleItems([itemId], user)).get(itemId);
  if (!item) throw AppError.notFound('This item is not available.');
  await insertOnce(ItemBookmark, { owner: user._id, item: itemId }, { owner: user._id, item: itemId });
  return { saved: true, item };
}
async function itemBookmarkStatus(user, itemId) {
  if (!(await visibleItems([itemId], user)).has(itemId)) throw AppError.notFound('This item is not available.');
  return { saved: Boolean(await ItemBookmark.exists({ owner: user._id, item: itemId })) };
}
async function listItemBookmarks(user, query) {
  const { page, limit, skip } = getPaging(query);
  const [rows, total] = await Promise.all([
    ItemBookmark.find({ owner: user._id }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    ItemBookmark.countDocuments({ owner: user._id }),
  ]);
  const current = await visibleItems(rows.map((row) => row.item), user);
  return { data: rows.map((row) => ({ id: String(row._id), itemId: String(row.item), savedAt: row.createdAt, available: current.has(String(row.item)), item: current.get(String(row.item)) || null })), meta: buildMeta(page, limit, total) };
}
async function removeItemBookmark(user, itemId) {
  await ItemBookmark.deleteOne({ owner: user._id, item: itemId });
  return { saved: false };
}
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
async function syncPublishingInbox(user, p) {
  if (!p.notices) return;
  const follows = await Follow.find({ owner: user._id }).lean();
  if (!follows.length) return;
  const since = new Date(Math.max(p.deliverySince.getTime(), Math.min(...follows.map((f) => f.createdAt.getTime()))));
  // Stream authentic publishing events rather than trusting caller-supplied events.
  // Scheduled approvals are reconsidered after their publication start, without an external worker.
  const candidates = DomainEvent.find({ 'payload.sample': { $ne: true }, type: { $in: NOTIFICATION_TYPES }, $or: [{ timestamp: { $gte: since } }, { type: 'NOTICE_SCHEDULED', 'payload.publicationStart': { $gte: since } }] }).sort({ timestamp: 1, _id: 1 }).lean().cursor();
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
const CASE_SUMMARIES = {
  LF_ITEM_POSTED: 'A lost-and-found report was posted.',
  LF_ITEM_DELETED: 'A lost-and-found report was removed.',
  LF_ITEM_RESOLVED: 'A lost-and-found report was resolved.',
  LF_CLAIM_SUBMITTED: 'An ownership claim was submitted.',
  LF_CLAIM_APPROVED: 'An ownership claim was approved. Collection is still required.',
  LF_CLAIM_REJECTED: 'An ownership claim was not accepted.',
  LF_CLAIM_WITHDRAWN: 'An ownership claim was withdrawn.',
  LF_CLAIM_RELEASED: 'An ownership approval was released.',
  LF_ITEM_HANDED_OVER: 'Physical collection of a lost-and-found item was recorded.',
};

/** Resolve only current server-owned references, never cached event payloads.
 * A claimant sees their own claim; the reporter sees only a handover update
 * for their own item. Both must still be explicit recipients of that event.
 */
async function currentSources(rows, user) {
  const result = new Map();
  const noticeRows = rows.filter((row) => row.source !== 'LOST_FOUND');
  const notices = await visibleMap(noticeRows.map((row) => row.notice), user);
  for (const row of noticeRows) if (notices.has(String(row.notice))) result.set(String(row._id), notices.get(String(row.notice)));
  const caseRows = rows.filter((row) => row.source === 'LOST_FOUND');
  if (!caseRows.length) return result;
  const events = await CaseEvent.find({ _id: { $in: caseRows.map((row) => row.caseEvent) }, recipients: String(user._id) })
    .select('eventId type entityType entityId').lean();
  const eventMap = new Map(events.map((event) => [String(event._id), event]));
  const claims = await Claim.find({ _id: { $in: events.filter((event) => event.entityType === 'LF_CLAIM').map((event) => event.entityId) }, deletedAt: null })
    .select('item claimant').lean();
  const claimMap = new Map(claims.map((claim) => [String(claim._id), claim]));
  const items = await Item.find({ _id: { $in: [...claims.map((claim) => claim.item), ...events.filter((event) => event.entityType === 'LF_ITEM').map((event) => event.entityId)] }, deletedAt: null })
    .select('title reporter').lean();
  const itemMap = new Map(items.map((item) => [String(item._id), item]));
  for (const row of caseRows) {
    const event = eventMap.get(String(row.caseEvent));
    if (!event || row.eventId !== event.eventId || row.type !== event.type) continue;
    const claim = event.entityType === 'LF_CLAIM' ? claimMap.get(event.entityId) : null;
    const item = itemMap.get(String(claim ? claim.item : event.entityId));
    if (!item) continue;
    let href;
    if (claim && String(claim.claimant) === String(user._id)) href = `/items/my-claims/${claim._id}`;
    else if (String(item.reporter) === String(user._id) && (!claim || event.type === 'LF_ITEM_HANDED_OVER')) href = `/items/my-reports/${item._id}`;
    if (href) result.set(String(row._id), { id: String(item._id), title: item.title, summary: CASE_SUMMARIES[event.type] || 'A lost-and-found case was updated.', href });
  }
  return result;
}

async function syncCaseInbox(user, p) {
  const since = p.caseDeliverySince || user.createdAt || p.createdAt;
  const events = CaseEvent.find({ recipients: String(user._id), type: { $in: CASE_EVENT_TYPES }, timestamp: { $gte: since, $lte: clock.now() } })
    .sort({ timestamp: 1, _id: 1 }).lean().cursor();
  for await (const event of events) {
    const candidate = { _id: event._id, source: 'LOST_FOUND', caseEvent: event._id, eventId: event.eventId, type: event.type };
    if (!(await currentSources([candidate], user)).has(String(event._id))) continue;
    await insertOnce(Delivery, { owner: user._id, eventId: event.eventId }, {
      owner: user._id, eventId: event.eventId, type: event.type, source: 'LOST_FOUND', caseEvent: event._id,
      occurredAt: event.timestamp, read: false, readAt: null,
    });
    const recipients = [...new Set(event.recipients)];
    const delivered = await Delivery.countDocuments({ eventId: event.eventId, source: 'LOST_FOUND', owner: { $in: recipients } });
    if (delivered === recipients.length) await CaseEvent.updateOne({ _id: event._id }, { $set: { deliveryStatus: 'DELIVERED' } });
  }
}
async function syncInbox(user) {
  const p = await preferences(user);
  if (!p.inApp) return;
  await Promise.all([syncPublishingInbox(user, p), syncCaseInbox(user, p)]);
}
async function unreadCount(user) {
  const rows = await Delivery.find({ owner: user._id, read: false }).select('source notice caseEvent eventId type').lean();
  return (await currentSources(rows, user)).size;
}
async function listInbox(user, query) {
  await syncInbox(user);
  const { page, limit, skip } = getPaging(query);
  const [rows, total, unread] = await Promise.all([Delivery.find({ owner: user._id }).sort({ occurredAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), Delivery.countDocuments({ owner: user._id }), unreadCount(user)]);
  const current = await currentSources(rows, user);
  return { data: rows.map((row) => ({ id: String(row._id), source: row.source || 'NOTICE', type: row.type, occurredAt: row.occurredAt, read: row.read, readAt: row.readAt,
    available: current.has(String(row._id)), notice: row.source === 'LOST_FOUND' ? null : current.get(String(row._id)) || null,
    item: row.source === 'LOST_FOUND' ? current.get(String(row._id)) || null : null,
  })), meta: { ...buildMeta(page, limit, total), unread } };
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
  const source = (await currentSources([row], user)).get(String(row._id));
  if (!source) throw AppError.notFound('This source is no longer available.');
  return { href: source.href };
}
module.exports = { preferences, preferenceView, updatePreferences, saveBookmark, bookmarkStatus, listBookmarks, removeBookmark,
  saveItemBookmark, itemBookmarkStatus, listItemBookmarks, removeItemBookmark,
  listFollows, follow, unfollow, syncInbox, listInbox, setRead, markAllRead, openDelivery };
