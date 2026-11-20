'use strict';

/**
 * Field allowlists. Every response is built here so private data cannot leak
 * by adding a field to a model.
 *
 *   publicItem    anyone        listed items only; contact only if EVERYONE
 *   ownerItem     the reporter  + private details, contact, claim count
 *   adminItem     ADMIN         + reporter identity, history
 *   claimantClaim the claimant  own evidence; never other claims
 *   adminClaim    ADMIN         + claimant identity, handover record
 *
 * A reporter never receives claim evidence or claimant identity.
 */

const id = (v) => (v ? String(v._id || v) : null);

function person(u) {
  if (!u || !u._id) return null;
  return { id: String(u._id), name: u.name, email: u.email };
}

/** "Claim in progress" is shown publicly instead of who is collecting. */
function publicStatusLabel(status) {
  return status === 'COLLECTION_APPROVED' ? 'CLAIM_IN_PROGRESS' : status;
}

function publicItem(i) {
  return {
    id: id(i),
    reference: i.reference,
    type: i.type,
    title: i.title,
    description: i.description,
    category: i.category,
    location: i.location,
    postedAt: i.postedAt,
    custodyNote: i.type === 'FOUND' ? i.custodyNote || null : null,
    contactDetails: i.contactVisibility === 'EVERYONE' ? i.contactDetails || null : null,
    status: publicStatusLabel(i.status),
    photoIds: i.photoIds || [],
  };
}

function ownerItem(i, { claimCount } = {}) {
  return {
    id: id(i),
    reference: i.reference,
    type: i.type,
    title: i.title,
    description: i.description,
    category: i.category,
    location: i.location,
    postedAt: i.postedAt,
    custodyNote: i.custodyNote || null,
    contactDetails: i.contactDetails || null,
    contactVisibility: i.contactVisibility || 'ADMIN',
    privateDetails: i.type === 'LOST' ? i.privateDetails || null : null,
    status: i.status,
    returnedAt: i.returnedAt,
    resolvedAt: i.resolvedAt,
    photoIds: i.photoIds || [],
    // The reporter learns how many claims exist, never who made them.
    claimCount: claimCount === undefined ? undefined : claimCount,
    version: i.version,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

function history(list) {
  return (list || []).map((h) => ({ at: h.at, action: h.action, actorRole: h.actorRole || null, note: h.note || null }));
}

function adminItem(i, extra = {}) {
  return {
    ...ownerItem(i),
    reporter: person(i.reporter),
    activeClaimId: id(i.activeClaim),
    history: history(i.history),
    ...extra,
  };
}

function itemSummary(i) {
  if (!i || !i._id) return null;
  return {
    id: id(i),
    reference: i.reference,
    type: i.type,
    title: i.title,
    category: i.category,
    location: i.location,
    postedAt: i.postedAt,
    status: i.status,
    custodyNote: i.custodyNote || null,
    deleted: Boolean(i.deletedAt),
  };
}

function claimantClaim(c) {
  return {
    id: id(c),
    item: itemSummary(c.item),
    status: c.status,
    evidenceText: c.evidenceRedactedAt ? null : c.evidenceText,
    evidenceRedacted: Boolean(c.evidenceRedactedAt),
    decisionNote: c.decisionNote || null,
    decidedAt: c.decidedAt,
    collected: Boolean(c.handover),
    collectedAt: c.handover ? c.handover.at : null,
    version: c.version,
    createdAt: c.createdAt,
  };
}

function adminClaim(c) {
  return {
    ...claimantClaim(c),
    claimant: person(c.claimant),
    decidedBy: person(c.decidedBy),
    handover: c.handover
      ? {
          at: c.handover.at,
          admin: person(c.handover.admin),
          identityChecked: c.handover.identityChecked,
          recipientName: c.handover.recipientName,
          note: c.handover.note || null,
        }
      : null,
    history: history(c.history),
  };
}

/** Safe payload for notification events: no evidence, no private details, no contact. */
function eventItemPayload(i) {
  return { itemId: id(i), reference: i.reference, type: i.type, title: i.title, status: i.status };
}

module.exports = { publicItem, ownerItem, adminItem, itemSummary, claimantClaim, adminClaim, eventItemPayload, publicStatusLabel };
