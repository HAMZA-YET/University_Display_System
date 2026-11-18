'use strict';

/**
 * THE single public eligibility rule (design decision D2).
 *
 * Every public path (notice list, notice detail, search, home page, events
 * list, event detail and attachment download) uses these two functions. No
 * public code path may build its own visibility query.
 *
 * A notice is visible to a viewer only when ALL are true:
 * 1. approvedRevision exists
 * 2. stored workflow status is APPROVED (not WITHDRAWN, ARCHIVED or other)
 * 3. publicationStart <= now            (start is inclusive)
 * 4. publicationEnd is null OR now < publicationEnd   (end is exclusive)
 * 5. visibility allows the viewer (PUBLIC for everyone, CAMPUS for any
 *    logged-in user)
 * 6. audience matches the viewer, if the viewer carries audience groups
 *
 * Visibility, audience, department and category are read from the approved
 * snapshot copy (publicSearch), never from the working copy.
 */

function allowedVisibilities(viewer) {
  return viewer ? ['PUBLIC', 'CAMPUS'] : ['PUBLIC'];
}

/**
 * Audience rule. The MVP user model has no audience group (student, faculty,
 * staff), so audience is shown to readers as a targeting label. When a future
 * accounts module (Member 1) supplies viewer.audienceGroups, notices are
 * restricted to ALL plus those groups. See docs/DECISIONS.md.
 */
function allowedAudiences(viewer) {
  if (viewer && Array.isArray(viewer.audienceGroups) && viewer.audienceGroups.length) {
    return ['ALL', ...viewer.audienceGroups];
  }
  return null;
}

function buildPublicEligibilityFilter(now, viewer) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('buildPublicEligibilityFilter requires a valid Date');
  }
  const filter = {
    approvedRevision: { $ne: null },
    status: 'APPROVED',
    publicationStart: { $ne: null, $lte: now },
    $or: [{ publicationEnd: null }, { publicationEnd: { $gt: now } }],
    'publicSearch.visibility': { $in: allowedVisibilities(viewer) },
  };
  const audiences = allowedAudiences(viewer);
  if (audiences) filter['publicSearch.audience'] = { $in: audiences };
  return filter;
}

function isPubliclyVisible(notice, now, viewer) {
  if (!notice) return false;
  if (!notice.approvedRevision) return false;
  if (notice.status !== 'APPROVED') return false;
  if (!notice.publicationStart) return false;
  const t = now.getTime();
  if (new Date(notice.publicationStart).getTime() > t) return false;
  if (notice.publicationEnd && t >= new Date(notice.publicationEnd).getTime()) return false;
  const snapshot = notice.publicSearch || {};
  if (!allowedVisibilities(viewer).includes(snapshot.visibility)) return false;
  const audiences = allowedAudiences(viewer);
  if (audiences && !audiences.includes(snapshot.audience)) return false;
  return true;
}

/** Combines the eligibility rule with user filters using $and, so filters can only narrow. */
function withEligibility(now, viewer, ...userFilters) {
  const parts = [buildPublicEligibilityFilter(now, viewer), ...userFilters.filter((f) => f && Object.keys(f).length)];
  return { $and: parts };
}

/**
 * Effective status (D1). SCHEDULED, PUBLISHED and EXPIRED are computed from
 * the approved window and the current time. Never stored.
 */
function getEffectiveStatus(notice, now) {
  if (!notice) return null;
  if (notice.status !== 'APPROVED') return notice.status;
  if (!notice.publicationStart) return 'APPROVED';
  const t = now.getTime();
  if (t < new Date(notice.publicationStart).getTime()) return 'SCHEDULED';
  if (notice.publicationEnd && t >= new Date(notice.publicationEnd).getTime()) return 'EXPIRED';
  return 'PUBLISHED';
}

/** Translates an effective status into a management query (Section 11). */
function effectiveStatusFilter(effective, now) {
  switch (effective) {
    case 'SCHEDULED':
      return { status: 'APPROVED', publicationStart: { $gt: now } };
    case 'PUBLISHED':
      return {
        status: 'APPROVED',
        publicationStart: { $ne: null, $lte: now },
        $or: [{ publicationEnd: null }, { publicationEnd: { $gt: now } }],
      };
    case 'EXPIRED':
      return { status: 'APPROVED', publicationEnd: { $ne: null, $lte: now } };
    case 'APPROVED':
      return { status: 'APPROVED' };
    default:
      return { status: effective };
  }
}

module.exports = {
  buildPublicEligibilityFilter,
  isPubliclyVisible,
  withEligibility,
  getEffectiveStatus,
  effectiveStatusFilter,
};
