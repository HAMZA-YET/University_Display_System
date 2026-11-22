'use strict';
const crypto = require('crypto');
const AppError = require('../../utils/AppError');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('hex');
function key() {
  if (!/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || '')) {
    throw new AppError(503, 'MFA_UNAVAILABLE', 'MFA encryption is not configured.');
  }
  return Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'hex');
}
function encrypt(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('hex')).join('.');
}
function decrypt(value) {
  const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'hex'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
module.exports = { digest, randomToken, encrypt, decrypt };
