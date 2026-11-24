# Security integration test evidence

Verified locally on Windows / Node 24.16.0. Original Member 1 source was read-only. Tests used isolated disposable MongoDB replica-set data and a cached mongod executable; no development database was used. These results apply to this integration branch, not independent acceptance or a production deployment.

## Final commands and results

| Command | Actual result |
|---|---|
| npm test | 219 passed, 0 failed: backend Jest 166; existing operator CLI 6; security CLI/setup 2; frontend Vitest 34; Member 4 runner 11 |
| npm run test:readiness | 6 passed, 0 failed (also included in backend coverage; not six extra unique cases) |
| npm run lint | Passed |
| npm run build | Passed, Vite transformed 598 modules |
| npm audit --omit=dev --json | 0 known runtime dependency vulnerabilities reported |
| New backend modules: node --check | Passed |
| Pre-stage changed-file secret/path scan | 38 changed/new files checked, 0 findings; 7 sensitive-path ignore probes passed |

The Member 4 runner prints additional internal assertion counts; these are not added again to the 219 total. Earlier audit-only integration passed 178 tests. This phase adds 35 backend cases, two setup/CLI cases and four frontend cases, bringing the full runner to 219.

During development, two account tests initially hit a shared rate limiter (30 passed / 2 failed in the targeted run). Resetting only the app was insufficient because the router was singleton-scoped. The router now has per-app construction; the limiter was not weakened. The first full frontend run had four new selector failures because shared labels include required text (30 passed / 4 failed). Corrected selectors passed all four, then the complete regression passed. No unresolved test failure remains in the final local run.

## Assignment traceability

Test IDs below retain the original assignment's meanings; they are not invented endpoint identifiers.

| Assignment | Evidence | Limits |
|---|---|---|
| A02/A03; T01 Accounts | Existing auth/security/readiness suites; auth-audit; security-accounts; AccountSecurity frontend tests | No manual browser or fresh-machine sign-off |
| A03/A04; T02 Role boundaries | Existing author/reviewer/admin tests; self-administration denial, suspension, department changes, revoked JWTs, MFA staff rollout, admin-only audit/operations | B/C record and department policy decisions not rewritten |
| A04; T01 Accounts | Expired/reused/concurrent activation and recovery; wrong purpose; generic recovery acknowledgement; actual local delivery; encrypted factors; TOTP/recovery replay; MFA expiry/attempt cap; suspension during challenge; copied JWT logout denial | External mail and all-factor operator recovery unavailable; staff rollout remains an explicit setting |
| A05; T10 Upload validation | security-evidence: malformed/signature/type/size rejection, actual decoded PNG upload and matching download, traversal denial, quarantine/deletion/public-path isolation | No antivirus; legacy notice PDF/DOCX parser hardening deferred |
| A05/A07; T02 Role boundaries | Missing/false/nonboolean/error case adapters deny everyone, including ADMIN; revoked adapter decision denies download/delete; trusted department helper denies missing/cross scope | Synthetic callback tests are not a real C authorization integration |
| A06/A07; T15 Recovery/retention | security-operations: actual encrypted backup/restore of DB documents/private bytes; JWT version increment; action-token omission; corrupt archive and nonempty target rejection; persistent restore review lock | Not independent B restore; no Blob export or real C lifecycle approval |
| A06/A07 security review | auth-audit allowlist/secret exclusion and admin restrictions; dry-run cleanup; job failure records; maintenance lock; setup repeatability and CLI confirmation guards | Best-effort audit, local limiters, offline backup requires stopped external writers |
| A08 handoff | INTEGRATION and OPERATIONS guides, demo outline, exact environment names and nondestructive migration description | B/C clean-machine reproduction, D/L submission review and professor presentation pending |

## Browser and teammate scope

Frontend tests run in Vitest/jsdom; they are not a real browser walkthrough. Successful non-MFA login, MFA challenge navigation, rejected MFA and profile submission are component-tested. No screenshot or manual browser verification is claimed.

The root application suite covers the currently integrated team features. `member3-lost-found` is a staged package without its own package.json or copied test helpers/shared modules, and its private evidence policy is not mounted in the main application. Its standalone tests were not represented as passing integrated coverage. Do not enable case evidence by supplying a permissive callback.

## Independent acceptance

- C: T01/T02/T10 security review, cross-case/claim access, department policy and retention: **pending**.
- B: separate setup and T15 restore with deleted/withdrawn domain data: **pending**.
- D/L: website design/navigation review and clean submission: **pending**.
- Rahul: additive User fields, JWT revocation, MFA rollout and integration-contract approval: **pending**.
- CI after push: check the Pull Request; local results are not a claim about GitHub Actions.

The changed-file secret scan checks high-risk filename patterns, private-key headers, GitHub token patterns, credential-bearing MongoDB URIs and literal encryption-key assignments. It prints filenames/rule numbers only, never matched contents. It is a limited scan, not a full-history or binary archive audit. Final staged-index review is recorded in PROGRESS.

Final review added explicit foreign-origin checks on new mutation routes, standard rate-limit errors and JWT-expiry tests. The final full suite passed 219 tests after these additions.

## Shared integration review — 22 November 2026

The original submission above was reviewed against shared main at 529f459. Review fixes preserve exact same-origin production requests without trusting forwarded host headers, make invitation account/token creation atomic, validate invitation departments, and preserve a valid session after an incorrect MFA-enrollment password. MFA login now preserves the requested destination, prevents simultaneous submissions, and bounds secret/code presentation on narrow screens. The setup utility restricts existing configuration permissions before writing keys and rejects symlink destinations.

Fresh verification on macOS / Node 26.3.0 passed: backend Jest **171**, operator CLI **6**, security CLI/setup **4**, frontend Vitest **36**, and Member 4 runner **11**. The six standalone readiness checks, frontend lint and production build also passed. Readiness coverage and the Member 4 runner's internal grouped assertions are not counted again.

The first review run exposed a temporary-directory alias on macOS in the restore test. Fixtures now use a canonical temporary root; the actual encrypted restore test remains enabled and an explicit symlink-target rejection regression was added. Runtime restore safeguards were not relaxed. All test databases and restore destinations were disposable; no production data, credentials, enrollment policy or delivery provider was changed. These automated checks do not replace the remaining domain-owner acceptance or a manual browser/deployment review.

## Production-path implementation — 25 November 2026

The current app mounts Member3's real private-evidence callback. Optional proof-file controls now appear on the claimant and admin claim pages. Private evidence supports the existing private Vercel Blob connection as well as local storage, with a 4 MiB serverless ceiling, checksum/size verification and current authorization on list/download/delete. New security capability responses prevent unavailable enrollment, invitations and recovery messages being offered as working actions. Late file metadata/download responses are discarded on logout or account switch.

A Resend HTTPS adapter is implemented, using the documented [send-email contract](https://resend.com/docs/api-reference/emails/send-email). It requires an externally configured API key and verified sender. Blob operations follow the documented [private SDK contract](https://vercel.com/docs/vercel-blob/using-blob-sdk). No real email provider was provisioned or contacted, no private production file was uploaded, and no live email deliverability is claimed. Cloud backup/export and physical evidence purge remain deferred.

Targeted verification used a disposable local replica set with production credential variables removed. Five backend suites passed 55 tests: security accounts, local evidence, private Blob evidence, production-message adapter/configuration and operations. The cross-instance upload race admits ten files and rejects two before another provider write; retained deleted/quarantined records keep their slots. Parallel recovery requests trigger one provider message while known/unknown responses stay generic. Cloud-evidence backup refusal is tested. Blob and Resend calls were mocked. Twelve frontend account/proof component tests passed, including unavailable setup controls, proof upload refresh and account-switch response isolation. Frontend lint, new-module syntax checks and whitespace validation passed. One new upload component test initially failed because jsdom did not submit its file form through the click default; the final test asserts the selected file and submits the form event explicitly. The first quota fixture hit the existing two-active-upload capacity guard; the final test uses separate app instances to exercise the persistent database cap. Browser click/download acceptance is separate from this component result and remains owned by the shared integration verifier.
