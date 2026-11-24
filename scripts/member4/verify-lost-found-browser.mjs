// Local synthetic browser acceptance only. No production URLs or data are used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const { chromium } = await import(process.env.UIDS_PLAYWRIGHT_MODULE || 'playwright');
const base = 'http://127.0.0.1:5187';
const baseline = 'http://127.0.0.1:5188';
const fixture = JSON.parse(await fs.readFile(new URL('../../node_modules/.cache/member4-e2e-fixtures.json', import.meta.url), 'utf8'));
assert.equal(fixture.fictional, true);
assert.equal(fixture.baseURL, 'http://127.0.0.1:5017');
const output = new URL('../../node_modules/.cache/member3-integration/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks = [], errors = [];
async function session() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('**/*', route => [base, baseline].some(origin => route.request().url().startsWith(origin + '/')) ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}
async function visit(page, path) {
  await page.goto(base + path);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.waitForLoadState('networkidle');
}
async function login(page, email) {
  await visit(page, '/login');
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Password/).fill(fixture.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL(url => url.pathname !== '/login');
}
async function check(name, run) { await run(); checks.push(name); console.log('PASS ' + name); }
async function image(page, name) { await page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true }); }
let itemId, photoId, claimId, proofFileId, proofImage;
const title = '[Local test] Found navy backpack ' + Date.now().toString(36);
const proof = 'Fictional ownership proof: the inside pocket has a green star patch.';
const contact = 'fictional.owner@example.test';
try {
  const anonymous = await session(), viewer = await session(), reporter = await session(), claimant = await session(), admin = await session();
  await check('existing desktop/mobile header and footer match the previous built design', async () => {
    const old = await session();
    for (const width of [1280, 390]) {
      await old.page.setViewportSize({ width, height: 900 });
      await anonymous.page.setViewportSize({ width, height: 900 });
      await old.page.goto(baseline + '/');
      await old.page.waitForLoadState('networkidle');
      await visit(anonymous.page, '/');
      for (const selector of ['header.topbar', 'footer']) {
        const before = await old.page.locator(selector).screenshot({ animations: 'disabled' });
        const after = await anonymous.page.locator(selector).screenshot({ animations: 'disabled' });
        assert.equal(before.equals(after), true, `Existing ${selector} changed at ${width}px`);
      }
    }
    await old.context.close();
  });
  await check('members-only browse sends visitors to login and remains usable on small screens', async () => {
    await anonymous.page.goto(base + '/items');
    await anonymous.page.waitForURL(/\/login$/);
    await login(viewer.page, fixture.otherEmail);
    await visit(viewer.page, '/items');
    await viewer.page.getByRole('heading', { name: 'Lost something? Found something?' }).waitFor();
    assert.equal(await viewer.page.getByText('Service not connected', { exact: true }).count(), 0);
    for (const width of [320, 390, 1280]) {
      await viewer.page.setViewportSize({ width, height: 900 });
      assert.equal(await viewer.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Lost/found overflow at ${width}px`);
    }
    await image(viewer.page, 'lost-found-desktop.png');
  });
  await check('protected reporting returns through login and saves a report with a real image', async () => {
    await visit(reporter.page, '/items/report');
    await reporter.page.waitForURL(/\/login$/);
    await reporter.page.getByLabel(/^Email/).fill(fixture.readerEmail);
    await reporter.page.getByLabel(/^Password/).fill(fixture.password);
    await reporter.page.getByRole('button', { name: 'Log in', exact: true }).click();
    await reporter.page.waitForURL(base + '/items/report');
    await reporter.page.getByLabel('I found something', { exact: true }).check();
    await reporter.page.getByLabel(/^Title/).fill(title);
    await reporter.page.getByLabel(/^Description/).fill('Fictional navy backpack used only in this disposable browser test.');
    await reporter.page.getByLabel(/^Category/).selectOption({ index: 1 });
    await reporter.page.getByLabel(/^Where did you find it/).fill('Fictional library test desk');
    await reporter.page.getByLabel('Where is the item now?', { exact: true }).fill('Fictional collection office');
    await reporter.page.getByLabel('How can people reach you?', { exact: true }).fill(contact);
    const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#123c66' } }).png().toBuffer();
    await reporter.page.locator('input[type="file"]').setInputFiles({ name: 'fictional-item.png', mimeType: 'image/png', buffer: png });
    await reporter.page.getByRole('button', { name: 'Post report', exact: true }).click();
    await reporter.page.waitForURL(/\/items\/my-reports\/[a-f0-9]{24}$/);
    itemId = new URL(reporter.page.url()).pathname.split('/').pop();
    const own = await reporter.context.request.get(base + '/api/lost-found/me/items/' + itemId);
    assert.equal(own.status(), 200);
    const record = (await own.json()).data;
    assert.equal(record.photoIds.length, 1);
    photoId = record.photoIds[0];
    assert.equal((await anonymous.context.request.get(base + `/api/public/lost-found/items/${itemId}`)).status(), 401);
    const photo = await viewer.context.request.get(base + `/api/public/lost-found/items/${itemId}/photos/${photoId}`);
    assert.equal(photo.status(), 200);
    assert.equal(photo.headers()['cache-control'], 'private, no-store');
    assert.equal((await photo.body()).equals(png), true);
  });
  await check('search/detail hide private contact and prevent reporter self-claims', async () => {
    await visit(viewer.page, '/items?type=FOUND&q=navy%20backpack');
    await viewer.page.getByRole('link', { name: title, exact: true }).waitFor();
    await viewer.page.getByRole('link', { name: title, exact: true }).click();
    await viewer.page.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal(await viewer.page.getByText(contact, { exact: true }).count(), 0);
    await visit(reporter.page, '/items/' + itemId);
    await reporter.page.getByText('This is your report', { exact: true }).waitFor();
    assert.equal(await reporter.page.getByRole('button', { name: 'Claim', exact: true }).count(), 0);
    await viewer.page.setViewportSize({ width: 390, height: 844 });
    await image(viewer.page, 'lost-found-mobile.png');
  });
  await check('shared search and item bookmarks use live member-scoped records', async () => {
    const guest = await anonymous.context.request.get(base + '/api/member-tools/search', { params: { q: title } });
    assert.equal(guest.status(), 200);
    assert.equal((await guest.json()).meta.sources.includes('item'), false);
    await visit(viewer.page, '/search?source=all&q=' + encodeURIComponent(title));
    await viewer.page.getByRole('link', { name: title, exact: true }).click();
    await viewer.page.waitForURL(base + '/items/' + itemId);
    await viewer.page.getByRole('button', { name: 'Save item', exact: true }).click();
    await viewer.page.getByText('Item saved to your account.', { exact: true }).waitFor();
    await visit(viewer.page, '/saved-interests');
    await viewer.page.getByRole('heading', { name: 'Saved lost-and-found reports', exact: true }).waitFor();
    await viewer.page.getByRole('link', { name: title, exact: true }).waitFor();
    const outsider = await reporter.context.request.get(base + '/api/member-tools/item-bookmarks');
    assert.equal((await outsider.json()).data.length, 0);
  });
  await check('another member submits a private ownership claim with owner isolation', async () => {
    await login(claimant.page, fixture.otherEmail);
    await visit(claimant.page, '/items/' + itemId);
    await claimant.page.getByLabel(/^Proof of ownership/).fill(proof);
    await claimant.page.getByRole('button', { name: 'Claim', exact: true }).click();
    await claimant.page.waitForURL(/\/items\/my-claims\/[a-f0-9]{24}$/);
    claimId = new URL(claimant.page.url()).pathname.split('/').pop();
    assert.equal((await reporter.context.request.get(base + '/api/lost-found/me/claims/' + claimId)).status(), 404);
    const ownReport = await reporter.context.request.get(base + '/api/lost-found/me/items/' + itemId);
    assert.equal(JSON.stringify(await ownReport.json()).includes(proof), false);
  });
  await check('claimant uploads private proof and the reporter cannot read it', async () => {
    proofImage = await sharp({ create: { width: 18, height: 18, channels: 3, background: '#29684c' } }).png().toBuffer();
    const files = claimant.page.getByRole('region', { name: 'Private proof files' });
    await files.getByLabel(/^Attach a JPEG or PNG image/).setInputFiles({ name: 'fictional-ownership-proof.png', mimeType: 'image/png', buffer: proofImage });
    await files.getByRole('button', { name: 'Attach private proof', exact: true }).click();
    await files.getByText('Private proof attached.', { exact: true }).waitFor();
    const listed = await claimant.context.request.get(base + '/api/private-evidence/' + claimId);
    assert.equal(listed.status(), 200);
    const records = (await listed.json()).data;
    assert.equal(records.length, 1);
    proofFileId = records[0].fileId;
    assert.equal(JSON.stringify(records).includes('storageKey'), false);
    assert.equal((await reporter.context.request.get(base + `/api/private-evidence/${claimId}/${proofFileId}`)).status(), 403);
    assert.equal((await anonymous.context.request.get(base + `/api/private-evidence/${claimId}/${proofFileId}`)).status(), 401);
    await claimant.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await claimant.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
  await check('admin list links open the working review route and approval remains separate from handover', async () => {
    await login(admin.page, fixture.adminEmail);
    await visit(admin.page, '/admin/lost-found/items');
    await admin.page.getByRole('link', { name: title, exact: true }).click();
    await admin.page.waitForURL(base + '/admin/lost-found/items/' + itemId);
    await admin.page.getByRole('region', { name: 'Private proof files' }).getByText('fictional-ownership-proof.png', { exact: true }).waitFor();
    const proofRead = await admin.context.request.get(base + `/api/private-evidence/${claimId}/${proofFileId}`);
    assert.equal(proofRead.status(), 200);
    assert.equal(proofRead.headers()['cache-control'], 'private, no-store');
    assert.equal((await proofRead.body()).equals(proofImage), true);
    await admin.page.getByRole('button', { name: 'Approve', exact: true }).click();
    await admin.page.getByRole('dialog', { name: 'Approve this claim?' }).getByRole('button', { name: 'Approve', exact: true }).click();
    await admin.page.getByRole('button', { name: 'Record handover', exact: true }).waitFor();
    const listed = await viewer.context.request.get(base + '/api/public/lost-found/items/' + itemId);
    assert.equal(listed.status(), 200, 'Approval must not imply physical return');
    await claimant.page.reload();
    const collection = claimant.page.getByText('Where to collect:', { exact: true });
    await collection.waitFor();
    assert.match(await collection.locator('..').innerText(), /Fictional collection office/);
  });
  await check('shared inbox shows a private case decision without proof text and opens the owner case', async () => {
    await visit(claimant.page, '/notifications');
    const decision = claimant.page.locator('article').filter({ hasText: 'An ownership claim was approved.' });
    await decision.getByRole('heading', { name: title, exact: true }).waitFor();
    assert.equal((await claimant.page.locator('main').innerText()).includes(proof), false);
    await decision.getByRole('button', { name: 'Open case', exact: true }).click();
    await claimant.page.waitForURL(base + '/items/my-claims/' + claimId);
  });
  await check('physical handover removes public item/photo access while retaining authorized history', async () => {
    await admin.page.getByRole('button', { name: 'Record handover', exact: true }).click();
    const dialog = admin.page.getByRole('dialog', { name: 'Record handover' });
    await dialog.getByLabel(/^Collected by/).fill('Fictional Other Member');
    await dialog.getByRole('checkbox', { name: /I checked the collector/ }).check();
    await dialog.getByRole('button', { name: 'Record handover', exact: true }).click();
    await admin.page.getByText('Handover recorded. The item is now returned to its owner.', { exact: true }).waitFor();
    assert.equal((await viewer.context.request.get(base + '/api/public/lost-found/items/' + itemId)).status(), 404);
    assert.equal((await viewer.context.request.get(base + `/api/public/lost-found/items/${itemId}/photos/${photoId}`)).status(), 404);
    assert.equal((await reporter.context.request.get(base + `/api/lost-found/items/${itemId}/photos/${photoId}`)).status(), 200);
    assert.equal((await claimant.context.request.get(base + `/api/lost-found/items/${itemId}/photos/${photoId}`)).status(), 404);
    const saved = await viewer.context.request.get(base + '/api/member-tools/item-bookmarks');
    const entry = (await saved.json()).data.find(row => row.itemId === itemId);
    assert.equal(entry.available, false);
    assert.equal(entry.item, null);
  });
  await check('admin assigns trusted campus audiences and previous user sessions are revoked', async () => {
    await visit(admin.page, '/admin/users');
    const account = admin.page.getByRole('row').filter({ hasText: fixture.otherEmail });
    await account.getByRole('button', { name: 'Edit audiences', exact: true }).click();
    const dialog = admin.page.getByRole('dialog', { name: 'Change campus audiences', exact: true });
    await dialog.getByRole('checkbox', { name: 'Students', exact: true }).check();
    await dialog.getByRole('button', { name: 'Confirm change', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await claimant.context.request.get(base + '/api/auth/me')).status(), 401);
    assert.equal((await viewer.context.request.get(base + '/api/member-tools/item-bookmarks')).status(), 401);
  });
  assert.deepEqual(errors, []);
  const report = { passed: checks.length, checks, errors, scope: 'Chrome; disposable local data only; no production writes' };
  await fs.writeFile(new URL('browser-results.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
