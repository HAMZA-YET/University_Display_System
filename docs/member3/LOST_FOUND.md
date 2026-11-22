# Member 3 — Lost & Found (integrated)

The lost & found feature is now part of the main app. `/items` (the link already in the team navigation bar and footer) opens it. The old `member3-lost-found/` folder is the stand-alone version and is kept only for history.

## 1. Where things are

| Part | Path |
|---|---|
| Models, service, routes, rules | `backend/src/modules/lostFound/` |
| Private-evidence permission callback | `backend/src/modules/lostFound/lostFound.evidence.js` |
| Retention cleanup | `backend/src/modules/lostFound/lostFound.cleanup.js`, `backend/scripts/lostFoundCleanup.js` |
| Seed data | `backend/src/modules/lostFound/lostFound.seed.js` (called from `backend/src/seed/seed.js`) |
| Backend tests | `backend/tests/lostFound.test.js` |
| API client | `frontend/src/api/lostFound.js` |
| Pages | `frontend/src/pages/lostFound/`, `frontend/src/pages/adminLostFound/` |
| Components | `frontend/src/components/lostFound/` |
| Styles (team tokens, scoped to `.lf-module`) | `frontend/src/styles/lostFound.css` |
| Frontend tests | `frontend/src/test/LostFound.test.jsx` |

### Changes to shared files

The shared files changed only where they had to be:

- `backend/src/app.js` mounts `/api/public/lost-found` and `/api/lost-found`. It also passes `lostFound.evidence.authorizeEvidence` as the default callback for Member 1's `createEvidenceRouter`. A callback given in `options.authorizeEvidence` still wins, so Member 1's tests are unchanged.
- `backend/src/seed/seed.js` calls `seedLostFound(users)`. `backend/src/seed/fixtures/accounts.js` adds `student1@kdu-uids.test` and `student2@kdu-uids.test`.
- `backend/tests/helpers/testDb.js` registers the lost & found models so their indexes are built in tests.
- `backend/package.json` adds the `lf:cleanup` script.
- `frontend/src/App.jsx`:
  - The `/items/*` placeholder (`Member4Routes`) is replaced by the lost & found routes, which sit inside the existing `ProtectedRoute` guards.
  - `<NoticeToaster />` is mounted under `<NavBar />`.
  - NavBar, Footer, AuthContext and the login flow are untouched.
- `README.md`: the "lost/found unavailable" sentence is updated.

## 2. Pages

| URL | Who | What |
|---|---|---|
| `/items` | everyone | Browse and search reports (Found / Lost, categories) |
| `/items/:id` | everyone; claim needs login | Item details; claim form for FOUND items (hidden from the reporter) |
| `/items/report` | signed in | Report a lost or found item (up to 3 photos) |
| `/items/my-cases` | signed in | My reports and my claims |
| `/items/my-reports/:id`, `/items/my-reports/:id/edit` | owner | Manage or edit a report |
| `/items/my-claims/:id` | claimant | Claim status and collection instructions |
| `/admin/lost-found` | ADMIN | Dashboard: action needed, categories, items held the longest |
| `/admin/lost-found/items`, `/admin/lost-found/items/:id` | ADMIN | All items; review claims, approve, reject, hand over, release |
| `/admin/lost-found/claims` | ADMIN | Claims queue |

## 3. API

**Public** (`/api/public/lost-found`):

- `GET /items`: search with `q`, `type`, `category`, `page`
- `GET /items/:id`
- `GET /items/:id/photos/:photoId`

**Signed in** (`/api/lost-found`):

| Method and path | Purpose |
|---|---|
| `POST /items` | Report an item (multipart, `photos[]`) |
| `GET /me/items` | My reports |
| `GET /me/items/:id` | One of my reports |
| `PATCH /me/items/:id` | Edit my report |
| `POST /me/items/:id/resolve` | Mark my report resolved |
| `DELETE /me/items/:id` | Delete my report |
| `POST /me/items/:id/photos` | Add a photo |
| `DELETE /me/items/:id/photos/:photoId` | Remove a photo |
| `GET /items/:id/photos/:photoId` | Fetch a photo |
| `POST /items/:id/claims` | Claim a FOUND item |
| `GET /me/claims` | My claims |
| `GET /me/claims/:id` | One of my claims |
| `DELETE /me/claims/:id` | Withdraw my claim |
| `GET /me/notices` | My notices |

**ADMIN** (`/api/lost-found/admin`):

| Method and path | Purpose |
|---|---|
| `GET /stats` | Dashboard figures |
| `GET /items` | All items |
| `GET /items/:id` | One item, with its claims |
| `DELETE /items/:id` | Delete an item |
| `GET /claims` | Claims queue |
| `POST /claims/:id/decision` | Approve or reject a claim |
| `POST /claims/:id/release` | Release an approved claim |
| `POST /claims/:id/handover` | Record the physical handover |
| `DELETE /claims/:id` | Delete a claim |
| `GET /case-events` | Case events outbox |

## 4. Rules that matter

- **Reporting:** a report is public as soon as it is posted. Each user can post at most 10 reports in 24 hours.
- **Claims:** only FOUND items can be claimed. The reporter cannot claim their own item. Each claim has private evidence text, and each user can have one live claim per item.
- **Concurrent approval:** approval is an atomic conditional update (`OPEN → COLLECTION_APPROVED`), backed by the partial unique index `lf_one_collector_per_item`. If two admins approve different claims at the same moment, exactly one succeeds. The other gets 409, and the remaining pending claims are rejected automatically.
- **Physical handover:** the ADMIN must tick "identity checked" and enter the recipient's name. The item moves to `RETURNED`, and every step is written to the case history and audit log.
- **Photo access:** photos of public items are public. Photos of deleted items, or of items that are no longer public, are visible only to the owner and the ADMIN.
- **Private evidence:** claim evidence text is never in public responses. Only the claimant and the ADMIN see it.

## 5. Contracts with other members

### Member 4 — search, attachments, notifications

- **Search:** `GET /api/public/lost-found/items` returns only public, non-deleted items and never contact or evidence fields, so it is safe to index. Member 4's `/items` placeholder (`Member4Routes` / ItemsApp) is no longer routed. Member 4 can delete it or keep it as reference; its tests still pass.
- **Attachments:**
  - Photos use the team attachment gateway (`getGateway()`): local disk in development, Vercel Blob in production.
  - Rules: JPG or PNG only, 5 MB each, at most 3 per report.
- **Notifications:**
  - Every state change writes a `LostFoundCaseEvent` document (collection `lostfoundcaseevents`). ADMINs can read them through `GET /api/lost-found/admin/case-events`. Member 4 can consume these for email or push.
  - Each event carries `eventId`, `idempotencyKey`, `type`, `entityType` (`LF_ITEM`/`LF_CLAIM`), `entityId`, `entityVersion`, `actor`, `recipients`, `timestamp`, `payload` and `deliveryStatus` (`PENDING` → `DELIVERED`).
  - In-app notices (`GET /api/lost-found/me/notices`) are shown by `NoticeToaster`, which polls every 30 s and shows each notice for 5 s.

### Member 1 — private evidence

- `lostFound.evidence.js` answers Member 1's `authorizeEvidence({ actor, caseId, action })`, where `caseId` is the claim id:

  | Action | Allowed for |
  |---|---|
  | `upload` | the claimant, while the claim is PENDING and the item is public |
  | `download` | the claimant or an ADMIN |
  | `delete` | an ADMIN, or the claimant while the claim is PENDING |

  Anything else, including unknown or deleted claims and the finder of the item, is refused.
- No claim-photo upload button is shown in the UI. The team decided proof photos are not required, because owners rarely have photos of their belongings. The backend link is in place if the team wants a button later.

## 6. Retention cleanup

```
npm run lf:cleanup -w backend
```

- For cases finished (returned, resolved or deleted) more than `LF_EVIDENCE_RETENTION_DAYS` ago (default 90), it redacts the private claim evidence text.
- Marks the linked Member 1 `Evidence` records `DELETED`. Physical removal of the stored files is handled by Member 1's evidence operations tooling.
- Prints `{ items, claims, evidenceFiles, cutoff }`.

## 7. Production setup still required

1. **Scheduled cleanup:** run `lf:cleanup` daily. Use a Vercel Cron job or a GitHub Actions schedule with `MONGO_URI` as a secret. Nothing is scheduled yet.
2. **Photos on Vercel:** `BLOB_READ_WRITE_TOKEN` must be set (the same storage as the team attachments).
3. **Private evidence:** Member 1's evidence storage is unavailable on Vercel, so `/api/private-evidence` returns its "unavailable" response there. This does not affect lost & found, because claims do not need evidence files.
4. **Seed:** the local demo data needs `ALLOW_DEVELOPMENT_SEED=true npm run seed -w backend`.
5. **MFA:** if `REQUIRE_PRIVILEGED_MFA=true`, ADMIN lost & found pages require the ADMIN to have MFA set up (Member 1's guard).
6. **Optional:** `UNIVERSITY_TZ` (default `Asia/Seoul`) for date labels in notices.

## 8. Decisions for team review ⚠️

These two differ from the original proposal (T07). Please confirm or change them:

1. **Immediate publication.** Reports go public as soon as they are posted, with no moderation step.
   - Why: lost items are time-sensitive, and the rate limit, the ADMIN delete action and the photo warnings limit abuse.
   - Alternative: a `PENDING_REVIEW` status before reports go public.
2. **ADMIN-only verification.** Only the `ADMIN` role approves claims and records handovers (`VERIFIER_ROLES = ['ADMIN']`).
   - If the proposal meant a separate "lost & found officer" or `EDITOR` role, it is a one-line change in `lostFound.constants.js`.

## 9. Demonstration

1. Run `ALLOW_DEVELOPMENT_SEED=true npm run seed -w backend`, then `npm run dev`.
2. Open `/items` signed out. Browse, search for "umbrella", and filter by Found.
3. Log in as `student1@kdu-uids.test` / `Student@12345`.
   - Report a found item with a photo. It appears in `/items` immediately.
   - Open it: "This is your report" appears, and there is no claim form.
4. Log in as `student2@kdu-uids.test` and claim that item with identifying details. The claim shows as Pending in `/items/my-cases`.
5. Log in as the ADMIN and go to `/admin/lost-found`.
   - Open the item and approve the claim.
   - Student 2 sees a notice with the collection office.
6. ADMIN: record the handover (tick identity checked, enter the name). The item becomes Returned and the history shows every step.
7. Optional concurrency check: approve two claims on the same item from two tabs. One succeeds and the other is refused.

## 10. Test results (local, before the PR)

| Check | Result |
|---|---|
| `npm run lint` | clean |
| Frontend tests (vitest) | 44 / 44 pass (36 team + 8 lost & found) |
| Member 4 tests | 11 / 11 pass |
| `npm run build` | succeeds |
| Backend tests (jest + mongodb-memory-server) | confirmed by GitHub Actions on the PR (MongoDB could not be downloaded in my local sandbox) |

Backend lost & found test groups:

- LF-REPORT-1..7
- LF-CLAIM-1..10, including concurrent approval
- LF-NOTICE-1
- LF-ADMIN-1..3
- LF-PHOTO-1..2
- LF-RETENTION-1
- LF-EVIDENCE-1..4

## 11. Unresolved

- The two decisions in section 8.
- Cleanup scheduling in production (section 7).
- The claim-photo upload UI is deliberately left out. The backend support exists.
- `member3-lost-found/` and the empty legacy `backend/controller|router|schema` lost/found files can be deleted once the team agrees.
- Member 4's unused ItemsApp placeholder.
