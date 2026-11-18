'use strict';

const express = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const asyncHandler = require('../../utils/asyncHandler');
const clock = require('../../utils/clock');
const Notice = require('../notices/notice.model');
const { effectiveStatusFilter } = require('../notices/visibility');
const { EFFECTIVE_STATUSES } = require('../notices/notice.constants');
const noticeService = require('../notices/notice.service');
const eventService = require('../events/event.service');
const domainEvents = require('../domainEvents/domainEvent.service');
const audit = require('../audit/audit.service');

const router = express.Router();

/** GET /api/admin/summary - data for the admin dashboard (computed live, D1). */
router.get(
  '/summary',
  authenticate,
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const now = clock.now();
    const counts = {};
    await Promise.all(
      EFFECTIVE_STATUSES.filter((s) => s !== 'APPROVED').map(async (status) => {
        counts[status] = await Notice.countDocuments(effectiveStatusFilter(status, now));
      })
    );
    const [pendingReviews, upcomingEvents, recentDomainEvents, recentAudit] = await Promise.all([
      noticeService.countPendingReviews(),
      eventService.countUpcomingPublic(),
      domainEvents.listDomainEvents({ page: 1, limit: 8 }),
      audit.listAuditLogs({ page: 1, limit: 8 }),
    ]);
    res.json({
      data: {
        countsByEffectiveStatus: counts,
        pendingReviews,
        upcomingEvents,
        recentDomainEvents: recentDomainEvents.data,
        recentAudit: recentAudit.data,
        generatedAt: now,
      },
    });
  })
);

/** GET /api/admin/pending-count - small endpoint for the navigation badge. */
router.get(
  '/pending-count',
  authenticate,
  authorize('REVIEWER', 'ADMIN'),
  asyncHandler(async (req, res) => res.json({ data: { pendingReviews: await noticeService.countPendingReviews() } }))
);

module.exports = router;
