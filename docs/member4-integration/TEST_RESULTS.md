# Actual results — continued local integration, 2026-11-19

Workspace: the isolated repository checkout
Environment: Windows / Node 24.22.3 / npm 12.2.2. No real accounts, production credentials or external database were used. All DB suites used fresh mongodb-memory-server replica sets and per-file random databases. Browser fixtures used a separate generated loopback test DB, not the Jest databases.

## Final checks

| Command/check | Actual outcome |
|---|---|
| Root npm test | PASS, exit 0: backend Jest 12 suites / 118 tests, operator Node 6 tests, frontend Vitest 11 files / 30 tests, Member4 Node runner 11 entries. Temporary npm PATH shim and cache environment applied only to this shell. Raw root-test.log below. |
| node scripts/member4/test-backend.cjs | PASS: 118 Jest tests + 6 operator tests, including database-backed auth/security/publication/revision/events/directory/member-tools. New runner itself verified. |
| npm run test -w frontend | PASS: 30 tests / 11 files. Saved JSON report has success=true, failed=0. |
| npm run test:member4 | PASS: 11 Node entries = 3 legacy files containing 56 grouped checks, 5 live-search subtests and 3 integration-contract subtests. Legacy checks are synthetic, not production security evidence. |
| npm run test:readiness -w backend | PASS: six readiness tests (also included in full Jest suite). |
| npm run lint -w frontend | PASS with updated ESLint 10.15.0. |
| npm run build -w frontend | PASS Vite 8.3.8; no chunk exceeds 500 kB and no large-chunk warning remains. |
| npm audit --json | PASS, exit 0: zero vulnerabilities at audit time, previously four moderate tool-chain findings. |
| nodemon compatibility | Version 3.1.11, child start + file-change restart observed outside sandbox; stopped child, verified no smoke fixture process remained. Sandbox restart attempt was blocked by process restrictions, not counted as successful. |
| node scripts/member4/verify-local-api.mjs | PASS: 11 real-HTTP groups against disposable loopback API. Includes ready DB, public/CAMPUS/draft/withdrawn eligibility, strict filters, login/me/logout, 401/403, disjoint pagination, bookmark idempotency/identity rejection/owner isolation, follows/preferences, inbox dedup/read/unread/all/open and cross-owner denial, missing C endpoint 404. |
| Build mock-sentinel scan | PASS: legacy synthetic-account, notebook-demo, lost-blue-notebook, Synthetic Alpha and old notice fixture sentinels absent from all built JS files. This is evidence for disconnected prototypes, not a universal content audit of an unknown production DB. |
| git diff --check | PASS; six reports/source changes are prepared on a local review branch only. |

## MongoDB environment fix

Prior: EPERM creating the user-home cache and an interrupted archive (~169 MB). Current: configured node_modules/.cache/mongodb-binaries, enabled library-supported resume, downloaded the remaining ~429.9 MB of the official 7.0.24 archive, and let mongodb-memory-server extract/start normally. No checksum or security check was disabled. scripts/member4/test-backend.cjs sets these local options and strips inherited MONGO_URI/MONGODB_URI/MONGO_TEST_URI, JWT, bootstrap and blob values before child test setup creates its own memory DB. Existing production/test setup source was not modified.

## Browser end-to-end evidence

Built preview http://127.0.0.1:5187 proxies to test-only API on loopback 5000. Actually observed: guest public search (one public sample, no CAMPUS/draft/withdrawn data); category/newest/keyword URL; notice detail with fictional label; browser Back restoring filters; successful cookie login as fictional READER; home includes eligible CAMPUS sample only after login; bookmark save confirmation and saved listing; new General follow; preference save confirmation; inbox displays two real DB deliveries; mark-read changes unread count from 1 to 0; Open notice reaches eligible CAMPUS detail; logout returns to public home without the campus sample; guest direct CAMPUS detail shows generic unavailable page. /items says service not connected, never inserts mocks. Mobile search at 320px: document width 305px, no overflow; Enter opens/closes menu. Single unmatched keyword zzzznorecord92348 produces zero-results state. This uses actual backend calls, not mocked HTTP responses.

Observed keyword behavior: backend MongoDB text search can match individual terms in a multiword/hyphenated query, unlike the legacy prototype's all-words predicate. This is documented, not silently redefined. Full backend tests remain authoritative for eligibility and filter semantics.

No full screen-reader conformance, every device/browser, actual C item lifecycle or production deployment was verified. C discovery remains blocked, so its mock tests cannot be reported as integrated Lost & Found tests.

## Corrected failures during this continuation

The first dependency update attempt encountered sandbox EPERM mkdir; authorized normal filesystem installation succeeded. Initial lazy Login caused one existing Setup.test.jsx failure (email field not immediately present); restored eager Login without editing that test, then all 30 passed. A subsequent import cleanup briefly produced duplicate-import build errors; corrected, reran lint/build and full test pipeline successfully. None of these failed attempts is represented as a pass.

## Dependency and bundle evidence

Four moderate findings were transitive effects of [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), not four independent CVEs. Patched ESLint 10.15.0/config-array 0.23.6 use minimatch 11.0.9. Pinned nodemon 3.1.11 uses unaffected minimatch 3.1.5. No production dependency version set changed (old/new lock comparison). No forced major overrides.

Before optimization: entry JS ~614,450 bytes. Final: entry 406,934; preloaded Button 50,455; client 59,606; labels 1,027; startup JS total 518,022 bytes, approximately 15.7% lower than the old entry. This is an output-byte comparison, not a measured network-speed claim. CSS stays ~48.51 kB; optional pages/chunks load on demand. Existing 500 kB threshold unchanged.

## Saved raw evidence (outside application)

the local evidence directory (outside this repository)

- root-test.log: full final root test output.
- backend-tests.json: 118 passes, zero failures.
- frontend-tests.json: 30 passes, zero failures.
- api-e2e-results.json: 11 real-HTTP groups.
- npm-audit-final.json: zero current findings.
- dependency-version-diff.json: exact compatible development version changes.
- bundle-and-test-summary.json: built JS sizes/mock-sentinel scan.

Local results do not assert GitHub Actions success for this unpublished diff. No workflow was triggered or changed.

Final preservation verification: 200 original source/document files match the untouched backup byte hashes; differences 0. Prior integration checkout remains clean at 02472a0858590e5a8ae0d57fbd6f015301c2722c. Review base remains 0d67f079e6732ac5caf8265e477511a8a9860669; the feature commit is local only and no remote writes occurred. Exact added/modified paths are in CHANGES_IMPLEMENTED.md and final-file-manifest.json.

## Review-preparation rerun

Latest main was checked read-only and still equals base 0d67f079e6732ac5caf8265e477511a8a9860669. Root npm test passed again: backend 118, operator 6, frontend 30 and Member4 Node runner 11 entries. Lint/build/audit also passed again (zero audit findings). Review-preparation test log is kept outside the commit. Browser/real-HTTP evidence above describes the completed integration verification, not an invented new browser rerun. Lost & Found, explicit detail-return UX, official assignment alignment, full accessibility coverage and production deployment remain unverified/pending.
