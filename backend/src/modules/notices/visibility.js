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
 * 6. CAMPUS audience is ALL or matches an administrator-assigned account group
 *
 * Visibility, audience, department and category are read from the approved
 * snapshot copy (publicSearch), never from the working copy.
 */

function allowedVisibilities(viewer) {
  return viewer ? ['PUBLIC', 'CAMPUS'] : ['PUBLIC'];
}

/**
 * PUBLIC content remains public for every viewer; its audience is a targeting
 * label. CAMPUS content requires login and, unless audience=ALL, a trusted
 * account group. Missing/legacy account groups grant no restricted audience.
 */
function allowedAudiences(viewer) {
  const groups = viewer && Array.isArray(viewer.audienceGroups) ? viewer.audienceGroups : [];
  return ['ALL', ...groups.filter(group => ['STUDENTS', 'FACULTY', 'STAFF'].includes(group))];
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
  filter.$and = [{ $or: [
    { 'publicSearch.visibility': 'PUBLIC' },
    { 'publicSearch.audience': { $in: allowedAudiences(viewer) } },
  ] }];
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
  if (snapshot.visibility === 'CAMPUS' && !allowedAudiences(viewer).includes(snapshot.audience)) return false;
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
