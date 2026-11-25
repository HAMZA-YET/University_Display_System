'use strict';
const Notice = require('../notices/notice.model');
const Professor = require('../professors/professor.model');
const { directoryFields, professorKeywordMatch } = require('../professors/professor.directory');
const Item = require('../lostFound/item.model');
const { PUBLIC_STATUSES } = require('../lostFound/lostFound.constants');
const { withEligibility } = require('../notices/visibility');
const { containsRegex } = require('../../utils/regex');
const { getPaging, buildMeta } = require('../../utils/pagination');
const clock = require('../../utils/clock');

/** One database aggregation supplies a stable alphabetical page and its counts.
 * Lost-and-found is omitted entirely for visitors, including its metadata.
 * Projections deliberately exclude contact details, claim evidence and photos.
 */
async function searchAll(user, query) {
  const { page, limit, skip } = getPaging(query);
  const rx = query.q ? containsRegex(query.q) : null;
  const noticeKeyword = rx ? { $or: [{ 'publicSearch.title': rx }, { 'publicSearch.summary': rx }, { 'publicSearch.body': rx }] } : {};
  const pipeline = [
    { $match: withEligibility(clock.now(), user, noticeKeyword) },
    { $project: { _id: 0, id: { $toString: '$_id' }, source: { $literal: 'notice' }, title: '$publicSearch.title', summary: { $ifNull: ['$publicSearch.summary', ''] }, href: { $concat: ['/notices/', { $toString: '$_id' }] } } },
    { $unionWith: { coll: Professor.collection.name, pipeline: [
      { $match: { isActive: true } },
      ...directoryFields,
      { $match: professorKeywordMatch(query.q) },
      { $project: { _id: 0, id: { $toString: '$_id' }, source: { $literal: 'professor' }, title: '$name', summary: {
        $cond: [{ $gt: [{ $size: { $ifNull: ['$subjects', []] } }, 0] },
          { $reduce: { input: '$subjects', initialValue: '', in: { $concat: ['$$value', { $cond: [{ $eq: ['$$value', ''] }, '', ', '] }, '$$this'] } } },
          { $ifNull: ['$positionLabel', { $reduce: { input: { $ifNull: ['$roles', []] }, initialValue: '', in: { $concat: ['$$value', { $cond: [{ $eq: ['$$value', ''] }, '', ', '] }, '$$this'] } } }] },
        ],
      }, href: { $literal: '/professors' }, officeRoom: 1, sourceUrl: 1, sourceRetrievedAt: 1, positionLabel: 1, roles: 1 } },
    ] } },
  ];
  if (user) pipeline.push({ $unionWith: { coll: Item.collection.name, pipeline: [
    { $match: { deletedAt: null, status: { $in: PUBLIC_STATUSES }, ...(rx ? { $or: [{ title: rx }, { description: rx }, { location: rx }, { reference: rx }] } : {}) } },
    { $project: { _id: 0, id: { $toString: '$_id' }, source: { $literal: 'item' }, title: 1, summary: '$description', href: { $concat: ['/items/', { $toString: '$_id' }] } } },
  ] } });
  pipeline.push(
    { $set: { sortTitle: { $toLower: '$title' } } },
    { $sort: { sortTitle: 1, source: 1, id: 1 } },
    { $facet: { data: [{ $skip: skip }, { $limit: limit }, { $unset: 'sortTitle' }], total: [{ $count: 'count' }], counts: [{ $group: { _id: '$source', count: { $sum: 1 } } }] } },
  );
  const [result] = await Notice.aggregate(pipeline);
  const sources = user ? ['notice', 'professor', 'item'] : ['notice', 'professor'];
  const counts = Object.fromEntries(sources.map((source) => [source, 0]));
  for (const row of result.counts) counts[row._id] = row.count;
  return { data: result.data, meta: { ...buildMeta(page, limit, result.total[0]?.count || 0), sources, counts, sort: 'title' } };
}

module.exports = { searchAll };
