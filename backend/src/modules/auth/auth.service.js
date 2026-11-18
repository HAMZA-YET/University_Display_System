'use strict';

const bcrypt = require('bcryptjs');
const User = require('../users/user.model');
const AppError = require('../../utils/AppError');
const { loadEnv } = require('../../config/env');

let dummyHash = null;

async function hashPassword(plain) {
  return bcrypt.hash(plain, loadEnv().BCRYPT_ROUNDS);
}

/** Self-registration always creates a READER. */
async function register({ name, email, password }) {
  const existing = await User.exists({ email });
  if (existing) {
    throw new AppError(409, 'DUPLICATE', 'An account with this email already exists.', [
      { location: 'body', field: 'email', message: 'Already registered' },
    ]);
  }
  const passwordHash = await hashPassword(password);
  const user = await User.create({ name, email, passwordHash, role: 'READER' });
  return user.toObject();
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash').lean();
  const fail = new AppError(401, 'UNAUTHENTICATED', 'Email or password is incorrect.');
  if (!user) {
    // Spend comparable time so response timing does not reveal registered emails.
    if (!dummyHash) dummyHash = await hashPassword('timing-equaliser-1');
    await bcrypt.compare(password, dummyHash);
    throw fail;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw fail;
  if (!user.isActive) throw new AppError(403, 'FORBIDDEN', 'This account has been deactivated.');
  delete user.passwordHash;
  return user;
}

function toAuthUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department || null,
  };
}

module.exports = { register, login, hashPassword, toAuthUser };
