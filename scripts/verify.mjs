// Real-browser verification for Makefun Live. Serves app/ from an absolute root on a random port,
// drives the actual routes with Playwright, and checks only what the live make.fun API returns.
// Usage: node scripts/verify.mjs            (all checks)
//        node scripts/verify.mjs --shots    (the three JPEG screenshots too)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/friok/makefun/recorded-build-v6/app';
const SHOT_DIR = path.join(HERE, '..', 'screenshots');
const SHOTS = [
  { file: '1-board.jpg', route: '#/' },
  { file: '2-bounty.jpg', route: '#/bounty/makefun-frontend-01' },
  { file: '3-leaderboard.jpg', route: '#/bounty/bring-the-humans-01/leaderboard' },
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const READY = () => window.__shotReady === true || window.__error;

function loadPlaywright() {
  for (const id of ['C:/Users/friok/makefun/node_modules/playwright', 'playwright']) {
    try { return require(id); } catch { /* next */ }
  }
  throw new Error('playwright not found');
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.join(ROOT, rel);
    fs.readFile(file, (err, buf) => {
      if (err || url.pathname.startsWith('/api/')) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function gotoReady(page, base, route) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(`${base}/${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(READY, null, { timeout: 30000 });
  return errors;
}

// After an in-page hash change the old route can still read ready; wait until the new route has
// actually painted (page-body repopulated under the new hash) and then report its state.
async function settle(page, hash) {
  await page.waitForFunction((h) => location.hash === h, hash, { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('page-body')?.innerText.trim().length > 0, null, { timeout: 30000 });
  await page.waitForFunction(READY, null, { timeout: 30000 });
  return page.evaluate(() => ({ ready: window.__shotReady, err: window.__error, view: document.getElementById('main')?.dataset.view }));
}

async function main() {
  const shots = process.argv.includes('--shots');
  const { chromium } = loadPlaywright();
  let server, browser;
  try {
    server = await serve();
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();

    // Same endpoint and query the app itself requests, so DOM counts compare against one response.
    const lbApi = await (await fetch('https://make.fun/api/competitions/bring-the-humans-01/leaderboard?rows=first')).json();
    const ROUTES = ['#/', '#/bounty/makefun-frontend-01', '#/bounty/bring-the-humans-01/leaderboard', '#/hunters', '#/u/setyamickala'];
    for (const [w, h] of [[1280, 800], [768, 1024], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      for (const route of ROUTES) {
        const errs = await gotoReady(page, base, route);
        const state = await page.evaluate(() => ({
          ready: window.__shotReady, err: window.__error,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          body: (document.getElementById('page-body')?.innerText || '').length,
        }));
        check(`${w}px ${route} clean`, state.ready === true && !state.err && errs.length === 0, state.err || errs.join('; '));
        check(`${w}px ${route} layout`, state.overflow <= 1 && state.body > 20, `${state.overflow}px ${state.body} chars`);
      }
      if (w === 1280) {
        await page.goto(`${base}/#/bounty/makefun-frontend-01`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(READY);
        await page.click('#load-requirements', { timeout: 15000 });
        await page.waitForSelector('#requirements-list li', { timeout: 20000 });
        const reqs = await page.$$eval('#requirements-list li', (ns) => ns.map((n) => n.innerText.trim()).filter(Boolean));
        check('requirements render live checks', reqs.length > 0, `${reqs.length} ignored=${reqs.filter((t) => /^Requirement$/.test(t)).length}`);
        check('requirements not fallback text', !(await page.locator('#requirements').innerText()).includes('lists no separate requirements'));
      }
      await ctx.close();
    }

    // Interaction checks on one context.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    let apiCalls = 0;
    page.on('request', (r) => { if (r.url().startsWith('https://make.fun/api/')) apiCalls++; });
    await gotoReady(page, base, '#/');
    const themeOf = () => page.evaluate(() => localStorage.getItem('makefun-live.theme'));
    const before = await themeOf();
    await page.click('#ctl-theme');
    const after = await themeOf();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(READY);
    check('theme toggles + persists', before !== after && (await themeOf()) === after, `${before} -> ${after}`);
    const bodyText = () => page.locator('#page-body').innerText();
    const search = page.locator('input[type=search]').first();
    await search.fill('zzzznothing');
    await page.waitForTimeout(150);
    const noMatch = await bodyText();
    await search.fill('');
    await page.waitForTimeout(150);
    check('search no-match + reset', /Nothing matches|No loaded bounty/.test(noMatch) && (await bodyText()) !== noMatch);

    const calls0 = apiCalls;
    await page.click('#ctl-refresh');
    await page.waitForTimeout(2500);
    check('refresh hits real API', apiCalls > calls0, `${apiCalls - calls0} requests`);

    const url0 = page.url();
    await page.focus('#skip-link');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
    check('skip link focuses main, no hash change', focused === 'main' && page.url() === url0, focused);

    await page.goto(`${base}/#/bounty/bring-the-humans-01/leaderboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(READY);
    const dom = await page.evaluate(() => (document.getElementById('page-body')?.innerText || '').match(/make\.fun returned ([\d,]+) rows \((\d[\d,]*) in entries, (\d[\d,]*) in rest\)/));
    const apiEntries = Array.isArray(lbApi.entries) ? lbApi.entries.length : 0;
    const apiRest = Array.isArray(lbApi.rest) ? lbApi.rest.length : 0;
    const apiCols = Array.isArray(lbApi.columns) ? lbApi.columns.length : 0;
    const n = (s) => Number(String(s).replace(/,/g, ''));
    const exact = dom && n(dom[2]) === apiEntries && n(dom[3]) === apiRest;
    check('leaderboard counts match same API response', exact, `dom=${dom ? dom.slice(2).join('/') : 'none'} api=${apiEntries}/${apiRest} cols=${apiCols}`);
    check('leaderboard has no error fallback', !/could not be loaded|Nothing is invented|Unexpected answer/i.test(await page.locator('#page-body').innerText()));

    // Avatars: lazy images that failed must have been replaced by the initials fallback.
    await page.goto(`${base}/#/hunters`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(READY);
    await page.waitForTimeout(2500);
    const broken = await page.evaluate(() => {
      const vh = innerHeight;
      return [...document.images].filter((img) => {
        const r = img.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= vh && r.width > 0 && img.complete && img.naturalWidth === 0;
      }).map((i) => i.src);
    });
    check('no broken visible avatars', broken.length === 0, broken.slice(0, 2).join(','));

    // Fast hash changes: the last route wins. reload() forces a fresh document so the wait below
    // cannot be satisfied by the previous route's ready flag.
    await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(READY);
    await page.evaluate(() => { location.hash = '#/hunters'; location.hash = '#/u/setyamickala'; });
    const last = await settle(page, '#/u/setyamickala');
    const finalHash = await page.evaluate(() => location.hash);
    check('fast hash change lands on last route', finalHash === '#/u/setyamickala' && last.ready === true && !last.err, `${finalHash} ${last.view}`);
    await ctx.close();

    // Unknown route is an expected, honest error — checked separately.
    const upage = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await gotoReady(upage, base, '#/nonsense/route');
    const unknown = await upage.locator('#page-body').innerText();
    check('unknown route explains itself', unknown.length > 0, unknown.slice(0, 40).replace(/\n/g, ' '));
    await upage.context().close();

    if (shots) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      for (const shot of SHOTS) {
        const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
        await sctx.addInitScript(() => localStorage.setItem('makefun-live.theme', 'dark'));
        const spage = await sctx.newPage();
        await gotoReady(spage, base, shot.route);
        await spage.waitForTimeout(shot.route.includes('leaderboard') ? 1200 : 300);
        await spage.screenshot({ path: path.join(SHOT_DIR, shot.file), type: 'jpeg', quality: 92 });
        const size = fs.statSync(path.join(SHOT_DIR, shot.file)).size;
        check(`shot ${shot.file}`, size > 20000 && size <= 262144, `${Math.round(size / 1024)}KiB`);
        await sctx.close();
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise((r) => server.close(r));
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.error(`FAILED: ${failed.map((f) => f.name).join(' | ')}`); process.exitCode = 1; }
}

main().catch((err) => { console.error('VERIFY ERROR', err); process.exitCode = 1; });