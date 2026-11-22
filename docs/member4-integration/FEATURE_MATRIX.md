# Feature status and D01–D06 mapping — 2026-11-22

Evidence below is local synthetic verification on main a53db54 plus the final-review changes. No production certification is implied. The original plans/prototypes remain historical records, not statements about today's live routes.

| Assignment | Current implementation and boundary | Actual verification | Remaining limit |
|---|---|---|---|
| D01 journeys, architecture and requirements | Existing plans preserved; this matrix maps current functionality | Read-only architecture/document review | Official task-division document unavailable; alignment pending |
| D02 reusable layout/forms/cards/states | Live pages reuse frontend/src/components/layout and ui; no duplicate Member 4 shell mounted | Full frontend suite; Chrome mobile menu/skip link, error and empty UI | Full screen-reader/contrast audit not performed |
| D03 public notices/details | Team public home/notices APIs and approved revision projection | Publication/time-revision/security suites; HTTP PUBLIC/CAMPUS/draft/withdrawal; browser detail/Back | Team B owns publishing; no production-data verification |
| D04 notice keyword/category/department/date/sort | member4/search/liveSearch.js -> /api/public/notices; scalar filters, inclusive KST date endpoints, default/newest sort | Backend schema contracts, URL UI tests, live HTTP filters, browser filtered result | No multi-select OR, unified ranking, oldest/title sorts or public workflow-status filter |
| D04 professor search | /api/professors; name/subject keyword, department, alphabetical backend order | Professor backend suite; live HTTP AI/BSC filter; Chrome fictional professor card | Not unified with notices; no notice dates/category/sort for professors |
| D04 pagination/count/URL/reset | Server metadata and Router query parameters | Live HTTP disjoint pages; frontend Next/Back/restored filters/reset; browser detail/Back | Explicit return-to-search link/focus restoration on shared detail page pending |
| D05 public items/photos | /items is an unavailable state; C API not mounted | HTTP missing route 404; browser unavailable page | BLOCKED by C/L; staged implementation must be adapted and verified |
| D05 notice bookmarks | /api/member-tools/bookmarks | Cookie-auth add/remove/idempotency, owner isolation and withdrawn projection; browser save/list | Item bookmarks unsupported |
| D05 topic follows | /api/member-tools/follows | Duplicate prevention, category/department matching, unfollow/history/account regressions | No item topic contract |
| D06 preferences | Existing member-tools preferences; inApp/notices only | API/frontend preference changes and account isolation; Chrome confirmation | No email/push or prototype compact/resolved settings |
| D06 inbox/read/count | /api/member-tools/inbox; read/unread/read-all | Backend, HTTP and browser suites; cross-owner denial, unread transitions | Refresh-based, not realtime; opening does not implicitly mark read |
| D06 event delivery | syncInbox reads authentic publishing DomainEvents; unique owner/eventId delivery | Concurrent reads, retries, follow timing, scheduled start and disabled intervals | C CaseEvents are separate and not consumed |
| Member 1 compatibility (D05/D06 dependency) | Existing MFA and copied-token logout revocation; no D auth implementation | TOTP/backend compatibility, recovery-code HTTP/Chrome sign-in, 401 while challenged, owner isolation, copied-cookie 401 after logout | Windows-specific permission/symlink tests skipped; production security acceptance not claimed |
| D06 safe source navigation/privacy | Server eligibility recheck, client noticeDestination allowlist | Withdrawn/restricted title suppression, zero unavailable unread contribution, opening denied; URL contract tests | Explicit return-to-inbox UX pending; no C detail destination |

## Search semantics

Different scalar filters narrow results together. Notice queries of three or more characters use MongoDB text-search semantics; shorter queries use escaped contains matching. This is not the prototype all-words/OR-multiselect search. Professor queries use escaped name/subject contains matching. Backend results/counts/sort remain authoritative. Unknown legacy URL keys such as demo/status/account are not forwarded; invalid supported values or duplicate supported keys are rejected before requests. Alphabetic but unknown department codes may be rejected by the backend.

## Notification semantics

Deliveries are generated when the inbox is fetched/refreshed. Scheduled publication becomes eligible at its start time, without claiming a background worker has run. Disabling preferences gates future delivery; re-enabling does not replay the disabled interval. Follows do not replay earlier publications. Existing unavailable history remains generic, without title/summary/destination; unread counts exclude ineligible sources. Identity, account separation and visibility checks occur on the server; local tests are not production security approval.
