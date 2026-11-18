# Contracts for other team members

These shapes are stable interfaces. Member 4 (D: public discovery, unified
search, notifications) can build on them without reading this module's code.

## Public notice (GET /api/public/notices/:id)

```json
{
  "id": "6740c0...",
  "title": "Final examination timetable for all departments",
  "summary": "The final examination timetable is published.",
  "body": "Plain text with blank lines between paragraphs.",
  "category": "EXAM",
  "department": "ALL",
  "audience": "STUDENTS",
  "visibility": "PUBLIC",
  "publishingOffice": "Academic Affairs Office",
  "contactEmail": "academic.affairs@example.edu",
  "actionDeadline": null,
  "priority": "URGENT",
  "pinned": true,
  "publishedAt": "2026-11-16T01:24:00.000Z",
  "publicationEnd": null,
  "updatedAt": null,
  "attachments": [
    { "fileId": "a1b2...", "fileName": "final-exam-timetable.pdf", "fileType": "application/pdf", "size": 609,
      "downloadUrl": "/api/public/attachments/a1b2..." }
  ],
  "event": null
}
```

- `updatedAt` is set only when an approved correction replaced the content.
- List items have the same shape without `body` and `event`.
- Never present: reviewer identity, review reasons, review history, working
  copy, pending revisions, version numbers, storage paths, attachments that
  are not VALID.

## Public event (GET /api/public/events/:id)

```json
{
  "id": "6740c1...",
  "noticeId": "6740c0...",
  "noticeTitle": "University sports day",
  "department": "ALL",
  "title": "University sports day",
  "start": "2026-11-29T00:00:00.000Z",
  "end": "2026-11-29T08:00:00.000Z",
  "timezone": "Asia/Seoul",
  "allDay": false,
  "venue": "Main Field",
  "venueBuilding": null,
  "venueRoom": null,
  "organizer": "Student Council",
  "state": "POSTPONED",
  "storedState": "POSTPONED",
  "cancellationReason": null,
  "postponementReason": "Heavy rain is forecast for the original date.",
  "originalStart": "2026-11-22T00:00:00.000Z",
  "originalEnd": "2026-11-22T08:00:00.000Z"
}
```

`state` is one of SCHEDULED, POSTPONED, CANCELLED, COMPLETED (COMPLETED is
computed when now >= end and the event is not cancelled).

## Domain event (collection `domainevents`, GET /api/domain-events)

```json
{
  "eventId": "2f1d6c1e-....-5...-....-............",
  "idempotencyKey": "NOTICE_PUBLISHED:6740c0...:1",
  "type": "NOTICE_PUBLISHED",
  "entityType": "NOTICE",
  "entityId": "6740c0...",
  "entityVersion": 1,
  "action": "approve",
  "actor": "6740bf...",
  "source": "uids.publishing",
  "timestamp": "2026-11-16T01:24:00.000Z",
  "payload": { "...": "see below" },
  "deliveryStatus": "PENDING"
}
```

- `eventId = UUIDv5(namespace, type + ":" + entityId + ":" + entityVersion)`,
  namespace `6f1c2b8e-4d3a-5e7f-9a10-b2c3d4e5f601`. It is deterministic: the
  same logical operation always has the same ID. The collection has unique
  indexes on `eventId` and `idempotencyKey`, and inserts use upsert with
  `$setOnInsert`, so a retry never creates a second document.
- `timestamp` is the time of the original operation, not of a retry.
- Events are written only after the state change is saved, inside the same
  MongoDB transaction when the database is a replica set.
- `deliveryStatus` is for the consumer owned by Member 4. This module writes
  PENDING and never sends email, SMS or push messages.

### entityVersion meaning

| Type                                   | entityVersion             |
|----------------------------------------|---------------------------|
| NOTICE_PUBLISHED, NOTICE_SCHEDULED, NOTICE_CORRECTED | approved revision number |
| NOTICE_WITHDRAWN, NOTICE_ARCHIVED      | notice version after the change |
| EVENT_CREATED                          | 1 (emitted when the parent notice is approved) |
| EVENT_POSTPONED, EVENT_CANCELLED       | event version after the change |

### Payloads (public-safe fields only)

Notice events:

```json
{ "id": "...", "title": "...", "department": "BSC", "category": "EXAM", "visibility": "PUBLIC",
  "publicationStart": "...", "publicationEnd": null, "state": "APPROVED" }
```

Event (calendar) events:

```json
{ "id": "...", "noticeId": "...", "title": "...", "department": "ALL",
  "start": "...", "end": "...", "timezone": "Asia/Seoul", "venue": "...", "state": "POSTPONED" }
```

Note for consumers: NOTICE_SCHEDULED is emitted at approval time. No second
event is emitted when the start time arrives (visibility is computed, D1).
A consumer that notifies at go-live should schedule from `publicationStart`
and re-check `GET /api/public/notices/:id` at that time. A CAMPUS notice must
only be announced to signed-in users.

## Attachment gateway (Member 1 boundary)

`server/src/modules/attachments/attachmentGateway.js` defines:

- `upload(file, uploader) -> { fileId, fileName, fileType, size, validationStatus }`
- `getMetadata(fileId) -> { fileId, fileName, fileType, size, validationStatus, uploader } | null`
- `openStream(fileId) -> ReadableStream | null`

Call `setGateway(member1Gateway)` at start-up to replace the local adapter.
