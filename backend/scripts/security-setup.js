'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const destination = path.resolve(process.argv[2] || path.join(__dirname, '../.env'));
let text = fs.readFileSync(destination, 'utf8');
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
fs.writeFileSync(destination, text, { mode: 0o600 });
console.log('Security keys configured. Existing nonempty keys were preserved. No keys printed.');
