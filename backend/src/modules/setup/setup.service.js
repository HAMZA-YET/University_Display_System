'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const { loadEnv } = require('../../config/env');
const { supportsTransactions } = require('../../utils/transaction');
const AppError = require('../../utils/AppError');
const User = require('../users/user.model');
const SetupState = require('./setupState.model');
const audit = require('../audit/audit.service');

const CLAIM_ID = 'initial-administrator';
const setupComplete = () => new AppError(409, 'SETUP_COMPLETE', 'Administrator setup is already complete.');
const setupUnavailable = () => new AppError(503, 'SETUP_UNAVAILABLE', 'Administrator setup is unavailable. Contact the project owner.');

function configuredToken() {
  const token = loadEnv().BOOTSTRAP_TOKEN;
  // There is no development or production fallback token.
  return token && token.length >= 32 ? token : null;
}
function verifyBootstrapToken(provided) {
  const expected = configuredToken();
  if (!expected) throw setupUnavailable();
  if (typeof provided !== 'string' || !provided || provided.length > 512) throw AppError.forbidden('The setup token is invalid.');
  // Hash first so timingSafeEqual always receives equal-length buffers.
  const digest = (value) => crypto.createHash('sha256').update(value, 'utf8').digest();
  if (!crypto.timingSafeEqual(digest(expected), digest(provided))) throw AppError.forbidden('The setup token is invalid.');
}
async function status() {
  const administratorExists = Boolean(await User.exists({ role: 'ADMIN' }));
  return { bootstrapConfigured: Boolean(configuredToken()) && !administratorExists, administratorExists };
}

/**
 * All first-admin paths (browser and trusted CLI) share the same claim and
 * mandatory transaction. A second session cannot win the unique singleton.
 */
async function withInitialAdministrator(administratorId, createAdministrator) {
  if (!(await supportsTransactions())) throw setupUnavailable();
  await SetupState.createCollection();
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      if (await User.exists({ role: 'ADMIN' }).session(session)) throw setupComplete();
      await SetupState.create([{ _id: CLAIM_ID, administrator: administratorId }], { session });
      result = await createAdministrator(session);
    });
    return result;
  } catch (error) {
    if (error && error.code === 11000) throw setupComplete();
    throw error;
  } finally {
    await session.endSession();
  }
}

async function promoteCurrentReader(ctx, providedToken) {
  // Reject completed setup before checking or consuming any supplied token.
  if (await User.exists({ role: 'ADMIN' })) throw setupComplete();
  verifyBootstrapToken(providedToken);
  return withInitialAdministrator(ctx.user._id, async (session) => {
    const user = await User.findOneAndUpdate({
      _id: ctx.user._id,
      role: 'READER',
      isActive: true,
      tokenVersion: ctx.user.tokenVersion,
    }, { $set: { role: 'ADMIN' }, $inc: { tokenVersion: 1 } }, { new: true, session }).lean();
    if (!user) throw AppError.unauthenticated('Your account changed. Sign in again before completing setup.');
    await audit.record(ctx, {
      action: 'INITIAL_ADMINISTRATOR_CREATED', entityType: 'USER', entityId: user._id,
      fromStatus: 'READER', toStatus: 'ADMIN',
    }, session);
    return user;
  });
}

module.exports = { status, promoteCurrentReader, withInitialAdministrator };
