// Stable fictional producer-event identities. No event payload titles or private data.
export const mockEvents=Object.freeze([
{id:'b-demo-001',sourceId:'notice-library-study-spaces',occurredAt:'2026-11-07T00:00:00Z'},
{id:'c-demo-001',sourceId:'lost-blue-notebook',occurredAt:'2026-11-07T01:00:00Z'},
{id:'c-demo-002',sourceId:'found-study-folder',occurredAt:'2026-11-07T02:00:00Z'},
{id:'c-demo-003',sourceId:'lost-blue-notebook',occurredAt:'2026-11-07T03:00:00Z'}
].map(event=>Object.freeze(event)));
