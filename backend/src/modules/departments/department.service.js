'use strict';

const Department = require('./department.model');
const AppError = require('../../utils/AppError');
const { withTransaction } = require('../../utils/transaction');
const audit = require('../audit/audit.service');
const Professor = require('../professors/professor.model');
const Notice = require('../notices/notice.model');
const Revision = require('../notices/revision.model');

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

function toDepartmentView(department) {
  return { id: String(department._id), code: department.code, name: department.name, displayOrder: department.displayOrder };
}

async function createDepartment(ctx, body) {
  return withTransaction(async (session) => {
    const [department] = await Department.create([body], session ? { session } : undefined);
    await audit.record(ctx, { action: 'DEPARTMENT_CREATED', entityType: 'DEPARTMENT', entityId: department._id, reason: department.code }, session);
    return toDepartmentView(department);
  });
}

async function updateDepartment(ctx, id, body) {
  return withTransaction(async (session) => {
    const department = await Department.findByIdAndUpdate(id, { $set: body }, { new: true, runValidators: true, ...(session ? { session } : {}) }).lean();
    if (!department) throw AppError.notFound('The department was not found.');
    await audit.record(ctx, { action: 'DEPARTMENT_UPDATED', entityType: 'DEPARTMENT', entityId: id, reason: department.code }, session);
    return toDepartmentView(department);
  });
}

async function deleteDepartment(ctx, id) {
  return withTransaction(async (session) => {
    const department = await Department.findById(id).session(session || null).lean();
    if (!department) throw AppError.notFound('The department was not found.');
    const code = department.code;
    // Include inactive professors, archived notices, current approved search
    // content, and historical revision snapshots. No status excludes history.
    const professor = await Professor.exists({ department: code }).session(session || null);
    const notice = await Notice.exists({ $or: [{ department: code }, { 'publicSearch.department': code }] }).session(session || null);
    const revision = await Revision.exists({ 'contentSnapshot.department': code }).session(session || null);
    if (professor || notice || revision) {
      throw new AppError(409, 'DEPARTMENT_IN_USE',
        'This department is referenced by professor or notice records, including publication history, and cannot be deleted. Edit its name instead.');
    }
    const deleted = await Department.deleteOne({ _id: id }, session ? { session } : undefined);
    if (!deleted.deletedCount) throw AppError.notFound('The department was not found.');
    await audit.record(ctx, { action: 'DEPARTMENT_DELETED', entityType: 'DEPARTMENT', entityId: id, reason: code }, session);
    return { deleted: true, id: String(id) };
  });
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

module.exports = { DEFAULT_DEPARTMENTS, ensureDefaultDepartments, listDepartments, assertDepartment, toDepartmentView, createDepartment, updateDepartment, deleteDepartment };
