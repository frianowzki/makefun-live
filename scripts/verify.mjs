// The browser suite for app/ (Node 22, the standard library and the existing Playwright): serve app/ on a random
// loopback port, drive the five surfaces at 1280, 768 and 390 px wide with a real Chromium, and fail on anything a
// visitor would see go wrong: a console error, an uncaught page error, a broken image, horizontal overflow, a stuck
// loading state, an unhonest empty or error view.
//
//   node scripts/verify.mjs            run it; exit 0 when every check passes, 1 when one fails, 2 when Playwright is
//                                      unavailable (nothing is pretended in that case)
//
// Playwright is not installed here: it is the copy beside this repository (C:/Users/friok/makefun/node_modules),
// else a resolution of the module name. Evidence is written outside the repository, under MAKEFUN_EVIDENCE
// (C:/Users/friok/makefun/recorded-v5-evidence by default): the JSON report, the three JPEG captures that go into
// screenshots/, and a full-page capture of each route at each width.
//
// Live data moves while the suite runs, so every comparison against the API uses the response the browser itself
// received for that view (captured from the page's own network traffic), never a second request made afterwards.

import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appDir = join(repo, 'app');
const evidence = resolve(process.env.MAKEFUN_EVIDENCE ?? 'C:/Users/friok/makefun/recorded-v5-evidence');
const reportDir = join(evidence, 'browser-report');
const shotDir = join(evidence, 'screenshots-build');

const API_ORIGIN = 'https://make.fun';
/** The public API lives under /api: an endpoint path is appended to this, never to the origin alone (which 404s). */
const API_BASE = `${API_ORIGIN}/api`;
/** Origins an avatar may legitimately come from: make.fun's own storage, and the GitHub avatars the API returns. */
const AVATAR_ORIGINS = [`${API_ORIGIN}/`, 'https://avatars.githubusercontent.com/'];
const ROUTES = ['#/', '#/bounty/makefun-frontend-01', '#/bounty/bring-the-humans-01/leaderboard', '#/hunters', '#/u/gentle-badger-68'];
const WIDTHS = [1280, 768, 390];
const HEIGHT = 800;

/** The three captures the entry hands in: the desktop viewport, and the theme the entry advertises (the cover light). */
const CAPTURES = [
  { file: '1-board.jpg', route: '#/', theme: 'light' },
  { file: '2-bounty.jpg', route: '#/bounty/makefun-frontend-01', theme: 'light' },
  { file: '3-leaderboard.jpg', route: '#/bounty/bring-the-humans-01/leaderboard', theme: 'dark' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

const checks = [];
const failures = [];
function check(ok, label, detail) {
  const record = { ok: Boolean(ok), label, ...(detail === undefined ? {} : { detail }) };
  checks.push(record);
  if (!record.ok) failures.push(record);
  return record.ok;
}

/** A static server for app/ on a port the OS picks: its own filesystem reads, no build step, no proxy. */
function serveApp() {
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400, { 'content-type': 'text/plain' }).end('bad request');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    // A blank same-origin page for the suite's own use (storing a theme before a capture): no app code, no requests.
    if (pathname === '/__verify') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end('<!doctype html><meta charset="utf-8"><title>probe</title>');
      return;
    }
    const file = resolve(join(appDir, normalize(pathname)));
    if (file !== appDir && !file.startsWith(appDir + sep)) {
      response.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
      return;
    }
    let stats;
    try {
      stats = statSync(file);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    if (!stats.isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(response);
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

/** Playwright's chromium: the copy beside this repository, else the module itself, else an error that says both. */
async function loadChromium() {
  const attempts = [];
  try {
    const require = createRequire(import.meta.url);
    const playwright = require('C:/Users/friok/makefun/node_modules/playwright');
    if (playwright?.chromium) return playwright.chromium;
    attempts.push("require('C:/Users/friok/makefun/node_modules/playwright') answered without a chromium export");
  } catch (error) {
    attempts.push(`require('C:/Users/friok/makefun/node_modules/playwright'): ${error.message}`);
  }
  try {
    const module = await import('playwright');
    const chromium = module.chromium ?? module.default?.chromium;
    if (chromium) return chromium;
    attempts.push("import('playwright') answered without a chromium export");
  } catch (error) {
    attempts.push(`import('playwright'): ${error.message}`);
  }
  throw new Error(`Playwright is unavailable, so nothing was tested:\n  ${attempts.join('\n  ')}`);
}

/** The app flags __shotReady true when a route has finished rendering, __error when it failed: wait for the first, read both. */
async function settle(page, label) {
  try {
    await page.waitForFunction(() => window.__shotReady === true, undefined, { timeout: 45000 });
  } catch {
    const preview = await page.evaluate(() => (document.querySelector('main')?.innerText ?? '').slice(0, 200)).catch(() => '');
    check(false, `${label}: view settles (__shotReady)`, preview);
    return false;
  }
  const state = await page.evaluate(() => ({ error: window.__error, busy: document.querySelector('main')?.getAttribute('aria-busy') }));
  check(state.error === false, `${label}: no render error (__error honest)`, state);
  check(state.busy === 'false', `${label}: main is not left busy`, state.busy);
  return state.error === false;
}

/**
 * What a visitor would notice on the rendered page: one h1 with text, every image that was actually requested finished
 * with pixels, no horizontal overflow at this width (the wider of clientWidth and innerWidth against the wider of the
 * document's and the body's scrollWidth, so a browser's own near-zero scrollWidth clamp never hides it), and no loading
 * placeholder left.
 *
 * Images are settled first: lazy images below the fold are scrolled into view and awaited, so "was it ever requested"
 * is a fact rather than a guess. An image the browser never fetched (loading=lazy, still off screen) cannot be called
 * broken; an image that was requested and answered with no pixels is broken and fails, visible or not.
 */
async function settleImages(page) {
  await page.evaluate(async () => {
    const pictures = [...document.images];
    for (const img of pictures) {
      if (img.complete && img.naturalWidth > 0) continue;
      try {
        await img.decode();
        continue;
      } catch {}
      if (img.getAttribute('loading') === 'lazy') img.loading = 'eager';
    }
    await new Promise((done) => {
      let pending = pictures.filter((img) => !img.complete).length;
      if (pending === 0) {
        done();
        return;
      }
      const timer = setTimeout(done, 15000);
      const one = () => {
        pending -= 1;
        if (pending <= 0) {
          clearTimeout(timer);
          done();
        }
      };
      for (const img of pictures) if (!img.complete) { img.addEventListener('load', one, { once: true }); img.addEventListener('error', one, { once: true }); }
    });
  });
  await page.waitForTimeout(150);
}

async function inspect(page, label) {
  await settleImages(page).catch(() => {});
  const facts = await page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      h1: main?.querySelector('h1')?.textContent?.trim() ?? '',
      h1Count: main?.querySelectorAll('h1').length ?? 0,
      // A requested image (currentSrc set, or complete) that ended with no pixels is broken; one the browser has not
      // started yet is reported separately as not requested, never counted as a failure.
      images: [...document.querySelectorAll('img')].map((img) => {
        const src = img.currentSrc || img.getAttribute('src') || '';
        const requested = Boolean(img.currentSrc) || img.complete;
        return { src, requested, complete: img.complete, width: img.naturalWidth, height: img.naturalHeight, loading: img.getAttribute('loading') ?? '' };
      }),
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      innerWidth: window.innerWidth,
      loading: Boolean(main?.querySelector('.loading')),
      text: (main?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 300),
    };
  });
  const available = Math.max(facts.clientWidth, facts.innerWidth);
  const overflow = Math.max(facts.scrollWidth, facts.bodyScrollWidth);
  check(facts.h1Count === 1 && facts.h1 !== '', `${label}: one h1 with text`, { h1: facts.h1, h1Count: facts.h1Count });
  check(!facts.loading, `${label}: no loading placeholder left behind`, facts.text);
  const broken = facts.images.filter((image) => image.src !== '' && image.requested && (!image.complete || image.width === 0 || image.height === 0));
  check(broken.length === 0, `${label}: every requested image loaded (${facts.images.filter((image) => image.requested).length}/${facts.images.length} on the page)`, broken);
  check(overflow <= available * 1.01, `${label}: no horizontal overflow (${overflow} <= ${available})`, { scrollWidth: facts.scrollWidth, bodyScrollWidth: facts.bodyScrollWidth, clientWidth: facts.clientWidth });
  return facts;
}

/** Console errors, uncaught page errors and failed API requests, collected for the life of a page. */
function watch(page, bucket) {
  page.on('console', (message) => {
    if (message.type() === 'error') bucket.console.push(message.text());
  });
  page.on('pageerror', (error) => bucket.errors.push(String(error?.message ?? error)));
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (url.includes('/api/') || url.startsWith(bucket.origin)) bucket.failed.push(`${url} (${request.failure()?.errorText ?? 'failed'})`);
  });
}

/**
 * The browser's own trailing network traffic, kept per page: the JSON body of every /api/ answer it received, with the
 * view it answered. Live data moves, so a comparison uses the exact bytes this page rendered, not a later request.
 */
function tapApi(page, bucket) {
  page.on('response', (response) => {
    const url = response.url();
    if (!url.startsWith(`${API_BASE}/`)) return;
    const path = url.slice(API_BASE.length);
    const promise = response.json().then((body) => {
      bucket.api[path] = { status: response.status(), body, url };
    }).catch(() => {});
    bucket.pending.push(promise);
  });
}

/** The last response the page received for an endpoint: awaited so a comparison never reads a half-landed body. */
async function browserApi(bucket, path) {
  await Promise.allSettled(bucket.pending);
  const seen = bucket.api[path];
  if (!seen) throw new Error(`the browser never received ${API_BASE}${path}`);
  if (seen.status >= 400) throw new Error(`the browser received HTTP ${seen.status} for ${API_BASE}${path}`);
  return seen.body;
}

/** A public API read outside the page, for values the view does not itself fetch (the signed-out checklist source). */
async function api(path, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/json' }, signal: controller.signal });
      if (response.ok) return await response.json();
      const error = new Error(`${path}: HTTP ${response.status} from ${API_BASE}${path}`);
      error.status = response.status;
      throw error;
    } catch (error) {
      last = error;
      // A 4xx is the API's answer; only a transient failure (5xx, 429, timeout, socket) is worth another request.
      if (error.status && error.status < 500 && error.status !== 429) throw error;
      if (attempt < attempts) await new Promise((done) => setTimeout(done, 400 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

const captureName = (route) => (route === '#/' ? 'board' : route.replace(/^#\//, '').replace(/\//g, '-').replace(/[^a-z0-9-]/gi, ''));

async function run() {
  mkdirSync(reportDir, { recursive: true });
  mkdirSync(shotDir, { recursive: true });
  const report = { startedAt: new Date().toISOString(), node: process.version, repo, appDir, evidence, checks, failures, facts: {}, server: null, problems: [] };
  let server;
  let browser;
  try {
    check(existsSync(join(appDir, 'index.html')), 'app/index.html exists', appDir);
    const served = await serveApp();
    server = served.server;
    const origin = `http://127.0.0.1:${served.port}`;
    report.server = origin;
    check(served.port > 0, 'server listens on a random loopback port', origin);

    const chromium = await loadChromium();
    browser = await chromium.launch({ headless: true });
    check(browser.isConnected(), 'headless Chromium launched');

    // ---- five surfaces at three widths: settled, one h1, images loaded, no overflow, no errors.
    const bucket = { console: [], errors: [], failed: [], origin, api: {}, pending: [] };
    const page = await browser.newPage({ viewport: { width: 1280, height: HEIGHT } });
    watch(page, bucket);
    tapApi(page, bucket);
    const surfaces = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      for (const route of ROUTES) {
        const label = `${route} @${width}`;
        await page.goto(`${origin}/${route}`, { waitUntil: 'domcontentloaded' });
        if (!(await settle(page, label))) continue;
        const facts = await inspect(page, label);
        surfaces.push({ route, width, h1: facts.h1 });
        await page.screenshot({ path: join(shotDir, `${captureName(route)}-${width}.jpg`), type: 'jpeg', quality: 70, fullPage: true }).catch(() => {});
      }
    }
    report.facts.surfaces = surfaces;
    const expectedSurfaces = ROUTES.length * WIDTHS.length;
    check(surfaces.length === expectedSurfaces, `all five routes settle at all three widths (${surfaces.length}/${expectedSurfaces})`, surfaces.map((s) => `${s.route}@${s.width}`));
    check(ROUTES.every((route) => new Set(surfaces.filter((s) => s.route === route).map((s) => s.h1)).size === 1), 'each route keeps one heading across widths', surfaces);
    check(new Set(surfaces.map((s) => s.h1)).size >= 4, 'the routes render distinct views', [...new Set(surfaces.map((s) => s.h1))]);

    // ---- board: search finds nothing honestly, reset restores the list, refresh asks the network again.
    await page.setViewportSize({ width: 1280, height: HEIGHT });
    await page.goto(`${origin}/#/`, { waitUntil: 'domcontentloaded' });
    await settle(page, 'board search');
    const cardsBefore = await page.locator('#cards .bounty-card').count();
    check(cardsBefore > 0, 'board lists competitions', cardsBefore);
    await page.fill('#search', 'zzzz-no-such-competition');
    await page.waitForFunction(() => /no matching/i.test(document.querySelector('#cards')?.textContent ?? ''), undefined, { timeout: 5000 }).catch(() => {});
    const emptyText = await page.locator('#cards').innerText();
    check(/no matching/i.test(emptyText), 'search with no match says so', emptyText.replace(/\s+/g, ' ').slice(0, 120));
    check((await page.locator('#cards .bounty-card').count()) === 0, 'search with no match lists no card');
    await page.click('#clear-search');
    await page.waitForFunction((n) => document.querySelectorAll('#cards .bounty-card').length === n, cardsBefore, { timeout: 5000 }).catch(() => {});
    check((await page.locator('#cards .bounty-card').count()) === cardsBefore, 'clear search restores every card');
    check((await page.inputValue('#search')) === '', 'clear search empties the field');

    const errorsBeforeRefresh = bucket.console.length + bucket.errors.length;
    let apiRequests = 0;
    const countRequest = (request) => {
      if (request.url().includes('/api/competitions?')) apiRequests += 1;
    };
    page.on('request', countRequest);
    await page.click('#refresh');
    await page.waitForFunction(() => window.__shotReady === true, undefined, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(500);
    page.off('request', countRequest);
    check(apiRequests > 0, 'refresh issues a fresh API request', apiRequests);
    check(bucket.console.length + bucket.errors.length === errorsBeforeRefresh, 'refresh adds no console or page error');

    // ---- theme: toggles, and the choice survives a reload.
    const themeBefore = await page.getAttribute('html', 'data-theme');
    await page.click('#theme');
    const themeAfter = await page.getAttribute('html', 'data-theme');
    check(themeBefore !== themeAfter, 'theme toggles', { themeBefore, themeAfter });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settle(page, 'theme reload');
    check((await page.getAttribute('html', 'data-theme')) === themeAfter, 'theme choice persists across a reload', { expected: themeAfter, actual: await page.getAttribute('html', 'data-theme') });

    // ---- keyboard: Tab reaches the skip link, Enter moves focus to main and leaves the hash route alone.
    await page.goto(`${origin}/#/bounty/makefun-frontend-01`, { waitUntil: 'domcontentloaded' });
    await settle(page, 'skip link');
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Tab');
    const firstFocus = await page.evaluate(() => ({ id: document.activeElement?.id, cls: String(document.activeElement?.className ?? ''), text: (document.activeElement?.textContent ?? '').trim().slice(0, 40) }));
    check(firstFocus.cls === 'skip', 'first Tab focuses the skip link', firstFocus);
    const hashBefore = await page.evaluate(() => location.hash);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const afterSkip = await page.evaluate(() => ({ active: document.activeElement?.id, hash: location.hash, ready: window.__shotReady }));
    check(afterSkip.active === 'main', 'Enter on the skip link focuses main', afterSkip);
    check(afterSkip.hash === hashBefore, 'skip link does not rewrite the hash route', { hashBefore, hash: afterSkip.hash });
    check(afterSkip.ready === true, 'skip link does not restart the route', afterSkip.ready);

    // ---- requirements: the real checklist loads from the API, every deliverable and applicable check shown.
    // The page's summaries take the API's text up to its first ": " (the rest lives in the summary's body), so a check
    // counts as shown when its own leading fragment is on screen and no word of it is cut off by a shorter heading.
    const requirements = await api('/competitions/makefun-frontend-01/requirements');
    await page.goto(`${origin}/#/bounty/makefun-frontend-01`, { waitUntil: 'domcontentloaded' });
    await settle(page, 'requirements');
    await page.click('#requirements-load');
    await page.waitForSelector('#requirements-content details', { timeout: 30000 });
    const shownDetails = await page.evaluate(() => ({
      text: document.querySelector('#requirements-content')?.innerText ?? '',
      summaries: [...document.querySelectorAll('#requirements-content details > summary')].map((summary) => summary.textContent.replace(/\s+/g, ' ').trim()),
    }));
    const requirementsText = shownDetails.text;
    const deliverables = requirements.deliverables ?? [];
    const applicableChecks = (requirements.checks ?? []).filter((item) => item.applies !== false);
    const missingDeliverables = deliverables.filter((item) => !requirementsText.includes(item.name));
    const headOf = (text) => String(text).split(/[:—–]/)[0].trim();
    const missingChecks = applicableChecks.filter((item) => {
      const title = String(item.title || item.check || '');
      const head = headOf(title);
      return !(shownDetails.summaries.some((summary) => summary.startsWith(head)) || requirementsText.includes(title));
    });
    check(deliverables.length > 0 && missingDeliverables.length === 0, `requirements show every deliverable (${deliverables.length})`, missingDeliverables.map((d) => d.name));
    check(applicableChecks.length > 0 && missingChecks.length === 0, `requirements show every applicable check (${applicableChecks.length})`, missingChecks.map((c) => c.title || c.check));
    const inapplicableShown = (requirements.checks ?? []).filter((item) => item.applies === false).filter((item) => shownDetails.summaries.some((summary) => summary.startsWith(headOf(item.title || item.check))));
    check(inapplicableShown.length === 0, 'requirements leave out the checks the API marks inapplicable', inapplicableShown.map((c) => c.title || c.check));

    // ---- leaderboard: what is on screen is the API's own display string, the signup count included. The API's answer
    // compared against is the one this page received (entries plus the deduped rest the app appends).
    const leaderboardPath = '/competitions/bring-the-humans-01/leaderboard?rows=first';
    await page.goto(`${origin}/#/bounty/bring-the-humans-01/leaderboard`, { waitUntil: 'domcontentloaded' });
    await settle(page, 'leaderboard');
    const leaderboard = await browserApi(bucket, leaderboardPath);
    const columns = (leaderboard.columns ?? []).filter((column) => !column.hidden);
    const onScreen = await page.evaluate(() => [...document.querySelectorAll('tbody tr[data-submission]')].map((row) => {
      const cells = {};
      for (const cell of row.querySelectorAll('td[data-column]')) cells[cell.dataset.column] = cell.textContent.trim();
      return { id: row.dataset.submission, cells };
    }));
    const apiRows = [...new Map([...(leaderboard.entries ?? []), ...(Array.isArray(leaderboard.rest) ? leaderboard.rest : [])].map((row) => [row.submission_id, row])).values()];
    check(onScreen.length >= Math.min(apiRows.length, 1), 'leaderboard lists rows', onScreen.length);
    check(onScreen.length === apiRows.length, 'leaderboard lists the API\'s entries and rest, deduped (none dropped, none invented)', { screen: onScreen.length, api: apiRows.length, entries: leaderboard.entries?.length, rest: Array.isArray(leaderboard.rest) ? leaderboard.rest.length : leaderboard.rest });
    const firstApiRow = (leaderboard.entries ?? [])[0];
    check(firstApiRow === undefined || onScreen[0]?.id === firstApiRow.submission_id, "leaderboard's first row is the API's first entry", { screen: onScreen[0]?.id, api: firstApiRow?.submission_id });
    const mismatches = [];
    for (const row of onScreen) {
      const apiRow = apiRows.find((entry) => entry.submission_id === row.id);
      if (!apiRow) {
        mismatches.push({ id: row.id, column: 'row', screen: 'unlisted', api: 'absent' });
        continue;
      }
      for (const column of columns) {
        const expected = apiRow.display?.[column.key] ?? apiRow.values?.[column.key];
        if (expected === undefined || expected === null) continue;
        if (row.cells[column.key] !== String(expected)) mismatches.push({ id: row.id, column: column.key, screen: row.cells[column.key], api: String(expected) });
      }
    }
    check(mismatches.length === 0, 'every leaderboard cell is the API display string (not a percent or a reformat)', mismatches.slice(0, 5));
    const topApi = (leaderboard.entries ?? [])[0];
    const topSignups = topApi?.display?.signups ?? topApi?.values?.signups;
    check(onScreen[0]?.cells?.signups === String(topSignups), "leaderboard signups of the top row equal the API's exactly", { screen: onScreen[0]?.cells?.signups, api: topSignups });
    check(!/%/.test(onScreen[0]?.cells?.signups ?? ''), 'leaderboard signups are a count, not a percentage', onScreen[0]?.cells?.signups);

    // ---- profile: /api/profiles/<handle>, its numbers on screen, every avatar under make.fun or GitHub's avatar host.
    const profile = await api('/profiles/gentle-badger-68');
    await page.goto(`${origin}/#/u/gentle-badger-68`, { waitUntil: 'domcontentloaded' });
    await settle(page, 'profile');
    const profileText = await page.locator('main').innerText();
    check(profileText.includes(`@${profile.handle}`), 'profile shows the handle the API returns', profile.handle);
    check(profileText.includes(String(profile.record?.competitions_entered)), "profile shows the API's competitions entered", profile.record?.competitions_entered);
    const imageSources = await page.evaluate(() => [...document.querySelectorAll('img')].map((img) => img.currentSrc || img.getAttribute('src') || ''));
    const avatarIsSafe = (src) => AVATAR_ORIGINS.some((allowed) => src.startsWith(allowed)) || src.startsWith('data:image/');
    const unsafeSources = imageSources.filter((src) => !avatarIsSafe(src));
    const rejectedByApp = await page.evaluate(() => [...document.querySelectorAll('#main [data-avatar]')].map((img) => img.dataset.avatar ?? '').filter((src) => /^\s*(javascript|data:text|vbscript|file):/i.test(src)));
    check(unsafeSources.length === 0, 'every avatar URL resolves under make.fun or avatars.githubusercontent.com (no javascript:/data: text)', unsafeSources.length === 0 ? imageSources : unsafeSources);
    check(rejectedByApp.length === 0, 'the app itself never puts an unsafe URL in an avatar src', rejectedByApp);

    // ---- unknown route: says so and offers the way back.
    await page.goto(`${origin}/#/not-a-real-view`, { waitUntil: 'domcontentloaded' });
    await settle(page, 'unknown route');
    const unknownText = await page.locator('main').innerText();
    check(/isn.t here|not (found|here)/i.test(unknownText) && /board/i.test(unknownText), 'unknown route says it does not exist and links back', unknownText.replace(/\s+/g, ' ').slice(0, 160));

    // ---- rapid navigation: five hash changes at once end on the view asked for last.
    await page.goto(`${origin}/#/`, { waitUntil: 'domcontentloaded' });
    await settle(page, 'rapid navigation start');
    await page.evaluate(() => {
      for (const hash of ['#/hunters', '#/bounty/makefun-frontend-01', '#/u/gentle-badger-68', '#/bounty/bring-the-humans-01/leaderboard', '#/hunters']) location.hash = hash;
    });
    await settle(page, 'rapid navigation end');
    await page.waitForTimeout(300);
    const raceHeading = (await page.locator('main h1').first().innerText()).trim();
    check(/Meet the makers/i.test(raceHeading), 'rapid navigation ends on the route asked for last', raceHeading);

    report.facts.console = bucket.console;
    report.facts.pageErrors = bucket.errors;
    report.facts.failedRequests = bucket.failed;
    check(bucket.console.length === 0, 'no console errors across the run', bucket.console.slice(0, 5));
    check(bucket.errors.length === 0, 'no uncaught page errors across the run', bucket.errors.slice(0, 5));
    check(bucket.failed.length === 0, 'no failed API or app requests', bucket.failed.slice(0, 5));

    // ---- the three captures: each from a fresh page (a clean profile, live data), after it has settled at 1280x800.
    // The theme is stored before the route is entered — main.js applies the stored theme on load — and both the theme
    // attribute and the colour scheme/tokens the pixels use are recorded, so a capture never advertises what it lacks.
    const captures = [];
    for (const capture of CAPTURES) {
      const shotPage = await browser.newPage({ viewport: { width: 1280, height: HEIGHT } });
      const shots = { console: [], errors: [], failed: [], origin, api: {}, pending: [] };
      watch(shotPage, shots);
      try {
        // Store the theme on a page of this site that is not quitting a live route: a goto that aborts an in-flight
        // route fetch would both lose the request and (with a shared origin) race the next page's setItem.
        await shotPage.goto(`${origin}/__verify`, { waitUntil: 'load' });
        await shotPage.evaluate((theme) => localStorage.setItem('fieldnotes-theme', theme), capture.theme);
        const stored = await shotPage.evaluate(() => localStorage.getItem('fieldnotes-theme'));
        check(stored === capture.theme, `capture ${capture.file}: theme stored before load (${stored})`, stored);
        await shotPage.goto(`${origin}/${capture.route}`, { waitUntil: 'domcontentloaded' });
        if (!(await settle(shotPage, `capture ${capture.file}`))) continue;
        await settleImages(shotPage).catch(() => {});
        const theme = await shotPage.getAttribute('html', 'data-theme');
        const tokens = await shotPage.evaluate(() => {
          const style = getComputedStyle(document.documentElement);
          return { bg: style.getPropertyValue('--bg').trim(), colorScheme: style.colorScheme, body: getComputedStyle(document.body).backgroundColor };
        });
        check(theme === capture.theme, `capture ${capture.file}: ${capture.theme} theme`, theme);
        check(tokens.colorScheme === capture.theme, `capture ${capture.file}: the page paints the ${capture.theme} colour scheme`, tokens);
        const live = await shotPage.evaluate(() => (document.querySelector('main')?.innerText ?? '').replace(/\s+/g, ' '));
        check(capture.route !== '#/' || /USD/i.test(live), `capture ${capture.file}: shows live money (pot and fee)`, live.slice(0, 160));
        const path = join(shotDir, capture.file);
        await shotPage.screenshot({ path, type: 'jpeg', quality: 82, fullPage: false });
        const bytes = statSync(path).size;
        check(bytes <= 262144, `capture ${capture.file}: within 256 KiB (${bytes} bytes)`, bytes);
        check(shots.console.length === 0 && shots.errors.length === 0, `capture ${capture.file}: no console or page error while capturing`, [...shots.console, ...shots.errors].slice(0, 3));
        captures.push({ file: capture.file, route: capture.route, viewport: { width: 1280, height: 800 }, theme, tokens, path, bytes });
      } finally {
        await shotPage.close().catch(() => {});
      }
    }
    report.facts.captures = captures;
    check(captures.length === CAPTURES.length, `all three captures written (${captures.length}/${CAPTURES.length})`, captures.map((capture) => capture.file));
  } catch (error) {
    report.problems.push(String(error?.stack ?? error));
    check(false, 'the suite ran to the end', String(error?.message ?? error));
  } finally {
    if (browser) {
      await browser.close().catch((error) => report.problems.push(`browser.close: ${error.message}`));
    }
    if (server) {
      await new Promise((done) => server.close(() => done()));
    }
    report.finishedAt = new Date().toISOString();
    report.passed = checks.filter((item) => item.ok).length;
    report.total = checks.length;
    writeFileSync(join(reportDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

let report;
try {
  report = await run();
} catch (error) {
  console.error(`verify: ${String(error?.stack ?? error)}`);
  process.exit(2);
}
if (report.failures.length > 0) {
  console.error(`VERIFY_FAIL ${report.passed}/${report.total} checks passed, ${report.failures.length} failed:`);
  for (const failure of report.failures) console.error(`  x ${failure.label}${failure.detail === undefined ? '' : ` ${JSON.stringify(failure.detail).slice(0, 400)}`}`);
  console.error(`report: ${join(reportDir, 'report.json')}`);
  process.exit(1);
}
console.log(`VERIFY_PASS ${report.passed}/${report.total} checks`);
for (const item of report.checks) console.log(`  ok ${item.label}`);
for (const capture of report.facts.captures ?? []) console.log(`  capture ${capture.file} ${capture.bytes} bytes -> ${capture.path}`);
console.log(`report: ${join(reportDir, 'report.json')}`);
process.exit(0);
