'use strict';

const { z } = require('zod');

/**
 * Validates process.env once. Missing deployment credentials are reported by
 * readiness, allowing the UI and health endpoint to explain setup requirements.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGO_URI: z.string().trim().default(''),
  BOOTSTRAP_TOKEN: z.string().default(''),
  JWT_SECRET: z.union([z.literal(''), z.string().min(32, 'JWT_SECRET must be at least 32 characters long')]).default(''),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^(\d+)(m|h)$/, 'JWT_EXPIRES_IN must look like 15m, 30m or 1h')
    .default('1h')
    .refine((v) => {
      const n = Number(v.slice(0, -1));
      const minutes = v.endsWith('h') ? n * 60 : n;
      return minutes >= 15 && minutes <= 60;
    }, 'JWT_EXPIRES_IN must be between 15 minutes and 1 hour'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  UNIVERSITY_TZ: z.string().default('Asia/Seoul'),
  UPLOAD_DIR: z.string().default('./storage/uploads'),
  ATTACHMENT_STORAGE: z.enum(['local', 'vercel-blob', 'disabled']).default(process.env.VERCEL ? 'disabled' : 'local'),
  MAX_PINNED_NOTICES: z.coerce.number().int().min(1).max(50).default(5),
  ENABLE_STATUS_SYNC: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  REQUIRE_PRIVILEGED_MFA: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  AUTH_LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(5),
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(100),
});

let cached = null;

function loadEnv() {
  if (cached) return cached;
  // Vercel's MongoDB Atlas integration provisions MONGODB_URI. Keep the
  // member module's original MONGO_URI compatible for local environments.
  const parsed = envSchema.safeParse({ ...process.env, MONGO_URI: process.env.MONGO_URI || process.env.MONGODB_URI });
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    const message = `Invalid environment configuration:\n${lines.join('\n')}`;
    throw new Error(message);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && env.BCRYPT_ROUNDS < 12) {
    throw new Error('BCRYPT_ROUNDS must be at least 12 in production');
  }
  cached = Object.freeze(env);
  return cached;
}

function resetEnvCache() {
  cached = null;
}

module.exports = { loadEnv, resetEnvCache, envSchema };
