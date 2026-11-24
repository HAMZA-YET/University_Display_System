# Member 1 integration progress

> November 25 integration update: this is the historical Member 1 branch report. The real claim authorization callback, private Blob proof-file storage and claimant/admin proof controls are now connected. A production message adapter is implemented but no sender/provider is configured. Use INTEGRATION.md and OPERATIONS.md for current capabilities and operational limits; the older counts and blockers below describe the original handoff.

Branch: feature/member1-security-integration. Base main: 529f459e00d5ceb08bb603a2eacaba89aae093a9. Original UIDS-Member1 remains unchanged. The prior uncommitted audit changes were retained and extended.

## Completed locally

- A01 mapping and backward-compatible integration decisions documented.
- Existing Express/Mongoose, bcrypt, JWT HttpOnly cookies, user IDs/roles and frontend layout retained.
- Auth audit events and secret exclusions retained; logout now revokes the presented JWT, preserving other sessions.
- Own-profile screen/API; existing admin role/suspension actions reused; department edits validate team department codes and revoke sessions.
- Single-use activation/recovery with explicit expiry and transaction-based concurrency protection; private local test delivery.
- Encrypted TOTP enrollment, five-attempt challenge limits, one-use recovery codes and password recovery that retains MFA.
- Optional staff MFA rollout preserves existing unenrolled accounts; enrolled accounts always require MFA.
- Separate private evidence gateway with strict image decoding, quarantine state, integrity checks and fail-closed C callback. Existing notice gateway/visibility unchanged.
- Restricted diagnostics, dry-run cleanup/reconciliation reporting, maintenance locks and encrypted local database/file backup with actual separate-target restoration and persistent review lock.
- Shared-component account security/recovery pages and MFA login UI; no teammate case/notice screens replaced.
- Setup/operations scripts, environment examples, integration/operations/evidence guides and A01–A08 checklist.

Changed areas: .gitignore and root README/lockfile; backend environment/package/scripts; app composition, auth/authorization/user modules; new backend/src/modules/security; backend security tests; frontend AuthContext/Login/navigation and new security API/pages/tests; docs/member1. No changes to teammate publishing, case, search or notification implementations.

## Verification

Final npm test: **219 passed, 0 failed**. Standalone readiness: **6 passed** (overlapping coverage). Frontend lint, production build and new-module syntax checks passed. Runtime dependency audit reported zero vulnerabilities. Real local message writing and consumption passed. Real service-level encrypted backup/restore verified documents and bytes in a disposable new target; restoration remains locked for review. Setup was tested twice against a temporary .env to prove existing keys are preserved and not printed.

Initial targeted failures were shared rate-limit state; initial new UI failures were selectors missing shared required-label text. Both were corrected and the full regression rerun. No claim of fresh-machine setup, independent T15 acceptance, manual browser verification or production deployment.

Pre-stage secret scan: 38 changed/new files, zero pattern/path findings; seven sensitive-file ignore probes passed. Final staging and delivery results are added below after inspection.

## Remaining / blocked by integration decisions

C must supply a reviewed private-evidence authorization callback and physical-retention policy. Existing staged public item-photo permissions are not a substitute. B/C must confirm domain department boundaries; the helper does not silently impose a new publishing policy. Legacy notice document validation is preserved, not relabelled as full parsing/antivirus. Production delivery, Blob-provider backup and all-factor operator recovery are unavailable. All-staff MFA requires coordinated enrollment and REQUIRE_PRIVILEGED_MFA rollout. Local IP limits are not distributed rate limiting. Offline backups require all external writers to stop.

A01–A08 are not fully accepted: see INTEGRATION checklist. C security review, B independent restore/clean setup and D/L submission review remain pending. The PR is a reviewable integration, not permission to merge or deploy.

Final review added explicit foreign-origin checks on new mutation routes, standard rate-limit errors and JWT-expiry tests. The final full suite passed 219 tests after these additions.

Final staged-index inspection: 41 source/config/documentation/test files, zero secret/path findings, seven ignore probes passed, git diff --cached --check passed. No .env, private file, local database, credential export or backup key is staged. All final tests/build/lint passed before the authorized commit and PR preparation.
