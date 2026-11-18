'use strict';

const express = require('express');
const { z } = require('zod');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const validate = require('../../middleware/validate');
const asyncHandler = require('../../utils/asyncHandler');
const audit = require('../audit/audit.service');
const service = require('./department.service');

const router = express.Router();
const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(160);
const displayOrder = z.number().int().min(0).max(10000);
const idParams = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid department id') }).strict();
const createBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,10}$/, 'Use 2 to 10 letters for the department code')
    .refine((code) => code !== 'ALL', 'ALL is reserved for all departments'),
  name,
  displayOrder: displayOrder.default(0),
}).strict();
const updateBody = z.object({ name: name.optional(), displayOrder: displayOrder.optional() }).strict()
  .refine((value) => value.name !== undefined || value.displayOrder !== undefined, 'Send a name or display order to update');

router.get('/', asyncHandler(async (req, res) => {
  const departments = await service.listDepartments();
  res.json({ data: departments.map(service.toDepartmentView) });
}));

router.use(authenticate, authorize('ADMIN'));
router.post('/', validate({ body: createBody }), asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(201).json({ data: await service.createDepartment(audit.contextFromRequest(req), req.body) });
}));
router.patch('/:id', validate({ params: idParams, body: updateBody }), asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: await service.updateDepartment(audit.contextFromRequest(req), req.params.id, req.body) });
}));
router.delete('/:id', validate({ params: idParams }), asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ data: await service.deleteDepartment(audit.contextFromRequest(req), req.params.id) });
}));

module.exports = router;
