import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLiveSearch, liveSearchParams, searchConnectedRecords } from '../../frontend/src/member4/search/liveSearch.js';

const response = { data: [{ id: 'real-record', title: 'From the API' }], meta: { page: 2, limit: 12, total: 13, totalPages: 2 } };

test('notice search sends documented public fields and preserves server pagination', async () => {
  let sent;
  const controller = new AbortController();
  const result = await searchConnectedRecords('?q= library &department=CS&page=2&demo=empty&status=DRAFT', {
    signal: controller.signal,
    request: async (...args) => { sent = args; return response; },
  });
  assert.equal(sent[0], '/public/notices');
  assert.deepEqual(sent[1].params, { q: 'library', department: 'CS', page: 2, limit: 12 });
  assert.equal(sent[1].signal, controller.signal);
  assert.equal(result.records, response.data);
  assert.equal(result.meta, response.meta);
});

test('professor search uses the real directory endpoint', async () => {
  let endpoint;
  const result = await searchConnectedRecords('source=professor&q=machine+learning', {
    request: async (path) => { endpoint = path; return response; },
  });
  assert.equal(endpoint, '/professors');
  assert.equal(result.state.source, 'professor');
});

test('lost-and-found search requires a signed-in account and uses only its supported fields', async () => {
  const guest = await searchConnectedRecords('source=item&q=umbrella', { request: () => assert.fail('Guest requested item metadata') });
  assert.equal(guest.kind, 'signin');
  let sent;
  await searchConnectedRecords('source=item&q=umbrella&category=UMBRELLA&page=2', { signedIn: true,
    request: async (...args) => { sent = args; return response; },
  });
  assert.equal(sent[0], '/public/lost-found/items');
  assert.deepEqual(sent[1].params, { page: 2, limit: 12, q: 'umbrella', category: 'UMBRELLA' });
});

test('combined search uses one server-paginated endpoint and rejects source-specific filters', async () => {
  let sent;
  await searchConnectedRecords('source=all&q=campus&page=2', { request: async (...args) => { sent = args; return response; } });
  assert.equal(sent[0], '/member-tools/search');
  assert.deepEqual(sent[1].params, { page: 2, limit: 12, q: 'campus' });
  assert.equal((await searchConnectedRecords('source=all&department=CS')).kind, 'invalid');
  assert.equal((await searchConnectedRecords('source=item&category=EXAM', { signedIn: true })).kind, 'invalid');
});

test('invalid or duplicate filters never issue a request', async () => {
  for (const input of ['source=lost', 'source=__proto__', 'q=a&q=b', 'source=notice&source=professor', 'page=0', 'page=1.5', 'department=%24where', 'source=professor&department=ALL', `q=${'x'.repeat(101)}`]) {
    const result = await searchConnectedRecords(input, { request: () => { assert.fail('Invalid filters reached API'); } });
    assert.equal(result.kind, 'invalid', input);
  }
});

test('search links round-trip public filters without demo or account parameters', () => {
  const state = parseLiveSearch('source=professor&q=library&department=CS&page=3&demo=error&account=alpha').state;
  const params = liveSearchParams(state);
  assert.deepEqual(parseLiveSearch(params).state, state);
  assert.equal(params.has('demo'), false);
  assert.equal(params.has('account'), false);
});

test('unavailable, malformed and aborted API results never substitute fictional records', async () => {
  const unavailable = new Error('Database unavailable');
  await assert.rejects(searchConnectedRecords('', { request: async () => { throw unavailable; } }), unavailable);
  await assert.rejects(searchConnectedRecords('', { request: async () => '<html>frontend fallback</html>' }), /unexpected search response/);
  await assert.rejects(searchConnectedRecords('', { request: async () => { throw new DOMException('Cancelled', 'AbortError'); } }), { name: 'AbortError' });
  const empty = await searchConnectedRecords('', { request: async () => ({ data: [], meta: { page: 1, total: 0, totalPages: 1 } }) });
  assert.deepEqual(empty.records, []);
});
