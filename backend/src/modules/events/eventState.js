'use strict';

/**
 * Effective event state. COMPLETED is computed: the stored state is SCHEDULED
 * or POSTPONED and now >= end. CANCELLED always stays CANCELLED.
 * Used by both the list view and the calendar view so they always agree.
 */
function getEventState(event, now) {
  if (!event) return null;
  if (event.state === 'CANCELLED') return 'CANCELLED';
  if (now.getTime() >= new Date(event.end).getTime()) return 'COMPLETED';
  return event.state;
}

/** Query fragment for a public state tab (Upcoming, Completed, Cancelled, Postponed). */
function eventStateFilter(tab, now) {
  switch (tab) {
    case 'UPCOMING':
      return { state: { $in: ['SCHEDULED', 'POSTPONED'] }, end: { $gt: now } };
    case 'POSTPONED':
      return { state: 'POSTPONED', end: { $gt: now } };
    case 'COMPLETED':
      return { state: { $in: ['SCHEDULED', 'POSTPONED'] }, end: { $lte: now } };
    case 'CANCELLED':
      return { state: 'CANCELLED' };
    default:
      return {};
  }
}

module.exports = { getEventState, eventStateFilter };
