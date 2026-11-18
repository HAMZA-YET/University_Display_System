'use strict';

const { z } = require('zod');

const email = z.string().trim().toLowerCase().email('Email format is not valid').max(160);

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes');

const registerBody = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    email,
    password,
  })
  .strict();

const loginBody = z
  .object({
    email,
    password: z.string().min(1, 'Password is required').max(128)
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes'),
  })
  .strict();

module.exports = { registerBody, loginBody, password, email };
