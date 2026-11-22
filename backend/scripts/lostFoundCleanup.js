'use strict';

/**
 * npm run lf:cleanup - applies the lost-and-found evidence retention rule.
 * LF_EVIDENCE_RETENTION_DAYS (default 90) sets the period.
 */
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const { loadEnv } = require('../src/config/env');
const { connectDb } = require('../src/config/db');
const { redactExpiredEvidence } = require('../src/modules/lostFound/lostFound.cleanup');

async function main() {
  const env = loadEnv();
  await connectDb(env.MONGO_URI);
  const result = await redactExpiredEvidence();
  // eslint-disable-next-line no-console
  console.log('Lost-and-found retention cleanup:', JSON.stringify(result));
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('Cleanup failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
