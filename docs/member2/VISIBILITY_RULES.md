# Public visibility rules

One module decides what the public can see:
`server/src/modules/notices/visibility.js`.

- `buildPublicEligibilityFilter(now, viewer)` returns the MongoDB query.
- `isPubliclyVisible(notice, now, viewer)` is the same rule in JavaScript.

Every public path uses it: notice list, notice detail, search, home page,
events list, event detail and attachment download. User filters are always
combined with `$and`, so a filter can only narrow the result, never widen it.

## The rule

A notice is visible to a viewer only when ALL are true:

1. `approvedRevision` exists
2. stored status is `APPROVED` (not WITHDRAWN, ARCHIVED or anything else)
3. `publicationStart <= now` (start is inclusive)
4. `publicationEnd` is null OR `now < publicationEnd` (end is exclusive)
5. visibility allows the viewer: PUBLIC for everyone, CAMPUS for any signed-in user
6. audience matches the viewer when the viewer carries audience groups (see DECISIONS.md)

Visibility, audience, department and category are read from the approved
snapshot copy (`publicSearch`), never from the working copy. Public content
(title, summary, body, attachments) is always read from the approved Revision.

The rule never checks `status === "PUBLISHED"` (that value is never stored),
and it never depends on a background job. `now` comes from the injectable
clock (`server/src/utils/clock.js`), so tests can fix the time.

## Boundary examples

Window: start 2026-12-02 00:00:00.000 UTC, end 2026-12-04 00:00:00.000 UTC.

| Time (UTC)                 | Visible? | Effective status |
|----------------------------|----------|------------------|
| 2026-12-01 23:59:59.999    | No       | SCHEDULED        |
| 2026-12-02 00:00:00.000    | Yes      | PUBLISHED        |
| 2026-12-02 00:01:00.000    | Yes      | PUBLISHED        |
| 2026-12-03 23:59:59.999    | Yes      | PUBLISHED        |
| 2026-12-04 00:00:00.000    | No       | EXPIRED          |
| 2026-12-04 00:01:00.000    | No       | EXPIRED          |

These six cases are tested for list, detail, search, events and attachment
download in `server/tests/notices.time-revisions.test.js`.

## Related rules

- Action deadline never affects visibility. Only `publicationEnd` controls expiry.
- An event is public only when its parent notice is public. A CANCELLED event
  stays visible (labelled) while its notice is visible.
- An attachment downloads only if it is VALID, belongs to the current approved
  revision, and that notice is publicly visible. This is checked on every request.
- A request for a notice the viewer may not see returns `404 NOT_FOUND`, so the
  API does not reveal that it exists.
