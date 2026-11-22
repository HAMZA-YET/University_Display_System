'use strict';

const mongoose = require('mongoose');
const Claim = require('./claim.model');
const Item = require('./item.model');
const C = require('./lostFound.constants');

/**
 * Member 3 (C) answer to Member 1's private-evidence callback
 * (`createEvidenceRouter(authorizeEvidence)`, A05).
 *
 * The evidence `caseId` is a lost-and-found CLAIM id. The callback loads the
 * claim from the trusted database (never from request data) and allows:
 *
 *   upload    the claimant, while their claim is PENDING on a listed item
 *   download  the claimant (own claim) or an ADMIN
 *   delete    the claimant while the claim is PENDING, or an ADMIN
 *
 * Everyone else, deleted claims and deleted items are refused. Any error
 * refuses (fail closed). The finder (reporter) never sees claim evidence.
 *
 * There is currently no "attach photo proof" button in the interface; claims
 * use written proof. This keeps Member 1's service usable and safe if the team
 * enables photo proof later.
 */
async function authorizeEvidence({ actor, caseId, action }) {
  try {
    if (!actor || !actor._id || !mongoose.isValidObjectId(caseId)) return false;
    const claim = await Claim.findOne({ _id: caseId, deletedAt: null }).select('claimant status item handover').lean();
    if (!claim) return false;
    const item = await Item.findOne({ _id: claim.item, deletedAt: null }).select('status').lean();
    if (!item) return false;

    const isClaimant = String(claim.claimant) === String(actor._id);
    const isAdmin = C.VERIFIER_ROLES.includes(actor.role);
    const pending = claim.status === 'PENDING';

    if (action === 'upload') return isClaimant && pending && C.PUBLIC_STATUSES.includes(item.status);
    if (action === 'download') return isClaimant || isAdmin;
    if (action === 'delete') return isAdmin || (isClaimant && pending);
    return false;
  } catch (err) {
    return false;
  }
}

module.exports = { authorizeEvidence };
