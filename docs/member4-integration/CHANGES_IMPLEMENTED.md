# Local changes and evidence

All updated paths are within the isolated repository checkout. Original source is baseline main 0d67f079e6732ac5caf8265e477511a8a9860669, except additions indicated 'new'. Changes are prepared on feature/member4-live-integration for local review only; team approval and remote publication are not implied.

| Original -> updated relative path | Why / Member4 requirement | Evidence / review |
|---|---|---|
| frontend/src/member4/search/liveSearch.js -> frontend/src/member4/search/liveSearch.js | D04: verified notice category/date/sort contract, safe URL state, inclusive KST-to-ISO bounds and validation | Backend-schema contract, frontend and real-HTTP filter tests |
| frontend/src/member4/search/SearchPage.jsx -> frontend/src/member4/search/SearchPage.jsx | D04: reuse shared controls for live filter UI, reset notice-only fields on source switch | Rendered control test, browser search/Back |
| frontend/src/member4/data/memberApi.js -> frontend/src/member4/data/memberApi.js | D06: validate returned notice navigation destination | Existing API unchanged; destination regression and browser open |
| new -> frontend/src/member4/data/noticeDestination.js | D06: only verified local notice path allowed; no external/management/item redirects | Node contract assertions |
| new -> frontend/src/member4/search/integration.test.jsx | URL form restoration/submission/reset | Frontend test suite |
| new -> tests/member4/integration-contracts.test.mjs | Actual publicListQuery schema agreement and destination failures | Member4 Node suite |
| frontend/src/App.jsx -> same path (SHARED) | Safe bundle optimization: lazy optional routes with existing LoadingState; Login/public routes eager | Route paths/ProtectedRoute guards unchanged; setup regression + full tests + built browser journeys. Team review required before upload |
| backend/package.json -> same path (SHARED dev tool only) | Pin nodemon 3.1.11 to remove vulnerable minimatch 10 dependency without forced major override | Version/start/restart smoke and audit. Team review required |
| package-lock.json -> same path (SHARED) | Lock compatible ESLint 10.15.0 and its fixed transitive packages; pin watcher resolution | Full suites/audit; production dependency versions unchanged. Team review required |
| new -> scripts/member4/test-backend.cjs | Reproducible writable/resumable MongoDB test cache; inherited production DB/signing/blob values discarded | Full backend 118 + operator 6 pass via this runner |
| new -> scripts/member4/start-isolated-preview.cjs | Loopback ephemeral replica set, random test DB/signing key, explicitly fictional accounts/notices, disabled attachments | Actual browser and real-HTTP local journeys; no external DB URI accepted |
| new -> scripts/member4/verify-local-api.mjs | Real-HTTP test checks only fixed loopback fixture harness | 11 check groups passed; test-data file ignored under node_modules/.cache |

The six requested docs/member4-integration reports are updated. Existing Member4 mock adapters and all historical D01–D06 documentation remain preserved. Production backend source, publishing/claim logic, schemas, shared NoticeCard/NoticeDetails, root README, CI and Vercel files were NOT modified. No extra production dependency or endpoint was added.

Dependency version changes: ESLint 10.11.0 -> 10.15.0; config-array 0.23.5 -> 0.23.6; minimatch 10.2.6 -> 11.0.9 through the compatible ESLint dependency; nodemon 3.1.14 -> pinned 3.1.11 using unaffected minimatch 3.1.5. Related dev transitives: regexpp 4.12.2 -> 4.12.3, acorn 8.18 -> 8.19, brace-expansion deduplication and nonrecursive-glob-match addition. Existing version ranges support the direct versions; no forced major tooling upgrade. Raw version diff is retained outside the checkout in the evidence directory.

## Final exact file manifest

Modified (6):
- backend/package.json
- frontend/src/App.jsx
- frontend/src/member4/data/memberApi.js
- frontend/src/member4/search/SearchPage.jsx
- frontend/src/member4/search/liveSearch.js
- package-lock.json

Added (12):
- docs/member4-integration/CHANGES_IMPLEMENTED.md
- docs/member4-integration/FEATURE_MATRIX.md
- docs/member4-integration/INTEGRATION_AUDIT.md
- docs/member4-integration/REMAINING_WORK.md
- docs/member4-integration/TEAM_DEPENDENCIES.md
- docs/member4-integration/TEST_RESULTS.md
- frontend/src/member4/data/noticeDestination.js
- frontend/src/member4/search/integration.test.jsx
- scripts/member4/start-isolated-preview.cjs
- scripts/member4/test-backend.cjs
- scripts/member4/verify-local-api.mjs
- tests/member4/integration-contracts.test.mjs

No files were deleted. The absolute local file manifest is retained outside the repository.
