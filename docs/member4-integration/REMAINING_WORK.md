# Remaining work and run instructions

## Works locally now

Real notice/home/detail APIs, notice/professor search, verified notice category/date/default-newest filtering, metadata pagination/URL/reset, authenticated notice bookmarks/follows/preferences/inbox, source-safe notification opening and owner enforcement are wired and tested. Full frontend/backend suites, real HTTP and built-browser member journeys completed; MongoDB test environment is no longer blocked. Four npm findings resolved; bundle warning resolved without raising threshold.

## Still incomplete / requires review

1. C/L: PR2 is still open and staged under member3-lost-found/client/server. Approve adaptation/mounting into frontend/backend, canonical /lost-found vs /items navigation, styles/model registration and C's reports/claims/photos/handover/retention tests before exposing it. No C business logic is recreated here. Item bookmarks, item media and C inbox events await verified contracts.
2. B/L: explicit Back-to-search/inbox and focus restoration need reviewed changes to shared NoticeCard/NoticeDetails. Browser Back already preserves URL; no speculative return endpoint was added. Publishing workflow remains untouched.
3. L/B/C: unified cross-type search, multi-select OR filters, rank/relevance/oldest/title sorts and public status model need an agreed API. Current scalar notice/professor contracts are used faithfully; no draft exposure.
4. A/L: real institution audience groups, production identity/media credentials, event operations and deployment/readiness require review. Local synthetic isolation/security tests do not certify production configuration.
5. Team: review shared App.jsx lazy boundaries, backend dev watcher pin and root lockfile before publishing. All teammate tests pass; those shared changes are explicitly documented. No approval to upload/merge/deploy is implied.
6. Obtain official Member4 task division and complete final UX/accessibility/multi-browser acceptance. Original D01–D06 plans/mocks remain preserved; these six reports describe the current integrated state.

## Normal local checks (Node 22.13+ within Node22, or compatible Node24; npm on PATH)

~~~powershell
cd "the isolated repository checkout"
npm ci
node scripts/member4/test-backend.cjs
npm run test -w frontend
npm run test:member4
npm run lint
npm run build
~~~

The test runner uses disposable replica sets and a writable/resumable test cache, never production DB values. Stop the temporary preview before reinstalling node_modules (it uses the cached mongod executable). Do not use production setup/seed scripts for testing.

## Disposable end-to-end preview

Terminal 1, from workspace root:
~~~powershell
node scripts/member4/start-isolated-preview.cjs
~~~
It discards inherited production DB/signing/blob configuration, creates a random local test DB/key and fictional accounts/notices, listens only on 127.0.0.1:5000 and disables attachment storage. Synthetic fixture login data is written only to ignored node_modules/.cache/member4-e2e-fixtures.json. Ctrl+C disconnects and stops the owned test replica set. It does not accept a production database URI or provision production accounts.

Terminal 2:
~~~powershell
npm run build
cd frontend
node ../node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5187 --strictPort
~~~
Open http://127.0.0.1:5187/search. In another terminal at workspace root:
~~~powershell
node scripts/member4/verify-local-api.mjs
~~~
This verifier accepts only the fixed loopback fixture API. All resulting records are fictional; badges/footer identify samples. An ordinary production-configured development run remains npm run dev, using backend/.env.example with independently approved local credentials; no production credentials were created here.

This host has no npm executable on PATH, so commands were invoked through the existing npm CLI and a temporary shell-only npm.cmd shim outside the checkout. No user/system PATH or npm security setting changed.

No push, merge, deploy, production account or production data change was performed.
