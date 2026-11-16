# Executed checks

Date: 2026-11-16. Base main: 9ab8b8ea190dc93d70a4cadb20e6ce50efa38381. Checks apply to the isolated addition-only contribution, not a production-integrated application.

| Check | Actual outcome |
| --- | --- |
| node --test tests/member4/*.test.mjs | PASS: 3 test files, 56 grouped adapter/service checks (search 21, interests/media 17, notifications 18). |
| Frontend ESLint using existing configuration (node ../node_modules/eslint/bin/eslint.js . from frontend) | PASS, exit 0. |
| Vite build with existing team config, programmatic build({build:{write:false}}) | PASS for unchanged team app and Member4Routes module. |
| Full mounted Member4Routes temporary virtual-entry production bundle | PASS; harness/artifacts kept outside contribution. No additional app entry/config is staged. |
| Exact team-lockfile npm ci (online and offline attempted) | NOT COMPLETED: native filesystem operations could not create install/log/profile files in this execution environment. Checks used a copied local prototype dependency tree; 47 resolved dependency entries differ from the team lockfile. Exact-lockfile reproducibility remains unverified. |
| Automated Playwright browser suite | NOT RUN: browser launch failed creating its profile singleton lock. No browser-suite pass claimed. |
| Browser-control fallback on isolated production-bundle harness | PASS for homepage/important/latest notices; notice-detail navigation/rendering; keyword submission preserving q=library and 2 results; public item list and missing/pending/withdrawn media states; synthetic inbox empty/loading; shared department-follow persistence; eligible event delivery (1 unread); replay (0 deliveries, 4 duplicate events); mark-read transition (0 unread); 320px inbox width without document overflow; Enter-key mobile-menu expansion. |

Fallback preview was loopback port 5183, outside the team app. It validates selected flows only. Full D02 showcase, all responsive breakpoints, every visual recovery scenario and complete browser regressions were not rerun in this contribution check. The original historical test reports remain local and are not represented as new results.

The unit checks include case-insensitive keywords, AND/OR filtering, stable sorting/pagination/counts/URL invalid-state handling, bookmarks/follows/preferences, allowlisted synthetic media, visibility changes, duplicate events/retries, source-safe navigation and synthetic cross-member denial. These are local mock tests; no real identity, backend authorization, event authenticity or durable multi-user persistence was verified.

Before approval: install exact locked dependencies, run npm run lint/build in the normal team environment, integrate through owner-approved routing, rerun complete mounted desktop/mobile/keyboard flows, connect authoritative services and obtain leader review. Existing entrypoints are deliberately unmodified.
