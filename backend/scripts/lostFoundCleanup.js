'use strict';

async function runCleanupCommand(args = process.argv.slice(2), dependencies = {}) {
  if (args.some(arg => !['--apply', '--confirm-stopped'].includes(arg))) throw new Error('Unknown cleanup option.');
  const apply = args.includes('--apply');
  if (apply && !args.includes('--confirm-stopped')) throw new Error('Stop all application writers and supply --confirm-stopped before applying cleanup.');
  const connect = dependencies.connect || require('../src/config/db').connectDb;
  const disconnect = dependencies.disconnect || (() => require('mongoose').disconnect());
  const cleanup = dependencies.cleanup || require('../src/modules/lostFound/lostFound.cleanup').redactExpiredEvidence;
  const exclusive = dependencies.exclusive || require('../src/modules/security/operations').exclusive;
  const uri = dependencies.mongoUri || require('../src/config/env').loadEnv().MONGO_URI;
  try {
    await connect(uri);
    return apply
      ? await exclusive('LOST_FOUND_RETENTION', () => cleanup({ dryRun: false }))
      : await cleanup({ dryRun: true });
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), quiet: true });
  runCleanupCommand().then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error('Lost-and-found cleanup failed. Check options, private configuration, retention period and database availability.');
    process.exitCode = 1;
  });
}

module.exports = { runCleanupCommand };
