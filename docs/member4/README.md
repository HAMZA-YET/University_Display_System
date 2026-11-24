# Member 4 — Discovery and member tools (D01–D06)

> November 25 update: item bookmarks, server-paginated combined search and recipient-scoped lost-and-found inbox delivery are now integrated. See `docs/member4-integration/LOST_FOUND_CONNECTION.md` for the current contracts and limits. The older dated results and missing-feature statements below are retained as historical evidence.

> Presentation design update: the home page now uses local official KDU photographs and an accessible manual gallery. Asset provenance and the video source are documented in `docs/design-assets.md` and `docs/kdu-media-manifest.json`. Existing team features and API contracts remain in use.

Current status (2026-11-22), verified on main a53db54fa24f0237ef42bcad2f9a2eb33a4add45: Member 4 PR #3 and Member 1 security PR #4 are merged. The shared React/Vite app mounts live search, saved interests and notifications, using the shared cookie session and real backend APIs. Legacy mock adapters remain isolated historical test tools; current pages are not mock-only and require no new mounting.

See [current D01–D06 feature mapping](../member4-integration/FEATURE_MATRIX.md), [actual final verification](../member4-integration/TEST_RESULTS.md), and [remaining dependencies](../member4-integration/TEAM_DEPENDENCIES.md).

## Routes and data

- `/`, `/notices`, `/notices/:id`: shared public notice views, approved snapshots and visibility rules.
- `/search`: connected notice or professor search, scalar filters, pagination and URL state.
- `/saved-interests`: authenticated notice bookmarks, category/department follows and notification preferences.
- `/notifications`: authenticated, refresh-based inbox, counts/read state and visibility-rechecked notice navigation.
- `/items`: explicit unavailable state. Member 3 PR #2 is merged but staged under member3-lost-found, not mounted into backend/frontend. Do not claim item discovery, photographs, claims or item events are connected.

The team owns shared layout/UI/authentication and publishing. Member 4 does not replace those systems or implement ownership decisions. All synthetic preview records are explicitly fictional; no mock fallback is displayed on API failure. The original standalone D02 showcase and detailed plans remain preserved separately.

## Setup and verification

Use the root workspaces/lockfile, not a separate frontend installation. From the root, `npm ci` installs dependencies when needed; `npm run lint`, `npm run build`, frontend/backend tests and safe disposable preview instructions are in [REMAINING_WORK.md](../member4-integration/REMAINING_WORK.md). Do not use production credentials or seed/bootstrap commands for tests.

The earlier isolated test report in test-results.md is dated historical mock evidence. It does not describe the current mounted app. Official task-division alignment remains pending because the document is unavailable. Full production/security/accessibility approval is not claimed. D07/D08 are excluded.

Member 1 MFA and copied-token logout revocation are preserved and compatibility-tested with Member 4 personal tools using disposable accounts. The updated complete suite includes 173 backend passes (one Windows skip), 40 frontend passes, six operator passes, two security CLI passes (two Windows skips), 11 Member 4 runner entries, 13 HTTP groups and six Chrome groups. Historical mock checks do not prove production authorization. All logs/screenshots/fixture credentials and the PR draft remain local, outside the approved 13-file commit scope.

## Official-media design verification

After building the frontend, start `scripts/member4/start-isolated-preview.cjs` and `scripts/member4/start-isolated-frontend.mjs` for disposable local data on ports 5017/5187. Set `UIDS_PLAYWRIGHT_MODULE` if Playwright is installed outside the workspace. Run the HTTP verifier before the shared browser verifier: its first inbox read materializes the pre-seeded deliveries before the browser changes notification preferences.

```sh
node scripts/member4/verify-local-api.mjs
node scripts/member4/verify-browser.mjs
node scripts/member4/verify-lost-found-browser.mjs --skip-previous-design-comparison
node scripts/member4/verify-kdu-design.mjs
```

The explicit `--skip-previous-design-comparison` flag is for the requested redesign: it omits only the old header/footer byte comparison, leaving the functional journeys enabled. The comparison remains on by default for future feature-only integrations. `verify-kdu-design.mjs` checks media hashes, browser decoding, gallery controls, local asset requests, navigation and responsive layout, and saves screenshots/results in ignored `node_modules/.cache/kdu-design/`. No production credentials or records are used.
