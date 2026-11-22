'use strict';
// The caller must load the target from its own trusted domain model.
function matchesDepartment(actor, trustedTarget) {
  return Boolean(actor && typeof actor.department === 'string' && actor.department.trim()
    && trustedTarget && actor.department === trustedTarget.department);
}
module.exports = { matchesDepartment };
