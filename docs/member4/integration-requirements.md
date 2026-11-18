# Integration requirements

## Current integration

The repository application now mounts Member 4 routes inside the shared Member 2 layout and React Router. Public search uses the server's notice and professor APIs. Member tools use authenticated API routes and MongoDB persistence. Synthetic identity selectors, event injection and visibility test switches are excluded from deployed routes. The earlier proposal below is retained as submission context; its instruction to leave the welcome-screen entry point unchanged no longer describes the integrated application.

No existing repository file is changed. All added paths were absent from main at the reviewed base. Existing member placeholders may overlap by responsibility; this contribution deliberately leaves them untouched. The isolated member4 namespace is a review boundary, not a second application.

## Exact pending host changes (owner to perform)

1. Leader L must review frontend/src/member4/Member4Routes.jsx and decide route ownership with all members. Import/mount it through the existing frontend/src/App.jsx or approved router only after agreement. The PR does not edit App.jsx, main.jsx, index.html, CSS, manifests, lockfiles or workflow configuration.
2. Adopt the approved paths in README.md; replace window pathname/reload links with the shared routing convention as necessary. Configure clean-path fallback for hosted routes. Reconcile / and other shared paths with existing/planned screens.
3. Keep the member4-root wrapper for scoped CSS when composing the optional component; agree shared UI exports/design tokens before moving or deduplicating components. Existing team styles remain unchanged.
4. Replace mocks at the adapter boundary; do not expose synthetic selectors, visibility switches or event-preview controls in production. Backend mock modules are imported by browser adapters only for local demonstration. Wire genuine protected endpoints only after trusted identity, authorization, persistence and event authenticity exist.
5. Run exact-lockfile npm ci and the normal team lint/build in a standard developer environment; repeat mounted browser checks after real router wiring. Existing workflow/package scripts are unchanged and may require leader-owned adjustments to run frontend checks from the correct directory.

## Contracts requiring confirmation

| Owner | Required confirmation |
| --- | --- |
| Member A | Trusted current-member session/identity, authorization and error semantics; validated public media descriptors, withdrawal/revocation, alt text and allowed origins; account/profile route. No client account selector may substitute for identity. |
| Member B | Approved/public notice fields and IDs, lifecycle/withdrawal visibility, pagination/detail/search semantics; authenticated publication events and stable revision/event IDs; source checks on saved/inbox opens. |
| Member C | Eligible lost/found fields, permitted location and safe office contact, media eligibility, item lifecycle/events; report/claim destination routes. Reporting, claim decisions and handover are not implemented here. |
| Leader L | Directory/category/department IDs and labels; unified search/routing ownership; persistence technology, endpoint names, response/error shapes, event delivery/idempotency retention rules and review of shared UI overlap. |

Service method names and JSON snapshots describe local behavior only. No permanent API, database schema or authentication design is agreed. Synthetic cross-member denial, follow matching, deduplication and visibility tests are mock behavior tests, not evidence of production security. Search filtering is not backend authorization.

D01–D06 detailed planning is retained locally. Obtain the official Individual Task Division and verify alignment before approval. Real integration, exact dependency reproducibility, team review and production access-control tests remain outstanding. No D07/D08 work is included.
