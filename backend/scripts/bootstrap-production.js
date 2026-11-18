'use strict';

/**
 * Explicit, non-destructive production bootstrap. There are no default
 * accounts/passwords and this script is never invoked by build/start/deploy.
 */
const fs = require('fs/promises');
const { z } = require('zod');
const { loadEnv } = require('../src/config/env');
const { missingConfiguration } = require('../src/config/readiness');
const { connectDb, disconnectDb } = require('../src/config/db');
const User = require('../src/modules/users/user.model');
const Department = require('../src/modules/departments/department.model');
const { hashPassword } = require('../src/modules/auth/auth.service');
const { withInitialAdministrator } = require('../src/modules/setup/setup.service');
const mongoose = require('mongoose');

const credentials = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(12).max(128)
    .regex(/[A-Za-z]/).regex(/[0-9]/)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password exceeds bcrypt byte limit'),
});
const departmentsSchema = z.array(z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,10}$/),
  name: z.string().trim().min(2).max(160),
  displayOrder: z.number().int().min(0).default(0),
}).strict()).max(100);

async function bootstrap() {
  if (missingConfiguration().length) throw new Error('Configure MONGODB_URI (or MONGO_URI) and JWT_SECRET first.');
  const parsed = credentials.safeParse({
    name: process.env.BOOTSTRAP_ADMIN_NAME,
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  });
  if (!parsed.success) {
    throw new Error('Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, and a unique BOOTSTRAP_ADMIN_PASSWORD of 12+ characters (at most 72 UTF-8 bytes, with a letter and number).');
  }
  // Validate all optional metadata before connecting or making any writes.
  let departments = [];
  if (process.env.BOOTSTRAP_DEPARTMENTS_FILE) {
    departments = departmentsSchema.parse(JSON.parse(await fs.readFile(process.env.BOOTSTRAP_DEPARTMENTS_FILE, 'utf8')));
  }
  const env = loadEnv();
  if (env.BCRYPT_ROUNDS < 12) throw new Error('Production bootstrap requires BCRYPT_ROUNDS >= 12.');
  await connectDb(env.MONGO_URI);
  await User.init();
  const { name, email, password } = parsed.data;
  const existing = await User.findOne({ email }).lean();
  if (existing && existing.role !== 'ADMIN') {
    throw new Error('This email already belongs to a non-administrator. Use the existing administrator to manage its role.');
  }
  if (!existing) {
    // Share the API's atomic first-admin claim so even concurrent browser/CLI
    // attempts cannot create multiple initial administrators.
    const administratorId = new mongoose.Types.ObjectId();
    const passwordHash = await hashPassword(password);
    await withInitialAdministrator(administratorId, async (session) => {
      const [user] = await User.create([{ _id: administratorId, name, email, passwordHash, role: 'ADMIN' }], { session });
      return user;
    });
  }
  for (const department of departments) {
    await Department.updateOne({ code: department.code }, { $setOnInsert: department }, { upsert: true });
  }
  console.log(existing ? 'Administrator already exists; credentials were unchanged.' : 'Initial administrator created.');
  console.log(`${departments.length} department definitions processed. Existing records were preserved.`);
}

if (require.main === module) {
  bootstrap().catch((error) => {
    // Driver errors can contain connection strings. Keep CLI failure output safe.
    console.error(/^Mongo/.test(error.name) ? 'Database operation failed. Check the configured connection and database permissions.' : error.message);
    process.exitCode = 1;
  }).finally(disconnectDb);
}
module.exports = { bootstrap, credentials, departmentsSchema };
