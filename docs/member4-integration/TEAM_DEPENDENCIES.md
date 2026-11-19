# Team dependencies and approval boundaries

| Owner | Available and locally verified | Decision still needed |
|---|---|---|
| A — identity/media | Cookie identity, active/tokenVersion lookup, authenticated owner-scoped services, public attachment gateway; auth/security tests pass using fictional users | Institution audienceGroups and production identity/media setup; eligible C photos/revocation |
| B — publishing | Public approved snapshots, publication/revision/window visibility and authentic DomainEvents; backend and browser tests pass | Review category/date/default-newest search semantics, KST bounds and shared detail-return UX; no lifecycle/schema change proposed |
| C — Lost & Found | PR2 reviewed as an unmerged staged package; live main item endpoint absent | Approve path adaptation, mounts, public report/claim/photo rules, alias/navigation, item bookmark/event contracts; no claim/handover decisions implemented by D |
| L — shared integration/directory | Workspace lock, existing directory/departments, protected member-tools persistence, all existing test suites pass locally | Review shared App loading boundaries and compatible dev-dependency pin/root lock; unified search decisions; final official assignment and submission approval |

## Local shared modifications explicitly disclosed

- frontend/src/App.jsx: lazy optional route imports and Suspense fallback; common public screens and Login eager. All paths/role guards unchanged. Existing setup/login test preserved and passes.
- backend/package.json: ONLY devDependency nodemon pinned to 3.1.11 (original compatible range included it), removing vulnerable minimatch 10. Start/restart tested.
- package-lock.json: compatible ESLint toolchain and nodemon resolution/hoisting; production dependency version sets unchanged. Zero findings in final npm audit.

These are authorized local optimization/security changes from the continuation request and require team review before any later publication. Backend production source, schemas, publishing authorization, shared notice presentation, CI, Vercel and root README remain unchanged. Test-only scripts cannot connect to an externally supplied production database.

## Intentionally not performed

No PR2 merge or shared.diff application, C routes/business decisions, production sample-content installation, new permanent API/schema/auth system, real credentials/accounts/data, upload/PR/merge/deployment. Explicit NoticeCard/NoticeDetails return-state integration remains a review item. Old Member4 prototype mocks are still isolated, not silently promoted into production routes.

Evidence and exact feature status are in FEATURE_MATRIX.md and TEST_RESULTS.md. Original source/document backup and prior integration checkout remain preserved. Team approval and production readiness are not claimed.

## Four concerns reviewed for the local review branch

| Concern | Included in this commit? | Decision / evidence |
|---|---|---|
| Route loading | Yes: App.jsx only | Optional pages lazy-loaded; Login/public screens and all role guards retained. Full test pipeline passes. Team review pending before submission/merge. |
| Dependency lockfile | Yes: backend dev watcher pin + root lock | Compatible ESLint/minimatch fixes and nodemon 3.1.11. No production dependency version changes. Zero current audit findings; watcher start/restart verified. |
| Lost & Found wiring | No | C PR2 not mounted; /items remains unavailable and missing API returns 404. C/L must approve route and business-logic integration separately. |
| Detail-return navigation | No | Browser Back preserves search state. Explicit return-to-search/inbox and focus wiring remain a separate shared-page review. |

The user authorized staging/committing this existing local scope for team review. This is not team approval or permission to publish.
