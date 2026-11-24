# Lost-and-found member tools — 25 November 2026

This update connects the existing Member 3 records to the shared discovery,
saved-interests and notification interfaces. It preserves the shared layout,
styles, notice bookmark API and Member 3 decision-popup polling.

## Search

`/search` retains notice and professor sources, and adds:

- `source=item`: authenticated lost-and-found search through the existing
  `/api/public/lost-found/items` route. Supports keyword, one item category,
  and server pagination. Visitors see a sign-in prompt without requesting item
  records. The backend remains the authentication authority.
- `source=all`: `/api/member-tools/search?q=...&page=...&limit=...` uses one
  MongoDB union/facet aggregation for the page, total and per-source counts.
  Results are sorted by lowercase title, source and ID. This is alphabetical
  discovery, not relevance ranking. Source-specific filters require selecting
  that source first.

Visitor combined search includes eligible notices and active professors only.
Lost-and-found documents, counts and source metadata are omitted entirely.
Authenticated combined search adds only currently listed, nondeleted items.
Search projections exclude contact details, ownership proof and private case
fields. Notice visibility still uses the shared trusted backend eligibility
filter. Queries use escaped contains matching across each source's supported
public fields. Personal and combined responses use `private, no-store`.
Notice keywords include the approved public body; unapproved working-copy
bodies and ineligible audience records are excluded. Authenticated mutations
also use the shared trusted-origin guard, including empty-body inbox actions.

Search state is keyed by the current account; pending private responses are
discarded on logout or account changes. Query parameters retain page/filter
state. Notice navigation also carries safe return context for the shared detail
page; returning to search can restore focus to the results heading.

## Saved items

The additive `MemberItemBookmark` collection stores owner/item references and a
unique owner/item index. Existing `MemberBookmark` notice records are unchanged.

| API | Meaning |
|---|---|
| `GET /api/member-tools/item-bookmarks` | Own saved item references, current availability, paginated |
| `GET /api/member-tools/item-bookmarks/:itemId` | Current eligible source and own saved status |
| `PUT /api/member-tools/item-bookmarks/:itemId` | Idempotent save; empty body, no caller-supplied identity |
| `DELETE /api/member-tools/item-bookmarks/:itemId` | Remove own reference, including unavailable sources |

The existing bookmark control now supports `itemId`. Listed item details offer
Save item, and Saved interests includes saved lost-and-found reports. Every read
rechecks listing/deletion status. Returned, resolved or deleted sources show a
generic unavailable record without retaining their title, summary or link.
Access to one's separate case history does not make a closed report bookmark
public again.

## Shared inbox

Publishing notifications retain their existing contract. Additive delivery
fields identify `source=LOST_FOUND` and a trusted `LostFoundCaseEvent` reference;
old notice deliveries default to `NOTICE`. The unique owner/event ID index
continues to prevent retries or concurrent refreshes creating duplicate rows.

Lost-and-found synchronization accepts only explicit event recipients. Each
listing, unread count and opening reloads the current event, claim and item.
Claimants receive their own case destination. A reporter receives the handover
update for their own report. Deleted claims/items or removed recipient access
become unavailable and stop contributing to unread counts. Finished but
nondeleted own claims/reports remain accessible through their private history.

Only current item titles, fixed event summaries and allowlisted own-case paths
enter the inbox response. Event payloads, proof text, contact details, decision
notes and other claimants' identity are never copied into deliveries. Opening
rechecks ownership on the server, and the client accepts only notice or own-case
paths. Inbox navigation retains return context.
Delayed opening responses from an unmounted account cannot navigate a later
account's interface.

The existing `inApp` preference gates future case deliveries. The `notices`
setting continues to control followed publication updates independently.
Re-enabling in-app delivery starts a new case delivery window and does not
replay disabled intervals; existing history remains. Case events become
globally marked delivered only after all declared recipients have a delivery.
Synchronization remains refresh-based; this does not add email, push or sockets.

## Verification and remaining limits

`backend/tests/member-tools.lostFound.test.js` covers authenticated item saves,
concurrent deduplication, owner separation, source revocation, visitor combined
search privacy, authoritative disjoint pages, case recipient/ownership checks,
handover destinations, proof/contact suppression and preference windows.
`frontend/src/member4/lost-found-integration.test.jsx` covers guest/pending search
privacy, combined search, account changes, saved-source removal and safe case
navigation. Portable Member 4 tests cover the source contracts and destinations.

No production data is created by these tests. This update does not add item-topic
subscriptions, relevance ranking, multiselect filters, email/push delivery or a
new authentication system. Production evidence storage and retention operations
are documented separately by their owning modules.
