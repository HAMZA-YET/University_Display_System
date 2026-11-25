'use strict';

const Professor = require('./professor.model');
const Department = require('../departments/department.model');
const AppError = require('../../utils/AppError');
const audit = require('../audit/audit.service');
const { assertDepartment } = require('../departments/department.service');
const { getPaging, buildMeta } = require('../../utils/pagination');
const { directoryDepartmentName, directoryFields, professorKeywordMatch, withPublishedContact } = require('./professor.directory');

function toProfessorView(p, { publicDirectory = false } = {}) {
  const departmentName = publicDirectory && p.sourceKey ? directoryDepartmentName(p.department) : null;
  return {
    id: String(p._id),
    name: p.name,
    titlePrefix: p.titlePrefix || null,
    department: p.department,
    ...(departmentName ? { departmentName } : {}),
    position: p.position,
    officeRoom: p.officeRoom,
    officeBuilding: p.officeBuilding,
    email: p.email,
    phone: p.phone || null,
    counsellingHours: (p.counsellingHours || []).map((s) => ({
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
      location: s.location || null,
      note: s.note || null,
    })),
    subjects: p.subjects || [],
    profileImage: p.profileImage || null,
    isActive: p.isActive,
    version: p.version,
    ...(p.sourceKey ? {
      sourceKey: p.sourceKey,
      sourceUrl: p.sourceUrl,
      sourceRetrievedAt: p.sourceRetrievedAt,
      positionLabel: p.positionLabel || null,
      roles: p.roles || [],
      qualifications: p.qualifications || [],
    } : {}),
  };
}

function normalize(body) {
  const out = { ...body };
  delete out.expectedVersion;
  if (out.phone === '') out.phone = null;
  if (out.profileImage === '') out.profileImage = null;
  out.counsellingHours = (out.counsellingHours || []).sort((a, b) =>
    a.day === b.day ? a.startTime.localeCompare(b.startTime) : 0
  );
  return out;
}

async function listProfessors(query, { includeInactive = false } = {}) {
  const { page, limit, skip } = getPaging(query);
  const directory = includeInactive ? [] : [{ $match: { isActive: true } }, ...directoryFields];
  const department = query.department ? [{ $match: { department: query.department } }] : [];
  const [{ items, totals, byDept }] = await Professor.aggregate([
    ...directory,
    { $match: professorKeywordMatch(query.q) },
    { $facet: {
      items: [...department, { $sort: { name: 1, _id: 1 } }, { $skip: skip }, { $limit: limit }],
      totals: [...department, { $count: 'total' }],
      byDept: [{ $group: { _id: '$department', count: { $sum: 1 } } }],
    } },
  ]).collation({ locale: 'en' });
  const counts = Object.fromEntries(byDept.filter((d) => d._id).map((d) => [d._id, d.count]));
  counts.ALL = byDept.reduce((sum, d) => sum + d.count, 0);
  return {
    data: items.map(p => toProfessorView(p, { publicDirectory: !includeInactive })),
    meta: { ...buildMeta(page, limit, totals[0]?.total || 0), departmentCounts: counts },
  };
}

async function getProfessor(id, { includeInactive = false } = {}) {
  const p = await Professor.findById(id).lean();
  if (!p || (!includeInactive && !p.isActive)) throw AppError.notFound();
  return includeInactive ? toProfessorView(p) : toProfessorView(withPublishedContact(p), { publicDirectory: true });
}

async function createProfessor(ctx, body) {
  await assertDepartment(body.department);
  const doc = await Professor.create({ ...normalize(body), version: 1 });
  await audit.record(ctx, { action: 'PROFESSOR_CREATED', entityType: 'PROFESSOR', entityId: doc._id, reason: doc.name });
  return toProfessorView(doc.toObject());
}

async function updateProfessor(ctx, id, body, expectedVersion) {
  const existing = await Professor.findById(id).lean();
  if (!existing) throw AppError.notFound();
  if (!existing.sourceKey) {
    const fields = { ...body };
    delete fields.expectedVersion;
    const parsed = require('./professor.schemas').professorBody.safeParse(fields);
    if (!parsed.success) throw AppError.badRequest('Some fields are not valid.', parsed.error.issues.map((issue) => ({
      location: 'body', field: issue.path.join('.') || 'body', message: issue.message,
    })));
    body = parsed.data;
  }
  if (body.department) await assertDepartment(body.department);
  if (existing.version !== expectedVersion) throw AppError.versionConflict(existing.version, 'professor record');
  const updated = await Professor.findOneAndUpdate(
    { _id: id, version: expectedVersion, ...(existing.sourceKey ? { sourceKey: existing.sourceKey } : {}) },
    { $set: normalize(body), $inc: { version: 1 } },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) {
    const current = await Professor.findById(id).lean();
    throw AppError.versionConflict(current ? current.version : null, 'professor record');
  }
  await audit.record(ctx, { action: 'PROFESSOR_UPDATED', entityType: 'PROFESSOR', entityId: id, reason: updated.name });
  return toProfessorView(updated);
}

async function deleteProfessor(ctx, id) {
  const existing = await Professor.findById(id).lean();
  if (!existing) throw AppError.notFound();
  await Professor.deleteOne({ _id: id });
  await audit.record(ctx, { action: 'PROFESSOR_DELETED', entityType: 'PROFESSOR', entityId: id, reason: existing.name });
  return { deleted: true, id: String(id) };
}

async function departmentsWithCounts() {
  const [departments, counts] = await Promise.all([
    Department.find().sort({ displayOrder: 1 }).lean(),
    Professor.aggregate([
      { $match: { isActive: true } }, ...directoryFields,
      { $group: { _id: '$department', count: { $sum: 1 } } },
    ]),
  ]);
  const map = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  const options = new Map(departments.map(({ code, name }) => [
    code,
    { code, name: (/\s\(Demo\)$/i.test(name) && directoryDepartmentName(code)) || name, count: map[code] || 0 },
  ]));
  for (const { _id: code, count } of counts) {
    const name = directoryDepartmentName(code);
    if (name && !options.has(code)) options.set(code, { code, name, count });
  }
  return [...options.values()];
}

module.exports = {
  listProfessors,
  getProfessor,
  createProfessor,
  updateProfessor,
  deleteProfessor,
  departmentsWithCounts,
  toProfessorView,
};
