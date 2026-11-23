import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const fixture = JSON.parse(await fs.readFile(new URL('../../node_modules/.cache/member4-e2e-fixtures.json', import.meta.url), 'utf8'));
assert.equal(fixture.fictional, true);
assert.equal(fixture.baseURL, 'http://127.0.0.1:5017');
const checks = [];
async function request(path, { cookie = '', method = 'GET', body } = {}) {
  assert.ok(path.startsWith('/api/'));
  const response = await fetch(fixture.baseURL + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const setCookies = response.headers.getSetCookie();
  return { status: response.status, data: await response.json(), setCookies, cookie: setCookies.map((value) => value.split(';')[0]).join(';') };
}
async function check(name, run) { await run(); checks.push(name); }
let a, b;
try {
  await check('ready health uses the disposable loopback database', async () => assert.equal((await request('/api/ready')).data.data.ready, true));
  await check('public notices exclude CAMPUS, drafts and withdrawn content', async () => {
    const dates = new URLSearchParams({ from: fixture.publicationDate + 'T00:00:00+09:00', to: fixture.publicationDate + 'T23:59:59.999+09:00' });
    const result = await request('/api/public/notices?q=Integration&category=EXAM&department=BSC&sort=newest&' + dates);
    assert.equal(result.status, 200); assert.deepEqual(result.data.data.map((row) => row.id), [fixture.publicNoticeId]);
    assert.equal((await request('/api/public/notices/' + fixture.campusNoticeId)).status, 404);
    assert.equal((await request('/api/public/notices/' + fixture.draftId)).status, 404);
    assert.equal((await request('/api/public/notices/' + fixture.withdrawnId)).status, 404);
  });
  await check('unknown public status filter is rejected, personal APIs require authentication', async () => {
    assert.equal((await request('/api/public/notices?status=DRAFT')).status, 400);
    assert.equal((await request('/api/member-tools/inbox')).status, 401);
    assert.equal((await request('/api/member-tools/bookmarks')).status, 401);
  });
  await check('professor keyword and department search use fictional live directory records', async () => {
    const result = await request('/api/professors?q=Learning&department=AI');
    assert.equal(result.status, 200);
    assert.equal(result.data.meta.total, 1);
    assert.equal(result.data.data[0].name, 'Fictional Learning Professor (Demo)');
    assert.equal((await request('/api/professors?q=Learning&department=BSC')).data.meta.total, 0);
  });
  await check('real cookie login and current identity, invalid login denied', async () => {
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: fixture.readerEmail, password: 'WrongPassword123' } })).status, 401);
    a = await request('/api/auth/login', { method: 'POST', body: { email: fixture.readerEmail, password: fixture.password } });
    b = await request('/api/auth/login', { method: 'POST', body: { email: fixture.otherEmail, password: fixture.password } });
    assert.equal(a.status, 200); assert.equal(b.status, 200); assert.ok(a.cookie);
    assert.equal((await request('/api/auth/me', { cookie: a.cookie })).data.data.email, fixture.readerEmail);
  });
  await check('authenticated visibility and role authorization remain server enforced', async () => {
    assert.equal((await request('/api/public/notices/' + fixture.campusNoticeId, { cookie: a.cookie })).status, 200);
    assert.equal((await request('/api/notices', { cookie: a.cookie })).status, 403);
    assert.equal((await request('/api/admin/pending-count', { cookie: a.cookie })).status, 403);
    const first = await request('/api/public/notices?limit=1&page=1', { cookie: a.cookie });
    const second = await request('/api/public/notices?limit=1&page=2', { cookie: a.cookie });
    assert.equal(first.data.meta.total, 2); assert.notEqual(first.data.data[0].id, second.data.data[0].id);
  });
  const bookmarkPath = '/api/member-tools/bookmarks/' + fixture.publicNoticeId;
  await check('bookmark saves are idempotent and client identity spoofing is rejected', async () => {
    assert.equal((await request(bookmarkPath, { method: 'PUT', cookie: a.cookie, body: { owner: 'other-member' } })).status, 400);
    for (let i = 0; i < 2; i++) assert.equal((await request(bookmarkPath, { method: 'PUT', cookie: a.cookie, body: {} })).status, 200);
    assert.equal((await request('/api/member-tools/bookmarks', { cookie: a.cookie })).data.meta.total, 1);
    assert.equal((await request('/api/member-tools/bookmarks', { cookie: b.cookie })).data.meta.total, 0);
  });
  await check('follow duplicate prevention and preference isolation', async () => {
    const follow = await request('/api/member-tools/follows', { method: 'POST', cookie: a.cookie, body: { kind: 'category', target: 'EXAM' } });
    assert.equal(follow.data.data.length, 1);
    await request('/api/member-tools/inbox', { cookie: a.cookie });
    assert.equal((await request('/api/member-tools/follows', { cookie: b.cookie })).data.data.length, 0);
    assert.equal((await request('/api/member-tools/preferences', { method: 'PATCH', cookie: a.cookie, body: { notices: false } })).data.data.notices, false);
    assert.equal((await request('/api/member-tools/preferences', { cookie: b.cookie })).data.data.notices, true);
    await request('/api/member-tools/preferences', { method: 'PATCH', cookie: a.cookie, body: { notices: true } });
  });
  // Seeded follows already predate publications; do not disable delivery before the first read.
  await check('inbox listing is owner-scoped and repeated synchronization deduplicates deliveries', async () => {
    const first = await request('/api/member-tools/inbox', { cookie: a.cookie });
    const second = await request('/api/member-tools/inbox', { cookie: a.cookie });
    // Existing delivered history remains after preferences are re-enabled.
    assert.equal(first.status, 200); assert.equal(first.data.meta.total, 2); assert.deepEqual(second.data.data.map((row) => row.id), first.data.data.map((row) => row.id));
    assert.equal((await request('/api/member-tools/inbox', { cookie: b.cookie })).data.meta.total, 0);
  });
  await check('notification navigation, read/unread/all and cross-member denial use real APIs', async () => {
    const initial = (await request('/api/member-tools/inbox', { cookie: a.cookie })).data;
    const id = initial.data.find((row) => row.available).id;
    const url = '/api/member-tools/inbox/' + id;
    assert.equal((await request(url + '/open', { cookie: b.cookie })).status, 404);
    assert.equal((await request(url, { cookie: b.cookie, method: 'PATCH', body: { read: true } })).status, 404);
    assert.match((await request(url + '/open', { cookie: a.cookie })).data.data.href, /^\/notices\/[a-f0-9]{24}$/);
    const read = await request(url, { cookie: a.cookie, method: 'PATCH', body: { read: true } });
    assert.equal(read.data.data.read, true);
    const unread = await request(url, { cookie: a.cookie, method: 'PATCH', body: { read: false } });
    assert.equal(unread.data.data.read, false); assert.ok(unread.data.data.unread > 0);
    assert.equal((await request('/api/member-tools/inbox/read-all', { cookie: a.cookie, method: 'POST', body: {} })).data.data.unread, 0);
    await request(url, { cookie: a.cookie, method: 'PATCH', body: { read: false } });
  });
  await check('bookmark removal and connected lost-and-found API use live data', async () => {
    assert.equal((await request(bookmarkPath, { method: 'DELETE', cookie: a.cookie })).status, 200);
    assert.equal((await request(bookmarkPath, { cookie: a.cookie })).data.data.saved, false);
    const items = await request('/api/public/lost-found/items');
    assert.equal(items.status, 200);
    assert.ok(Array.isArray(items.data.data));
    assert.ok(items.data.meta);
    const capabilities = await request('/api/public/lost-found/capabilities');
    assert.equal(capabilities.status, 200);
    assert.equal(capabilities.data.data.maxPhotos, 3);
  });
  await check('logout clears the browser session cookie; cleared-cookie requests are unauthenticated', async () => {
    const logout = await request('/api/auth/logout', { cookie: b.cookie, method: 'POST', body: {} });
    assert.equal(logout.status, 200);
    const cleared = logout.setCookies.find((value) => value.startsWith('uids_token='));
    assert.ok(cleared, 'Logout must send the session cookie');
    assert.match(cleared, /^uids_token=;/);
    assert.match(cleared, /Expires=Thu, 01 Jan 1970/i);
    assert.match(cleared, /HttpOnly/i);
    assert.equal((await request('/api/auth/me', { cookie: logout.cookie })).status, 401);
    assert.equal((await request('/api/auth/me', { cookie: b.cookie })).status, 401, 'Copied JWT must be revoked');
    assert.equal((await request('/api/member-tools/bookmarks', { cookie: b.cookie })).status, 401);
    assert.equal((await request('/api/auth/me', { cookie: a.cookie })).status, 200, 'Other session must remain valid');
  });
  await check('MFA challenge is not member identity; verified session supports member tools and logout revokes copied token', async () => {
    const login = await request('/api/auth/login', { method: 'POST', body: { email: fixture.mfaEmail, password: fixture.password } });
    assert.deepEqual(login.data.data, { mfaRequired: true });
    assert.equal((await request('/api/member-tools/inbox', { cookie: login.cookie })).status, 401);
    const code = fixture.mfaRecoveryCodes.shift();
    assert.ok(code, 'Restart disposable preview to replenish synthetic MFA recovery codes');
    await fs.writeFile(new URL('../../node_modules/.cache/member4-e2e-fixtures.json', import.meta.url), JSON.stringify(fixture, null, 2), { mode: 0o600 });
    const verified = await request('/api/security/mfa/verify', { cookie: login.cookie, method: 'POST', body: { code } });
    assert.equal(verified.status, 200);
    assert.equal((await request('/api/member-tools/preferences', { cookie: verified.cookie })).status, 200);
    assert.equal((await request('/api/member-tools/bookmarks/' + fixture.publicNoticeId, { cookie: verified.cookie, method: 'PUT', body: {} })).status, 200);
    assert.equal((await request('/api/member-tools/bookmarks', { cookie: verified.cookie })).data.meta.total, 1);
    assert.equal((await request('/api/member-tools/inbox', { cookie: verified.cookie })).data.meta.total, 0);
    assert.equal((await request('/api/auth/logout', { cookie: verified.cookie, method: 'POST', body: {} })).status, 200);
    assert.equal((await request('/api/member-tools/bookmarks', { cookie: verified.cookie })).status, 401);
    assert.equal((await request('/api/security/mfa/verify', { cookie: login.cookie, method: 'POST', body: { code } })).status, 400, 'Recovery code/challenge replay must fail');
  });
  await fs.writeFile(new URL('../../node_modules/.cache/member4-e2e-api-results.json', import.meta.url), JSON.stringify({ passed: checks.length, checks, scope: 'disposable local replica set; not production' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} catch (error) { console.error(error); process.exitCode = 1; }
