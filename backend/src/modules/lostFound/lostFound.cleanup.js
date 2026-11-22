'use strict';

const Item = require('./item.model');
const Claim = require('./claim.model');
const clock = require('../../utils/clock');

/** Member 1's private-evidence metadata (caseId = claim id). Loaded lazily. */
function evidenceModel() {
  // eslint-disable-next-line global-require
  return require('../security/evidence').Evidence;
}

const REDACTED = '[removed by retention policy]';

/**
 * Sample-data retention rule (C06). Configured project rule, not a legal
 * policy: once a case is finished (returned, marked found, or deleted) for
 * `days` days, the private evidence on its finished claims is removed. The
 * history (who did what and when) is kept. Safe to run repeatedly.
 */
async function redactExpiredEvidence({ days = Number(process.env.LF_EVIDENCE_RETENTION_DAYS) || 90 } = {}) {
  const cutoff = new Date(clock.now().getTime() - days * 24 * 3600 * 1000);
  const items = await Item.find({
    $or: [{ returnedAt: { $lte: cutoff } }, { resolvedAt: { $lte: cutoff } }, { deletedAt: { $lte: cutoff } }],
  })
    .select('_id')
    .lean();
  if (!items.length) return { items: 0, claims: 0, evidenceFiles: 0, cutoff };

  const claims = await Claim.find({
    item: { $in: items.map((i) => i._id) },
    evidenceRedactedAt: null,
    $or: [{ status: { $in: ['REJECTED', 'WITHDRAWN'] } }, { status: 'APPROVED', handover: { $ne: null } }],
  }).lean();

  let evidenceFiles = 0;
  for (const c of claims) {
    // Any private evidence files on this claim are logically deleted (reads are
    // denied at once). Physical file removal stays with Member 1's operations
    // cleanup, which this policy now approves for these files.
    const res = await evidenceModel().updateMany({ caseId: String(c._id), state: { $ne: 'DELETED' } }, { $set: { state: 'DELETED' } });
    evidenceFiles += res.modifiedCount || 0;
    await Claim.updateOne(
      { _id: c._id, evidenceRedactedAt: null },
      {
        $set: { evidenceText: REDACTED, evidenceFileIds: [], evidenceRedactedAt: clock.now() },
        $push: { history: { at: clock.now(), action: 'EVIDENCE_REDACTED', actorRole: 'SYSTEM', note: `Retention: ${days} days` } },
      }
    );
  }
  return { items: items.length, claims: claims.length, evidenceFiles, cutoff };
}

module.exports = { redactExpiredEvidence, REDACTED };
