'use strict';

const { z } = require('zod');
const { POSITIONS, DAYS } = require('./professor.model');
const { paginationQuery } = require('../../utils/pagination');

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm (24-hour)');

const slot = z
  .object({
    day: z.enum(DAYS),
    startTime: time,
    endTime: time,
    location: z.union([z.string().trim().max(100), z.null()]).optional(),
    note: z.union([z.string().trim().max(200), z.null()]).optional(),
  })
  .strict()
  .refine((s) => s.endTime > s.startTime, { message: 'End time must be after start time', path: ['endTime'] });

/** Rejects overlapping slots on the same day. */
const counsellingHours = z
  .array(slot)
  .max(20)
  .superRefine((slots, ctx) => {
    for (let i = 0; i < slots.length; i += 1) {
      for (let j = i + 1; j < slots.length; j += 1) {
        const a = slots[i];
        const b = slots[j];
        if (a.day === b.day && a.startTime < b.endTime && b.startTime < a.endTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [j, 'startTime'],
            message: `Overlaps with another ${a.day} slot (${a.startTime}-${a.endTime})`,
          });
        }
      }
    }
  });

/** Subjects: 1-20 items, each 2-100 chars, trimmed, duplicates removed case-insensitively. */
const subjects = z
  .array(z.string().trim().min(2, 'Each subject must be at least 2 characters').max(100))
  .transform((list) => {
    const seen = new Set();
    return list.filter((s) => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .refine((list) => list.length >= 1 && list.length <= 20, 'Add between 1 and 20 subjects');

const profileImage = z
  .union([
    z
      .string()
      .trim()
      .max(500)
      .url('Profile image must be a URL')
      .refine((u) => /^https?:\/\//i.test(u), 'Profile image must use http or https'),
    z.literal(''),
    z.null(),
  ])
  .optional();

const professorBody = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    titlePrefix: z.union([z.string().trim().max(20), z.null()]).optional(),
    department: z.string().trim().toUpperCase().regex(/^[A-Z]{2,10}$/, 'Department code is not valid'),
    position: z.enum(POSITIONS),
    officeRoom: z.string().trim().min(1, 'Office room is required').max(50),
    officeBuilding: z.string().trim().min(1, 'Office building is required').max(100),
    email: z.string().trim().toLowerCase().email('Email format is not valid'),
    phone: z
      .union([z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, 'Phone number format is not valid'), z.literal(''), z.null()])
      .optional(),
    counsellingHours: counsellingHours.default([]),
    subjects,
    profileImage,
    isActive: z.boolean().optional(),
  })
  .strict();

const updateBody = professorBody.extend({ expectedVersion: z.number().int().min(1).optional() }).strict();

const listQuery = z
  .object({
    ...paginationQuery,
    department: z.string().trim().toUpperCase().regex(/^[A-Z]{2,10}$/).optional(),
    q: z.string().trim().max(100).optional(),
    includeInactive: z.enum(['true', 'false']).optional(),
  })
  .strict();

const idParams = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id') }).strict();

module.exports = { professorBody, updateBody, listQuery, idParams };
