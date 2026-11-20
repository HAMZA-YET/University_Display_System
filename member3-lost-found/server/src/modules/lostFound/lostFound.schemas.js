'use strict';

const { z } = require('zod');
const C = require('./lostFound.constants');
const { paginationQuery } = require('../../utils/pagination');

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
const optionalText = (max) => z.union([z.string().trim().max(max), z.literal(''), z.null()]).optional();

const editableFields = {
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(1500),
  category: z.enum(C.CATEGORIES, { errorMap: () => ({ message: 'Choose a category' }) }),
  location: z.string().trim().min(2, 'Location is required').max(120),
  custodyNote: optionalText(300),
  contactDetails: optionalText(200),
  contactVisibility: z.enum(C.CONTACT_VISIBILITY, { errorMap: () => ({ message: 'Choose who can see your contact details' }) }),
  privateDetails: optionalText(1500),
};

/** The date is NOT accepted from the client: the server sets postedAt. */
const createItemBody = z
  .object({ type: z.enum(C.ITEM_TYPES, { errorMap: () => ({ message: 'Choose Lost or Found' }) }), ...editableFields })
  .strict();

/** The type cannot change after posting (post a new report instead). */
const updateItemBody = z
  .object({ ...editableFields, expectedVersion: z.number().int().min(1).optional() })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).some((k) => k !== 'expectedVersion'), { message: 'Nothing to update' });

const publicListQuery = z
  .object({
    ...paginationQuery,
    q: z.string().trim().max(100).optional(),
    type: z.enum(C.ITEM_TYPES).optional(),
    category: z.enum(C.CATEGORIES).optional(),
  })
  .strict();

const mineItemsQuery = z.object({ ...paginationQuery, type: z.enum(C.ITEM_TYPES).optional() }).strict();
const mineQuery = z.object({ ...paginationQuery }).strict();

const adminItemQuery = z
  .object({
    ...paginationQuery,
    type: z.enum(C.ITEM_TYPES).optional(),
    category: z.enum(C.CATEGORIES).optional(),
    status: z.enum(C.ITEM_STATUS).optional(),
  })
  .strict();

const adminClaimQuery = z.object({ ...paginationQuery, status: z.enum([...C.VISIBLE_CLAIM_STATUSES, 'ALL']).optional() }).strict();

const caseEventQuery = z
  .object({ ...paginationQuery, type: z.enum(C.CASE_EVENT_TYPES).optional(), entityId: objectId.optional() })
  .strict();

const idParams = z.object({ id: objectId }).strict();
const photoParams = z.object({ id: objectId, photoId: z.string().regex(/^[a-f0-9]{32}$/, 'Invalid photo id') }).strict();

const claimBody = z
  .object({
    evidenceText: z.string().trim().min(20, 'Describe something only the owner would know (at least 20 characters)').max(2000),
  })
  .strict();

const decisionBody = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    note: z.string().trim().max(1000).optional(),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .strict();

const releaseBody = z
  .object({ note: z.string().trim().min(10, 'Explain why the approval is released (at least 10 characters)').max(1000) })
  .strict();

const handoverBody = z
  .object({
    identityChecked: z.literal(true, { errorMap: () => ({ message: 'Confirm that you checked the collector identity' }) }),
    recipientName: z.string().trim().min(2, 'Enter the name of the person collecting').max(100),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

module.exports = {
  createItemBody,
  updateItemBody,
  publicListQuery,
  mineItemsQuery,
  mineQuery,
  adminItemQuery,
  adminClaimQuery,
  caseEventQuery,
  idParams,
  photoParams,
  claimBody,
  decisionBody,
  releaseBody,
  handoverBody,
};
