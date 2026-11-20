# UIDS Member 4 integration audit — continuation, 2026-11-19

Workspace: the isolated repository checkout
Baseline: main 0d67f079e6732ac5caf8265e477511a8a9860669. Existing local changes were retained; implementation preserved the existing checkout; review preparation creates a local commit only, with no push, merge or deployment. Original Member4 source/documents and the old integration checkout remain separate.

## What is connected

Root npm workspaces frontend/backend and the root lockfile define the application. React/Vite/React Router uses the shared AuthProvider and cookie Axios client; Express/Mongoose supplies real public and protected endpoints. D03 home/notices/details already use the team APIs. D04 uses /api/public/notices and /api/professors, now with the verified category/date/sort fields. D05 notice bookmarks/follows and D06 preferences/inbox use /api/member-tools with database-derived req.user. No production Member4 route imports the old mocks.

Connected APIs are real code, not proof that their current database contains real university information. All data created for this work is fictional in a disposable loopback replica set. Original sample content is marked [Sample]/[Demo], public notice cards/details show sample badges, and the footer identifies sample records as fictional. The built JavaScript was scanned and contains none of the legacy synthetic account/item/media sentinels. No fictional fallback is returned when live APIs fail.

## Prior test-environment failure resolved

The earlier backend test failure was EPERM at the default MongoDB cache, followed by an interrupted 599.7 MB binary download. The remaining archive was resumed with MONGOMS_RESUME_DOWNLOAD=true in node_modules/.cache/mongodb-binaries. Official mongodb-memory-server download/extraction completed, and full DB-backed tests now pass. scripts/member4/test-backend.cjs makes the cache/resume settings repeatable and removes inherited production DB/signing/blob variables before Jest; the existing global setup creates a fresh test replica set and random databases. No production database or account was used.

## Dependency and performance review

The four moderate npm findings shared minimatch advisory GHSA-g3hv-75wg-m249 (development tooling). Compatible ESLint 10.15.0/config-array 0.23.6 resolve minimatch 11.0.9. Latest nodemon 3.1.14 still depended on affected minimatch 10, so backend devDependency is pinned to compatible 3.1.11 using minimatch 3.1.5. Original ^3.1.7 allowed this release. No production dependency versions changed. Final npm audit reports zero findings; this is a point-in-time audit, not a guarantee against future advisories. No force/major upgrade or major transitive override was used.

Optional page imports in frontend/src/App.jsx now use React.lazy/Suspense. Paths, role guards, AuthProvider, API behavior and publishing workflows are unchanged. Login stays eager because an existing setup-to-login regression requires immediate form availability. Final entry JS 406,934 bytes; entry plus preloaded JS 518,022 bytes, down from about 614,450 bytes. All individual chunks are below the existing 500 kB warning threshold; the warning was not suppressed. See TEST_RESULTS for actual checks and earlier corrected failures.

## Member 3 and shared boundaries

PR #2 was rechecked read-only: open, unmerged, head 3e640f655e2f7c6a4918a5d906b44fd02aada732, base 0d67f079e6732ac5caf8265e477511a8a9860669. Its 45 files are staged under member3-lost-found/client and server with shared.diff. main uses frontend/backend. /api/public/lost-found/items returns 404, and /items visibly reports service not connected. No C code or speculative routes were added. Review/mounting, /items vs /lost-found, photo eligibility, item bookmarks and item events remain C/L decisions.

The continuation explicitly authorized compatible dependency fixes and safe bundle optimization in this isolated copy. Shared-file changes are limited to App.jsx (loading boundaries), backend/package.json (dev watcher pin) and package-lock.json. No backend production source, notice lifecycle/schema, shared notice components, root README, CI or Vercel configuration changed. Explicit detail return-context links remain pending approval. Official Member4 task-division alignment remains unverified because the document is unavailable locally.
