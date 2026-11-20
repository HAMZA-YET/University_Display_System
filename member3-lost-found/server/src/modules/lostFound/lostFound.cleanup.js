'use strict';

const Item = require('./item.model');
const Claim = require('./claim.model');
const clock = require('../../utils/clock');

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
  if (!items.length) return { items: 0, claims: 0, cutoff };

  const claims = await Claim.find({
    item: { $in: items.map((i) => i._id) },
    evidenceRedactedAt: null,
    $or: [{ status: { $in: ['REJECTED', 'WITHDRAWN'] } }, { status: 'APPROVED', handover: { $ne: null } }],
  }).lean();

  for (const c of claims) {
    await Claim.updateOne(
      { _id: c._id, evidenceRedactedAt: null },
      {
        $set: { evidenceText: REDACTED, evidenceFileIds: [], evidenceRedactedAt: clock.now() },
        $push: { history: { at: clock.now(), action: 'EVIDENCE_REDACTED', actorRole: 'SYSTEM', note: `Retention: ${days} days` } },
      }
    );
  }
  return { items: items.length, claims: claims.length, cutoff };
}

module.exports = { redactExpiredEvidence, REDACTED };
