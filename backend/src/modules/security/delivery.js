'use strict';
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const AppError = require('../../utils/AppError');
// Local development delivery only. No links or secrets are returned by HTTP.
function available() {
  if (process.env.NODE_ENV === 'production' || process.env.ACCOUNT_DELIVERY !== 'local') {
    throw new AppError(503, 'DELIVERY_UNAVAILABLE', 'Account message delivery is not configured.');
  }
}
async function deliver({ email, purpose, token }) {
  available();
  const directory = path.resolve(__dirname, '../../../.local/messages');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('Unsafe message directory');
  await fs.writeFile(path.join(directory, randomUUID() + '.json'), JSON.stringify({ email, purpose, token }), { flag: 'wx', mode: 0o600 });
}
module.exports = { available, deliver };
