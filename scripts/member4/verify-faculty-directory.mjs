// Read-only checks for the isolated preview or the public deployed directory.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.UIDS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UIDS_FACULTY_BASE || 'http://127.0.0.1:5187';
assert.ok(['http://127.0.0.1:5187', 'https://university-display-system.vercel.app'].includes(base));
const catalog = JSON.parse(await fs.readFile(new URL('../../backend/src/data/kdu-faculty.json', import.meta.url), 'utf8'));
const output = new URL(`../../node_modules/.cache/faculty-directory-${base.startsWith('https:') ? 'production' : 'local'}/`, import.meta.url);
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
context.setDefaultTimeout(30000);
const page = await context.newPage(), checks = [], errors = [], blocked = [];
page.on('pageerror', error => errors.push(error.message));
await context.route('**/*', route => {
  const request = route.request();
  if (new URL(request.url()).origin === base && ['GET', 'HEAD'].includes(request.method())) return route.continue();
  blocked.push({ method: request.method(), path: new URL(request.url()).pathname });
  return route.abort();
});
async function check(name, run) { await run(); checks.push(name); }
async function get(path) {
  const response = await context.request.get(base + path, { maxRedirects: 0 });
  assert.equal(response.status(), 200, path);
  return response;
}
async function visit(path) { await page.goto(base + path); await page.getByRole('heading', { level: 1 }).first().waitFor(); }
try {
  await check('all 58 sourced identities retain exact names, portraits and published facts', async () => {
    const response = await (await get('/api/professors?limit=100')).json();
    const records = response.data.filter(profile => profile.sourceKey);
    assert.equal(records.length, catalog.profiles.length);
    for (const expected of catalog.profiles) {
      const profile = records.find(record => record.sourceKey === 'kdu-global:' + expected.slug);
      assert.ok(profile, expected.slug);
      for (const key of ['name', 'profileImage', 'positionLabel', 'roles', 'qualifications']) assert.deepEqual(profile[key], expected[key]);
      assert.equal(profile.email, expected.email?.toLowerCase() || null);
      assert.equal(profile.sourceUrl, catalog.sourceUrl);
      for (const key of ['department', 'officeRoom', 'officeBuilding', 'phone']) assert.equal(profile[key], null);
      assert.deepEqual(profile.subjects, []);
      assert.deepEqual(profile.counsellingHours, []);
    }
  });
  await check('all 58 local portraits match source hashes and decode at original dimensions', async () => {
    for (const photo of catalog.profiles) assert.equal(createHash('sha256').update(await (await get(photo.profileImage)).body()).digest('hex'), photo.sha256);
    await visit('/professors');
    const sizes = await page.evaluate(async paths => Promise.all(paths.map(async path => {
      const image = new Image(); image.src = path; await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    })), catalog.profiles.map(profile => profile.profileImage));
    sizes.forEach((size, i) => assert.deepEqual(size, [catalog.profiles[i].width, catalog.profiles[i].height]));
  });
  await check('roles and qualifications are searchable and open the correct named directory card', async () => {
    const first = catalog.profiles[0], role = first.roles.find(value => value !== first.positionLabel);
    const query = new URLSearchParams({ q: role });
    const directory = await (await get('/api/professors?' + query)).json();
    assert.ok(directory.data.some(profile => profile.sourceKey === 'kdu-global:' + first.slug));
    const combined = await (await get('/api/member-tools/search?' + new URLSearchParams({ q: 'Development Policy' }))).json();
    assert.ok(combined.data.some(record => record.source === 'professor' && record.title === first.name));
    await visit('/search?' + new URLSearchParams({ source: 'all', q: role }));
    await page.getByRole('link', { name: first.name, exact: true }).first().click();
    await page.waitForURL(url => url.pathname === '/professors' && url.searchParams.get('q') === first.name);
    await page.locator('.prof-card-official').first().waitFor();
    await page.getByRole('heading', { name: first.name, exact: true }).waitFor();
    assert.equal(await page.locator('.prof-card-official').count(), 1);
  });
  await check('unpublished emails and counselling hours are not invented', async () => {
    const missing = catalog.profiles.find(profile => profile.email === null);
    await visit('/professors?' + new URLSearchParams({ q: missing.name }));
    await page.getByRole('heading', { name: missing.name, exact: true }).waitFor();
    const card = page.locator('.prof-card-official');
    await card.getByText('Not published', { exact: true }).waitFor();
    assert.equal(await card.locator('a[href^="mailto:"]').count(), 0);
    assert.equal(await card.getByText('By appointment only.', { exact: true }).count(), 0);
    await card.getByText('Office and counselling details are not published.', { exact: true }).waitFor();
  });
  await check('directory and portraits fit four viewport widths without upscaling or overflow', async () => {
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await visit('/professors');
      await page.locator('.prof-card-official').first().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`);
      assert.ok(await page.locator('.prof-card-official img').first().evaluate(async image => { await image.decode(); return image.naturalWidth > 0 && image.clientWidth <= image.naturalWidth; }));
      if ([390,1280].includes(width)) await page.screenshot({ path: fileURLToPath(new URL(`directory-${width}.png`, output)) });
    }
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  const report = { base, passed: checks.length, checks, portraits: catalog.profiles.length, viewports: [320,390,768,1280], errors, blocked, productionWrites: 0 };
  await fs.writeFile(new URL('results.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
