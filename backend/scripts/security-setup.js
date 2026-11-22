'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const destination = path.resolve(process.argv[2] || path.join(__dirname, '../.env'));
if (fs.lstatSync(destination).isSymbolicLink()) throw new Error('Configuration file must not be a symbolic link.');
const descriptor = fs.openSync(destination, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0));
try {
  if (!fs.fstatSync(descriptor).isFile()) throw new Error('Configuration must be a regular file.');
  // mode on writeFile only protects newly created files. Restrict this existing
  // descriptor before storing secrets, and keep reads/writes on the same file.
  fs.fchmodSync(descriptor, 0o600);
  let text = fs.readFileSync(descriptor, 'utf8');
  for (const name of ['MFA_ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY']) {
    const pattern = new RegExp('^' + name + '=(.*)$', 'm');
    const existing = text.match(pattern);
    if (existing && existing[1].trim()) {
      if (!/^[a-f0-9]{64}$/i.test(existing[1].trim())) throw new Error(name + ' must be 64 hexadecimal characters; existing value was not changed.');
      continue;
    }
    const line = name + '=' + crypto.randomBytes(32).toString('hex');
    text = existing ? text.replace(pattern, line) : text + '\n' + line + '\n';
  }
  const contents = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < contents.length) {
    const written = fs.writeSync(descriptor, contents, offset, contents.length - offset, offset);
    if (!written) throw new Error('Unable to update configuration file.');
    offset += written;
  }
  fs.ftruncateSync(descriptor, contents.length);
} finally {
  fs.closeSync(descriptor);
}
console.log('Security keys configured. Existing nonempty keys were preserved. No keys printed.');
