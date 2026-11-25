'use strict';

const { departments, profiles } = require('../../data/kdu-faculty-contacts.json');
const { containsRegex } = require('../../utils/regex');

const contacts = new Map(Object.entries(profiles).map(([slug, profile]) => ['kdu-global:' + slug, profile]));

function directoryDepartmentName(code) {
  return Object.hasOwn(departments, code) ? departments[code] : null;
}

function withPublishedContact(professor) {
  const contact = contacts.get(professor.sourceKey);
  return {
    ...professor,
    department: professor.department ?? contact?.department ?? null,
    officeRoom: professor.officeRoom ?? contact?.officeRoom ?? null,
  };
}

// Keep the public fallback in queries too so filtering, paging and counts agree
// with the details on each card. Saved administrator values take precedence.
const directoryFields = [
  { $set: { publishedContact: { $switch: {
    branches: [...contacts].map(([sourceKey, profile]) => ({
      case: { $eq: ['$sourceKey', sourceKey] }, then: { $literal: profile },
    })),
    default: null,
  } } } },
  { $set: {
    department: { $ifNull: ['$department', '$publishedContact.department', null] },
    officeRoom: { $ifNull: ['$officeRoom', '$publishedContact.officeRoom', null] },
  } },
];

function professorKeywordMatch(query = '') {
  const keyword = query.trim();
  if (!keyword) return {};
  const text = keyword.replace(/^(?:office(?:\s+room)?|room)\s+(?=\d)/i, '');
  const terms = text.split(/[\s,]+/).filter(Boolean);
  return { $and: (terms.length ? [...new Set(terms)] : [text]).map(term => {
    const rx = containsRegex(term.replace(/^(\d+[a-z]?)호$/i, '$1'));
    const codes = Object.keys(departments).filter(code => rx.test(departments[code]));
    return { $or: [
      { name: rx }, { subjects: rx }, { department: rx }, { officeRoom: rx }, { officeBuilding: rx },
      { 'publishedContact.nameInContactDirectory': rx },
      { sourceKey: { $exists: true }, $or: [{ qualifications: rx }, { roles: rx }] },
      ...(codes.length ? [{ department: { $in: codes } }] : []),
    ] };
  }) };
}

module.exports = { directoryDepartmentName, directoryFields, professorKeywordMatch, withPublishedContact };
