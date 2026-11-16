# Member 4 — Discovery and member tools (D01–D06)

Review-ready isolated modules for Mahato Nitesh (Team Leader). These extend the existing React + Vite + JSX project; they do not replace the team application. All records, identities, follows, events and inbox deliveries are fictional/local mock demonstrations. D03–D06 are not production-integrated or approved. D07–D08 are excluded.

## Included modules

- Shared navigation/layout/footer, accessible form feedback, cards, tables, pagination, loading/empty/error states and scoped focus/responsive styles in frontend/src/member4/components.
- Public homepage, notices and details in discovery; unified keyword/filter/sort/page/URL-state tools in search.
- Public item discovery, allowlisted media placeholders, bookmarks, follows and shared preferences in items.
- Inbox/read counts/read transitions, preferences, event deduplication and safe source navigation in notifications.
- Replaceable synthetic adapters/fixtures in frontend/src/member4/mocks; pure mock service modules in backend/member4/mock. They register no HTTP endpoints and provide no real authentication or production authorization.
- Portable adapter/service regression tests in tests/member4. One existing fictional SVG is included as a demonstration illustration, not an actual photograph or evidence.

## Setup and integration status

Use the existing frontend dependency manifest and lockfile. No additional package/config/entrypoint is included. Use a Node version supported by the team's Vite version (Node 22.12+ recommended):

~~~sh
cd frontend
npm ci
npm run lint
npm run build
npm run dev -- --host 127.0.0.1
~~~

The default team application remains unchanged and will still show its current welcome screen. Member4Routes.jsx is an optional component, not a competing browser entrypoint. Leader L must approve and perform mounting/routing in the existing application before these pages appear in that app. See integration-requirements.md. The local original D02 showcase and detailed D01–D06 documents remain in the contributor's backup and are not duplicated here.

Run tests from the repository root:

~~~sh
node --test tests/member4/*.test.mjs
~~~

Shared components can be imported individually from frontend/src/member4/components. Full feature composition uses Member4Routes, whose member4-root wrapper scopes styles. Existing links use clean-path navigation/reloads; hosting fallback and the team's router must be agreed before wiring. Proposed paths: /, /notices, /notices/:id, /search, /search-record/:id, /items, /items/:id, /saved-interests and /notifications. These are review proposals, not reserved production routes.

## Mock boundaries

Synthetic Alpha/Beta selection is a test harness, not login. Browser storage is provisional and user-editable. A client member ID is never accepted as authenticated identity by the mock service context checks; those checks do not prove real cross-member security. Protected production routes remain disabled. Fixture visibility checks hide unavailable source details, but authoritative checks must run in trusted backend services. External/unverified/private media URLs are rejected. Report/claim/profile/directory destinations stay disabled pending owner confirmation.

Official Member 4 task-division alignment remains pending verification because that document is unavailable locally. Detailed user-provided D01–D06 checklists guided the existing implementation.
