'use strict';

const mongoose = require('mongoose');
const State = require('./sampleContent.model');
const { SOURCE, key, id, fixtures, DEPARTMENTS } = require('./sampleContent.fixtures');
const Department = require('../departments/department.model');
const Professor = require('../professors/professor.model');
const Notice = require('../notices/notice.model');
const Revision = require('../notices/revision.model');
const Event = require('../events/event.model');
const DomainEvent = require('../domainEvents/domainEvent.model');
const User = require('../users/user.model');
const { Follow } = require('../member-tools/memberTools.models');
const domainEvents = require('../domainEvents/domainEvent.service');
const audit = require('../audit/audit.service');
const { supportsTransactions } = require('../../utils/transaction');
const clock = require('../../utils/clock');
const AppError = require('../../utils/AppError');

const marked = { sampleContentKey: { $regex: `^${SOURCE}:` } };
const MODELS = { departments: Department, professors: Professor, notices: Notice, events: Event };
const EXPECTED = { departments: 6, professors: 6, notices: 12, events: 6 };

async function status(session = null) {
  const counts = {};
  for (const [name, Model] of Object.entries(MODELS)) counts[name] = await Model.countDocuments(marked).session(session);
  const departmentCount = await Department.countDocuments({ code: { $in: DEPARTMENTS.map(([code]) => code) } }).session(session);
  const complete = departmentCount === 6 && counts.professors === 6 && counts.notices === 12 && counts.events === 6;
  return { installed: Object.values(counts).some(Boolean), complete, counts, expected: EXPECTED };
}

async function atomic(action) {
  if (!(await supportsTransactions())) throw new AppError(503, 'SAMPLE_CONTENT_UNAVAILABLE', 'Sample installation requires a transaction-capable database.');
  // The collection/index initialization happens before transactions, including
  // the first request to a new database. No sample content is installed here.
  await Promise.all([State, Department, Professor, Notice, Revision, Event, DomainEvent].map((Model) => Model.init()));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const state = await State.findOneAndUpdate({ _id: SOURCE },
          { $setOnInsert: { baseDate: clock.now() }, $inc: { generation: 1 } },
          { upsert: true, new: true, session }).lean();
        result = await action(session, state);
      });
      return result;
    } catch (error) {
      // A first-ever concurrent install can race on the singleton _id. Retry
      // the complete transaction against the committed state, never partially.
      if (error.code !== 11000 || attempt === 2) throw error;
    } finally {
      await session.endSession();
    }
  }
  throw new AppError(409, 'SAMPLE_CONTENT_BUSY', 'Please retry the sample installation.');
}

async function insertSample(Model, fields, session) {
  const existing = await Model.findById(fields._id).select('+sampleContentKey').session(session).lean();
  if (existing) {
    if (existing.sampleContentKey !== fields.sampleContentKey) {
      throw new AppError(409, 'SAMPLE_CONTENT_CONFLICT', 'An existing record conflicts with a sample identifier. No content was changed.');
    }
    return false;
  }
  await Model.create([fields], { session });
  return true;
}

async function publishingEvent(type, entity, payload, session, administrator, timestamp) {
  const eventKey = domainEvents.buildKey(type, entity._id, entity.version);
  await insertSample(DomainEvent, {
    _id: id('domain-event', eventKey), sampleContentKey: key('domain-event', eventKey),
    eventId: domainEvents.buildEventId(type, entity._id, entity.version), idempotencyKey: eventKey,
    type, entityType: type.startsWith('NOTICE_') ? 'NOTICE' : 'EVENT', entityId: String(entity._id),
    entityVersion: entity.version, action: type, actor: String(administrator), source: 'uids.publishing',
    timestamp, payload: { ...payload, sample: true }, deliveryStatus: 'PENDING',
  }, session);
}

async function install(ctx) {
  return atomic(async (session, state) => {
    const baseline = state.baseDate || clock.now();
    const data = fixtures(ctx.user._id, baseline);
    const created = { departments: 0, professors: 0, notices: 0, events: 0 };
    // Reuse existing university departments verbatim. Never mark them as samples.
    for (const fields of data.departments) {
      if (!(await Department.exists({ code: fields.code }).session(session))) {
        if (await insertSample(Department, fields, session)) created.departments += 1;
      }
    }
    for (const fields of data.professors) if (await insertSample(Professor, fields, session)) created.professors += 1;
    for (const { notice, revision, event } of data.notices) {
      const isNew = await insertSample(Notice, notice, session);
      if (isNew) {
        created.notices += 1;
        await insertSample(Revision, revision, session);
        await publishingEvent('NOTICE_PUBLISHED', notice, domainEvents.noticePayload(notice, revision.contentSnapshot), session, ctx.user._id, clock.now());
      }
      // Existing sample notices may have user corrections or withdrawals. A
      // reinstall never rebuilds revisions or emits their old publications.
      if (event && isNew && await insertSample(Event, event, session)) {
        created.events += 1;
        await publishingEvent('EVENT_CREATED', event, domainEvents.eventPayload(event, notice), session, ctx.user._id, clock.now());
        if (event.state === 'POSTPONED' || event.state === 'CANCELLED') {
          await publishingEvent(`EVENT_${event.state}`, event, domainEvents.eventPayload(event, notice), session, ctx.user._id, clock.now());
        }
      }
    }
    if (Object.values(created).some(Boolean)) await audit.record(ctx, {
      action: 'SAMPLE_CONTENT_INSTALLED', entityType: 'SAMPLE_CONTENT', entityId: SOURCE,
      reason: 'Explicit administrator installation of labelled fictional demonstration content.',
    }, session);
    return { ...(await status(session)), created };
  });
}

async function remove(ctx) {
  return atomic(async (session) => {
    const removed = { departments: 0, professors: 0, notices: 0, events: 0 };
    const sampleNotices = await Notice.find(marked).select('_id version').session(session).lean();
    const noticeIds = [];
    for (const notice of sampleNotices) {
      const realRevision = await Revision.exists({ notice: notice._id, sampleContentKey: { $exists: false } }).session(session);
      const changedEvent = await Event.exists({ notice: notice._id, $or: [{ sampleContentKey: { $exists: false } }, { version: { $ne: 1 } }] }).session(session);
      // Preserve anything a user has changed or extended after installation.
      if (notice.version === 3 && !realRevision && !changedEvent) noticeIds.push(notice._id);
    }
    const events = await Event.find({ ...marked, notice: { $in: noticeIds } }).select('_id').session(session).lean();
    const entityIds = [...noticeIds, ...events.map((event) => event._id)].map(String);
    await DomainEvent.deleteMany({ ...marked, entityId: { $in: entityIds } }, { session });
    removed.events = (await Event.deleteMany({ ...marked, notice: { $in: noticeIds } }, { session })).deletedCount;
    await Revision.deleteMany({ ...marked, notice: { $in: noticeIds } }, { session });
    removed.notices = (await Notice.deleteMany({ ...marked, _id: { $in: noticeIds }, version: 3 }, { session })).deletedCount;
    removed.professors = (await Professor.deleteMany({ ...marked, version: 1 }, { session })).deletedCount;
    for (const department of await Department.find(marked).session(session).lean()) {
      const code = department.code;
      const originalIndex = DEPARTMENTS.findIndex(([originalCode]) => originalCode === code);
      const originalName = originalIndex >= 0 ? `${DEPARTMENTS[originalIndex][1]} (Demo)` : null;
      // Department edits have no version field. Compare the exact initial
      // metadata and include it in the delete predicate to preserve edits.
      if (department.name !== originalName || department.displayOrder !== originalIndex + 1) continue;
      const professor = await Professor.exists({ department: code }).session(session);
      const notice = await Notice.exists({ $or: [{ department: code }, { 'publicSearch.department': code }] }).session(session);
      const revision = await Revision.exists({ 'contentSnapshot.department': code }).session(session);
      const user = await User.exists({ department: code }).session(session);
      const follow = await Follow.exists({ kind: 'department', target: code }).session(session);
      if (!professor && !notice && !revision && !user && !follow) removed.departments += (await Department.deleteOne({ ...marked, _id: department._id, name: originalName, displayOrder: originalIndex + 1 }, { session })).deletedCount;
    }
    await State.updateOne({ _id: SOURCE }, { $set: { baseDate: clock.now() } }, { session });
    if (Object.values(removed).some(Boolean)) await audit.record(ctx, {
      action: 'SAMPLE_CONTENT_REMOVED', entityType: 'SAMPLE_CONTENT', entityId: SOURCE,
      reason: 'Explicit administrator removal of unmodified sample records only. User records, edits and audit history were preserved.',
    }, session);
    return { ...(await status(session)), removed };
  });
}
module.exports = { status, install, remove };
