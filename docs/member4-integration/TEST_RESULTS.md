# Actual test results — Member 4 on updated main, 2026-11-22

Base: `a53db54fa24f0237ef42bcad2f9a2eb33a4add45`, including Member 1 PR #4. Branch: feature/member4-final-review. Windows, Node 24.22.3. Tests use disposable local MongoDB replica sets, random per-suite databases and synthetic users. No production accounts, credentials, delivery or databases were used.

## Actual executed results

| Check | Result |
|---|---|
| npm ci --no-audit --no-fund | PASS: 697 packages installed from unchanged updated-main lockfile; no manifest/lock changes |
| npm test — backend Jest | 16 suites passed; 173 tests passed, one skipped, 174 total; zero failures |
| npm test — operator Node tests | Six passed; zero failures |
| npm test — Member 1 security CLI | Two passed, two skipped, four total; zero failures |
| npm test — frontend Vitest | 12 files, 40 tests passed; zero failures |
| npm test — Member 4 Node runner | 11 entries passed: three legacy mock files (17/18/21 grouped checks), five live-search tests, three schema/navigation tests |
| npm run test:readiness | One suite, six passed; overlaps full backend suite, not six additional unique tests |
| npm run lint | PASS |
| NODE_ENV=production npm run build | PASS: 598 modules, largest JS chunk 409.95 kB; no >500 kB warning |
| node scripts/member4/verify-local-api.mjs | 13 real-HTTP groups passed |
| node scripts/member4/verify-browser.mjs | Six Chrome groups passed; no browser page exceptions |
| Windows screenshot path with spaces | fileURLToPath/pathToFileURL round-trip assertion passed |

The three Windows-specific skips are unchanged Member 1 tests: Jest security-operations symlink-target rejection; CLI POSIX file permissions and CLI symlink-destination rejection. They were not disabled by Member 4 and are not reported as passes. Run those on a suitable non-Windows host before claiming their verification.

The inherited MongoDB postinstall hook was blocked by the existing npm allowScripts policy. The already downloaded official MongoDB 7.0.24 executable was copied outside node_modules before npm ci, hash-verified and restored to the local test cache; tests ran successfully. No allowScripts/security policy was changed. No fresh dependency advisory audit or production installation is claimed.

## Member 1 compatibility evidence

The unchanged auth-audit, security-accounts, security-evidence, security-operations and security CLI suites ran. Existing account tests cover MFA password confirmation, encrypted enrollment, OTP replay, challenge attempts/expiry, single-use recovery, copied-token logout denial, independent sessions and privileged MFA rollout.

A new Member 4 backend test enrolls a synthetic reader using existing routes, proves bookmarks/follows/preferences/inbox return 401 during an MFA-only challenge, verifies a new TOTP step, saves/reads a bookmark and inbox, verifies another member remains isolated, logs out and proves the copied MFA token returns 401 on all four personal APIs. No shared identity or user model code was altered.

The real-HTTP verifier confirms ordinary logout clears the HttpOnly cookie AND rejects the original copied JWT while preserving another valid session. Its MFA group verifies challenge denial, a real one-use recovery-code login, preferences/bookmarks/inbox, logout revocation and challenge/code replay denial. Recovery codes exist only in ignored synthetic fixtures and are consumed once; restart the disposable preview when depleted.

Chrome adds a real login/MFA form journey: challenge cannot access inbox, a recovery code completes login, saved interests/preferences load, account-menu logout clears the cookie, and replaying its copied JWT to bookmarks returns 401. Browser recovery-code coverage and backend TOTP coverage are distinguished. No screenshot or log intentionally captures a setup secret, key, cookie or recovery code.

## D01–D06 regression evidence

Notice/professor search, scalar filters, KST dates, default/newest sort, pagination, URL restoration/reset, invalid parameters, loading/error/retry and empty results are covered by schema/backend/UI/HTTP/browser checks. Bookmarks/follows/preferences/account isolation, notification read/unread/all/counts, schedule timing, delivery deduplication and withdrawn/restricted source privacy are covered by member-tools tests and live HTTP.

Chrome checks live notice detail/Back/reset; fictional professor results; invalid/empty/forced 503/retry; ordinary login/bookmark/preferences/inbox; 320/390/1280 widths across search/saved/inbox/items plus mobile Escape focus and skip link; and MFA compatibility. No screen-reader, Firefox/Safari or full accessibility certification is claimed. Deterministic slow-network loading is asserted in UI tests, not separately in Chrome.

## Corrections and scope of prior evidence

Prior 120-backend/34-frontend/12-HTTP/five-Chrome results applied to old main 529f459; they are not results for the updated baseline. Earlier test-authoring errors (mock config, ambiguous zero-match query, reused bookmark state) were corrected before that run. Its NODE_ENV=test build warning was an environment mistake; production-mode builds are used now.

The first updated-main root attempt failed configuration validation because shell cleanup passed an empty REQUIRE_PRIVILEGED_MFA value (172 failed, one passed, one skipped). Re-running with the optional variables truly deleted from the child environment passed all applicable suites. No source validation, security checks or Member 1 tests were weakened. A redundant patch-backup command initially had malformed output syntax; the full file copies and Git bundle had already verified successfully, and the patch was subsequently generated correctly from the retained stash.

## Reproducible screenshots and local evidence

Run the commands in REMAINING_WORK.md. The browser script writes four screenshots and browser-results.json under ignored node_modules/.cache/member4-final-review/: search-desktop.png, professor-search.png, inbox-desktop.png and inbox-mobile.png. Sample labels, fictional descriptions and the footer disclaimer remain visible. No MFA setup-key/recovery-code screenshots are taken.

Copies for the updated baseline are retained outside Git under sibling member4-integration-validation/final-review/updated-main/. Raw logs: updated-main-tests-clean-env.log, updated-main-checks.log and updated-main-browser.log in the parent evidence directory. Earlier logs remain preserved; they must not be mistaken for current results. No fixtures, raw logs, caches, screenshots or machine-specific shim are proposed for commit.

## Still unverified

Member 3 is merged but its API routers and React pages are unmounted; item discovery/photos/claims/handover and LF inbox events remain blocked. Official task-division alignment, explicit shared detail-return/focus controls, lazy-chunk recovery, full accessibility/multi-browser and production identity/media acceptance remain pending. Prior PR CI is historical; this unpublished branch has no new GitHub Actions result.
