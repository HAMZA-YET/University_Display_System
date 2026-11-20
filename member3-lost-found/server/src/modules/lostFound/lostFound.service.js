'use strict';

const Item = require('./item.model');
const Claim = require('./claim.model');
const Counter = require('./counter.model');
const Notice = require('./notice.model');
const C = require('./lostFound.constants');
const S = require('./lostFound.serializers');
const caseEvents = require('./caseEvent.service');
const audit = require('../audit/audit.service');
const AppError = require('../../utils/AppError');
const clock = require('../../utils/clock');
const { withTransaction } = require('../../utils/transaction');
const { getPaging, buildMeta } = require('../../utils/pagination');
const { containsRegex } = require('../../utils/regex');

const PERSON = 'name email';
const UNIVERSITY_TZ = process.env.UNIVERSITY_TZ || 'Asia/Seoul';
const DAY_MS = 24 * 3600 * 1000;

// ---------------------------------------------------------------- helpers

const conflict = (code, message) => new AppError(409, code, message);
const sameId = (a, b) => Boolean(a && b && String(a._id || a) === String(b._id || b));
const blankToNull = (v) => (v === '' || v === undefined ? null : v);
const opts = (session, extra = {}) => ({ ...extra, session: session || undefined });
const isAdmin = (user) => Boolean(user && C.VERIFIER_ROLES.includes(user.role));

function entry(ctx, action, note) {
  return { at: clock.now(), actor: ctx.user ? ctx.user._id : null, actorRole: ctx.user ? ctx.user.role : null, action, note: note || null };
}

function seoulYear(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: UNIVERSITY_TZ, year: 'numeric' }).format(date);
}

/** Unique, readable reference: LF-2026-00042. The unique index is the final guard. */
async function nextReference(session) {
  const year = seoulYear(clock.now());
  const counter = await Counter.findOneAndUpdate({ _id: `LF-${year}` }, { $inc: { seq: 1 } }, opts(session, { new: true, upsert: true }));
  return `LF-${year}-${String(counter.seq).padStart(5, '0')}`;
}

/** Normalizes report fields. Private details exist only for LOST items. */
function normalizeItemBody(body, type) {
  const out = { ...body };
  delete out.expectedVersion;
  delete out.type;
  for (const k of ['custodyNote', 'contactDetails', 'privateDetails']) {
    if (k in out) out[k] = blankToNull(out[k]);
  }
  if (type === 'FOUND') out.privateDetails = null;
  if (type === 'LOST' && 'custodyNote' in out) out.custodyNote = null;
  return out;
}

/** On-screen notice (5-second popup) for one member. */
function notify(userId, kind, text, link, session) {
  if (!userId) return null;
  return Notice.create([{ user: userId._id || userId, kind, text, link: link || null }], opts(session));
}

function itemEvent(type, item, ctx, session, recipients) {
  return caseEvents.recordOnce(
    type,
    { entityType: 'LF_ITEM', entityId: item._id, entityVersion: item.version },
    { payload: S.eventItemPayload(item), recipients: recipients || [], actor: ctx.user && ctx.user._id, session }
  );
}

function claimEvent(type, claim, item, ctx, session, recipients) {
  return caseEvents.recordOnce(
    type,
    { entityType: 'LF_CLAIM', entityId: claim._id, entityVersion: claim.version },
    {
      payload: { claimId: String(claim._id), status: claim.status, item: S.eventItemPayload(item) },
      recipients: recipients || [claim.claimant],
      actor: ctx.user && ctx.user._id,
      session,
    }
  );
}

function assertExpected(doc, expectedVersion, entity) {
  if (expectedVersion !== undefined && expectedVersion !== null && doc.version !== expectedVersion) {
    throw AppError.versionConflict(doc.version, entity);
  }
}

/**
 * Rejects every PENDING claim on an item and frees an APPROVED one that has
 * not been collected. Claimants get a notice; they are never told who else
 * claimed or collected the item.
 */
async function rejectOpenClaims(ctx, item, note, session, { includeApproved = false } = {}) {
  const statuses = includeApproved ? ['PENDING', 'APPROVED'] : ['PENDING'];
  const open = await Claim.find({ item: item._id, status: { $in: statuses }, handover: null }).session(session || null);
  for (const claim of open) {
    const updated = await Claim.findOneAndUpdate(
      { _id: claim._id, status: claim.status, handover: null },
      {
        $set: { status: 'REJECTED', decisionNote: note, decidedAt: clock.now(), decidedBy: ctx.user ? ctx.user._id : null },
        $inc: { version: 1 },
        $push: { history: entry(ctx, 'AUTO_REJECTED', note) },
      },
      opts(session, { new: true })
    ).lean();
    if (updated) {
      await claimEvent('LF_CLAIM_REJECTED', updated, item, ctx, session);
      if (!updated.deletedAt)
        await notify(
          updated.claimant,
          'error',
          `Your claim for "${item.title}" was rejected: ${note}`,
          `/lost-found/my-claims/${updated._id}`,
          session
        );
    }
  }
  return open.length;
}

// ---------------------------------------------------------------- public

function publicFilter() {
  return { deletedAt: null, status: { $in: C.PUBLIC_STATUSES } };
}

async function listPublicItems(query) {
  const { page, limit, skip } = getPaging(query);
  const filter = publicFilter();
  if (query.type) filter.type = query.type;
  if (query.category) filter.category = query.category;
  if (query.q) {
    const rx = containsRegex(query.q);
    filter.$or = [{ title: rx }, { description: rx }, { location: rx }, { reference: rx }];
  }
  const [items, total] = await Promise.all([
    Item.find(filter).sort({ postedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    Item.countDocuments(filter),
  ]);
  return { data: items.map(S.publicItem), meta: buildMeta(page, limit, total) };
}

/** Same 404 for "missing", "deleted" and "no longer listed". */
async function getPublicItem(id) {
  const item = await Item.findOne({ _id: id, ...publicFilter() }).lean();
  if (!item) throw AppError.notFound('This item is not available.');
  return S.publicItem(item);
}

// ---------------------------------------------------------------- reporter

/** Reports are published immediately (no admin review), with a daily limit against spam. */
async function createItem(ctx, body) {
  if (!isAdmin(ctx.user)) {
    const recent = await Item.countDocuments({ reporter: ctx.user._id, createdAt: { $gte: new Date(clock.now().getTime() - DAY_MS) } });
    if (recent >= C.DAILY_REPORT_LIMIT) {
      throw new AppError(429, 'DAILY_LIMIT', `You can post at most ${C.DAILY_REPORT_LIMIT} reports in 24 hours. Please try again later.`);
    }
  }
  return withTransaction(async (session) => {
    const reference = await nextReference(session);
    const [item] = await Item.create(
      [
        {
          ...normalizeItemBody(body, body.type),
          type: body.type,
          reference,
          reporter: ctx.user._id,
          postedAt: clock.now(),
          status: 'OPEN',
          history: [entry(ctx, 'POSTED')],
          version: 1,
        },
      ],
      opts(session)
    );
    await audit.record(
      ctx,
      { action: 'LF_ITEM_POSTED', entityType: 'LF_ITEM', entityId: item._id, toStatus: 'OPEN', reason: reference },
      session
    );
    await itemEvent('LF_ITEM_POSTED', item, ctx, session);
    return S.ownerItem(item.toObject(), { claimCount: 0 });
  });
}

async function listMyItems(ctx, query) {
  const { page, limit, skip } = getPaging(query);
  const filter = { reporter: ctx.user._id, deletedAt: null };
  if (query.type) filter.type = query.type;
  const [items, total] = await Promise.all([
    Item.find(filter).sort({ postedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    Item.countDocuments(filter),
  ]);
  return { data: items.map((i) => S.ownerItem(i)), meta: buildMeta(page, limit, total) };
}

/** Another member's report, or a deleted one, looks exactly like a missing one. */
async function loadOwnItem(ctx, id) {
  const item = await Item.findOne({ _id: id, deletedAt: null }).lean();
  if (!item || !sameId(item.reporter, ctx.user._id)) throw AppError.notFound();
  return item;
}

async function getMyItem(ctx, id) {
  const item = await loadOwnItem(ctx, id);
  const claimCount = await Claim.countDocuments({ item: item._id, status: { $in: C.ACTIVE_CLAIM_STATUSES } });
  return S.ownerItem(item, { claimCount });
}

/** Reporters may edit any time while the item is still listed. Changes are live immediately. */
async function updateMyItem(ctx, id, body, expectedVersion) {
  const item = await loadOwnItem(ctx, id);
  if (!C.PUBLIC_STATUSES.includes(item.status)) throw AppError.invalidTransition('This report is finished and can no longer be edited.');
  assertExpected(item, expectedVersion, 'report');
  const updated = await Item.findOneAndUpdate(
    { _id: id, reporter: ctx.user._id, deletedAt: null, version: item.version },
    { $set: normalizeItemBody(body, item.type), $inc: { version: 1 }, $push: { history: entry(ctx, 'EDITED') } },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) {
    const current = await Item.findById(id).lean();
    throw AppError.versionConflict(current ? current.version : null, 'report');
  }
  await audit.record(ctx, { action: 'LF_ITEM_EDITED', entityType: 'LF_ITEM', entityId: id });
  return S.ownerItem(updated);
}

/** Lost item: the reporter got it back. It leaves the public list. */
async function resolveMyItem(ctx, id) {
  const item = await loadOwnItem(ctx, id);
  if (item.type !== 'LOST') throw AppError.invalidTransition('Only lost items can be marked as found.');
  if (item.status !== 'OPEN') throw AppError.invalidTransition('This report is already finished.');
  const updated = await Item.findOneAndUpdate(
    { _id: id, status: 'OPEN', deletedAt: null },
    { $set: { status: 'RESOLVED', resolvedAt: clock.now() }, $inc: { version: 1 }, $push: { history: entry(ctx, 'MARKED_FOUND') } },
    { new: true }
  ).lean();
  if (!updated) throw conflict('ITEM_CHANGED', 'The report changed. Reload and try again.');
  await audit.record(ctx, { action: 'LF_ITEM_RESOLVED', entityType: 'LF_ITEM', entityId: id, fromStatus: 'OPEN', toStatus: 'RESOLVED' });
  await itemEvent('LF_ITEM_RESOLVED', updated, ctx, null);
  return S.ownerItem(updated);
}

/**
 * Deletes a report (reporter at any time, or admin). The record is hidden but
 * kept for the audit log. Waiting or approved-but-not-collected claims are
 * rejected and those claimants are notified.
 */
async function deleteItem(ctx, item) {
  return withTransaction(async (session) => {
    const updated = await Item.findOneAndUpdate(
      { _id: item._id, deletedAt: null },
      {
        $set: {
          deletedAt: clock.now(),
          deletedBy: ctx.user._id,
          activeClaim: item.status === 'COLLECTION_APPROVED' ? null : item.activeClaim,
        },
        $inc: { version: 1 },
        $push: { history: entry(ctx, 'DELETED') },
      },
      opts(session, { new: true })
    ).lean();
    if (!updated) throw AppError.notFound();
    await rejectOpenClaims(ctx, updated, 'The report was removed.', session, { includeApproved: true });
    await audit.record(ctx, { action: 'LF_ITEM_DELETED', entityType: 'LF_ITEM', entityId: item._id, reason: item.reference }, session);
    await itemEvent('LF_ITEM_DELETED', updated, ctx, session);
    return { deleted: true, id: String(item._id) };
  });
}

async function deleteMyItem(ctx, id) {
  return deleteItem(ctx, await loadOwnItem(ctx, id));
}

// ---------------------------------------------------------------- claims: members

async function submitClaim(ctx, itemId, body) {
  const item = await Item.findOne({ _id: itemId, ...publicFilter() }).lean();
  if (!item) throw AppError.notFound('This item is not available.');
  if (item.type !== 'FOUND') throw AppError.invalidTransition('Only found items can be claimed.');
  if (item.status !== 'OPEN') throw conflict('NOT_CLAIMABLE', 'A collection is already in progress for this item.');
  if (isAdmin(ctx.user)) throw AppError.forbidden('Administrators verify claims and cannot make them.');
  if (sameId(item.reporter, ctx.user._id)) throw AppError.forbidden('You cannot claim an item you reported.');

  return withTransaction(async (session) => {
    let claim;
    try {
      [claim] = await Claim.create(
        [
          {
            item: item._id,
            claimant: ctx.user._id,
            evidenceText: body.evidenceText,
            status: 'PENDING',
            history: [entry(ctx, 'SUBMITTED')],
            version: 1,
          },
        ],
        opts(session)
      );
    } catch (err) {
      if (err.code === 11000) throw conflict('DUPLICATE_CLAIM', 'You already have an active claim for this item.');
      throw err;
    }
    await audit.record(
      ctx,
      { action: 'LF_CLAIM_SUBMITTED', entityType: 'LF_CLAIM', entityId: claim._id, toStatus: 'PENDING', reason: item.reference },
      session
    );
    await claimEvent('LF_CLAIM_SUBMITTED', claim, item, ctx, session, []);
    return S.claimantClaim({ ...claim.toObject(), item });
  });
}

async function listMyClaims(ctx, query) {
  const { page, limit, skip } = getPaging(query);
  const filter = { claimant: ctx.user._id, deletedAt: null };
  const [claims, total] = await Promise.all([
    Claim.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).populate('item').lean(),
    Claim.countDocuments(filter),
  ]);
  return { data: claims.map(S.claimantClaim), meta: buildMeta(page, limit, total) };
}

/** Only the claimant can read a claim through member routes. Everyone else gets 404. */
async function loadOwnClaim(ctx, id) {
  const claim = await Claim.findOne({ _id: id, deletedAt: null }).populate('item').lean();
  if (!claim || !sameId(claim.claimant, ctx.user._id)) throw AppError.notFound();
  return claim;
}

async function getMyClaim(ctx, id) {
  return S.claimantClaim(await loadOwnClaim(ctx, id));
}

/**
 * Deletes a claim (claimant at any time, or admin). A waiting claim is
 * withdrawn; an approved claim that was not collected frees the item again.
 * A collected claim is only hidden; the handover record stays.
 */
async function deleteClaim(ctx, claim) {
  return withTransaction(async (session) => {
    const live = C.ACTIVE_CLAIM_STATUSES.includes(claim.status) && !claim.handover;
    const set = { deletedAt: clock.now(), deletedBy: ctx.user._id };
    if (live) set.status = 'WITHDRAWN';
    const updated = await Claim.findOneAndUpdate(
      { _id: claim._id, deletedAt: null, status: claim.status },
      { $set: set, $inc: { version: 1 }, $push: { history: entry(ctx, 'DELETED') } },
      opts(session, { new: true })
    ).lean();
    if (!updated) throw conflict('CLAIM_CHANGED', 'This claim changed. Reload and try again.');
    let item = claim.item;
    if (live && claim.status === 'APPROVED') {
      item =
        (await Item.findOneAndUpdate(
          { _id: claim.item._id, activeClaim: claim._id, status: 'COLLECTION_APPROVED' },
          { $set: { status: 'OPEN', activeClaim: null }, $inc: { version: 1 }, $push: { history: entry(ctx, 'COLLECTION_CANCELLED') } },
          opts(session, { new: true })
        ).lean()) || item;
    }
    await audit.record(
      ctx,
      { action: 'LF_CLAIM_DELETED', entityType: 'LF_CLAIM', entityId: claim._id, fromStatus: claim.status, toStatus: updated.status },
      session
    );
    if (live) await claimEvent('LF_CLAIM_WITHDRAWN', updated, item, ctx, session, []);
    return { deleted: true, id: String(claim._id) };
  });
}

async function deleteMyClaim(ctx, id) {
  return deleteClaim(ctx, await loadOwnClaim(ctx, id));
}

// ---------------------------------------------------------------- notices (5-second popups)

/** Returns unseen notices for the member and marks them seen, so each shows once. */
async function takeMyNotices(ctx) {
  const notices = await Notice.find({ user: ctx.user._id, seenAt: null }).sort({ createdAt: 1 }).limit(10).lean();
  if (notices.length) await Notice.updateMany({ _id: { $in: notices.map((n) => n._id) }, seenAt: null }, { $set: { seenAt: clock.now() } });
  return notices.map((n) => ({ id: String(n._id), kind: n.kind, text: n.text, link: n.link, createdAt: n.createdAt }));
}

// ---------------------------------------------------------------- admin: dashboard

async function adminStats() {
  const now = clock.now();
  const listed = publicFilter();
  const liveItemIds = Item.find({ deletedAt: null }).distinct('_id');

  const [lostItems, foundItems, ids, byCategory, oldestFound, oldestLost] = await Promise.all([
    Item.countDocuments({ ...listed, type: 'LOST' }),
    Item.countDocuments({ ...listed, type: 'FOUND' }),
    liveItemIds,
    Item.aggregate([{ $match: listed }, { $group: { _id: { category: '$category', type: '$type' }, n: { $sum: 1 } } }]),
    Item.find({ ...listed, type: 'FOUND' })
      .sort({ postedAt: 1 })
      .limit(5)
      .select('reference title category postedAt status type')
      .lean(),
    Item.find({ ...listed, type: 'LOST' })
      .sort({ postedAt: 1 })
      .limit(5)
      .select('reference title category postedAt status type')
      .lean(),
  ]);
  const claimsWaiting = await Claim.countDocuments({ status: 'PENDING', deletedAt: null, item: { $in: ids } });

  const categories = {};
  for (const row of byCategory) {
    const key = row._id.category;
    categories[key] = categories[key] || { category: key, FOUND: 0, LOST: 0, total: 0 };
    categories[key][row._id.type] += row.n;
    categories[key].total += row.n;
  }
  const held = (i) => ({
    id: String(i._id),
    reference: i.reference,
    title: i.title,
    category: i.category,
    type: i.type,
    status: i.status,
    postedAt: i.postedAt,
    daysListed: Math.floor((now.getTime() - new Date(i.postedAt).getTime()) / DAY_MS),
  });

  return {
    actionNeeded: { lostItems, foundItems, claimsWaiting },
    byCategory: Object.values(categories).sort((a, b) => b.total - a.total),
    longestFound: oldestFound.map(held),
    longestLost: oldestLost.map(held),
    generatedAt: now,
  };
}

// ---------------------------------------------------------------- admin: items

/** All reports that are not deleted (any status), newest first. */
async function listAdminItems(query) {
  const { page, limit, skip } = getPaging(query);
  const base = { deletedAt: null };
  for (const k of ['category', 'status']) if (query[k]) base[k] = query[k];
  const filter = query.type ? { ...base, type: query.type } : base;
  const [items, total, lost, found] = await Promise.all([
    Item.find(filter).sort({ postedAt: -1, _id: -1 }).skip(skip).limit(limit).populate('reporter', PERSON).lean(),
    Item.countDocuments(filter),
    Item.countDocuments({ ...base, type: 'LOST' }),
    Item.countDocuments({ ...base, type: 'FOUND' }),
  ]);
  const counts = await Claim.aggregate([
    { $match: { item: { $in: items.map((i) => i._id) }, deletedAt: null, status: { $in: C.VISIBLE_CLAIM_STATUSES } } },
    { $group: { _id: '$item', total: { $sum: 1 }, pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } } } },
  ]);
  const byItem = Object.fromEntries(counts.map((c) => [String(c._id), c]));
  return {
    data: items.map((i) => {
      const c = byItem[String(i._id)] || { total: 0, pending: 0 };
      return S.adminItem(i, { claimCount: c.total, pendingClaimCount: c.pending });
    }),
    meta: { ...buildMeta(page, limit, total), typeCounts: { ALL: lost + found, LOST: lost, FOUND: found } },
  };
}

async function getAdminItem(id) {
  const item = await Item.findOne({ _id: id, deletedAt: null }).populate('reporter', PERSON).lean();
  if (!item) throw AppError.notFound();
  const claims = await Claim.find({ item: id, deletedAt: null, status: { $in: C.VISIBLE_CLAIM_STATUSES } })
    .sort({ createdAt: 1 })
    .populate('claimant', PERSON)
    .populate('decidedBy', PERSON)
    .populate('handover.admin', PERSON)
    .lean();
  return { ...S.adminItem(item), claims: claims.map((c) => S.adminClaim({ ...c, item })) };
}

async function adminDeleteItem(ctx, id) {
  const item = await Item.findOne({ _id: id, deletedAt: null }).lean();
  if (!item) throw AppError.notFound();
  return deleteItem(ctx, item);
}

// ---------------------------------------------------------------- admin: claims

/**
 * Claims grouped by item: "Navy umbrella - 3 claims". `status` picks the tab
 * (ALL, PENDING, APPROVED, REJECTED); tab counts are always returned.
 */
async function adminClaimsByItem(query) {
  const status = query.status && query.status !== 'ALL' ? [query.status] : C.VISIBLE_CLAIM_STATUSES;
  const liveIds = await Item.find({ deletedAt: null }).distinct('_id');
  const base = { deletedAt: null, item: { $in: liveIds } };

  const [groups, tabRows] = await Promise.all([
    Claim.aggregate([
      { $match: { ...base, status: { $in: status } } },
      {
        $group: {
          _id: '$item',
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] } },
          latest: { $max: '$createdAt' },
        },
      },
      { $sort: { pending: -1, latest: -1 } },
      { $limit: 200 },
    ]),
    Claim.aggregate([{ $match: { ...base, status: { $in: C.VISIBLE_CLAIM_STATUSES } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const items = await Item.find({ _id: { $in: groups.map((g) => g._id) } }).lean();
  const byId = Object.fromEntries(items.map((i) => [String(i._id), i]));
  const tabs = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
  for (const r of tabRows) tabs[r._id] = r.n;
  tabs.ALL = tabs.PENDING + tabs.APPROVED + tabs.REJECTED;

  return {
    data: groups
      .filter((g) => byId[String(g._id)])
      .map((g) => ({
        item: S.itemSummary(byId[String(g._id)]),
        counts: { total: g.total, pending: g.pending, approved: g.approved, rejected: g.rejected },
        latestClaimAt: g.latest,
      })),
    meta: { tabs },
  };
}

async function loadClaimForAdmin(id) {
  const claim = await Claim.findOne({ _id: id, deletedAt: null }).populate('item').lean();
  if (!claim || !claim.item || claim.item.deletedAt) throw AppError.notFound();
  return claim;
}

async function adminClaimView(id, session) {
  const so = { session: session || undefined };
  const claim = await Claim.findById(id)
    .session(session || null)
    .populate({ path: 'item', options: so })
    .populate({ path: 'claimant', select: PERSON, options: so })
    .populate({ path: 'decidedBy', select: PERSON, options: so })
    .populate({ path: 'handover.admin', select: PERSON, options: so })
    .lean();
  return S.adminClaim(claim);
}

/**
 * Admin decision. APPROVE takes the item's single collection slot with an
 * atomic conditional update { status: OPEN, activeClaim: null }; two
 * simultaneous approvals cannot both succeed, and the partial unique index
 * lf_one_collector_per_item is a second guard.
 */
async function decideClaim(ctx, id, body) {
  const claim = await loadClaimForAdmin(id);
  if (claim.status !== 'PENDING') throw conflict('CLAIM_ALREADY_DECIDED', 'This claim has already been decided.');
  assertExpected(claim, body.expectedVersion, 'claim');
  const item = claim.item;

  if (body.decision === 'REJECT') {
    return withTransaction(async (session) => {
      const updated = await Claim.findOneAndUpdate(
        { _id: id, status: 'PENDING', version: claim.version },
        {
          $set: { status: 'REJECTED', decisionNote: body.note || null, decidedBy: ctx.user._id, decidedAt: clock.now() },
          $inc: { version: 1 },
          $push: { history: entry(ctx, 'REJECTED', body.note) },
        },
        opts(session, { new: true })
      ).lean();
      if (!updated) throw conflict('CLAIM_ALREADY_DECIDED', 'This claim was already decided. Reload to see it.');
      await audit.record(
        ctx,
        { action: 'LF_CLAIM_REJECTED', entityType: 'LF_CLAIM', entityId: id, fromStatus: 'PENDING', toStatus: 'REJECTED' },
        session
      );
      await claimEvent('LF_CLAIM_REJECTED', updated, item, ctx, session);
      await notify(
        updated.claimant,
        'error',
        `Your claim for "${item.title}" was rejected.${body.note ? ` ${body.note}` : ''}`,
        `/lost-found/my-claims/${id}`,
        session
      );
      return adminClaimView(id, session);
    });
  }

  if (item.status !== 'OPEN' || item.activeClaim) {
    throw conflict('COLLECTION_ALREADY_APPROVED', 'Another claim is already approved for this item.');
  }
  return withTransaction(async (session) => {
    const takenItem = await Item.findOneAndUpdate(
      { _id: item._id, status: 'OPEN', activeClaim: null, deletedAt: null },
      {
        $set: { status: 'COLLECTION_APPROVED', activeClaim: claim._id },
        $inc: { version: 1 },
        $push: { history: entry(ctx, 'CLAIM_APPROVED') },
      },
      opts(session, { new: true })
    ).lean();
    if (!takenItem) throw conflict('COLLECTION_ALREADY_APPROVED', 'Another claim is already approved for this item.');

    let updated;
    try {
      updated = await Claim.findOneAndUpdate(
        { _id: id, status: 'PENDING', version: claim.version },
        {
          $set: { status: 'APPROVED', decisionNote: body.note || null, decidedBy: ctx.user._id, decidedAt: clock.now() },
          $inc: { version: 1 },
          $push: { history: entry(ctx, 'APPROVED', body.note) },
        },
        opts(session, { new: true })
      ).lean();
    } catch (err) {
      if (err.code !== 11000) throw err;
      updated = null;
    }
    if (!updated) {
      // Without a replica set there is no rollback: release the slot we took.
      if (!session) await Item.updateOne({ _id: item._id, activeClaim: claim._id }, { $set: { status: 'OPEN', activeClaim: null } });
      throw conflict('CLAIM_ALREADY_DECIDED', 'This claim changed while you were deciding. Reload to see it.');
    }
    await audit.record(
      ctx,
      { action: 'LF_CLAIM_APPROVED', entityType: 'LF_CLAIM', entityId: id, fromStatus: 'PENDING', toStatus: 'APPROVED' },
      session
    );
    await claimEvent('LF_CLAIM_APPROVED', updated, takenItem, ctx, session);
    const where = takenItem.custodyNote ? ` Collect it at: ${takenItem.custodyNote}` : ' Collect it at the lost-and-found office.';
    await notify(
      updated.claimant,
      'success',
      `Your claim for "${item.title}" was approved.${where}`,
      `/lost-found/my-claims/${id}`,
      session
    );
    return adminClaimView(id, session);
  });
}

/** Cancels an approval that was not collected (shown to the student as Rejected). The item is claimable again. */
async function releaseClaim(ctx, id, body) {
  const claim = await loadClaimForAdmin(id);
  if (claim.status !== 'APPROVED' || claim.handover)
    throw AppError.invalidTransition('Only an approved claim that was not collected can be released.');
  return withTransaction(async (session) => {
    const updated = await Claim.findOneAndUpdate(
      { _id: id, status: 'APPROVED', handover: null },
      {
        $set: { status: 'REJECTED', decisionNote: body.note, decidedBy: ctx.user._id, decidedAt: clock.now() },
        $inc: { version: 1 },
        $push: { history: entry(ctx, 'RELEASED', body.note) },
      },
      opts(session, { new: true })
    ).lean();
    if (!updated) throw conflict('CLAIM_CHANGED', 'This claim has changed. Reload to see it.');
    const item = await Item.findOneAndUpdate(
      { _id: claim.item._id, activeClaim: claim._id, status: 'COLLECTION_APPROVED' },
      { $set: { status: 'OPEN', activeClaim: null }, $inc: { version: 1 }, $push: { history: entry(ctx, 'APPROVAL_RELEASED', body.note) } },
      opts(session, { new: true })
    ).lean();
    if (!item) throw conflict('ITEM_CHANGED', 'The item is not waiting for this collection.');
    await audit.record(
      ctx,
      {
        action: 'LF_CLAIM_RELEASED',
        entityType: 'LF_CLAIM',
        entityId: id,
        fromStatus: 'APPROVED',
        toStatus: 'REJECTED',
        reason: body.note,
      },
      session
    );
    await claimEvent('LF_CLAIM_RELEASED', updated, item, ctx, session);
    await notify(
      updated.claimant,
      'error',
      `Your approved claim for "${item.title}" was cancelled: ${body.note}`,
      `/lost-found/my-claims/${id}`,
      session
    );
    return adminClaimView(id, session);
  });
}

/**
 * Records the physical return. Only this makes the item RETURNED. A repeated
 * request finds the item already RETURNED and gets 409, so there is never a
 * second handover. Other waiting claims are rejected with a notice.
 */
async function recordHandover(ctx, id, body) {
  const claim = await loadClaimForAdmin(id);
  if (claim.handover) throw conflict('ALREADY_HANDED_OVER', 'The handover for this claim has already been recorded.');
  if (claim.status !== 'APPROVED') throw AppError.invalidTransition('A claim must be approved before a handover can be recorded.');
  return withTransaction(async (session) => {
    const now = clock.now();
    const item = await Item.findOneAndUpdate(
      { _id: claim.item._id, activeClaim: claim._id, status: 'COLLECTION_APPROVED' },
      { $set: { status: 'RETURNED', returnedAt: now }, $inc: { version: 1 }, $push: { history: entry(ctx, 'HANDED_OVER') } },
      opts(session, { new: true })
    ).lean();
    if (!item) throw conflict('ALREADY_HANDED_OVER', 'This item is not waiting for this collection (it may already be returned).');
    const updated = await Claim.findOneAndUpdate(
      { _id: id, status: 'APPROVED', handover: null },
      {
        $set: {
          handover: { at: now, admin: ctx.user._id, identityChecked: true, recipientName: body.recipientName, note: body.note || null },
        },
        $inc: { version: 1 },
        $push: { history: entry(ctx, 'HANDED_OVER', body.note) },
      },
      opts(session, { new: true })
    ).lean();
    if (!updated) throw conflict('ALREADY_HANDED_OVER', 'The handover for this claim has already been recorded.');
    await rejectOpenClaims(ctx, item, 'This item was returned to its owner.', session);
    await audit.record(
      ctx,
      { action: 'LF_ITEM_HANDED_OVER', entityType: 'LF_CLAIM', entityId: id, fromStatus: 'APPROVED', toStatus: 'APPROVED' },
      session
    );
    await claimEvent('LF_ITEM_HANDED_OVER', updated, item, ctx, session, [updated.claimant, item.reporter]);
    return adminClaimView(id, session);
  });
}

async function adminDeleteClaim(ctx, id) {
  return deleteClaim(ctx, await loadClaimForAdmin(id));
}

module.exports = {
  // public
  listPublicItems,
  getPublicItem,
  // reporter
  createItem,
  listMyItems,
  getMyItem,
  updateMyItem,
  resolveMyItem,
  deleteMyItem,
  // claimant
  submitClaim,
  listMyClaims,
  getMyClaim,
  deleteMyClaim,
  takeMyNotices,
  // admin
  adminStats,
  listAdminItems,
  getAdminItem,
  adminDeleteItem,
  adminClaimsByItem,
  decideClaim,
  releaseClaim,
  recordHandover,
  adminDeleteClaim,
};
