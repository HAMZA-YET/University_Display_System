'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const OTPAuth = require('otpauth');
const { ActionToken, SecurityFactor } = require('./models');
const { digest, randomToken, encrypt, decrypt } = require('./crypto');
const User = require('../users/user.model');
const { hashPassword } = require('../auth/auth.service');
const delivery = require('./delivery');
const AppError = require('../../utils/AppError');
const clock = require('../../utils/clock');
const invalid = () => new AppError(400, 'INVALID_SECURITY_TOKEN', 'The code or link is invalid, expired or already used.');
const otp = secret => new OTPAuth.TOTP({ issuer: 'UIDS', label: 'Account', algorithm: 'SHA1', digits: 6, period: 30, secret });
async function requireTransactions() {
  if (!(await require('../../utils/transaction').supportsTransactions())) throw new AppError(503, 'SECURITY_TRANSACTIONS_REQUIRED', 'Account security requires a MongoDB replica set.');
}
async function issue(user, purpose, minutes) {
  const token = randomToken();
  await ActionToken.create({ digest: digest(token), userId: user._id, purpose, version: user.tokenVersion,
    expiresAt: new Date(clock.now().getTime() + minutes * 60000) });
  return token;
}
async function requestRecovery(email) {
  await requireTransactions();
  delivery.available();
  const user = await User.findOne({ email, isActive: true, activationPending: { $ne: true } }).lean();
  if (!user) return;
  const token = await issue(user, 'recovery', 30);
  try { await delivery.deliver({ email, purpose: 'recovery', token }); }
  catch { await ActionToken.deleteOne({ digest: digest(token) }); throw new AppError(503, 'DELIVERY_UNAVAILABLE', 'Account message delivery is unavailable.'); }
}
async function consumePassword(token, purpose, password) {
  await requireTransactions();
  const passwordHash = await hashPassword(password);
  await mongoose.connection.transaction(async session => {
    const record = await ActionToken.findOneAndDelete({ digest: digest(token), purpose, expiresAt: { $gt: clock.now() } }, { session });
    if (!record) throw invalid();
    const filter = purpose === 'activation' ? { activationPending: true, isActive: false } : { isActive: true, activationPending: { $ne: true } };
    const user = await User.findOneAndUpdate({ _id: record.userId, tokenVersion: record.version, ...filter },
      { $set: { passwordHash, ...(purpose === 'activation' ? { activationPending: false, isActive: true } : {}) }, $inc: { tokenVersion: 1 } }, { session, new: true });
    if (!user) throw invalid();
    await ActionToken.deleteMany({ userId: user._id }, { session });
  });
}
async function invite({ name, email, department }) {
  await requireTransactions();
  delivery.available();
  const user = await User.create({ name, email, department: department || null, role: 'READER', isActive: false,
    activationPending: true, passwordHash: await hashPassword(randomToken()) });
  const token = await issue(user, 'activation', 24 * 60);
  try { await delivery.deliver({ email, purpose: 'activation', token }); }
  catch { await ActionToken.deleteOne({ digest: digest(token) }); await User.deleteOne({ _id: user._id, activationPending: true }); throw new AppError(503, 'DELIVERY_UNAVAILABLE', 'Invitation delivery failed.'); }
  return user;
}
async function beginEnrollment(user, password) {
  await requireTransactions();
  const current = await User.findOne({ _id: user._id, isActive: true }).select('+passwordHash').lean();
  if (!current || !(await bcrypt.compare(password, current.passwordHash))) throw AppError.unauthenticated('Password is incorrect.');
  if (current.mfaEnabled) throw new AppError(409, 'MFA_ALREADY_ENABLED', 'MFA is already enabled.');
  const secret = new OTPAuth.Secret({ size: 20 });
  const encryptedSecret = encrypt(secret.base32);
  await SecurityFactor.findOneAndUpdate({ userId: user._id, enabled: false },
    { encryptedSecret, expiresAt: new Date(clock.now().getTime() + 10 * 60000), attempts: 0, lastStep: -1, recoveryHashes: [] }, { upsert: true });
  return { secret: secret.base32, uri: otp(secret).toString() };
}
function matchedStep(secret, code) {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = otp(OTPAuth.Secret.fromBase32(secret)).validate({ token: code, timestamp: clock.now().getTime(), window: 1 });
  return delta === null ? null : Math.floor(clock.now().getTime() / 30000) + delta;
}
async function confirmEnrollment(user, code) {
  await requireTransactions();
  const factor = await SecurityFactor.findOneAndUpdate({ userId: user._id, enabled: false, attempts: { $lt: 5 }, expiresAt: { $gt: clock.now() } },
    { $inc: { attempts: 1 } }, { new: true }).select('+encryptedSecret');
  if (!factor) throw invalid();
  const step = matchedStep(decrypt(factor.encryptedSecret), code);
  if (step === null) throw invalid();
  const codes = Array.from({ length: 8 }, randomToken);
  let updated;
  await mongoose.connection.transaction(async session => {
    const changed = await SecurityFactor.updateOne({ _id: factor._id, enabled: false, encryptedSecret: factor.encryptedSecret },
      { $set: { enabled: true, lastStep: step, recoveryHashes: codes.map(digest) }, $unset: { expiresAt: 1 } }, { session });
    if (changed.modifiedCount !== 1) throw invalid();
    updated = await User.findOneAndUpdate({ _id: user._id, tokenVersion: user.tokenVersion, isActive: true },
      { $set: { mfaEnabled: true }, $inc: { tokenVersion: 1 } }, { session, new: true }).lean();
    if (!updated) throw invalid();
  });
  return { user: updated, recoveryCodes: codes };
}
async function verifyChallenge(token, code) {
  await requireTransactions();
  // Count attempts atomically before checking the factor, including simultaneous requests.
  const challenge = await ActionToken.findOneAndUpdate({ digest: digest(token), purpose: 'mfa', attempts: { $lt: 5 }, expiresAt: { $gt: clock.now() } },
    { $inc: { attempts: 1 } }, { new: true });
  if (!challenge) throw invalid();
  let user;
  await mongoose.connection.transaction(async session => {
    user = await User.findOne({ _id: challenge.userId, isActive: true, tokenVersion: challenge.version, mfaEnabled: true }).session(session).lean();
    const factor = await SecurityFactor.findOne({ userId: challenge.userId, enabled: true }).select('+encryptedSecret +recoveryHashes').session(session);
    if (!user || !factor) throw invalid();
    let update;
    let filter = { _id: factor._id };
    if (/^[a-f0-9]{64}$/.test(code)) {
      filter.recoveryHashes = digest(code);
      update = { $pull: { recoveryHashes: digest(code) } };
    } else {
      const step = matchedStep(decrypt(factor.encryptedSecret), code);
      if (step === null || step <= factor.lastStep) throw invalid();
      filter.lastStep = { $lt: step };
      update = { $set: { lastStep: step } };
    }
    const changed = await SecurityFactor.updateOne(filter, update, { session });
    if (changed.modifiedCount !== 1) throw invalid();
    const consumed = await ActionToken.deleteOne({ _id: challenge._id }, { session });
    if (consumed.deletedCount !== 1) throw invalid();
    if (/^[a-f0-9]{64}$/.test(code)) {
      user = await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } }, { session, new: true }).lean();
      await ActionToken.deleteMany({ userId: user._id }, { session });
    }
  });
  return user;
}
module.exports = { issue, requestRecovery, consumePassword, invite, beginEnrollment, confirmEnrollment, verifyChallenge };
