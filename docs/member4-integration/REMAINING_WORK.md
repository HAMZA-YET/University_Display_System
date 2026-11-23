# Remaining work and commands — updated main, 2026-11-22

Independent Member 4 verification now targets main a53db54fa24f0237ef42bcad2f9a2eb33a4add45, including Member 1 security integration. Exact results/skips are in TEST_RESULTS.md. No team approval, upload, merge or deployment is implied.

## Remaining blockers

1. C/L: PR #2 is merged but staged under member3-lost-found/client/server. Adapt imports/paths into frontend/backend, mount routers/pages, register models/tests and verify report/claim/photo/handover/privacy behavior. /items remains truthfully unavailable; the public API returns 404.
2. C/L/D: agree canonical /items versus /lost-found destinations, eligible public item/media projection, item bookmark support and delivery of LF CaseEvents into the publishing-DomainEvent inbox. D does not implement ownership decisions.
3. B/L: explicit return-to-search/inbox and focus restoration require approved shared-page changes; native browser Back preserves search URL state.
4. L/B/C: unified ranking, multiple selections and additional sort/status behavior require real API contracts. Current scalar notice/professor semantics remain authoritative.
5. A/L: real audience groups, production identity/media/delivery configuration, retention/operations and deployment acceptance remain outside this local verification. Member 1 MFA/revocation code and tests were preserved and compatibility-tested, not redesigned.
6. Shared optional lazy routes still lack an active rejected-download error boundary. Full assistive-technology/multi-browser acceptance and official assignment alignment remain unverified.
7. Run the three unchanged Windows-skipped Member 1 permission/symlink tests on a suitable host. No failed test remains after correcting the local environment; skips are not passes.

## Complete tests

Use the root workspaces and updated main lockfile. This run installed with npm ci --no-audit --no-fund (697 packages). Do not change manifests, approve unrelated install scripts or run production seed/bootstrap/operations as test setup.

Use a fresh testing shell with no production credentials. Remove optional variables rather than assigning empty strings; new enum settings reject empty values. The actual verification used a Node child-process environment with DB/signing/blob/MFA/backup/delivery/rollout variables deleted, NODE_ENV=test and the writable MongoDB test cache below.

```powershell
# Disposable test process only; not a shell running production services
Remove-Item Env:MONGO_URI,Env:MONGODB_URI,Env:MONGO_TEST_URI,Env:JWT_SECRET,Env:BOOTSTRAP_TOKEN,Env:BLOB_READ_WRITE_TOKEN,Env:BLOB_STORE_ID,Env:MFA_ENCRYPTION_KEY,Env:BACKUP_ENCRYPTION_KEY,Env:ACCOUNT_DELIVERY,Env:REQUIRE_PRIVILEGED_MFA,Env:VERCEL -ErrorAction SilentlyContinue
$env:MONGOMS_DOWNLOAD_DIR = Join-Path (Get-Location) 'node_modules/.cache/mongodb-binaries'
$env:MONGOMS_RESUME_DOWNLOAD = 'true'
$env:NODE_ENV = 'test'
npm test
npm run test:readiness
npm run lint
$env:NODE_ENV = 'production'
npm run build
```

Root npm test is authoritative: it includes Jest, operator tests, Member 1 security CLI, frontend and Member 4 Node regressions. The older scripts/member4/test-backend.cjs runs Jest/operator tests only and does not include the newly added security CLI; it is not used to claim the full updated suite. On this host npm came from the existing CLI with an external temporary shim, without system-setting changes.

The owned test MongoDB binary is 7.0.24. When reinstalling node_modules, stop owned previews and preserve/hash-check that downloaded binary outside node_modules, then restore it to the cache (or use the documented MONGOMS_SYSTEM_BINARY setting). No production database URI is needed.

## HTTP and Chrome preview

```powershell
# Root, terminal 1: owned loopback replica set, random keys, synthetic records
node scripts/member4/start-isolated-preview.cjs
# Root, terminal 2
$env:NODE_ENV = 'production'
npm run build
cd frontend
node ../node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5187 --strictPort
# Root, terminal 3; sequentially
node scripts/member4/verify-local-api.mjs
node scripts/member4/verify-browser.mjs
```

Playwright and Chrome are optional local browser-test tools; no new package dependency is added. If supplied outside the project, UIDS_PLAYWRIGHT_MODULE accepts the module's file URL. fileURLToPath handles screenshot paths with spaces. Browser traffic is restricted to http://127.0.0.1:5187 and its loopback API proxy at port 5000.

The preview discards production DB/signing/blob/MFA/backup/delivery/rollout variables, generates random test signing/encryption keys and creates only synthetic users/notices/professor records in a fresh replica set. It fixes domain time to 2026-11-19 for deterministic date filters. The synthetic MFA user enrolls through existing Member 1 routes. Its one-use recovery codes are stored only in ignored local fixtures, consumed by sequential HTTP/browser runs and never printed. Restart the preview if codes are depleted; do not share that fixture. Ctrl+C stops owned processes and the disposable database. No permanent test endpoint or auth bypass is added.

## Review boundary

The approved scope is 13 files in CHANGES_IMPLEMENTED.md. FINAL_REVIEW_PR.md and raw evidence remain outside the checkout. Review git status --short and the scoped diff against origin/main after fetching. No contribution commit, push, PR, merge or deploy is authorized at this stage. D07/D08 are excluded.
