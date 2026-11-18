# API reference

Base path `/api`. JSON only (except file upload/download). Times are ISO 8601
strings; send them with an offset, for example `2026-12-01T09:00:00+09:00`.

Authentication: an httpOnly, SameSite=Strict cookie `uids_token` set by
login/register. The role is loaded from the database on every request.

## Conventions

List endpoints accept `page` (default 1) and `limit` (default 20, max 100) and return:

```json
{ "data": [], "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 1 } }
```

Unknown query or body fields are rejected (400). Keys starting with `$` or
containing `.` are rejected (400).

Standard error body:

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "...", "details": [], "requestId": "...", "currentVersion": 4 } }
```

| Status | Code | When |
|--------|------|------|
| 400 | VALIDATION_ERROR | invalid input; `details` = `[{ location, field, message }]` |
| 401 | UNAUTHENTICATED | no or invalid session |
| 403 | FORBIDDEN | role or ownership not allowed |
| 404 | NOT_FOUND | missing, or not visible to this viewer |
| 409 | VERSION_CONFLICT | stale version; includes `currentVersion` |
| 409 | INVALID_TRANSITION | action not allowed in the current state |
| 409 | DUPLICATE | unique key (email, one event per notice) |
| 409 | PIN_LIMIT_REACHED | more than MAX_PINNED_NOTICES pinned |
| 409 | CORRECTION_PENDING | a correction is already waiting |
| 413 | PAYLOAD_TOO_LARGE | JSON body over 1 MB |
| 428 | PRECONDITION_REQUIRED | update without If-Match / expectedVersion |
| 429 | RATE_LIMITED | too many auth requests |
| 500 | INTERNAL_ERROR | unexpected; nothing was saved; no stack trace outside development |

Optimistic concurrency: send `If-Match: <version>` (or `expectedVersion` in the
body). Required on `PATCH /notices/:id`, `PATCH /notices/:id/placement`,
`PATCH /events/:id`, `PUT /professors/:id`. Optional but honoured on actions.

## Auth `/api/auth`

| Method | Path | Access | Body | Result |
|---|---|---|---|---|
| POST | /register | public | `{ name, email, password }` (role not accepted) | 201 user (READER) + cookie |
| POST | /login | public, 5/min per IP+email | `{ email, password }` | user + cookie; 401 wrong credentials; 403 deactivated |
| POST | /logout | any | - | clears cookie |
| GET | /me | signed in | - | `{ id, name, email, role, department }` |

Password: 8+ characters, at least one letter and one number.

## Users `/api/users` (ADMIN)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | / | query `q, role, page, limit` | list |
| GET | /:id | - | one user |
| PATCH | /:id/role | `{ role }` | audited; signs the user out; not on yourself |
| PATCH | /:id/status | `{ isActive }` | audited; signs the user out; not on yourself |

## Departments

`GET /api/departments` (public) -> `[{ code, name, displayOrder }]`.

## Public notices

| Method | Path | Notes |
|---|---|---|
| GET | /api/public/notices | query `q, category, department, audience, from, to, pinned, sort(default/newest), page, limit`. Sorted pinned, priority, newest. A `status` parameter is rejected (400). |
| GET | /api/public/notices/:id | approved snapshot + linked public event + VALID attachments; 404 if not eligible |
| GET | /api/public/home | `{ important: [...], latest: [...] }` (6 each) |

## Notice management `/api/notices` (AUTHOR, REVIEWER, ADMIN)

| Method | Path | Roles | Body / query | Result |
|---|---|---|---|---|
| GET | / | staff | `status` (effective), `department, category, author, archived, q, page, limit` | AUTHOR sees own only |
| POST | / | AUTHOR, ADMIN | content fields (title required) | 201 draft |
| GET | /:id | staff (author: own) | - | management view incl. history |
| PATCH | /:id | owner | content fields; If-Match | updated; RETURNED -> DRAFT |
| DELETE | /:id | owner | - | only never-approved DRAFT/RETURNED |
| GET | /:id/preview | staff (author: own) | - | public shape of the working copy, `preview: true`; changes nothing |
| POST | /:id/submit | owner | `{}` | full validation; 400 lists every missing field |
| POST | /:id/approve | REVIEWER, ADMIN | `{ mode: "NOW"\|"SCHEDULE", publicationStart?, publicationEnd?, priority?, pinned? }` | `{ data, domainEvent }` |
| POST | /:id/return | REVIEWER, ADMIN | `{ reason }` (min 10) | RETURNED |
| POST | /:id/reject | REVIEWER, ADMIN | `{ reason }` | REJECTED |
| POST | /:id/withdraw | REVIEWER, ADMIN, owner AUTHOR | `{ reason }` | `{ data, domainEvent }` |
| POST | /:id/archive | REVIEWER, ADMIN | `{}` | only WITHDRAWN or EXPIRED |
| PATCH | /:id/placement | REVIEWER, ADMIN | `{ priority?, pinned? }`; If-Match | |
| GET | /:id/revisions | staff (author: own) | - | all revisions |
| POST | /:id/revisions | owner AUTHOR, ADMIN | full content + `changeNote` + `baseVersion` | 201 PENDING revision |
| GET | /:id/revisions/:revId/diff | staff | - | `{ base, revision, fields: [{ field, before, after, changed }], changedCount }` |
| POST | /:id/revisions/:revId/approve | REVIEWER, ADMIN | `{}` | new snapshot public; NOTICE_CORRECTED |
| POST | /:id/revisions/:revId/reject | REVIEWER, ADMIN | `{ reason }` | public version unchanged |
| GET | /review-queue | REVIEWER, ADMIN | page, limit | SUBMITTED + PENDING corrections, oldest first |

Content fields: `title, summary, body, category, department, audience,
visibility, publishingOffice, contactEmail, actionDeadline,
requestedPublicationStart, requestedPublicationEnd, attachments: [{ fileId }]`.
Fields `status, author, version, priority, pinned, publicationStart` are
rejected from authors.

## Events

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | /api/public/events | public | query `state (UPCOMING, COMPLETED, CANCELLED, POSTPONED), from, to, department, page, limit`; only events of publicly visible notices |
| GET | /api/public/events/:id | public | 404 if the notice is not visible |
| GET | /api/events | staff | `noticeId, state`; AUTHOR sees events of own notices |
| GET | /api/events/:id | staff | management view with scheduleHistory and version |
| POST | /api/events | AUTHOR, ADMIN (notice owner, notice DRAFT/RETURNED) | `{ noticeId, title?, start, end, timezone?, allDay?, venue, venueBuilding?, venueRoom?, organizer }` |
| PATCH | /api/events/:id | owner, notice draft | If-Match |
| DELETE | /api/events/:id | owner, notice draft | |
| POST | /api/events/:id/postpone | REVIEWER, ADMIN | `{ newStart, newEnd, reason }`; same _id; history kept; EVENT_POSTPONED |
| POST | /api/events/:id/cancel | REVIEWER, ADMIN | `{ reason }`; EVENT_CANCELLED; cannot be changed afterwards |

## Professors `/api/professors`

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | / | public | `department, q (name or subject), page, limit`; sorted by name; `meta.departmentCounts` |
| GET | /departments | public | `[{ code, name, count }]` |
| GET | /:id | public | |
| POST | / | ADMIN | `{ name, titlePrefix?, department, position, officeRoom, officeBuilding, email, phone?, counsellingHours: [{ day, startTime, endTime, location?, note? }], subjects: [..], profileImage?, isActive? }` |
| PUT | /:id | ADMIN | same body; If-Match |
| DELETE | /:id | ADMIN | hard delete; audited |

Rules: subjects 1-20, 2-100 chars, duplicates removed case-insensitively;
slots `HH:mm`, end after start, no overlaps on the same day; department must exist.

## Attachments

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | /api/attachments | AUTHOR, ADMIN | multipart field `file`; returns `{ fileId, fileName, fileType, size, validationStatus, rejectionReason }` |
| GET | /api/attachments/:fileId | staff (author: own uploads) | for previews |
| GET | /api/public/attachments/:fileId | public | streams only if VALID, in the current approved snapshot, and the notice is visible now |

## Domain events, audit, admin

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | /api/domain-events | REVIEWER, ADMIN | `type, entityId, page, limit` |
| GET | /api/audit-logs | ADMIN | `action, entityType, entityId, page, limit` |
| GET | /api/admin/summary | ADMIN | counts by effective status, pending reviews, upcoming events, recent domain events and audit |
| GET | /api/admin/pending-count | REVIEWER, ADMIN | `{ pendingReviews }` |
| GET | /api/health | public | `{ status: "ok" }` |

Ready-to-run examples: `docs/api.http`.
