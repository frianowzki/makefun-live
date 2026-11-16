// The router and the two things every page needs: a stage to render into and a top bar to keep in
// step. Routes are hash paths, so the whole board works from a static file.
//
//   #/                      the board of open bounties
//   #/bounty/<slug>         one bounty: brief, deadline, pot, entries
//   #/u/<handle>            one hunter's record
//   #/hunters               hunters ranked by prize money
//
// Each view module is fetched only when a route needs it: the board is the first paint, and the
// leaderboard and profile code stay off the wire until you open one.

import { esc, msLeft } from './format.js';
import { clearCache } from './api.js';
document.getElementById('refresh-btn')?.addEventListener('click', () => { clearCache(); render(); });
document.addEventListener('click', (event) => { if (event.target.closest('[data-retry]')) { clearCache(); render(); } });

const stage = document.getElementById('stage');
const rail = document.getElementById('rail');
const barTag = document.getElementById('bar-tag');
const themeButton = document.getElementById('theme-btn');

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (themeButton) themeButton.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
}
function readTheme() {
  try { const saved = localStorage.getItem('makefun-theme'); if (saved === 'dark' || saved === 'light') return saved; } catch {}
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
setTheme(readTheme());
themeButton?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  try { localStorage.setItem('makefun-theme', next); } catch {}
});
document.querySelector('.skip')?.addEventListener('click', (event) => {
  event.preventDefault(); document.getElementById('main')?.focus({ preventScroll: false });
});

/** Routes, in the order the rail lists them. `load` returns the view module and its markup. */
const ROUTES = [
  {
    id: 'board',
    match: (path) => path === '/' || path === '',
    nav: { href: '#/', label: 'Board', note: 'every open bounty' },
    async view(params, signal) {
      const { renderBoard, wireBoard } = await import('./board.js');
      return { title: 'Live bounties', tag: 'board', rail: null, html: await renderBoard(params, { signal }), after: wireBoard };
    },
  },
  {
    id: 'leaderboard',
    match: (path) => /^\/bounty\/[^/]+\/leaderboard$/.test(path),
    async view(params, signal) {
      const { renderLeaderboard } = await import('./leaderboard.js');
      return renderLeaderboard(params, { signal });
    },
  },
  {
    id: 'bounty',
    match: (path) => path.startsWith('/bounty/'),
    async view(params, signal) {
      const { renderBounty } = await import('./bounty.js');
      return renderBounty(params, { signal });
    },
  },
  {
    id: 'hunters',
    match: (path) => path === '/hunters',
    nav: { href: '#/hunters', label: 'Hunters', note: 'by prize money' },
    async view(params, signal) {
      const { renderHunters } = await import('./hunters.js');
      return { title: 'Hunters', tag: 'hunters', rail: null, html: await renderHunters(params, { signal }) };
    },
  },
  {
    id: 'profile',
    match: (path) => path.startsWith('/u/'),
    async view(params, signal) {
      const { renderProfile } = await import('./profile.js');
      return renderProfile(params, { signal });
    },
  },
];

/** '/bounty/kit-01' -> { name: 'kit-01' }; unknown slots are ignored by the view. */
function paramsOf(path) {
  const parts = path.split('/').filter(Boolean);
  return {
    slug: parts[0] === 'bounty' ? decodeURIComponent(parts[1] ?? '') : undefined,
    handle: parts[0] === 'u' ? decodeURIComponent(parts[1] ?? '') : undefined,
  };
}

/** The current hash path, always starting with '/'. */
function currentPath() {
  const raw = location.hash.replace(/^#/, '');
  return raw ? (raw.startsWith('/') ? raw : `/${raw}`) : '/';
}

/** The rail: the board and hunters, then the page you are on. A plain list, left aligned. */
function paintRail(activeId, context) {
  const items = ROUTES.filter((r) => r.nav);
  const rows = items.map(
    (r, i) => `<li class="rail-item${r.id === activeId ? ' is-here' : ''}">
        <a class="rail-link" href="${r.nav.href}"${r.id === activeId ? ' aria-current="page"' : ''}>
          <span class="rail-n">${String(i + 1).padStart(2, '0')}</span>
          <span class="rail-txt"><span class="rail-lbl">${esc(r.nav.label)}</span><span class="rail-note">${esc(r.nav.note)}</span></span>
        </a>
      </li>`,
  );
  // A bounty or a profile has no nav entry of its own: list the open page so the rail always names
  // where you are, and every surface keeps a link in it.
  if (context?.label) {
    const n = String(rows.length + 1).padStart(2, '0');
    rows.push(`<li class="rail-item is-here">
        <a class="rail-link" href="${esc(context.href)}" aria-current="page">
          <span class="rail-n">${n}</span>
          <span class="rail-txt"><span class="rail-lbl">${esc(context.label)}</span><span class="rail-note">${esc(context.note)}</span></span>
        </a>
      </li>`);
  }
  rail.innerHTML = `<ol class="rail-list">${rows.join('')}</ol>`;
}

/** An error page: what failed, and a way back. Never a blank stage. */
export function errorMarkup(err) {
  const header = err?.status ? `That request failed (${err.status}).` : 'That request did not come back.';
  return `<section class="fail">
    <h1 class="fail-h">${esc(header)}</h1>
    <p class="fail-p">${esc(err?.message ?? 'The make.fun API could not be reached.')}</p>
    <p class="fail-p"><button class="btn" data-retry type="button">Retry live data</button> <a class="btn" href="#/">Back to the board</a></p>
  </section>`;
}

/** A skeleton the shape of a board, so a slow network shows structure, not a spinner. */
export function boardSkeleton() {
  return `<section class="sect">
    <div class="sk sk-h"></div>
    ${Array.from({ length: 6 }, () => '<div class="sk sk-card"></div>').join('')}
  </section>`;
}

/** Paint one route, aborting the previous one's work if the hash moved on. */
let navToken = 0;
async function render() {
  window.__hermesAbort?.abort();
  const token = ++navToken;
  window.__shotReady = false;
  window.__error = null;
  stage.setAttribute('aria-busy', 'true');
  const path = currentPath();
  const route = ROUTES.find((r) => r.match(path));
  paintRail(route?.id, null);
  const controller = new AbortController();
  window.__hermesAbort = controller;
  stage.innerHTML = boardSkeleton();

  try {
    if (!route) throw new Error('Page not found. Use Board or Hunters to continue.');
    const params = paramsOf(path);
    const out = await route.view(params, controller.signal);
    if (token !== navToken) return;
    stage.innerHTML = out.html;
    document.title = out.title ? `${out.title} · make.fun` : 'make.fun — live bounty board';
    if (barTag) barTag.textContent = out.tag ?? 'board';
    paintRail(route.id, out.rail);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    // Give focus back to the stage after a nav so a keyboard user starts at the new content.
    document.getElementById('main')?.focus({ preventScroll: true });
    // A view's own wiring (a lazy panel, a filter) runs only once its markup is on the page.
    out.after?.(stage);
    window.__shotReady = true;
    document.dispatchEvent(new CustomEvent('view:painted', { detail: { route: route.id } }));
  } catch (err) {
    if (token !== navToken || err?.name === 'AbortError') return;
    window.__error = err.message;
    stage.innerHTML = errorMarkup(err);
    document.title = 'make.fun — could not load';
  } finally {
    if (token === navToken) stage.setAttribute('aria-busy', 'false');
    if (window.__hermesAbort === controller) window.__hermesAbort = null;
  }
}

/** Keep the "time left" labels honest without a re-render: tick every minute. */
function tickClocks() {
  for (const node of stage.querySelectorAll('[data-deadline]')) {
    const iso = node.getAttribute('data-deadline');
    const ms = msLeft(iso);
    if (ms <= 0) {
      node.textContent = 'ended';
      node.classList.add('is-urgent');
      continue;
    }
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    node.textContent = days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
  }
}

export function boot() {
  window.addEventListener('hashchange', render);
  setInterval(tickClocks, 60_000);
  render();
}

boot();
