'use strict';

const CATEGORIES = ['ACADEMIC', 'EXAM', 'SCHOLARSHIP', 'ADMISSION', 'EVENT', 'ADMINISTRATIVE', 'GENERAL'];
const AUDIENCES = ['ALL', 'STUDENTS', 'FACULTY', 'STAFF'];
const VISIBILITIES = ['PUBLIC', 'CAMPUS'];
const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];
const PRIORITY_RANK = { NORMAL: 0, HIGH: 1, URGENT: 2 };

/** Stored workflow status: changes only when a person acts (D1). */
const WORKFLOW_STATUSES = ['DRAFT', 'SUBMITTED', 'RETURNED', 'REJECTED', 'APPROVED', 'WITHDRAWN', 'ARCHIVED'];

/** Full 10-state effective status shown in the UI. */
const EFFECTIVE_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'RETURNED',
  'REJECTED',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'EXPIRED',
  'WITHDRAWN',
  'ARCHIVED',
];

/** Fields that make up the content snapshot of a revision. */
const CONTENT_FIELDS = [
  'title',
  'summary',
  'body',
  'category',
  'department',
  'audience',
  'visibility',
  'publishingOffice',
  'contactEmail',
  'actionDeadline',
  'attachments',
];

const REASON_MIN = 10;

module.exports = {
  CATEGORIES,
  AUDIENCES,
  VISIBILITIES,
  PRIORITIES,
  PRIORITY_RANK,
  WORKFLOW_STATUSES,
  EFFECTIVE_STATUSES,
  CONTENT_FIELDS,
  REASON_MIN,
};
