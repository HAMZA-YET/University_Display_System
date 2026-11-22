'use strict';

const express = require('express');
const { z } = require('zod');
const User = require('./user.model');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const audit = require('../audit/audit.service');
const { paginationQuery, getPaging, buildMeta } = require('../../utils/pagination');
const { containsRegex } = require('../../utils/regex');

const router = express.Router();

const idParams = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id') }).strict();
const listQuery = z
  .object({
    ...paginationQuery,
    q: z.string().trim().max(100).optional(),
    role: z.enum(User.ROLES).optional(),
  })
  .strict();
const roleBody = z.object({ role: z.enum(User.ROLES) }).strict();
const statusBody = z.object({ isActive: z.boolean() }).strict();

function toUserView(u) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department || null,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

router.use(authenticate, authorize('ADMIN'));

router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPaging(req.query);
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.q) {
      const rx = containsRegex(req.query.q);
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    res.json({ data: items.map(toUserView), meta: buildMeta(page, limit, total) });
  })
);

router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).lean();
    if (!user) throw AppError.notFound();
    res.json({ data: toUserView(user) });
  })
);

async function changeUser(req, update, auditEntry) {
  if (String(req.user._id) === req.params.id) {
    throw AppError.forbidden('Administrators cannot change their own role or status.');
  }
  const before = await User.findById(req.params.id).lean();
  if (!before) throw AppError.notFound();
  // tokenVersion is incremented so existing sessions of this user stop working.
  const after = await User.findByIdAndUpdate(
    req.params.id,
    { $set: update, $inc: { tokenVersion: 1 } },
    { new: true }
  ).lean();
  await audit.record(audit.contextFromRequest(req), auditEntry(before, after));
  return after;
}

router.patch(
  '/:id/role',
  validate({ params: idParams, body: roleBody }),
  asyncHandler(async (req, res) => {
    const user = await changeUser(req, { role: req.body.role }, (before, after) => ({
      action: 'USER_ROLE_CHANGED',
      entityType: 'USER',
      entityId: after._id,
      fromStatus: before.role,
      toStatus: after.role,
    }));
    res.json({ data: toUserView(user) });
  })
);

router.patch(
  '/:id/status',
  validate({ params: idParams, body: statusBody }),
  asyncHandler(async (req, res) => {
    const user = await changeUser(req, { isActive: req.body.isActive, activationPending: false }, (before, after) => ({
      action: 'USER_STATUS_CHANGED',
      entityType: 'USER',
      entityId: after._id,
      fromStatus: before.isActive ? 'ACTIVE' : 'INACTIVE',
      toStatus: after.isActive ? 'ACTIVE' : 'INACTIVE',
    }));
    res.json({ data: toUserView(user) });
  })
);

router.patch('/:id/department', validate({ params: idParams, body: z.object({ department: z.string().regex(/^[A-Z]{2,10}$/).nullable() }).strict() }),
  asyncHandler(async (req, res) => {
    if (req.body.department && !(await require('../departments/department.model').exists({ code: req.body.department }))) throw AppError.badRequest('Unknown department.');
    const user = await changeUser(req, { department: req.body.department }, (before, after) => ({
      action: 'USER_DEPARTMENT_CHANGED', entityType: 'USER', entityId: after._id,
      fromStatus: before.department, toStatus: after.department,
    }));
    res.json({ data: toUserView(user) });
  }));
module.exports = router;
