# Design decisions

The specification's core decisions D1-D10 are implemented as written. This
file records the choices made where the specification was silent, and every
deviation from it, with the reason.

## Implemented as specified

| ID  | Where |
|-----|-------|
| D1  | Stored workflow status vs computed effective status: `notices/visibility.js#getEffectiveStatus` |
| D2  | One eligibility rule: `notices/visibility.js`, used by every public path |
| D3  | Public reads from the approved Revision snapshot only (`approvedRevision` populated; `publicSearch` is a copy made at approval) |
| D4  | Injectable clock: `utils/clock.js`; no `new Date()` in time logic |
| D5  | UTC storage, Asia/Seoul in forms (`client/src/lib/time.js`), ISO 8601 with offset in the API |
| D6  | Optimistic concurrency with atomic `findOneAndUpdate({ _id, version })`, 409 on mismatch, 428 when If-Match is missing on updates |
| D7  | Idempotent domain events: UUIDv5 + unique indexes + `$setOnInsert`, written inside the transaction |
| D8  | Explicit serializers with allowlists: `notice.serializers.js`, `event.serializers.js` |
| D9  | `actionDeadline` is display only |
| D10 | Separation of duties in `stateMachine.js`; admin override recorded as `*_ADMIN_OVERRIDE` audit actions |

## Choices where the specification was silent

1. **Audience (visibility rule 6, shared application update).** PUBLIC notices
   remain visible to everyone; their audience is a targeting label. CAMPUS
   notices require login. CAMPUS/ALL permits every signed-in account, while
   CAMPUS/STUDENTS, FACULTY or STAFF requires the matching administrator-assigned
   `User.audienceGroups` value. New and legacy accounts default to no trusted
   groups; registration and profile edits cannot assign them. Administrators
   assign groups through user management, with an audit entry and session
   revocation. An administrator cannot change their own trusted groups.
2. **One event per notice.** "The linked public event" is singular in the
   spec, so `Event.notice` has a unique index. Creating a second event returns
   409 DUPLICATE.
3. **EVENT_CREATED is emitted when the parent notice is approved**, not when
   the author first saves the event on a draft. Emitting earlier would tell the
   notification consumer about an event that is not public yet.
4. **Delete draft.** The author workspace needs "Delete draft", which is not in
   the endpoint list. Added `DELETE /api/notices/:id`, owner only, allowed only
   for DRAFT/RETURNED notices that were never approved. Audited.
5. **Management GET for events and a pending-count endpoint.** Added
   `GET /api/events/:id`, `DELETE /api/events/:id` (draft only),
   `GET /api/admin/summary` (dashboard) and `GET /api/admin/pending-count`
   (navigation badge), plus `GET /api/professors/departments` (counts) and
   `GET /api/public/home`.
6. **Pin limit.** "At most 5 pinned notices visible at once" is counted over
   approved, not-expired, pinned notices (published or scheduled), so a
   scheduled pin cannot push the live count over the limit when it goes live.
   The error code is `409 PIN_LIMIT_REACHED`.
   Capacity-increasing approval and placement transactions first write one
   shared `NoticePinGuard` document, so parallel changes to different notices
   cannot each consume the final slot. Pinning requires a MongoDB replica set;
   it fails closed with `503 PIN_TRANSACTIONS_REQUIRED` without transactions.
7. **Pending correction conflict.** A second correction while one is pending
   returns `409 CORRECTION_PENDING` (clearer than a generic code).
8. **Corrections and the working copy.** When a correction is approved, the
   working copy is updated to match the new snapshot so staff views stay
   consistent. Public APIs still read only the approved Revision.
9. **Who may correct.** Matrix row "Create revision of approved notice":
   AUTHOR (own) and ADMIN. A reviewer may not approve a correction they
   authored or a correction on a notice they authored (admin override audited).
10. **Withdraw by reviewer** works on any APPROVED notice (scheduled,
    published or expired). Authors may withdraw only their own PUBLISHED notice.
11. **Placement** (priority/pinned) can be changed only on SCHEDULED or
    PUBLISHED notices and requires If-Match.
12. **Event postpone/cancel** require the parent notice to be APPROVED; a
    COMPLETED or CANCELLED event cannot be changed (409). If-Match is optional
    on these actions but honoured when sent.
13. **Event tabs.** UPCOMING = SCHEDULED or POSTPONED with end in the future
    (postponed events also appear in the Postponed tab). The events page loads
    one month at a time; the list and the month grid render the same response.
14. **Notice department filter** is an exact match. Notices for "ALL"
    departments are found with `department=ALL` ("University-wide notices").
15. **Professor search** uses an escaped, case-insensitive "contains" match on
    name and subjects, so partial words work while typing. The text index on
    name and subjects exists as the spec requires. Notice search follows
    Section 11 exactly (text index for 3+ characters, escaped regex below 3).
16. **Professor updates** need If-Match (Section 13 applies the concurrency rule
    to professor updates), so Professor has a `version` field.
17. **Notice body format.** The body is rendered as plain text with paragraph
    breaks (React escapes it). No HTML or Markdown is rendered, so DOMPurify
    was not needed and was not added.
18. **Rejected uploads.** The local gateway records a REJECTED file's
    metadata (without storing its bytes) and returns 201 with
    `validationStatus: REJECTED`, so the editor can show why. A notice that
    still has a rejected attachment cannot be submitted.
19. **Attachment ownership.** Authors may attach only files they uploaded
    (corrections may keep files already in the approved snapshot). Metadata
    always comes from the gateway, never from the request body.
20. **Operator injection.** `express-mongo-sanitize` flags `$` and dotted keys;
    instead of silently stripping them, the request is rejected with 400.
21. **Admin self-change.** An administrator cannot change their own role or
    deactivate themselves (prevents locking out the last admin).
22. **Role/status changes** increment `tokenVersion`, which signs the user out
    of existing sessions. Role is still read from the database on every request.
23. **Rate limits.** Login: 5 per minute per IP + email. All of `/api/auth`:
    100 per 15 minutes per IP. Both are configurable by env for tests.
24. **bcrypt cost.** 12 by default. `BCRYPT_ROUNDS` may be lowered only
    outside production (the test suite uses 4 for speed); the server refuses
    to start in production with less than 12.

## Deviations from the specification

1. **Node.js version.** The build machine has Node 22.23 (spec pins Node 20).
   `engines` is `>=20`; nothing uses Node 22-only features.
2. **MongoDB version in tests.** MongoDB's download server was blocked in the
   build environment, so the tests ran against a local mongod 8.3.7 binary
   (from conda-forge) through `MONGOMS_SYSTEM_BINARY`. On a normal machine
   mongodb-memory-server downloads its own binary and no variable is needed.
   docker-compose uses MongoDB 7.0 as specified.
3. **ESLint 8** with `.eslintrc.cjs` (stable shared config for both
   workspaces) instead of the newer flat config.
