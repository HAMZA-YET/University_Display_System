// Manual local verification only: never navigates to a production origin.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.UIDS_PLAYWRIGHT_MODULE || 'playwright');
const base = 'http://127.0.0.1:5187';
const fixture = JSON.parse(await fs.readFile(new URL('../../node_modules/.cache/member4-e2e-fixtures.json', import.meta.url)));
assert.equal(fixture.fictional, true);
assert.equal(fixture.baseURL, 'http://127.0.0.1:5017');
const output = new URL('../../node_modules/.cache/member4-final-review/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const checks = [], errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await context.route('**/*', (route) => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
async function visit(path) { await page.goto(base + path); await page.getByRole('heading', { level: 1 }).waitFor(); await page.waitForLoadState('networkidle'); }
async function check(name, run) { await run(); checks.push(name); }
async function shot(name) { await page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true }); }
try {
  await check('home search finds professors across sources and footer navigation starts at the page heading', async () => {
    await visit('/');
    const hero = page.getByRole('search', { name: 'Search campus information' });
    await hero.getByRole('searchbox').fill('Learning');
    await hero.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/search' && url.searchParams.get('source') === 'all');
    await page.getByRole('link', { name: 'Fictional Learning Professor (Demo)', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/professors' && url.searchParams.get('q') === 'Fictional Learning Professor (Demo)');
    await page.getByRole('heading', { name: 'Dr. Fictional Learning Professor (Demo)', exact: true }).waitFor();
    await page.locator('footer').getByRole('link', { name: 'Campus notices', exact: true }).click();
    await page.getByRole('heading', { name: 'Campus notices', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content');
  });
  await check('live filtered notice search, fictional label, detail and browser Back', async () => {
    await visit('/search?q=Integration&category=EXAM&department=BSC&sort=newest');
    await page.getByRole('link', { name: '[Sample] Integration exam', exact: true }).waitFor();
    await page.getByText('Sample content', { exact: true }).waitFor();
    await shot('search-desktop.png');
    await page.getByRole('link', { name: '[Sample] Integration exam', exact: true }).click();
    await page.getByRole('heading', { name: '[Sample] Integration exam', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Back to search', exact: true }).click();
    await page.getByRole('link', { name: '[Sample] Integration exam', exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement.id === 'campus-search-results');
    await page.getByRole('link', { name: '[Sample] Integration exam', exact: true }).click();
    await page.getByRole('heading', { name: '[Sample] Integration exam', exact: true }).waitFor();
    await page.goBack();
    await page.getByRole('link', { name: '[Sample] Integration exam', exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('category'), 'EXAM');
    await page.getByRole('link', { name: 'Clear search', exact: true }).click();
    assert.equal(new URL(page.url()).search, '');
  });
  await check('live professor search and explicit fictional profile badge', async () => {
    await visit('/search?source=professor&q=Learning&department=AI');
    await page.getByRole('heading', { name: 'Dr. Fictional Learning Professor (Demo)', exact: true }).waitFor();
    await page.getByText('Fictional sample profile', { exact: true }).waitFor();
    await shot('professor-search.png');
  });
  await check('invalid, empty, forced API error and retry states', async () => {
    await visit('/search?page=0');
    await page.getByText('Check the search filters', { exact: true }).waitFor();
    await visit('/search?q=zzzznomatchuidssentinel');
    await page.getByText('No matching information', { exact: true }).waitFor();
    await page.route('**/api/public/notices*', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Isolated browser test outage' } }) }));
    await visit('/search?q=Integration');
    await page.getByText('Search could not be completed', { exact: true }).waitFor();
    await page.unroute('**/api/public/notices*');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('link', { name: '[Sample] Integration exam', exact: true }).waitFor();
  });
  await check('synthetic login, bookmark, preferences and safe inbox navigation', async () => {
    await visit('/login');
    await page.getByLabel('Email', { exact: false }).fill(fixture.readerEmail);
    await page.getByLabel('Password', { exact: false }).fill(fixture.password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.waitForURL(base + '/');
    await visit('/notices/' + fixture.publicNoticeId);
    const bookmark = page.getByRole('button', { name: /^(Save notice|Remove bookmark)$/ });
    await bookmark.waitFor();
    // A previous verification run may already have saved this synthetic notice.
    if (await page.getByRole('button', { name: 'Remove bookmark', exact: true }).count()) {
      await page.getByRole('button', { name: 'Remove bookmark', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Save notice', exact: true }).click();
    await page.getByText('Notice saved to your account.', { exact: true }).waitFor();
    await visit('/saved-interests');
    await page.getByRole('link', { name: '[Sample] Integration exam', exact: true }).waitFor();
    await page.getByLabel('Enable in-app notifications').uncheck();
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await page.getByText('Notification preferences saved to your account.', { exact: true }).waitFor();
    await page.getByLabel('Enable in-app notifications').check();
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await page.getByText('Notification preferences saved to your account.', { exact: true }).waitFor();
    await visit('/notifications');
    await page.getByRole('button', { name: 'Refresh inbox', exact: true }).waitFor();
    // The API verifier may have consumed/read the same synthetic deliveries.
    await page.getByRole('heading', { name: '[Sample] Integration exam', exact: true }).waitFor();
    await shot('inbox-desktop.png');
    await page.getByRole('button', { name: 'Open notice', exact: true }).first().click();
    await page.waitForURL(/\/notices\/[a-f0-9]{24}$/);
  });
  await check('320/390/1280 responsive pages, keyboard skip link and mobile menu Escape', async () => {
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/search', '/saved-interests', '/notifications', '/items']) {
        await visit(path);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, width + ' ' + path);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await visit('/notifications');
    await page.getByRole('button', { name: 'Refresh inbox', exact: true }).waitFor();
    await shot('inbox-mobile.png');
    const account = page.locator('.account-menu');
    const summary = account.locator('summary');
    await summary.click();
    assert.equal(await account.evaluate(menu => menu.open), true);
    await page.keyboard.press('Escape');
    assert.equal(await account.evaluate(menu => menu.open), false);
    assert.equal(await summary.evaluate(element => element === document.activeElement), true);
    await summary.click();
    await page.mouse.click(8, 500);
    assert.equal(await account.evaluate(menu => menu.open), false);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Open menu', exact: true }).evaluate((button) => button === document.activeElement), true);
    await page.locator('.skip-link').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content');
  });
  await check('MFA login gates member tools; verified account works and logout revokes its copied JWT', async () => {
    await context.clearCookies();
    await visit('/login');
    await page.getByLabel('Email', { exact: false }).fill(fixture.mfaEmail);
    await page.getByLabel('Password', { exact: false }).fill(fixture.password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('heading', { name: 'Verify your sign-in', exact: true }).waitFor();
    assert.equal((await context.request.get(base + '/api/member-tools/inbox')).status(), 401);
    const code = fixture.mfaRecoveryCodes.shift();
    assert.ok(code, 'Restart disposable preview to replenish synthetic MFA recovery codes');
    await fs.writeFile(new URL('../../node_modules/.cache/member4-e2e-fixtures.json', import.meta.url), JSON.stringify(fixture, null, 2), { mode: 0o600 });
    await page.getByLabel('Authentication code', { exact: false }).fill(code);
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await page.waitForURL(base + '/');
    await visit('/saved-interests');
    await page.getByRole('heading', { name: 'Notification preferences', exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'Enable in-app notifications', exact: true }).waitFor();
    assert.equal((await context.request.get(base + '/api/member-tools/preferences')).status(), 200);
    const token = (await context.cookies(base)).find((cookie) => cookie.name === 'uids_token');
    assert.ok(token);
    await page.getByLabel('Account menu for Fictional MFA Member', { exact: true }).click();
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await page.waitForURL(base + '/');
    assert.equal((await context.request.get(base + '/api/member-tools/bookmarks', { headers: { Cookie: `uids_token=${token.value}` } })).status(), 401);
    assert.equal((await context.cookies(base)).some((cookie) => cookie.name === 'uids_token'), false);
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(new URL('browser-results.json', output), JSON.stringify({ passed: checks.length, checks, errors, scope: 'local synthetic preview only' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { await browser.close(); }
