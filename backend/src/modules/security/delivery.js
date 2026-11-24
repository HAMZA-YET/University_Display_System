'use strict';
const fs = require('fs/promises');
const path = require('path');
const { randomUUID, createHash } = require('crypto');
const AppError = require('../../utils/AppError');
const { loadEnv } = require('../../config/env');

// A configured sender must be verified with Resend. Configuration availability
// does not assert provider health or domain verification; failed sends fail closed.
function status() {
  if (process.env.ACCOUNT_DELIVERY === 'local' && process.env.NODE_ENV !== 'production') return { available: true, channel: 'local' };
  if (process.env.ACCOUNT_DELIVERY === 'resend') {
    const key = process.env.RESEND_API_KEY || '';
    const from = process.env.ACCOUNT_MESSAGE_FROM || '';
    let origin;
    try { origin = new URL(loadEnv().CLIENT_ORIGIN); } catch { return { available: false, channel: 'disabled' }; }
    if (key.trim().length >= 10 && !/[\r\n]/.test(key) && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)
      && !origin.username && !origin.password && ['http:', 'https:'].includes(origin.protocol)
      && (process.env.NODE_ENV !== 'production' || origin.protocol === 'https:')) {
      return { available: true, channel: 'email' };
    }
  }
  return { available: false, channel: 'disabled' };
}
function available() {
  if (!status().available) throw new AppError(503, 'DELIVERY_UNAVAILABLE', 'Account messages are unavailable. Please contact an administrator.');
}

async function deliver({ email, purpose, token }) {
  available();
  if (!['activation', 'recovery'].includes(purpose) || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid account message');
  if (status().channel === 'email') {
    const url = new URL('/account-recovery', loadEnv().CLIENT_ORIGIN).toString();
    const activation = purpose === 'activation';
    const payload = {
      from: process.env.ACCOUNT_MESSAGE_FROM,
      to: [email],
      subject: activation ? 'Activate your university display account' : 'Recover your university display account',
      // The code is never placed in a URL, browser history or HTTP response.
      text: `${activation ? 'An administrator invited you to activate your account.' : 'A password reset was requested for your account.'}\n\nOpen ${url}\nChoose ${activation ? 'Account activation' : 'Password recovery'} and enter this private code:\n\n${token}\n\nThis code expires in ${activation ? '24 hours' : '30 minutes'} and works once. ${activation ? '' : 'MFA remains enabled. '}If you did not expect this message, ignore it. Never share the code.`,
    };
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json',
          'Idempotency-Key': createHash('sha256').update(`${purpose}:${email}:${token}`).digest('hex') },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
      });
      const result = await response.json();
      if (!response.ok || typeof result.id !== 'string' || !result.id) throw new Error('Delivery rejected');
      return;
    } catch {
      // Never expose provider bodies, bearer credentials, recipients or codes.
      throw new AppError(503, 'DELIVERY_UNAVAILABLE', 'Account message delivery failed. Please try again later or contact an administrator.');
    }
  }
  const directory = path.resolve(__dirname, '../../../.local/messages');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error('Unsafe message directory');
  await fs.writeFile(path.join(directory, randomUUID() + '.json'), JSON.stringify({ email, purpose, token }), { flag: 'wx', mode: 0o600 });
}
module.exports = { status, available, deliver };
