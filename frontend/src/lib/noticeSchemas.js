import { z } from 'zod';
import { CATEGORIES, AUDIENCES, VISIBILITIES } from './labels';

/**
 * Client rules that mirror the server (server/src/modules/notices/notice.schemas.js).
 * Form values are strings; empty strings mean "not set".
 */
const optionalText = (max, label) => z.string().max(max, `${label} must be at most ${max} characters`);

const base = {
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(150, 'Title must be at most 150 characters'),
  summary: optionalText(300, 'Summary'),
  body: optionalText(20000, 'Body'),
  category: z.string(),
  department: z.string(),
  audience: z.string(),
  visibility: z.string(),
  publishingOffice: optionalText(120, 'Publishing office'),
  contactEmail: z.union([z.literal(''), z.string().trim().email('Contact email is not valid')]),
  actionDeadline: z.string(),
  requestedPublicationStart: z.string(),
  requestedPublicationEnd: z.string(),
};

const windowRule = (v, ctx) => {
  if (v.requestedPublicationStart && v.requestedPublicationEnd && v.requestedPublicationEnd <= v.requestedPublicationStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requestedPublicationEnd'], message: 'Requested end must be after the requested start' });
  }
};

/** "Save draft": only the title is required. */
export const draftSchema = z.object(base).superRefine(windowRule);

const required = (label) => z.string().min(1, `${label} is required`);

/** "Submit for review": every required field. */
export const submitSchema = z
  .object({
    ...base,
    summary: z.string().trim().min(10, 'Summary must be at least 10 characters').max(300, 'Summary must be at most 300 characters'),
    body: z.string().trim().min(20, 'Body must be at least 20 characters').max(20000, 'Body must be at most 20000 characters'),
    category: required('Category').refine((v) => CATEGORIES.includes(v), 'Category is required'),
    department: required('Department'),
    audience: required('Audience').refine((v) => AUDIENCES.includes(v), 'Audience is required'),
    visibility: required('Visibility').refine((v) => VISIBILITIES.includes(v), 'Visibility is required'),
    publishingOffice: z.string().trim().min(2, 'Publishing office is required').max(120),
    requestedPublicationStart: required('Requested publication start'),
  })
  .superRefine(windowRule);

/** Correction of an approved notice: full content plus a change note. */
export const correctionSchema = z.object({
  ...submitSchema.shape,
  requestedPublicationStart: z.string(),
  changeNote: z.string().trim().min(10, 'Change note must be at least 10 characters').max(1000),
});

export const EMPTY_NOTICE = {
  title: '',
  summary: '',
  body: '',
  category: '',
  department: '',
  audience: '',
  visibility: '',
  publishingOffice: '',
  contactEmail: '',
  actionDeadline: '',
  requestedPublicationStart: '',
  requestedPublicationEnd: '',
};
