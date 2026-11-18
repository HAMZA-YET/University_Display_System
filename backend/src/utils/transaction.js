'use strict';

const mongoose = require('mongoose');

let replicaSetCache = null;

/** True when the connected MongoDB deployment supports transactions. */
async function supportsTransactions() {
  if (replicaSetCache !== null) return replicaSetCache;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    replicaSetCache = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch (err) {
    replicaSetCache = false;
  }
  return replicaSetCache;
}

function resetTransactionCache() {
  replicaSetCache = null;
}

/**
 * Runs fn(session) inside a MongoDB transaction when the database is a replica
 * set. Otherwise runs fn(null): the state is saved first, then the domain event
 * is recorded, and idempotency makes retries safe (Section 16).
 */
async function withTransaction(fn) {
  if (!(await supportsTransactions())) {
    return fn(null);
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { withTransaction, supportsTransactions, resetTransactionCache };
