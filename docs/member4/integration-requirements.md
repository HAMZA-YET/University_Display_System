# Member 4 integration requirements — 2026-11-22

> November 23 integration update: Member 3 now mounts the lost-and-found pages and APIs under `/items` in the combined integration build. References below to unmounted/unavailable items describe the dated November 22 baseline, not the new routing. Item bookmarks, unified cross-type search and consumption of LF CaseEvents by the shared inbox remain pending. Historical test results are retained as historical evidence.

Member 4 is already mounted in the shared App.jsx through Member4Routes. Search calls public notice/professor APIs; saved interests and inbox use authenticated MongoDB-backed member-tools APIs. Shared authentication derives identity on the server. Legacy synthetic adapters and injection switches are not imported by live routes.

No new host mounting, authentication system, database schema or endpoint naming is proposed in this final review. Existing scalar filters, KST dates, default/newest sort and metadata pagination follow the authoritative APIs. Browser Back preserves search URL state; explicit shared detail-return/focus controls remain an approval item.

Member 3 PR #2 is merged but its client/server package remains unmounted under member3-lost-found. C/L must adapt paths and shared imports, mount routes/pages, verify models/auth/media/tests and agree /items versus /lost-found before D can integrate item search or links. C CaseEvents are not currently consumed by D's publishing-DomainEvent inbox. Claims, administrator decisions and handover remain C responsibilities.

Full owner-by-owner checklist: [TEAM_DEPENDENCIES.md](../member4-integration/TEAM_DEPENDENCIES.md). Current D01–D06 mapping: [FEATURE_MATRIX.md](../member4-integration/FEATURE_MATRIX.md). Actual local results: [TEST_RESULTS.md](../member4-integration/TEST_RESULTS.md).

Do not present fictional records as verified institution information. Preserve sample labels and the footer disclaimer. No production credential/configuration changes, Member 3 edits, D07/D08, push or deployment are authorized by this document. Obtain official assignment alignment and team review before final approval.

Verification baseline now includes Member 1 PR #4 at main a53db54fa24f0237ef42bcad2f9a2eb33a4add45. Personal Member 4 APIs deny MFA-only challenges, work after existing TOTP/recovery verification and reject copied JWTs after logout. No shared auth/user-model/production configuration or Member 3 source edits were needed. See TEST_RESULTS.md for exact passes, Windows-specific skips and local-environment corrections. The approved proposal contains 13 files; the PR draft and generated evidence remain outside the repository.
