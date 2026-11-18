'use strict';

/**
 * OPTIONAL status-sync job (ENABLE_STATUS_SYNC=true).
 * Copies the computed effective status into Notice.cachedEffectiveStatus for
 * admin reports. It is NEVER read by public APIs and visibility never depends
 * on it (D1). Tests always run with it disabled.
 */
const cron = require('node-cron');
const Notice = require('../modules/notices/notice.model');
const clock = require('../utils/clock');
const logger = require('../utils/logger');
const { getEffectiveStatus } = require('../modules/notices/visibility');

async function syncOnce() {
  const now = clock.now();
  const cursor = Notice.find({ status: 'APPROVED' }).select('status publicationStart publicationEnd cachedEffectiveStatus').cursor();
  let changed = 0;
  for await (const n of cursor) {
    const effective = getEffectiveStatus(n, now);
    if (n.cachedEffectiveStatus !== effective) {
      await Notice.updateOne({ _id: n._id }, { $set: { cachedEffectiveStatus: effective } }, { timestamps: false });
      changed += 1;
    }
  }
  return changed;
}

function startStatusSync() {
  const task = cron.schedule('* * * * *', () => {
    syncOnce()
      .then((changed) => changed && logger.info({ changed }, 'Status sync updated cached statuses'))
      .catch((err) => logger.warn({ err: err.message }, 'Status sync failed'));
  });
  logger.info('Optional status-sync job started (cache only, not used for visibility)');
  return task;
}

module.exports = { startStatusSync, syncOnce };
