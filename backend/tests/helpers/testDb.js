'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

// Register every model so indexes exist before tests run.
require('../../src/modules/users/user.model');
require('../../src/modules/departments/department.model');
require('../../src/modules/notices/notice.model');
require('../../src/modules/notices/revision.model');
require('../../src/modules/events/event.model');
require('../../src/modules/professors/professor.model');
require('../../src/modules/domainEvents/domainEvent.model');
require('../../src/modules/audit/audit.model');
require('../../src/modules/attachments/storedFile.model');
require('../../src/modules/lostFound/item.model');
require('../../src/modules/lostFound/claim.model');
require('../../src/modules/lostFound/caseEvent.model');
require('../../src/modules/lostFound/counter.model');
require('../../src/modules/lostFound/notice.model');

const { ensureDefaultDepartments } = require('../../src/modules/departments/department.service');
const { resetTransactionCache } = require('../../src/utils/transaction');

function uriFor(dbName) {
  const base = process.env.MONGO_TEST_URI;
  if (!base) throw new Error('MONGO_TEST_URI is not set; globalSetup did not run');
  const url = new URL(base);
  url.pathname = `/${dbName}`;
  return url.toString();
}

async function connect() {
  const dbName = `uids_test_${crypto.randomBytes(4).toString('hex')}`;
  resetTransactionCache();
  await mongoose.connect(uriFor(dbName));
  await Promise.all(Object.values(mongoose.models).map((m) => m.createCollection().catch(() => null)));
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  await ensureDefaultDepartments();
}

/** Each test file creates its own data; this clears it between tests. */
async function clear() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.filter((c) => c.collectionName !== 'departments').map((c) => c.deleteMany({})));
}

async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

module.exports = { connect, clear, disconnect };
