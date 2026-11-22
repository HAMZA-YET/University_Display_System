# Team dependencies — final review, 2026-11-22

| Owner | Available boundary | Approval or work still needed |
|---|---|---|
| A: identity/media | Member 1 PR #4 MFA, active-user/tokenVersion checks, copied-token logout revocation and security suites; Member 4 compatibility tests pass | Production audience groups, identity/media setup and C photograph eligibility/revocation. No auth/user-model changes authorized here |
| B: notices/events | Approved snapshots, visibility/window rules, publication DomainEvents; Member 4 search/bookmark/inbox consume these | Confirm scalar search/date/default-newest semantics; explicit shared detail-return/focus UX |
| C: Lost & Found | PR #2 merged; models/services/pages/tests exist under member3-lost-found | Adapt client/server paths to frontend/backend, resolve shared imports, mount routers/pages, agree canonical /items vs /lost-found, register/run C tests, verify claims/media/handover/privacy |
| L: directory/shared integration | Live professor/departments API and root workspaces | Approve C adaptation and shared routes; confirm final assignment, accessibility acceptance, unified search and event ownership |

## Member 3 requirement-by-requirement status

- Models, report/list/search/filter logic, student/admin pages, claim decision and handover: IMPLEMENTED BUT NOT INTEGRATED.
- Router mounts in backend/src/app.js and page registration in frontend/src/App.jsx: MISSING.
- Navbar: PARTIALLY IMPLEMENTED; existing /items leads to a truthful unavailable screen.
- Authentication/ownership/serialization, photo gateway, concurrent-claim indexes and status transitions: source exists, runtime behavior NOT VERIFIED in the shared app.
- C automated tests/build compatibility: BLOCKED. Backend test imports ./helpers/testApp and shared model/utils paths absent within its staged subtree. Frontend API imports ./client absent there. Existing workspace commands do not include staged C tests.
- React/Zod compatibility: NOT VERIFIED for C. Shared workspace uses React 19/Zod 4 and passes its own suites; C validation uses legacy errorMap options requiring validation against Zod 4, not assumed broken or compatible.
- Notification delivery: PARTIALLY IMPLEMENTED. C stores deterministic LF_* events in LostFoundCaseEvent; Member 4 consumes publishing DomainEvent types only. Agree recipient authorization, privacy-safe source resolution, delivery acknowledgement/idempotency and destinations before connecting them.

C/L must also confirm immediate publication versus moderation, public contact consent, administrator claim policy and footer/sample-label decisions. Approval is not handover; Member 4 must not implement ownership decisions. Do not run staged seed instructions against any production database.

## Independent versus blocked verification

Notice/professor search, pagination, URL behavior, bookmarks, notice follows/preferences/inbox, schedule/privacy/account tests run independently and passed. Item discovery/detail/media, item bookmarks, claims and LF notifications remain blocked. No percentage is assigned: staged code coverage and runtime integration are different measures.

## Shared integration concerns

App.jsx lazy loading and the root lockfile/dev-tool changes are already merged through PR #3; they are not new final-review changes. No shared route/lock/config edit is proposed now. Lazy-chunk rejection recovery and explicit detail return/focus remain follow-up review items. No root README, Member 3 implementation, auth, user model, production configuration or database changes are included.

## Updated-main preservation and compatibility

Member 1 PR #4 is now included through main a53db54. Auth/MFA/token revocation/user-model/security production files and tests match origin/main exactly; no conflicts or modifications to them were needed. Non-MFA synthetic accounts still work. MFA-only challenges cannot access personal Member 4 APIs; verified TOTP/recovery sessions can, and logged-out copied tokens cannot. Optional privileged-MFA rollout tests remain the unchanged Member 1 responsibility and ran in the full suite. Three Windows permission/symlink cases remain skipped, not passed. Production identity/media/delivery acceptance still belongs to A/L.

The prior baseline in older reports was 529f459. Updated test counts are in TEST_RESULTS.md; do not reuse old counts as proof of current security compatibility. No C mounting/events or shared return/focus changes are included in this 13-file proposal.
