'use strict';

// Manual operator command only. Never imported by app startup, seeding or build.
const crypto = require('crypto');

class FacultyImportError extends Error {}

const EMAIL_INDEX = {
  name: 'professor_email_nonempty_unique', unique: true,
  partialFilterExpression: { email: { $type: 'string', $gt: '' } },
};
const SOURCE_INDEX = {
  name: 'professor_source_key_unique', unique: true,
  partialFilterExpression: { sourceKey: { $type: 'string' } },
};

function parseArgs(argv) {
  if (new Set(argv).size !== argv.length || argv.some(arg => !['--apply', '--archive-samples'].includes(arg))) {
    throw new FacultyImportError('Use only --apply and/or --archive-samples. With no --apply, this command is a read-only dry run.');
  }
  return { apply: argv.includes('--apply'), archiveSamples: argv.includes('--archive-samples') };
}

function positionFor(label) {
  if (label === 'Visiting Faculty') return 'VISITING_FACULTY';
  if (label.includes('Instructor')) return 'INSTRUCTOR';
  const ranks = { 'Associate Professor': 'ASSOCIATE_PROFESSOR', 'Assistant Professor': 'ASSISTANT_PROFESSOR', Professor: 'PROFESSOR', 'Chair Professor': 'PROFESSOR' };
  if (!ranks[label]) throw new FacultyImportError('The faculty catalog contains an unsupported academic designation.');
  return ranks[label];
}

function buildProfiles(catalog) {
  let source;
  try { source = new URL(catalog.sourceUrl); } catch { throw new FacultyImportError('The faculty catalog source URL is invalid.'); }
  const retrievedAt = new Date(catalog.retrievedAt);
  if (source.protocol !== 'https:' || !['kduniv.ac.kr', 'www.kduniv.ac.kr'].includes(source.hostname)
    || source.username || source.password || Number.isNaN(retrievedAt.getTime())
    || !Array.isArray(catalog.profiles) || !catalog.profiles.length || catalog.profileCount !== catalog.profiles.length) {
    throw new FacultyImportError('The official faculty catalog metadata is invalid.');
  }
  const keys = new Set(), emails = new Set();
  return catalog.profiles.map(profile => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.slug || '')
      || typeof profile.name !== 'string' || profile.name.length < 2 || profile.name.length > 100
      || typeof profile.positionLabel !== 'string'
      || !Array.isArray(profile.roles) || profile.roles.some(role => typeof role !== 'string' || !role.trim() || role.length > 200)
      || !Array.isArray(profile.qualifications) || profile.qualifications.some(value => typeof value !== 'string' || !value.trim() || value.length > 300)
      || (profile.email !== null && (typeof profile.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)))
      || !/^\/assets\/kdu\/faculty\/[a-z0-9-]+\.(?:jpe?g|png|webp)$/.test(profile.profileImage || '')) {
      throw new FacultyImportError('A faculty catalog profile is invalid. No records were imported.');
    }
    const sourceKey = 'kdu-global:' + profile.slug;
    const email = profile.email === null ? null : profile.email.trim().toLowerCase();
    if (keys.has(sourceKey) || (email && emails.has(email))) throw new FacultyImportError('The faculty catalog contains duplicate identifiers or emails.');
    keys.add(sourceKey);
    if (email) emails.add(email);
    return {
      _id: crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0, 24),
      sourceKey, sourceUrl: catalog.sourceUrl, sourceRetrievedAt: retrievedAt,
      name: profile.name, titlePrefix: null, position: positionFor(profile.positionLabel),
      positionLabel: profile.positionLabel, roles: [...profile.roles], qualifications: [...profile.qualifications],
      department: null, officeRoom: null, officeBuilding: null, email, phone: null,
      subjects: [], counsellingHours: [], profileImage: profile.profileImage, isActive: true, version: 1,
    };
  });
}

function models() {
  return {
    mongoose: require('mongoose'),
    Professor: require('../modules/professors/professor.model'),
    AuditLog: require('../modules/audit/audit.model'),
    audit: require('../modules/audit/audit.service'),
    supportsTransactions: require('../utils/transaction').supportsTransactions,
  };
}

function samplePredicate() {
  const { DEPARTMENTS, key, id } = require('../modules/sample-content/sampleContent.fixtures');
  return {
    isActive: true, version: 1, sourceKey: { $exists: false },
    $or: DEPARTMENTS.map(([code]) => ({ _id: id('professor', code), sampleContentKey: key('professor', code) })),
  };
}

async function planImport(Professor, profiles, archiveSamples, session = null) {
  const rows = await Professor.find({ $or: [
    { sourceKey: { $in: profiles.map(profile => profile.sourceKey) } },
    { email: { $in: profiles.map(profile => profile.email).filter(Boolean) } },
    { _id: { $in: profiles.map(profile => profile._id) } },
  ] }).select('_id sourceKey email').session(session).lean();
  const existing = new Map(rows.filter(row => row.sourceKey).map(row => [row.sourceKey, row]));
  const missing = profiles.filter(profile => !existing.has(profile.sourceKey));
  let emailCollisions = 0, identifierCollisions = 0;
  for (const profile of missing) {
    if (profile.email && rows.some(row => row.email === profile.email && row.sourceKey !== profile.sourceKey)) emailCollisions += 1;
    if (rows.some(row => String(row._id) === profile._id && row.sourceKey !== profile.sourceKey)) identifierCollisions += 1;
  }
  const wouldArchiveSamples = archiveSamples ? await Professor.countDocuments(samplePredicate()).session(session) : 0;
  return {
    missing,
    counts: {
      catalogProfiles: profiles.length, existingOfficial: profiles.length - missing.length,
      wouldInsert: missing.length, wouldArchiveSamples, emailCollisions, identifierCollisions,
    },
  };
}

function assertNoCollisions(plan) {
  if (plan.counts.emailCollisions || plan.counts.identifierCollisions) {
    throw new FacultyImportError('Import blocked by professor email or identifier collisions. No faculty records were written.');
  }
}

// Index changes are deliberate and outside the data transaction. Keep the old
// unique constraint until its replacement has been successfully constructed.
async function ensureFacultyIndexes(Professor) {
  await Professor.collection.createIndex({ email: 1 }, EMAIL_INDEX);
  await Professor.collection.createIndex({ sourceKey: 1 }, SOURCE_INDEX);
  const indexes = await Professor.collection.indexes();
  const legacy = indexes.find(index => index.name === 'email_1' && index.unique === true
    && index.key.email === 1 && Object.keys(index.key).length === 1);
  if (legacy) await Professor.collection.dropIndex('email_1');
  return { legacyEmailIndexRemoved: Boolean(legacy) };
}

async function importFaculty({ catalog = require('../data/kdu-faculty.json'), apply = false, archiveSamples = false } = {}) {
  const profiles = buildProfiles(catalog);
  const { mongoose, Professor, AuditLog, audit, supportsTransactions } = models();
  for (const profile of profiles) {
    if (new Professor(profile).validateSync()) throw new FacultyImportError('A faculty profile failed model validation. No faculty records were written.');
  }
  const transactionsAvailable = await supportsTransactions();
  const plan = await planImport(Professor, profiles, archiveSamples);
  const base = { mode: apply ? 'apply' : 'dry-run', ...plan.counts, transactionsAvailable,
    canApply: transactionsAvailable && !plan.counts.emailCollisions && !plan.counts.identifierCollisions,
    inserted: 0, archivedSamples: 0 };
  if (!apply) return base;
  assertNoCollisions(plan);
  if (!transactionsAvailable) throw new FacultyImportError('Faculty import requires a transaction-capable MongoDB deployment. No faculty records were written.');
  const indexChanges = await ensureFacultyIndexes(Professor);
  await AuditLog.createCollection();
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const current = await planImport(Professor, profiles, archiveSamples, session);
      assertNoCollisions(current);
      const timestamp = new Date();
      let inserted = 0;
      if (current.missing.length) {
        const written = await Professor.bulkWrite(current.missing.map(profile => ({ updateOne: {
          filter: { sourceKey: profile.sourceKey },
          update: { $setOnInsert: { ...profile, createdAt: timestamp, updatedAt: timestamp } },
          upsert: true, timestamps: false,
        } })), { session, ordered: true });
        inserted = written.upsertedCount;
      }
      const archived = archiveSamples
        ? await Professor.updateMany(samplePredicate(), { $set: { isActive: false }, $inc: { version: 1 } }, { session })
        : { modifiedCount: 0 };
      const operator = { user: null, requestId: 'operator-kdu-faculty-import', ip: null };
      if (inserted) await audit.record(operator, {
        action: 'KDU_FACULTY_IMPORTED', entityType: 'FACULTY_CATALOG', entityId: 'kdu-global',
        reason: `System operator imported ${inserted} sourced public faculty profiles; unpublished fields were left empty.`,
      }, session);
      if (archived.modifiedCount) await audit.record(operator, {
        action: 'KDU_FACULTY_SAMPLES_ARCHIVED', entityType: 'FACULTY_CATALOG', entityId: 'kdu-global',
        reason: `System operator archived ${archived.modifiedCount} identified fictional sample profiles; no records were deleted.`,
      }, session);
      result = { ...base, ...current.counts, ...indexChanges, inserted, archivedSamples: archived.modifiedCount };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function defaultDependencies() {
  process.env.LOG_LEVEL = 'silent';
  const mongoose = require('mongoose');
  // Connecting for a dry run must not trigger background collection/index writes.
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  return { ...require('../config/db'), loadEnv: require('../config/env').loadEnv, importFaculty };
}

async function run(argv = process.argv.slice(2), dependenciesFactory = defaultDependencies) {
  const options = parseArgs(argv);
  const dependencies = dependenciesFactory();
  try {
    const env = dependencies.loadEnv();
    if (typeof env.MONGO_URI !== 'string' || !/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI.trim())) {
      throw new FacultyImportError('Configure the existing MONGO_URI or MONGODB_URI before running the faculty import.');
    }
    await dependencies.connectDb(env.MONGO_URI);
    return await dependencies.importFaculty(options);
  } finally {
    await dependencies.disconnectDb();
  }
}

function failureMessage(error) {
  return error instanceof FacultyImportError ? error.message
    : 'Faculty import failed. No connection strings, credentials or database error details were printed. Review configuration and the dry-run collision counts.';
}

if (require.main === module) {
  run().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(failureMessage(error));
    process.exitCode = 1;
  });
}

module.exports = { run, parseArgs, buildProfiles, importFaculty, ensureFacultyIndexes, failureMessage };
