'use strict';
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const fs = require('fs/promises');
const path = require('path');
const { loadEnv } = require('../src/config/env');
const operations = require('../src/modules/security/operations');
async function main() {
  const args = process.argv.slice(2); const command = args[0];
  const value = flag => { const index = args.indexOf(flag); if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Missing option'); return args[index + 1]; };
  if (!['cleanup', 'backup', 'restore', 'release-reviewed-restore'].includes(command)) throw new Error('Unknown operation');
  if (!args.includes('--confirm-stopped')) throw new Error('Stop every application writer and supply --confirm-stopped');
  await mongoose.connect(loadEnv().MONGO_URI);
  if (command === 'release-reviewed-restore') {
    if (!args.includes('--confirm-domain-review')) throw new Error('Domain review confirmation required');
    const result = await mongoose.connection.db.collection('security_maintenance').deleteOne({ _id: 'maintenance', action: 'RESTORE_REVIEW_REQUIRED', verified: true, failed: { $ne: true } });
    if (result.deletedCount !== 1) throw new Error('No successfully verified restore to release');
    return { released: true };
  }
  return operations.exclusive(command.toUpperCase(), async () => {
    if (command === 'cleanup') return operations.cleanup({ apply: args.includes('--apply') });
    if (command === 'backup') {
      const directory = path.resolve(__dirname, '../.local/backups');
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      if (await fs.realpath(directory) !== directory) throw new Error('Unsafe backup directory');
      return operations.backup(path.join(directory, Date.now() + '.uids-backup'));
    }
    if (!args.includes('--confirm-empty-restore')) throw new Error('Empty restore confirmation required');
    return operations.restore(value('--file'), value('--target-uri'), value('--target-files'));
  });
}
main().then(result => console.log(JSON.stringify(result))).catch(() => {
  console.error('Operation failed. Check confirmations, private configuration, database availability and the operations guide. No automatic cleanup or overwrite was performed.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
