'use strict';

const { z } = require('zod');
const { paginationQuery } = require('../../utils/pagination');
const { isValidTimeZone } = require('./event.model');

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
const isoDate = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO 8601 date-time with an offset' })
  .transform((v) => new Date(v));
const reason = z.string().trim().min(10, 'Reason must be at least 10 characters').max(1000);
const timezone = z.string().trim().refine(isValidTimeZone, 'Unknown IANA time zone');
const optionalText = (max) => z.union([z.string().trim().max(max), z.null()]).optional();

const detailFields = {
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
  start: isoDate,
  end: isoDate,
  timezone,
  allDay: z.boolean(),
  venue: z.string().trim().min(2, 'Venue is required').max(150),
  venueBuilding: optionalText(100),
  venueRoom: optionalText(50),
  organizer: z.string().trim().min(2, 'Organizer is required').max(120),
};

const endAfterStart = (v, ctx) => {
  if (v.start && v.end && v.end <= v.start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end'], message: 'End must be after start' });
  }
};

const createBody = z
  .object({
    noticeId: objectId,
    title: detailFields.title.optional(),
    start: detailFields.start,
    end: detailFields.end,
    timezone: detailFields.timezone.optional(),
    allDay: detailFields.allDay.optional(),
    venue: detailFields.venue,
    venueBuilding: detailFields.venueBuilding,
    venueRoom: detailFields.venueRoom,
    organizer: detailFields.organizer,
  })
  .strict()
  .superRefine(endAfterStart);

const updateBody = z
  .object({
    title: detailFields.title.optional(),
    start: detailFields.start.optional(),
    end: detailFields.end.optional(),
    timezone: detailFields.timezone.optional(),
    allDay: detailFields.allDay.optional(),
    venue: detailFields.venue.optional(),
    venueBuilding: detailFields.venueBuilding,
    venueRoom: detailFields.venueRoom,
    organizer: detailFields.organizer.optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict()
  .superRefine(endAfterStart);

const postponeBody = z
  .object({ newStart: isoDate, newEnd: isoDate, reason, expectedVersion: z.number().int().min(1).optional() })
  .strict()
  .superRefine((v, ctx) => {
    if (v.newEnd <= v.newStart) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['newEnd'], message: 'New end must be after new start' });
  });

const cancelBody = z.object({ reason, expectedVersion: z.number().int().min(1).optional() }).strict();

const idParams = z.object({ id: objectId }).strict();

const departmentCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2,10}$/, 'Department code is not valid');

const publicListQuery = z
  .object({
    ...paginationQuery,
    state: z.enum(['UPCOMING', 'COMPLETED', 'CANCELLED', 'POSTPONED']).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    department: departmentCode.optional(),
  })
  .strict();

const managementListQuery = z
  .object({
    ...paginationQuery,
    noticeId: objectId.optional(),
    state: z.enum(['UPCOMING', 'COMPLETED', 'CANCELLED', 'POSTPONED']).optional(),
  })
  .strict();

module.exports = { createBody, updateBody, postponeBody, cancelBody, idParams, publicListQuery, managementListQuery };
