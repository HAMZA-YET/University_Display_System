'use strict';

const Department = require('./department.model');
const AppError = require('../../utils/AppError');

/**
 * Default departments. The full names are editable sample data: the official
 * names must be confirmed by the university (see README).
 */
const DEFAULT_DEPARTMENTS = [
  { code: 'AI', name: 'Artificial Intelligence', displayOrder: 1 },
  { code: 'IBA', name: 'International Business Administration', displayOrder: 2 },
  { code: 'BSC', name: 'Bachelor of Smart Computing', displayOrder: 3 },
  { code: 'IHM', name: 'International Hospitality Management', displayOrder: 4 },
  { code: 'KS', name: 'Korean Studies', displayOrder: 5 },
  { code: 'EAP', name: 'English for Academic Purposes', displayOrder: 6 },
];

async function ensureDefaultDepartments() {
  for (const dept of DEFAULT_DEPARTMENTS) {
    await Department.updateOne({ code: dept.code }, { $setOnInsert: dept }, { upsert: true });
  }
}

async function listDepartments() {
  return Department.find().sort({ displayOrder: 1, code: 1 }).lean();
}

/** Throws 400 when the code is not a known department (optionally allowing "ALL"). */
async function assertDepartment(code, { allowAll = false, field = 'department' } = {}) {
  if (code === undefined || code === null) return;
  if (allowAll && code === 'ALL') return;
  const exists = await Department.exists({ code });
  if (!exists) {
    throw AppError.badRequest('Department is not valid.', [
      { location: 'body', field, message: `Unknown department code "${code}"` },
    ]);
  }
}

module.exports = { DEFAULT_DEPARTMENTS, ensureDefaultDepartments, listDepartments, assertDepartment };
