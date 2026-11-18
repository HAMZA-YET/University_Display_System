'use strict';

const AppError = require('../../utils/AppError');
const { getEffectiveStatus } = require('./visibility');
const { REASON_MIN } = require('./notice.constants');

/**
 * Notice lifecycle as data (Section 4). Controllers and services call
 * applyTransition(); anything not in this table is rejected with
 * 409 INVALID_TRANSITION.
 *
 * owner:          'required'  -> actor must be the notice author (any role)
 *                 'forAuthor' -> AUTHOR role must be the owner; staff need not be
 * separationOfDuties: reviewer may not decide on a notice they authored;
 *                 ADMIN may override and the override is audited.
 */
const TRANSITIONS = {
  create: {
    from: [null],
    to: 'DRAFT',
    roles: ['AUTHOR', 'ADMIN'],
    sideEffects: ['author = current user'],
  },
  update: {
    from: ['DRAFT', 'RETURNED'],
    to: 'DRAFT',
    roles: ['AUTHOR', 'ADMIN'],
    owner: 'required',
    sideEffects: ['version check'],
  },
  submit: {
    from: ['DRAFT', 'RETURNED'],
    to: 'SUBMITTED',
    roles: ['AUTHOR', 'ADMIN'],
    owner: 'required',
    sideEffects: ['full validation passes', 'submittedAt set'],
  },
  return: {
    from: ['SUBMITTED'],
    to: 'RETURNED',
    roles: ['REVIEWER', 'ADMIN'],
    separationOfDuties: true,
    reasonRequired: true,
  },
  reject: {
    from: ['SUBMITTED'],
    to: 'REJECTED',
    roles: ['REVIEWER', 'ADMIN'],
    separationOfDuties: true,
    reasonRequired: true,
    sideEffects: ['terminal'],
  },
  approve: {
    from: ['SUBMITTED'],
    to: 'APPROVED',
    roles: ['REVIEWER', 'ADMIN'],
    separationOfDuties: true,
    sideEffects: ['creates approved revision', 'sets publication window', 'emits NOTICE_PUBLISHED or NOTICE_SCHEDULED'],
  },
  withdraw: {
    from: ['APPROVED'],
    to: 'WITHDRAWN',
    roles: ['REVIEWER', 'ADMIN', 'AUTHOR'],
    owner: 'forAuthor',
    reasonRequired: true,
    guard: (notice, user, now) => {
      if (user.role === 'AUTHOR' && getEffectiveStatus(notice, now) !== 'PUBLISHED') {
        return 'An author may withdraw only their own published notice.';
      }
      return null;
    },
    sideEffects: ['emits NOTICE_WITHDRAWN'],
  },
  archive: {
    from: ['WITHDRAWN', 'APPROVED'],
    to: 'ARCHIVED',
    roles: ['REVIEWER', 'ADMIN'],
    guard: (notice, user, now) => {
      if (notice.status === 'APPROVED' && getEffectiveStatus(notice, now) !== 'EXPIRED') {
        return 'An approved notice can be archived only after it has expired.';
      }
      return null;
    },
    sideEffects: ['emits NOTICE_ARCHIVED'],
  },
};

function isOwner(notice, user) {
  const authorId = notice.author && notice.author._id ? notice.author._id : notice.author;
  return String(authorId) === String(user._id);
}

/**
 * Checks one transition. Returns { from, to, adminOverride }.
 * Throws 403 for role/ownership problems, 400 for a missing reason and
 * 409 INVALID_TRANSITION for a state that does not allow the action.
 */
function applyTransition({ notice, action, user, now, reason }) {
  const rule = TRANSITIONS[action];
  if (!rule) throw AppError.invalidTransition(`Unknown action "${action}".`);
  if (!user || !rule.roles.includes(user.role)) {
    throw AppError.forbidden(`Your role cannot ${action} a notice.`);
  }
  const from = notice ? notice.status : null;
  const owner = notice ? isOwner(notice, user) : true;

  if (rule.owner === 'required' && !owner) {
    throw AppError.forbidden(`Only the author can ${action} this notice.`);
  }
  if (rule.owner === 'forAuthor' && user.role === 'AUTHOR' && !owner) {
    throw AppError.forbidden(`Only the author can ${action} this notice.`);
  }
  let adminOverride = false;
  if (rule.separationOfDuties && owner) {
    if (user.role === 'ADMIN') {
      adminOverride = true;
    } else {
      throw AppError.forbidden('You cannot review a notice you authored.');
    }
  }
  if (!rule.from.includes(from)) {
    throw AppError.invalidTransition(`Cannot ${action} a notice whose status is ${from}.`);
  }
  if (rule.guard) {
    const problem = rule.guard(notice, user, now);
    if (problem) throw AppError.invalidTransition(problem);
  }
  if (rule.reasonRequired) {
    if (typeof reason !== 'string' || reason.trim().length < REASON_MIN) {
      throw AppError.badRequest(`A reason of at least ${REASON_MIN} characters is required.`, [
        { location: 'body', field: 'reason', message: `Reason must be at least ${REASON_MIN} characters` },
      ]);
    }
  }
  return { from, to: rule.to, adminOverride, owner };
}

module.exports = { TRANSITIONS, applyTransition, isOwner };
