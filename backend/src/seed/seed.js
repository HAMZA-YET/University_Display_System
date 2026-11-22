'use strict';

/**
 * npm run seed - resets and seeds the database (idempotent).
 * All dates are relative to the time the seed runs, so the scenarios stay
 * correct whenever it is run. Development data only.
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { loadEnv } = require('../config/env');
const { connectDb } = require('../config/db');
const { ensureDefaultDepartments } = require('../modules/departments/department.service');
const User = require('../modules/users/user.model');
const Department = require('../modules/departments/department.model');
const Notice = require('../modules/notices/notice.model');
const Revision = require('../modules/notices/revision.model');
const Event = require('../modules/events/event.model');
const Professor = require('../modules/professors/professor.model');
const DomainEvent = require('../modules/domainEvents/domainEvent.model');
const AuditLog = require('../modules/audit/audit.model');
const StoredFile = require('../modules/attachments/storedFile.model');
const localGateway = require('../modules/attachments/localAttachmentGateway');
const domainEvents = require('../modules/domainEvents/domainEvent.service');
const { PRIORITY_RANK } = require('../modules/notices/notice.constants');
const accounts = require('./fixtures/accounts');
const professors = require('./fixtures/professors');
const { seedLostFound } = require('../modules/lostFound/lostFound.seed');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const NOW = new Date();
const at = (ms) => new Date(NOW.getTime() + ms);

/** A small, valid one-page PDF used as a sample attachment. */
function samplePdf(title) {
  const text = title.replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    body += `${String(off).padStart(10, '0')} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

async function audit(actor, action, entityType, entityId, fromStatus, toStatus, reason, timestamp) {
  await AuditLog.create({
    actor: actor ? actor._id : null,
    actorRole: actor ? actor.role : null,
    action,
    entityType,
    entityId: String(entityId),
    fromStatus: fromStatus || null,
    toStatus: toStatus || null,
    reason: reason || null,
    requestId: 'seed',
    ip: '127.0.0.1',
    timestamp,
  });
}

function snapshotOf(c) {
  return {
    title: c.title,
    summary: c.summary,
    body: c.body,
    category: c.category,
    department: c.department,
    audience: c.audience,
    visibility: c.visibility,
    publishingOffice: c.publishingOffice,
    contactEmail: c.contactEmail || null,
    actionDeadline: c.actionDeadline || null,
    attachments: c.attachments || [],
  };
}

/**
 * Creates one notice in a given state, with its revision, history,
 * domain events and audit entries. `spec.flow` is a list of steps.
 */
async function createNotice(users, spec) {
  const author = users[spec.author || 'author'];
  const reviewer = users.reviewer;
  const c = spec.content;
  const created = spec.createdAt || at(-10 * DAY);
  const submitted = spec.submittedAt || new Date(created.getTime() + HOUR);
  // Notices that are already live were approved when they went live.
  const decided =
    spec.decidedAt ||
    (spec.start && spec.start.getTime() < NOW.getTime() && spec.start.getTime() > submitted.getTime()
      ? spec.start
      : new Date(submitted.getTime() + 2 * HOUR));
  const history = [];
  let version = 1;
  const doc = {
    ...c,
    attachments: c.attachments || [],
    author: author._id,
    status: 'DRAFT',
    priority: spec.priority || 'NORMAL',
    priorityRank: PRIORITY_RANK[spec.priority || 'NORMAL'],
    pinned: Boolean(spec.pinned),
    requestedPublicationStart: spec.requestedStart || null,
    requestedPublicationEnd: spec.requestedEnd || null,
    createdAt: created,
    updatedAt: created,
  };
  const notice = await Notice.create(doc);
  await audit(author, 'NOTICE_CREATED', 'NOTICE', notice._id, null, 'DRAFT', null, created);

  const steps = spec.flow || [];
  const set = {};
  if (steps.includes('submit')) {
    history.push({ decision: 'SUBMITTED', reviewer: author._id, decidedAt: submitted });
    set.status = 'SUBMITTED';
    set.submittedAt = submitted;
    version += 1;
    await audit(author, 'NOTICE_SUBMITTED', 'NOTICE', notice._id, 'DRAFT', 'SUBMITTED', null, submitted);
  }
  if (steps.includes('return')) {
    history.push({ decision: 'RETURNED', reviewer: reviewer._id, decidedAt: decided, reason: spec.reason });
    Object.assign(set, { status: 'RETURNED', reviewer: reviewer._id });
    version += 1;
    await audit(reviewer, 'NOTICE_RETURNED', 'NOTICE', notice._id, 'SUBMITTED', 'RETURNED', spec.reason, decided);
  }
  if (steps.includes('reject')) {
    history.push({ decision: 'REJECTED', reviewer: reviewer._id, decidedAt: decided, reason: spec.reason });
    Object.assign(set, { status: 'REJECTED', reviewer: reviewer._id });
    version += 1;
    await audit(reviewer, 'NOTICE_REJECTED', 'NOTICE', notice._id, 'SUBMITTED', 'REJECTED', spec.reason, decided);
  }

  let snapshot = null;
  if (steps.includes('approve')) {
    snapshot = snapshotOf(c);
    const revision = await Revision.create({
      notice: notice._id,
      revisionNumber: 1,
      kind: 'INITIAL',
      author: author._id,
      contentSnapshot: snapshot,
      reviewDecision: 'APPROVED',
      reviewedBy: reviewer._id,
      reviewedAt: decided,
      approved: true,
      approvedAt: decided,
    });
    history.push({ decision: 'APPROVED', reviewer: reviewer._id, decidedAt: decided, revisionNumber: 1 });
    version += 1;
    Object.assign(set, {
      status: 'APPROVED',
      reviewer: reviewer._id,
      approvedRevision: revision._id,
      approvedVersionNumber: 1,
      publicationStart: spec.start,
      publicationEnd: spec.end || null,
      approvedAt: decided,
      publishedAt: spec.start,
      publicSearch: {
        title: snapshot.title,
        summary: snapshot.summary,
        body: snapshot.body,
        category: snapshot.category,
        department: snapshot.department,
        audience: snapshot.audience,
        visibility: snapshot.visibility,
      },
    });
    const type = spec.start.getTime() <= decided.getTime() ? 'NOTICE_PUBLISHED' : 'NOTICE_SCHEDULED';
    await domainEvents.recordOnce(
      type,
      { entityType: 'NOTICE', entityId: notice._id, entityVersion: 1 },
      domainEvents.noticePayload({ _id: notice._id, publicationStart: spec.start, publicationEnd: spec.end || null, status: 'APPROVED' }, snapshot),
      { actor: reviewer._id, action: 'approve', timestamp: decided }
    );
    await audit(reviewer, 'NOTICE_APPROVED', 'NOTICE', notice._id, 'SUBMITTED', type === 'NOTICE_PUBLISHED' ? 'PUBLISHED' : 'SCHEDULED', null, decided);
  }
  if (steps.includes('withdraw')) {
    const when = spec.withdrawnAt || at(-1 * DAY);
    history.push({ decision: 'WITHDRAWN', reviewer: reviewer._id, decidedAt: when, reason: spec.withdrawReason });
    Object.assign(set, { status: 'WITHDRAWN', withdrawnAt: when, withdrawalReason: spec.withdrawReason });
    version += 1;
    await domainEvents.recordOnce(
      'NOTICE_WITHDRAWN',
      { entityType: 'NOTICE', entityId: notice._id, entityVersion: version },
      domainEvents.noticePayload({ _id: notice._id, publicationStart: spec.start, publicationEnd: spec.end || null, status: 'WITHDRAWN' }, snapshot),
      { actor: reviewer._id, action: 'withdraw', timestamp: when }
    );
    await audit(reviewer, 'NOTICE_WITHDRAWN', 'NOTICE', notice._id, 'PUBLISHED', 'WITHDRAWN', spec.withdrawReason, when);
  }
  if (steps.includes('archive')) {
    const when = spec.archivedAt || at(-2 * HOUR);
    history.push({ decision: 'ARCHIVED', reviewer: reviewer._id, decidedAt: when });
    Object.assign(set, { status: 'ARCHIVED', archivedAt: when });
    version += 1;
    await domainEvents.recordOnce(
      'NOTICE_ARCHIVED',
      { entityType: 'NOTICE', entityId: notice._id, entityVersion: version },
      domainEvents.noticePayload({ _id: notice._id, publicationStart: spec.start, publicationEnd: spec.end || null, status: 'ARCHIVED' }, snapshot),
      { actor: reviewer._id, action: 'archive', timestamp: when }
    );
    await audit(reviewer, 'NOTICE_ARCHIVED', 'NOTICE', notice._id, 'EXPIRED', 'ARCHIVED', null, when);
  }
  if (spec.correction) {
    const rev = await Revision.create({
      notice: notice._id,
      revisionNumber: 2,
      kind: 'CORRECTION',
      author: author._id,
      contentSnapshot: snapshotOf({ ...c, ...spec.correction.changes }),
      changeNote: spec.correction.changeNote,
      reviewDecision: 'PENDING',
      baseRevisionNumber: 1,
    });
    set.pendingRevision = rev._id;
    version += 1;
    await audit(author, 'CORRECTION_SUBMITTED', 'NOTICE', notice._id, null, 'PENDING', spec.correction.changeNote, at(-3 * HOUR));
  }

  const last = history.length ? history[history.length - 1].decidedAt : created;
  await Notice.collection.updateOne(
    { _id: notice._id },
    { $set: { ...set, reviewHistory: history.map((h) => ({ reason: null, revisionNumber: null, ...h })), version, updatedAt: last } }
  );
  return Notice.findById(notice._id).lean();
}

async function createEvent(users, notice, spec) {
  const event = await Event.create({
    notice: notice._id,
    title: spec.title,
    start: spec.start,
    end: spec.end,
    timezone: 'Asia/Seoul',
    allDay: false,
    venue: spec.venue,
    venueBuilding: spec.venueBuilding || null,
    venueRoom: spec.venueRoom || null,
    organizer: spec.organizer,
    state: 'SCHEDULED',
    version: 1,
    createdBy: users[spec.author || 'author']._id,
  });
  const approved = notice.status === 'APPROVED' || notice.status === 'WITHDRAWN';
  if (approved) {
    await domainEvents.recordOnce(
      'EVENT_CREATED',
      { entityType: 'EVENT', entityId: event._id, entityVersion: 1 },
      domainEvents.eventPayload(event, notice),
      { actor: users.reviewer._id, action: 'approve-notice', timestamp: notice.approvedAt || NOW }
    );
  }
  if (spec.postpone) {
    const p = spec.postpone;
    const changedAt = at(-1 * DAY);
    await Event.collection.updateOne(
      { _id: event._id },
      {
        $set: { start: p.newStart, end: p.newEnd, state: 'POSTPONED', postponementReason: p.reason, version: 2 },
        $push: { scheduleHistory: { previousStart: spec.start, previousEnd: spec.end, changedAt, changedBy: users.reviewer._id, reason: p.reason } },
      }
    );
    const updated = await Event.findById(event._id).lean();
    await domainEvents.recordOnce('EVENT_POSTPONED', { entityType: 'EVENT', entityId: event._id, entityVersion: 2 }, domainEvents.eventPayload(updated, notice), {
      actor: users.reviewer._id,
      action: 'postpone',
      timestamp: changedAt,
    });
    await audit(users.reviewer, 'EVENT_POSTPONED', 'EVENT', event._id, 'SCHEDULED', 'POSTPONED', p.reason, changedAt);
  }
  if (spec.cancelReason) {
    const when = at(-6 * HOUR);
    await Event.collection.updateOne({ _id: event._id }, { $set: { state: 'CANCELLED', cancellationReason: spec.cancelReason, version: 2 } });
    const updated = await Event.findById(event._id).lean();
    await domainEvents.recordOnce('EVENT_CANCELLED', { entityType: 'EVENT', entityId: event._id, entityVersion: 2 }, domainEvents.eventPayload(updated, notice), {
      actor: users.reviewer._id,
      action: 'cancel',
      timestamp: when,
    });
    await audit(users.reviewer, 'EVENT_CANCELLED', 'EVENT', event._id, 'SCHEDULED', 'CANCELLED', spec.cancelReason, when);
  }
  return event;
}

const base = (o) => ({
  audience: 'STUDENTS',
  visibility: 'PUBLIC',
  contactEmail: null,
  actionDeadline: null,
  ...o,
});

async function seed() {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.ALLOW_DEVELOPMENT_SEED !== 'true') {
    throw new Error('Development seeding is disabled. Use a disposable local database and explicitly set ALLOW_DEVELOPMENT_SEED=true.');
  }
  const env = loadEnv();
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database.');
  await connectDb(env.MONGO_URI);

  // Reset: remove stored upload files, clear every collection, rebuild indexes.
  const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
  if (fs.existsSync(uploadDir)) {
    for (const f of fs.readdirSync(uploadDir)) {
      if (/^[a-f0-9]{48}$/.test(f)) fs.unlinkSync(path.join(uploadDir, f));
    }
  }
  const models = [User, Department, Notice, Revision, Event, Professor, DomainEvent, AuditLog, StoredFile];
  for (const m of models) {
    await m.deleteMany({});
    await m.syncIndexes();
  }
  await ensureDefaultDepartments();

  // Accounts
  const users = {};
  for (const a of accounts) {
    const user = await User.create({
      name: a.name,
      email: a.email,
      passwordHash: await bcrypt.hash(a.password, env.BCRYPT_ROUNDS),
      role: a.role,
      department: a.department || null,
    });
    users[a.key] = user.toObject();
  }

  // Sample attachment through the gateway (stored outside any public folder).
  const pdfBuffer = samplePdf('Final examination timetable (sample)');
  const pdf = await localGateway.upload(
    { originalname: 'final-exam-timetable.pdf', mimetype: 'application/pdf', size: pdfBuffer.length, buffer: pdfBuffer },
    users.author
  );
  const examAttachment = { fileId: pdf.fileId, fileName: pdf.fileName, fileType: pdf.fileType, size: pdf.size, validationStatus: 'VALID' };

  const N = {};

  // 1. Published, pinned, URGENT, with attachment
  N.urgent = await createNotice(users, {
    flow: ['submit', 'approve'],
    priority: 'URGENT',
    pinned: true,
    start: at(-2 * DAY),
    content: base({
      title: 'Final examination timetable for all departments',
      summary: 'The final examination timetable is published. Check your exam rooms and seat numbers now.',
      body: 'The final examination period begins in three weeks. The full timetable for all departments is attached.\n\nBring your student identity card to every exam. Electronic devices must be switched off and placed in your bag.\n\nStudents with a timetable clash must contact the Academic Affairs Office by email.',
      category: 'EXAM',
      department: 'ALL',
      audience: 'STUDENTS',
      publishingOffice: 'Academic Affairs Office',
      contactEmail: 'academic.affairs@example.edu',
      attachments: [examAttachment],
    }),
  });

  // 2. Published HIGH (career fair, upcoming event)
  N.high = await createNotice(users, {
    flow: ['submit', 'approve'],
    priority: 'HIGH',
    start: at(-3 * DAY),
    end: at(30 * DAY),
    content: base({
      title: 'Career fair with partner companies',
      summary: 'Meet recruiters from partner companies in Korea and abroad. Bring printed copies of your CV.',
      body: 'The international career fair brings partner companies to campus. Students from every department are welcome.\n\nRecruiters will review CVs on the day. A CV clinic runs one week before the fair.',
      category: 'EVENT',
      department: 'IBA',
      audience: 'ALL',
      publishingOffice: 'Career Development Center',
      contactEmail: 'careers@example.edu',
    }),
  });

  // 3. Published with an action deadline (scholarship, completed info session)
  N.deadline = await createNotice(users, {
    author: 'author2',
    flow: ['submit', 'approve'],
    start: at(-8 * DAY),
    content: base({
      title: 'Merit scholarship applications for next semester',
      summary: 'Merit scholarship applications are open for students with a CGPA of 3.5 or higher.',
      body: 'Eligible students may apply for the merit scholarship for next semester. Submit the application form and your transcript.\n\nAn information session about the application was held last week. The slides are available from the Student Services Office.',
      category: 'SCHOLARSHIP',
      department: 'AI',
      audience: 'STUDENTS',
      publishingOffice: 'Student Services Office',
      contactEmail: 'scholarships@example.edu',
      actionDeadline: at(10 * DAY),
    }),
  });

  // 4. Published, CAMPUS-only (with upcoming event)
  N.campus = await createNotice(users, {
    flow: ['submit', 'approve'],
    start: at(-1 * DAY),
    content: base({
      title: 'Dormitory fire safety briefing',
      summary: 'All dormitory residents must attend the fire safety briefing. Attendance is recorded.',
      body: 'The dormitory office holds a compulsory fire safety briefing for all residents. The briefing explains evacuation routes and the use of fire extinguishers.\n\nThis notice is visible only to signed-in campus users.',
      category: 'ADMINISTRATIVE',
      department: 'ALL',
      audience: 'STUDENTS',
      visibility: 'CAMPUS',
      publishingOffice: 'Dormitory Office',
    }),
  });

  // 5. Draft
  N.draft = await createNotice(users, {
    flow: [],
    createdAt: at(-1 * DAY),
    content: {
      title: 'Smart Computing capstone showcase (draft)',
      summary: 'Final-year teams present their capstone projects.',
      body: null,
      category: 'ACADEMIC',
      department: 'BSC',
      audience: null,
      visibility: null,
      publishingOffice: null,
      contactEmail: null,
      actionDeadline: null,
    },
  });

  // 6. Submitted (in the review queue)
  N.submitted = await createNotice(users, {
    flow: ['submit'],
    createdAt: at(-2 * DAY),
    requestedStart: at(2 * DAY),
    content: base({
      title: 'Library extended opening hours during exams',
      summary: 'The library will open early and close late during the final examination period.',
      body: 'During the final examination period the library opens at 07:00 and closes at 24:00 every day, including weekends.\n\nGroup study rooms must be booked online.',
      category: 'GENERAL',
      department: 'ALL',
      audience: 'ALL',
      publishingOffice: 'University Library',
    }),
  });

  // 7. Returned with feedback
  N.returned = await createNotice(users, {
    flow: ['submit', 'return'],
    createdAt: at(-4 * DAY),
    requestedStart: at(1 * DAY),
    reason: 'Please add the registration link and the maximum number of participants.',
    content: base({
      title: 'Korean language speaking contest',
      summary: 'International students can join the Korean language speaking contest.',
      body: 'The Korean Studies department invites international students to the annual speaking contest. Prizes are awarded in three levels.',
      category: 'ACADEMIC',
      department: 'KS',
      audience: 'STUDENTS',
      publishingOffice: 'Korean Studies Department',
    }),
  });

  // 8. Rejected with reason
  N.rejected = await createNotice(users, {
    author: 'author2',
    flow: ['submit', 'reject'],
    createdAt: at(-6 * DAY),
    requestedStart: at(-4 * DAY),
    reason: 'This duplicates the timetable notice already published by Academic Affairs.',
    content: base({
      title: 'AI department exam room list',
      summary: 'Exam room list for AI department students for the final examinations.',
      body: 'Room allocations for the AI department are listed below. Please check carefully before the exam week.',
      category: 'EXAM',
      department: 'AI',
      publishingOffice: 'AI Department Office',
    }),
  });

  // 9. Scheduled (start = now + 3 days), event hidden until visible
  N.scheduled = await createNotice(users, {
    flow: ['submit', 'approve'],
    start: at(3 * DAY),
    end: at(40 * DAY),
    requestedStart: at(3 * DAY),
    content: base({
      title: 'Hospitality management industry visit',
      summary: 'IHM students visit a partner resort to learn about hotel operations.',
      body: 'The International Hospitality Management department organises an industry visit to a partner resort. Transport is provided from the main gate.',
      category: 'EVENT',
      department: 'IHM',
      publishingOffice: 'IHM Department Office',
    }),
  });

  // 10. Expired (end = now - 1 day)
  N.expired = await createNotice(users, {
    flow: ['submit', 'approve'],
    createdAt: at(-30 * DAY),
    submittedAt: at(-29 * DAY),
    decidedAt: at(-28 * DAY),
    start: at(-28 * DAY),
    end: at(-1 * DAY),
    content: base({
      title: 'Course registration period for the spring semester',
      summary: 'Course registration was open for two weeks. Late registration is no longer possible online.',
      body: 'Course registration for the spring semester was open through the student portal. Contact your department office for help.',
      category: 'ACADEMIC',
      department: 'ALL',
      publishingOffice: 'Academic Affairs Office',
    }),
  });

  // 11. Withdrawn
  N.withdrawn = await createNotice(users, {
    flow: ['submit', 'approve', 'withdraw'],
    createdAt: at(-9 * DAY),
    start: at(-7 * DAY),
    withdrawnAt: at(-2 * DAY),
    withdrawReason: 'The bus timetable changed; a corrected notice will follow.',
    content: base({
      title: 'Shuttle bus timetable to Sokcho terminal',
      summary: 'New shuttle bus times between campus and Sokcho terminal.',
      body: 'The shuttle bus runs every hour from 08:00 to 20:00 between the campus main gate and Sokcho terminal.',
      category: 'ADMINISTRATIVE',
      department: 'ALL',
      audience: 'ALL',
      publishingOffice: 'General Affairs Office',
    }),
  });

  // 12. Archived (expired, then archived)
  N.archived = await createNotice(users, {
    flow: ['submit', 'approve', 'archive'],
    createdAt: at(-60 * DAY),
    submittedAt: at(-59 * DAY),
    decidedAt: at(-58 * DAY),
    start: at(-58 * DAY),
    end: at(-30 * DAY),
    content: base({
      title: 'Orientation week programme for new students',
      summary: 'Orientation week activities for new international students.',
      body: 'Orientation week included campus tours, a welcome dinner and Korean culture workshops.',
      category: 'GENERAL',
      department: 'ALL',
      publishingOffice: 'International Office',
    }),
  });

  // 13. Published with a pending correction (old version stays public)
  N.corrected = await createNotice(users, {
    flow: ['submit', 'approve'],
    start: at(-4 * DAY),
    content: base({
      title: 'Computer lab maintenance in the Smart Computing Center',
      summary: 'Lab 4A will be closed on Saturday for network maintenance.',
      body: 'Lab 4A in the Smart Computing Center will be closed on Saturday from 09:00 to 13:00 for network maintenance. Please save your work to cloud storage.',
      category: 'ADMINISTRATIVE',
      department: 'BSC',
      publishingOffice: 'Smart Computing Center',
    }),
    correction: {
      changeNote: 'The maintenance window was extended to 17:00 by the IT team.',
      changes: {
        summary: 'Lab 4A will be closed on Saturday from 09:00 to 17:00 for network maintenance.',
        body: 'Lab 4A in the Smart Computing Center will be closed on Saturday from 09:00 to 17:00 for network maintenance. Please save your work to cloud storage.',
      },
    },
  });

  // 14. Published (sports day, postponed event)
  N.sports = await createNotice(users, {
    author: 'author2',
    flow: ['submit', 'approve'],
    start: at(-5 * DAY),
    content: base({
      title: 'University sports day',
      summary: 'Join the football, basketball and relay competitions on the main field.',
      body: 'All students and staff are invited to the university sports day. Teams register by department.',
      category: 'EVENT',
      department: 'ALL',
      audience: 'ALL',
      publishingOffice: 'Student Council',
    }),
  });

  // 15. Published (culture night, cancelled event)
  N.culture = await createNotice(users, {
    flow: ['submit', 'approve'],
    start: at(-6 * DAY),
    content: base({
      title: 'Korean culture night',
      summary: 'An evening of traditional music, food and games for the campus community.',
      body: 'The Korean Studies department hosts a culture night with traditional music, food tasting and games.',
      category: 'EVENT',
      department: 'KS',
      audience: 'ALL',
      publishingOffice: 'Korean Studies Department',
    }),
  });

  // Events (at least 6)
  const day = (d, h) => {
    const x = at(d * DAY);
    x.setUTCHours(h - 9, 0, 0, 0); // h in Seoul time (UTC+9)
    return x;
  };
  await createEvent(users, N.high, { title: 'International career fair', start: day(7, 10), end: day(7, 16), venue: 'Main Auditorium', venueBuilding: 'Global Hall', organizer: 'Career Development Center' });
  await createEvent(users, N.deadline, { author: 'author2', title: 'Scholarship information session', start: day(-5, 15), end: day(-5, 16), venue: 'Seminar Room 2', venueBuilding: 'Innovation Hall', venueRoom: '210', organizer: 'Student Services Office' });
  await createEvent(users, N.sports, {
    author: 'author2',
    title: 'University sports day',
    start: day(5, 9),
    end: day(5, 17),
    venue: 'Main Field',
    organizer: 'Student Council',
    postpone: { newStart: day(12, 9), newEnd: day(12, 17), reason: 'Heavy rain is forecast for the original date.' },
  });
  await createEvent(users, N.culture, {
    title: 'Korean culture night',
    start: day(4, 18),
    end: day(4, 21),
    venue: 'Student Union Hall',
    organizer: 'Korean Studies Department',
    cancelReason: 'The hall is closed for emergency repairs. A new date will be announced.',
  });
  await createEvent(users, N.scheduled, { title: 'Resort industry visit', start: day(10, 8), end: day(10, 18), venue: 'Partner resort (bus from main gate)', organizer: 'IHM Department Office' });
  await createEvent(users, N.campus, { title: 'Fire safety briefing', start: day(2, 19), end: day(2, 20), venue: 'Dormitory Lounge', venueBuilding: 'Dormitory A', organizer: 'Dormitory Office' });

  // Professors (3 or more per department)
  const admin = users.admin;
  for (const p of professors) {
    const doc = await Professor.create({ ...p, version: 1 });
    await audit(admin, 'PROFESSOR_CREATED', 'PROFESSOR', doc._id, null, null, doc.name, at(-20 * DAY));
  }

  // Lost and found (Member 3)
  const lostFoundCounts = await seedLostFound(users);

  const counts = {
    ...lostFoundCounts,
    users: await User.countDocuments(),
    notices: await Notice.countDocuments(),
    revisions: await Revision.countDocuments(),
    events: await Event.countDocuments(),
    professors: await Professor.countDocuments(),
    domainEvents: await DomainEvent.countDocuments(),
    auditEntries: await AuditLog.countDocuments(),
  };

  /* eslint-disable no-console */
  console.log('\nSeed complete:', JSON.stringify(counts));
  console.log('\nDevelopment accounts (do not use in production):');
  for (const a of accounts) console.log(`  ${a.email.padEnd(26)} ${a.password.padEnd(16)} ${a.role}`);
  console.log('\nAll professors, notices and contact details are fictional sample data.\n');
  /* eslint-enable no-console */
}

seed()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
