# Administrator sample content

After signing in as an administrator, open the Admin page and click **Install sample content**. Installation requires an explicit button click and an authenticated administrator API request; it never runs during build, startup, deployment, or registration.

The installer adds 6 demonstration departments, 6 fictional professor profiles with local avatar artwork, 12 clearly labelled fictional notices and 6 linked calendar events. Notices use approved revisions and public search snapshots, so lists, search, bookmarks and event views use the real application APIs. Dates are relative to the first installation and event sessions begin at 14:00 Asia/Seoul. Example events include postponed and cancelled states. Notices stay published for 60 days.

Every professor name and notice/event title identifies demonstration content, and every notice body says it is fictional and not an official university announcement. Contact addresses use the reserved `.example` domain. The installer creates no accounts, passwords, permissions, file uploads or real event registrations. The signed-in administrator is the sample author/reviewer. Generated sample publication events are explicitly excluded from inbox delivery, so installation does not notify existing users. Later genuine user actions use the normal publication workflow.

Existing department codes are reused without editing their metadata or marking them as samples. All newly inserted records have immutable internal sample keys and deterministic identifiers. Repeating installation inserts missing examples without overwriting existing records, edited content, dates or user read state. A modified/withdrawn sample notice is never republished by installation. Status counts describe marked sample records only; an installation can be complete with fewer than 6 sample departments when real departments were reused.

## API

All endpoints require a current administrator session and return `Cache-Control: private, no-store`.

- `GET /api/admin/sample-content` returns `{data:{installed,complete,counts,expected}}` with counts for departments, professors, notices and events.
- `POST /api/admin/sample-content` with `{}` explicitly installs examples and returns the same status plus `created` counts.
- `DELETE /api/admin/sample-content` requires the separate body `{"confirm":"REMOVE_SAMPLE_CONTENT"}` and returns the same status plus `removed` counts. Installation never invokes removal.

Removal only targets this installer's marked records. It preserves edited sample notices/events/professors and notices with user-authored corrections. Shared departments referenced by remaining notices, revisions, professors, users or department follows are preserved. All user accounts, real content, bookmarks, preferences, follows and audit history remain intact. Retained examples remain included in sample status counts. An administrator must separately confirm removal; the website does not remove examples as part of installation.

Installation/removal use MongoDB transactions and a singleton serialization record. A failed install commits no partial content. An unsupported database returns `SAMPLE_CONTENT_UNAVAILABLE` rather than claiming successful storage.
