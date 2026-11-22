# University Display System

A shared application for university notices, publication review, events, professor information, public search, saved interests and notifications. The app combines the Member 2 source originally uploaded in `member2/THOKAR_notice_publish_Professor_info.zip` with the Member 4 modules already committed to this repository. The original submission archive is preserved.

## Project layout

- `frontend/`: React, React Router and Vite application.
- `backend/src/`: Express API, MongoDB models and trusted authorization.
- `api/[...path].js`: Vercel Function entry point for the API.
- `docs/member2/`: imported publication, visibility, workflow and API contracts.
- `frontend/src/member4/`: live discovery and member tools. Earlier mock adapters remain isolated from deployed routes for historical regression tests.
- `tests/member4/` and `backend/tests/`: adapter, database, authorization and publication regressions.

The unimplemented legacy `backend/controller`, `backend/router`, and frontend placeholder files are retained for contributor history. They are not application entry points. The Member 3 lost & found service is connected: `/items` opens the working feature (backend `backend/src/modules/lostFound`, frontend `frontend/src/pages/lostFound`). See `docs/member3/LOST_FOUND.md`.

## Development

Use Node.js 22.12 or newer. Install all workspaces from the repository root:

```sh
npm ci
cp backend/.env.example backend/.env
```

Set `MONGODB_URI` (or legacy `MONGO_URI`) and a random `JWT_SECRET` of at least 32 characters in the backend environment. Use a disposable local MongoDB replica set for development and tests. Never commit credentials.

```sh
npm run dev
```

The frontend runs on port 5173 and proxies `/api` to the backend on port 5000. The published app uses same-origin API requests and HttpOnly session cookies.

## Verification

```sh
npm run lint
npm test
npm run test:readiness
npm run build
```

Backend integration tests start a temporary MongoDB replica set and never use the production database. The first run downloads MongoDB from its official distribution server. The frontend production output is `frontend/dist`. GitHub Actions runs these checks using the single root workspace lockfile.

## Deployment

The existing Vercel project is `university-display-system` under Rahul Singh's projects. Its project root is the repository root, with `npm ci`, `npm run build`, and output `frontend/dist`. `vercel.json` routes API requests to the serverless backend and other application paths to the SPA, so direct links and refreshes work.

Production requires a connected MongoDB Atlas database and `JWT_SECRET`. A private Vercel Blob store plus `ATTACHMENT_STORAGE=vercel-blob` enables durable notice attachments. The server accepts the Atlas integration's `MONGODB_URI` variable directly. Blob credentials and database credentials stay on the server; no `VITE_` variable contains secrets.

The production database is initialized without demo accounts, sample professors or fictional notices. Create the first administrator through the one-time setup flow or the explicit trusted-shell bootstrap described in [production setup](backend/PRODUCTION_SETUP.md). An administrator can then assign author/reviewer roles and enter real information. Development sample seeding is explicitly blocked on Vercel and in production.

Health endpoints:

- `/api/health`: service and capability status without secrets or collection data.
- `/api/ready`: HTTP 200 only when the production database and authentication configuration are ready.

## Application routes

Public routes include `/`, `/notices`, `/notices/:id`, `/events`, `/professors` and `/search`. Accounts use `/login` and `/register`. Signed-in members use `/saved-interests` and `/notifications`. Administrators can add real department definitions at `/admin/departments` before creating professors or department-specific notices. Author, reviewer and administrator routes require server-verified roles. Source visibility is rechecked when opening saved notices, attachments and notifications; withdrawing a notice removes access through those entry points too.

## Member 1 security integration

Accounts retain the team's bcrypt hashes, IDs, roles and HttpOnly JWT cookies. New account security screens are available at /account-security and /account-recovery. Existing accounts are not reset or automatically suspended.

See [the integration guide](docs/member1/INTEGRATION.md) for setup, compatible model additions, API contracts, MFA rollout, private evidence boundaries and the A01–A08 checklist. See [operations](docs/member1/OPERATIONS.md) before cleanup or backup/restore, and [test evidence](docs/member1/TEST_EVIDENCE.md) for actual verification and pending reviews.

New activation, recovery and MFA completion require a MongoDB replica set. They fail closed on a standalone MongoDB deployment; existing team routes keep their existing behavior. Never reuse the test database for a demonstration or production.
