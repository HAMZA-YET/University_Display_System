'use strict';

const { getEventState } = require('./eventState');

/** Public event contract (D8). No actor IDs, no internal fields. */
function toPublicEvent(event, now, notice) {
  if (!event) return null;
  const effectiveState = getEventState(event, now);
  // "Original" means the first schedule before any postponement.
  const lastChange = event.scheduleHistory && event.scheduleHistory.length ? event.scheduleHistory[0] : null;
  return {
    id: String(event._id),
    noticeId: String(event.notice && event.notice._id ? event.notice._id : event.notice),
    noticeTitle: notice && notice.publicSearch ? notice.publicSearch.title : undefined,
    department: notice && notice.publicSearch ? notice.publicSearch.department : undefined,
    title: event.title,
    start: event.start,
    end: event.end,
    timezone: event.timezone,
    allDay: event.allDay,
    venue: event.venue,
    venueBuilding: event.venueBuilding || null,
    venueRoom: event.venueRoom || null,
    organizer: event.organizer,
    state: effectiveState,
    storedState: event.state,
    cancellationReason: event.state === 'CANCELLED' ? event.cancellationReason : null,
    postponementReason: event.state === 'POSTPONED' ? event.postponementReason : null,
    originalStart: event.state === 'POSTPONED' && lastChange ? lastChange.previousStart : null,
    originalEnd: event.state === 'POSTPONED' && lastChange ? lastChange.previousEnd : null,
  };
}

function toManagementEvent(event, now) {
  if (!event) return null;
  return {
    ...toPublicEvent(event, now),
    storedState: event.state,
    version: event.version,
    scheduleHistory: (event.scheduleHistory || []).map((h) => ({
      previousStart: h.previousStart,
      previousEnd: h.previousEnd,
      changedAt: h.changedAt,
      changedBy: h.changedBy ? String(h.changedBy._id || h.changedBy) : null,
      reason: h.reason,
    })),
    cancellationReason: event.cancellationReason || null,
    postponementReason: event.postponementReason || null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

module.exports = { toPublicEvent, toManagementEvent };
