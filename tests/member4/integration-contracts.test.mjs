import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseLiveSearch, liveSearchParams, searchConnectedRecords } from '../../frontend/src/member4/search/liveSearch.js';
import { noticeDestination } from '../../frontend/src/member4/data/noticeDestination.js';
const require = createRequire(import.meta.url);
const { publicListQuery } = require('../../backend/src/modules/notices/notice.schemas.js');

test('notice filters round-trip and match the actual backend public schema', async () => {
  const input = 'q=exam&category=EXAM&department=CS&from=2026-11-01&to=2026-11-19&sort=newest&page=2';
  let sent;
  const result = await searchConnectedRecords(input, { request: async (endpoint, config) => {
    sent = { endpoint, params: config.params };
    return { data: [], meta: { page: 2, total: 0, totalPages: 1 } };
  } });
  assert.equal(sent.endpoint, '/public/notices');
  assert.equal(sent.params.from, '2026-11-01T00:00:00.000+09:00');
  assert.equal(sent.params.to, '2026-11-19T23:59:59.999+09:00');
  assert.equal(sent.params.category, 'EXAM'); assert.equal(sent.params.sort, 'newest');
  assert.equal(publicListQuery.safeParse(sent.params).success, true);
  assert.deepEqual(parseLiveSearch(liveSearchParams(result.state)).state, result.state);
});

test('invalid dates, categories, sorts and professor-only mismatches never call API', async () => {
  for (const query of ['from=2026-02-30', 'from=2026-12-01&to=2026-11-01', 'category=DRAFT', 'category=EXAM&category=GENERAL', 'sort=oldest', 'source=professor&from=2026-11-01', 'source=professor&category=EXAM', 'source=professor&sort=newest']) {
    assert.equal((await searchConnectedRecords(query, { request: () => assert.fail(query) })).kind, 'invalid', query);
  }
});

test('notification destinations reject external URLs, wrong record types and extra context', () => {
  assert.equal(noticeDestination('/notices/012345678901234567890123'), '/notices/012345678901234567890123');
  for (const value of ['https://evil.invalid/notices/012345678901234567890123', '//evil.invalid', '/author/notices/012345678901234567890123', '/notices/012345678901234567890123?redirect=evil', '/items/012345678901234567890123', null, 'javascript:alert(1)']) assert.throws(() => noticeDestination(value), /unavailable/);
});
