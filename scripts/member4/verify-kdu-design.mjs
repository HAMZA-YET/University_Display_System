// Manual Chrome verification of the local KDU redesign only. Never visits production.
// Start the isolated frontend on 5187 (and its optional disposable API) first.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.UIDS_PLAYWRIGHT_MODULE || 'playwright');
const base = 'http://127.0.0.1:5187';
const output = new URL('../../node_modules/.cache/kdu-design/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('../../docs/kdu-media-manifest.json', import.meta.url), 'utf8'));
assert.equal(new URL(manifest.sourcePage).hostname, 'kduniv.ac.kr');
assert.ok(Array.isArray(manifest.assets) && manifest.assets.length > 0, 'Official media manifest must contain assets');
const assets = new Map();
for (const asset of manifest.assets) {
  assert.match(asset.publicPath, /^\/assets\/kdu\/originals\/[a-zA-Z0-9._-]+$/, 'Only local original-media paths are allowed');
  assert.equal(new URL(asset.publicPath, base).origin, base);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.ok(!assets.has(asset.publicPath), `Duplicate media path: ${asset.publicPath}`);
  assets.set(asset.publicPath, asset);
}

await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
context.setDefaultTimeout(15000);
const page = await context.newPage();
const checks = [], errors = [], blockedRequests = [], failedAssets = [], viewports = [], screenshots = [], skipped = [];
let decodedAssetCount = 0;
let videoPlayback = null;
let currentCheck = null;
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  const url = new URL(response.url());
  if (assets.has(url.pathname) && response.status() >= 400) failedAssets.push({ path: url.pathname, status: response.status() });
});
page.on('requestfailed', request => {
  const url = new URL(request.url());
  if (url.origin === base && assets.has(url.pathname)) failedAssets.push({ path: url.pathname, failure: request.failure()?.errorText });
});
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin === base) return route.continue();
  blockedRequests.push({ origin: url.origin, path: url.pathname });
  return route.abort();
});

async function check(name, run) {
  currentCheck = name;
  await run();
  checks.push(name);
  currentCheck = null;
}
async function visit(path = '/') {
  assert.ok(path.startsWith('/') && !path.startsWith('//'));
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForLoadState('networkidle');
  assert.equal(new URL(page.url()).origin, base);
}
async function screenshot(name) {
  await page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true });
  screenshots.push(name);
}
async function decodedLocalImage(locator) {
  await locator.waitFor({ state: 'visible' });
  const decoded = await locator.evaluate(async image => {
    await image.decode();
    return { src: image.currentSrc || image.src, width: image.naturalWidth, height: image.naturalHeight, alt: image.getAttribute('alt') };
  });
  const url = new URL(decoded.src);
  assert.equal(url.origin, base, 'Displayed university images must be local');
  assert.ok(assets.has(url.pathname), `Displayed image is absent from the official manifest: ${url.pathname}`);
  assert.ok(decoded.width > 0 && decoded.height > 0, `Image did not decode: ${url.pathname}`);
  assert.ok(typeof decoded.alt === 'string' && decoded.alt.trim().length > 0, `University photograph needs descriptive alt text: ${url.pathname}`);
  return decoded.src;
}
async function resultReport(status, failure, failureStack) {
  await fs.writeFile(new URL('results.json', output), JSON.stringify({
    status, passed: checks.length, checks, viewports, officialAssets: assets.size, decodedAssetCount,
    screenshots, errors, blockedRequests, failedAssets, skipped, videoPlayback,
    ...(failure ? { failedCheck: currentCheck, failure, failureStack } : {}),
    scope: 'Local Chrome preview only; no production browsing, account changes or data writes',
  }, null, 2));
}

try {
  await visit();
  await check('official media assets are local, available and byte-identical to their provenance manifest', async () => {
    for (const [publicPath, asset] of assets) {
      const response = await context.request.get(base + publicPath, { maxRedirects: 0 });
      assert.equal(response.status(), 200, `Original asset unavailable: ${publicPath}`);
      const bytes = await response.body();
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `Original asset bytes changed: ${publicPath}`);
      assert.equal(response.headers()['content-type']?.split(';')[0].trim().toLowerCase(), asset.contentType.split(';')[0].trim().toLowerCase(), `Unexpected media type: ${publicPath}`);
    }
    const decoded = await page.evaluate(async paths => Promise.all(paths.map(async path => {
      const image = new Image();
      image.src = path;
      await image.decode();
      return { path, width: image.naturalWidth, height: image.naturalHeight };
    })), [...assets.keys()]);
    for (const image of decoded) {
      assert.ok(image.width > 0 && image.height > 0, `Original image did not decode: ${image.path}`);
      const asset = assets.get(image.path);
      if (Number.isInteger(asset.width)) assert.equal(image.width, asset.width, image.path);
      if (Number.isInteger(asset.height)) assert.equal(image.height, asset.height, image.path);
    }
    decodedAssetCount = decoded.length;
    await decodedLocalImage(page.locator('.kdu-hero-photo'));
  });

  await check('official university and YouTube destinations are accessible semantic links', async () => {
    const links = await page.locator('a[href]').evaluateAll(elements => elements.map(link => ({
      href: link.href, target: link.target, rel: link.rel,
      name: [link.getAttribute('aria-label'), link.textContent, link.querySelector('img')?.alt].map(value => value?.trim()).find(Boolean) || '',
    })));
    const official = links.filter(link => { const url = new URL(link.href); return url.hostname === 'kduniv.ac.kr' || url.hostname.endsWith('.kduniv.ac.kr'); });
    const videos = links.filter(link => { const host = new URL(link.href).hostname; return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com'); });
    assert.ok(official.length > 0, 'Provide a semantic link to the official university site');
    assert.ok(videos.length > 0, 'Provide a semantic link to the official university video');
    const officialVideo = manifest.externalVideos?.find(video => video.provider === 'YouTube');
    if (officialVideo?.watchUrl) assert.ok(videos.some(link => link.href === officialVideo.watchUrl), 'Use the official homepage video destination');
    for (const link of [...official, ...videos]) {
      assert.equal(new URL(link.href).protocol, 'https:');
      assert.ok(link.name.length > 0, `External link needs an accessible name: ${link.href}`);
      if (link.target === '_blank') assert.ok(link.rel.split(/\s+/).includes('noopener'), `New-tab link needs noopener: ${link.href}`);
    }
  });

  const localVideo = manifest.externalVideos?.find(video => video.localDownload?.status === 'downloaded')?.localDownload;
  if (localVideo) {
    await check('official local film loads only after activation, plays, pauses and restores focus on Escape', async () => {
      assert.match(localVideo.publicPath, /^\/assets\/kdu\/originals\/[a-zA-Z0-9._-]+\.mp4$/);
      const videoPath = localVideo.publicPath;
      const requests = [];
      const recordVideo = request => { if (new URL(request.url()).pathname === videoPath) requests.push(request.url()); };
      // Earlier checks did not activate the film. The Performance API includes
      // requests made before this listener, so premature preload is checked too.
      assert.equal(await page.locator('video').count(), 0, 'Do not mount the film before user activation');
      assert.equal(await page.evaluate(path => performance.getEntriesByType('resource').filter(entry => new URL(entry.name, location.href).pathname === path).length, videoPath), 0, 'Do not request the film before user activation');
      page.on('request', recordVideo);
      try {
        const trigger = page.getByRole('button', { name: 'Play KDU official video', exact: true });
        await trigger.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog', { name: 'KDU Global — official university film', exact: true });
        await dialog.waitFor({ state: 'visible' });
        const video = dialog.locator('video');
        await page.waitForFunction(() => {
          const film = document.querySelector('[role="dialog"] video');
          return film && film.readyState >= 1 && film.videoWidth > 0 && Number.isFinite(film.duration);
        });
        const metadata = await video.evaluate(film => ({ src: film.currentSrc || film.src, width: film.videoWidth, height: film.videoHeight, duration: film.duration }));
        assert.equal(new URL(metadata.src).origin, base);
        assert.equal(new URL(metadata.src).pathname, videoPath);
        assert.equal(metadata.width, 640);
        assert.equal(metadata.height, 360);
        assert.ok(metadata.duration > 360 && metadata.duration < 370, 'Expected the complete approximately 365-second official film');
        assert.ok(requests.length > 0, 'User activation should request the local film');
        const start = await video.evaluate(film => film.currentTime);
        await video.focus();
        await page.keyboard.press('Space');
        await video.evaluate(async film => { if (film.paused) await film.play(); });
        await page.waitForFunction(time => {
          const film = document.querySelector('[role="dialog"] video');
          return film && !film.paused && film.currentTime > time + 0.2;
        }, start);
        const progressedTo = await video.evaluate(film => { film.pause(); return film.currentTime; });
        assert.equal(await video.evaluate(film => film.paused), true);
        // Read headers only. Cancel immediately even when a server answers200
        // rather than206, avoiding an explicit full-film download or hash.
        const controller = new AbortController();
        let rangeStatus;
        try {
          const response = await fetch(base + videoPath, { headers: { Range: 'bytes=0-1023' }, redirect: 'error', signal: controller.signal });
          rangeStatus = response.status;
          assert.ok([200, 206].includes(rangeStatus), 'Local film must support a successful media request');
          assert.equal(response.headers.get('content-type')?.split(';')[0].trim(), 'video/mp4');
          if (rangeStatus === 206) assert.match(response.headers.get('content-range') || '', /^bytes 0-1023\/\d+$/);
        } finally { controller.abort(); }
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await page.locator('video').count(), 0);
        assert.equal(await trigger.evaluate(button => document.activeElement === button), true);
        videoPlayback = { width: metadata.width, height: metadata.height, duration: metadata.duration, progressedTo, rangeStatus };
      } finally { page.off('request', recordVideo); }
    });
  } else skipped.push('Local official-film playback: manifest does not mark a downloaded MP4');

  await check('Campus in focus gallery changes decoded local photos with keyboard controls', async () => {
    const gallery = page.locator('.kdu-gallery');
    await page.getByRole('heading', { name: 'Campus in focus', exact: true }).waitFor();
    assert.equal(await gallery.locator('img').count(), 1, 'Gallery should expose one active photograph');
    const first = await decodedLocalImage(gallery.locator('img'));
    const next = gallery.getByRole('button', { name: 'Next university photo', exact: true });
    await next.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(src => {
      const image = document.querySelector('.kdu-gallery img');
      return image && (image.currentSrc || image.src) !== src;
    }, first);
    const second = await decodedLocalImage(gallery.locator('img'));
    assert.notEqual(second, first);
    await gallery.getByRole('button', { name: 'Previous university photo', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(src => {
      const image = document.querySelector('.kdu-gallery img');
      return image && (image.currentSrc || image.src) === src;
    }, first);
    assert.equal(await decodedLocalImage(gallery.locator('img')), first);
  });

  await check('home fits 320, 390, 768 and 1280 pixel viewports with decoded official imagery', async () => {
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await visit();
      await decodedLocalImage(page.locator('.kdu-hero-photo'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `Horizontal overflow at ${width}px`);
      viewports.push(width);
      if (width === 390) await screenshot('home-mobile.png');
      if (width === 1280) await screenshot('home-desktop.png');
    }
  });

  await check('mobile navigation opens by keyboard, retains application links and restores Escape focus', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visit();
    await page.getByRole('button', { name: 'Open menu', exact: true }).waitFor({ state: 'visible' });
    const menu = page.locator('button.menu-button');
    assert.equal(await menu.count(), 1, 'Expected one mobile navigation toggle');
    async function waitForMenuState(expected, label) {
      try {
        await page.waitForFunction(value => document.querySelector('button.menu-button')?.getAttribute('aria-expanded') === value, expected, { timeout: 10000 });
      } catch (error) {
        const observed = await menu.getAttribute('aria-expanded');
        throw new Error(`${label}: expected aria-expanded=${expected}, observed ${observed}`, { cause: error });
      }
      assert.equal(await menu.getAttribute('aria-expanded'), expected, label);
    }
    await menu.focus();
    await page.keyboard.press('Enter');
    await waitForMenuState('true', 'Keyboard Enter should open the mobile navigation');
    const navigation = page.getByRole('navigation', { name: 'Main', exact: true });
    const hrefs = await navigation.locator('a[href]').evaluateAll(links => links.map(link => new URL(link.href).pathname));
    for (const required of ['/notices', '/events', '/professors', '/items', '/search']) assert.ok(hrefs.includes(required), `Navigation lost ${required}`);
    await page.keyboard.press('Escape');
    await waitForMenuState('false', 'Keyboard Escape should close the mobile navigation');
    await page.waitForFunction(() => document.activeElement === document.querySelector('button.menu-button'));
    assert.equal(await menu.evaluate(button => document.activeElement === button), true, 'Escape should restore focus to the mobile navigation toggle');
    await menu.click();
    await waitForMenuState('true', 'Pointer activation should reopen the mobile navigation');
    await navigation.locator('a[href="/notices"]').click();
    await page.waitForURL(url => url.origin === base && url.pathname === '/notices');
    await page.getByRole('heading', { level: 1, name: 'Campus notices', exact: true }).waitFor({ state: 'visible' });
    await waitForMenuState('false', 'Selecting a navigation destination should close the mobile menu');
  });

  await check('home hero submits combined search with its keyword intact', async () => {
    await visit();
    const search = page.getByRole('search', { name: 'Search campus information', exact: true });
    await search.getByRole('searchbox').fill('campus design check');
    await search.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForURL(url => url.origin === base && url.pathname === '/search'
      && url.searchParams.get('source') === 'all' && url.searchParams.get('q') === 'campus design check');
    await page.getByRole('heading', { name: 'Search campus information', exact: true }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Search in', exact: true }).inputValue(), 'all');
    await page.waitForLoadState('networkidle');
  });

  currentCheck = 'final browser and network assertions';
  assert.deepEqual(blockedRequests, [], 'The local redesign attempted third-party network requests');
  assert.deepEqual(failedAssets, [], 'One or more official image requests failed');
  assert.deepEqual(errors, [], 'The browser reported page exceptions');
  currentCheck = null;
  await resultReport('passed');
  console.log(JSON.stringify({ passed: checks.length, officialAssets: assets.size, decodedAssetCount, viewports, screenshots, skipped, videoPlayback, scope: 'local Chrome preview only' }, null, 2));
} catch (error) {
  await resultReport('failed', error.message, error.stack);
  console.error(`Verification failed during: ${currentCheck || 'setup'}`);
  console.error(error.stack || error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
