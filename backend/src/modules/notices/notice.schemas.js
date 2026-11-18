'use strict';

const { z } = require('zod');
const C = require('./notice.constants');
const { paginationQuery } = require('../../utils/pagination');

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
const isoDate = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO 8601 date-time with an offset, for example 2026-12-01T09:00:00+09:00' })
  .transform((v) => new Date(v));
const nullableDate = z.union([isoDate, z.null()]);
const departmentCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2,10}$/, 'Department code is not valid');
const reason = z.string().trim().min(C.REASON_MIN, `Reason must be at least ${C.REASON_MIN} characters`).max(1000);
const attachmentInput = z.object({ fileId: z.string().regex(/^[a-f0-9]{32}$/, 'Invalid file id') }).strict();

/** Draft content: everything optional except where a value is given it must be valid. */
const draftFields = {
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(150, 'Title must be at most 150 characters'),
  summary: z.union([z.string().trim().max(300, 'Summary must be at most 300 characters'), z.null()]),
  body: z.union([z.string().max(20000, 'Body must be at most 20000 characters'), z.null()]),
  category: z.union([z.enum(C.CATEGORIES), z.null()]),
  department: z.union([departmentCode, z.null()]),
  audience: z.union([z.enum(C.AUDIENCES), z.null()]),
  visibility: z.union([z.enum(C.VISIBILITIES), z.null()]),
  publishingOffice: z.union([z.string().trim().max(120, 'Publishing office must be at most 120 characters'), z.null()]),
  contactEmail: z.union([z.string().trim().toLowerCase().email('Contact email is not valid'), z.literal(''), z.null()]),
  actionDeadline: nullableDate,
  requestedPublicationStart: nullableDate,
  requestedPublicationEnd: nullableDate,
  attachments: z.array(attachmentInput).max(10, 'At most 10 attachments'),
};

const createBody = z
  .object({
    ...Object.fromEntries(Object.entries(draftFields).map(([k, v]) => [k, v.optional()])),
    title: draftFields.title,
  })
  .strict();

const updateBody = z
  .object({
    ...Object.fromEntries(Object.entries(draftFields).map(([k, v]) => [k, v.optional()])),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict();

/**
 * Full validation at submit time (and for corrections). Runs on the stored
 * working copy, so every missing field is listed at once.
 */
const fullContentShape = {
  title: z.string({ error: 'Title is required' }).trim().min(5, 'Title must be at least 5 characters').max(150),
  summary: z.string({ error: 'Summary is required' }).trim().min(10, 'Summary must be at least 10 characters').max(300),
  body: z.string({ error: 'Body is required' }).min(20, 'Body must be at least 20 characters').max(20000),
  category: z.enum(C.CATEGORIES, { error: 'Category is required' }),
  department: z.string({ error: 'Department is required' }).min(2, 'Department is required'),
  audience: z.enum(C.AUDIENCES, { error: 'Audience is required' }),
  visibility: z.enum(C.VISIBILITIES, { error: 'Visibility is required' }),
  publishingOffice: z.string({ error: 'Publishing office is required' }).trim().min(2, 'Publishing office must be at least 2 characters').max(120),
  contactEmail: z.union([z.string().email('Contact email is not valid'), z.literal(''), z.null()]).optional(),
  actionDeadline: z.union([z.date(), z.null()]).optional(),
};

const submitValidation = z
  .object({
    ...fullContentShape,
    requestedPublicationStart: z.date({ error: 'Requested publication start is required' }),
    requestedPublicationEnd: z.union([z.date(), z.null()]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.requestedPublicationEnd && v.requestedPublicationStart && v.requestedPublicationEnd <= v.requestedPublicationStart) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedPublicationEnd'], message: 'Requested end must be after the requested start' });
    }
  });

const correctionBody = z
  .object({
    title: z.string().trim().min(5, 'Title must be at least 5 characters').max(150),
    summary: z.string().trim().min(10, 'Summary must be at least 10 characters').max(300),
    body: z.string().min(20, 'Body must be at least 20 characters').max(20000),
    category: z.enum(C.CATEGORIES),
    department: departmentCode,
    audience: z.enum(C.AUDIENCES),
    visibility: z.enum(C.VISIBILITIES),
    publishingOffice: z.string().trim().min(2).max(120),
    contactEmail: z.union([z.string().trim().toLowerCase().email('Contact email is not valid'), z.literal(''), z.null()]).optional(),
    actionDeadline: nullableDate.optional(),
    attachments: z.array(attachmentInput).max(10).optional(),
    changeNote: z.string().trim().min(10, 'Change note must be at least 10 characters').max(1000),
    baseVersion: z.number().int().min(1),
  })
  .strict();

const approveBody = z
  .object({
    mode: z.enum(['NOW', 'SCHEDULE']),
    publicationStart: nullableDate.optional(),
    publicationEnd: nullableDate.optional(),
    priority: z.enum(C.PRIORITIES).optional(),
    pinned: z.boolean().optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict();

const reasonBody = z.object({ reason, expectedVersion: z.number().int().min(1).optional() }).strict();
const emptyBody = z.object({ expectedVersion: z.number().int().min(1).optional() }).strict();

const placementBody = z
  .object({
    priority: z.enum(C.PRIORITIES).optional(),
    pinned: z.boolean().optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((v) => v.priority !== undefined || v.pinned !== undefined, { message: 'Send priority or pinned' });

const idParams = z.object({ id: objectId }).strict();
const revisionParams = z.object({ id: objectId, revId: objectId }).strict();

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Public list query. No status parameter exists; unknown keys are rejected. */
const publicListQuery = z
  .object({
    ...paginationQuery,
    q: z.string().trim().max(100).optional(),
    category: z.enum(C.CATEGORIES).optional(),
    department: z.union([departmentCode, z.literal('ALL')]).optional(),
    audience: z.enum(C.AUDIENCES).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    pinned: booleanString.optional(),
    sort: z.enum(['default', 'newest']).optional(),
  })
  .strict();

const managementListQuery = z
  .object({
    ...paginationQuery,
    q: z.string().trim().max(100).optional(),
    status: z.enum(C.EFFECTIVE_STATUSES).optional(),
    department: z.union([departmentCode, z.literal('ALL')]).optional(),
    category: z.enum(C.CATEGORIES).optional(),
    author: objectId.optional(),
    archived: booleanString.optional(),
  })
  .strict();

const reviewQueueQuery = z.object({ ...paginationQuery }).strict();

module.exports = {
  objectId,
  isoDate,
  createBody,
  updateBody,
  submitValidation,
  correctionBody,
  approveBody,
  reasonBody,
  emptyBody,
  placementBody,
  idParams,
  revisionParams,
  publicListQuery,
  managementListQuery,
  reviewQueueQuery,
};
