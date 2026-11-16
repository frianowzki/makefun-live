// Makefun Live — entry point: hash routing, the theme toggle, the refresh and home controls, the
// skip link and the readiness/error signals the screenshot tooling reads.
//
// Route generation: every navigation bumps `generation` and aborts the previous view's requests.
// A view may only paint while it still owns the current generation, so a slow answer for a route
// the reader has left can never paint over the route they are on.

import * as board from './views/board.js';
import * as bounty from './views/bounty.js';
import * as leaderboard from './views/leaderboard.js';
import * as hunters from './views/hunters.js';
import * as profile from './views/profile.js';

const THEME_KEY = 'makefun-live.theme';
const TITLES = {
  board: 'Live bounties',
  hunters: 'The paid ranking',
  bounty: 'Bounty',
  leaderboard: 'Leaderboard',
  profile: 'Profile',
};

const signal = { __shotReady: false, __error: null };
window.__shotReady = false;
window.__error = null;

let generation = 0;
let active = null;
let controller = null;
let readyPending = false;

// ---------------------------------------------------------------- theme

function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const button = document.getElementById('ctl-theme');
  if (button) {
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.title = theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme';
    button.setAttribute('aria-label', button.title);
  }
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', theme);
}

function startTheme() {
  // A value already set by an init script (screenshots) wins; else the stored choice; else dark.
  const current = document.documentElement.getAttribute('data-theme');
  const saved = storedTheme();
  const chosen = current === 'light' || current === 'dark' ? current : (saved || 'dark');
  applyTheme(chosen);
  try { localStorage.setItem(THEME_KEY, chosen); } catch { /* storage blocked: theme lasts this page */ }
  const button = document.getElementById('ctl-theme');
  if (button) {
    button.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('makefun:theme', { detail: { theme: next } }));
    });
  }
}

// ---------------------------------------------------------------- readiness and errors

function resetReady() {
  signal.__shotReady = false;
  window.__shotReady = false;
  readyPending = true;
  const view = document.getElementById('view');
  if (view) view.setAttribute('aria-busy', 'true');
}

function markReady() {
  if (!readyPending) return;
  readyPending = false;
  const view = document.getElementById('view');
  if (view) view.setAttribute('aria-busy', 'false');
  // One more frame after the paint, so images requested during this paint are in flight.
  requestAnimationFrame(() => {
    window.__shotReady = true;
    document.dispatchEvent(new CustomEvent('makefun:ready'));
  });
}

function markError(message) {
  window.__error = String(message || 'unknown error');
  signal.__error = window.__error;
}

// ---------------------------------------------------------------- routing

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '');
  const path = raw === '' ? '/' : raw;
  const parts = path.split('?')[0].split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  if (parts.length === 0) return { name: 'board', params: {} };
  if (parts[0] === 'bounty' && parts.length >= 2) {
    const slug = parts[1];
    if (parts[2] === 'leaderboard' && parts.length === 3) return { name: 'leaderboard', params: { slug } };
    if (parts.length === 2) return { name: 'bounty', params: { slug } };
  }
  if (parts[0] === 'hunters' && parts.length === 1) return { name: 'hunters', params: {} };
  if (parts[0] === 'u' && parts.length >= 2) return { name: 'profile', params: { handle: parts[1] } };
  return { name: 'unknown', params: { path: raw } };
}

function navTarget(name) {
  if (name === 'hunters') return 'hunters';
  if (name === 'board' || name === 'bounty' || name === 'leaderboard' || name === 'profile') return 'board';
  return null;
}

function paintNav(name) {
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const activeName = name === 'leaderboard' || name === 'bounty' || name === 'profile' ? 'board' : name;
    if (link.dataset.nav === activeName) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const stamp = document.getElementById('rail-stamp');
  if (stamp) {
    const now = new Date();
    stamp.textContent = `Read from make.fun/api at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }
  const target = navTarget(name);
  if (target) document.body.dataset.section = target;
}

function renderUnknown(head, body, params) {
  head.appendChild(h1Only('This address has no page'));
  body.appendChild(unknownBox(params.path));
}

function h1Only(text) {
  const wrap = document.createElement('div');
  wrap.className = 'page-head';
  const p = document.createElement('p');
  p.className = 'eyebrow';
  p.textContent = 'Not found';
  const h1 = document.createElement('h1');
  h1.textContent = text;
  wrap.appendChild(p);
  wrap.appendChild(h1);
  return wrap;
}

function unknownBox(path) {
  const box = document.createElement('div');
  box.className = 'empty';
  box.id = 'unknown-route';
  const h3 = document.createElement('h3');
  h3.textContent = '#/' + (path || '') + ' is not a page here';
  const p = document.createElement('p');
  p.textContent = 'Makefun Live has four views: the live board, a bounty\u2019s page, that bounty\u2019s leaderboard, and a hunter\u2019s profile (#/u/<handle>). Nothing is guessed from an unknown address.';
  const a = document.createElement('a');
  a.className = 'btn';
  a.href = '#/';
  a.textContent = 'Go to the live board';
  box.appendChild(h3);
  box.appendChild(p);
  box.appendChild(a);
  return box;
}

async function route() {
  const gen = ++generation;
  if (controller) controller.abort();
  controller = new AbortController();
  if (active && typeof active.teardown === 'function') {
    try { active.teardown(); } catch (error) { console.warn('teardown failed', error); }
  }
  active = null;
  window.__error = null;
  signal.__error = null;
  resetReady();

  const parsed = parseHash();
  const head = document.getElementById('page-head');
  const body = document.getElementById('page-body');
  if (!head || !body) return;
  while (head.firstChild) head.removeChild(head.firstChild);
  while (body.firstChild) body.removeChild(body.firstChild);

  paintNav(parsed.name);
  const view = document.getElementById('view');
  if (view) view.setAttribute('data-route', parsed.name);

  const context = {
    signal: controller.signal,
    generation: gen,
    ready: () => { if (gen === generation) markReady(); },
    fail: (message) => { if (gen === generation) markError(message); },
    isCurrent: () => gen === generation,
  };

  let module = null;
  try {
    if (parsed.name === 'board') module = board;
    else if (parsed.name === 'bounty') module = bounty;
    else if (parsed.name === 'leaderboard') module = leaderboard;
    else if (parsed.name === 'hunters') module = hunters;
    else if (parsed.name === 'profile') module = profile;
    if (module) {
      const teardown = module.mounts(head, body, context, parsed.params);
      if (gen !== generation) {
        if (typeof teardown === 'function') teardown();
        return;
      }
      active = { module, teardown };
    } else {
      renderUnknown(head, body, parsed.params);
      markReady();
    }
  } catch (error) {
    markError(error && error.message ? error.message : 'view failed to start');
    body.appendChild(unknownBox(parsed.params.path || ''));
    markReady();
    return;
  }

  const suffix = TITLES[parsed.name] || 'Not found';
  document.title = parsed.name === 'board' ? 'Makefun Live \u2014 the bounty board' : `Makefun Live \u2014 ${suffix}`;
  updateRefreshLabel(parsed.name);
}

function updateRefreshLabel(name) {
  const button = document.getElementById('ctl-refresh');
  if (!button) return;
  const label = name === 'board' ? 'Reload the board from make.fun' : `Reload this ${TITLES[name] ? TITLES[name].toLowerCase() : 'view'} from make.fun`;
  button.title = label;
  button.setAttribute('aria-label', label);
}

function refreshCurrent() {
  const button = document.getElementById('ctl-refresh');
  if (button) {
    button.disabled = true;
    setTimeout(() => { button.disabled = false; }, 900);
  }
  if (active && typeof active.module.refresh === 'function') {
    window.__error = null;
    signal.__error = null;
    active.module.refresh();
  } else {
    void route();
  }
}

// ---------------------------------------------------------------- controls

function startControls() {
  const refreshBtn = document.getElementById('ctl-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshCurrent);
  const home = document.getElementById('ctl-home');
  if (home) {
    home.addEventListener('click', (event) => {
      event.preventDefault();
      if (window.location.hash === '' || window.location.hash === '#/') {
        refreshCurrent();
      } else {
        window.location.hash = '#/';
      }
    });
  }
  const skip = document.getElementById('skip-link');
  if (skip) {
    skip.addEventListener('click', (event) => {
      event.preventDefault();
      const main = document.getElementById('main');
      if (!main) return;
      main.focus({ preventScroll: false });
      main.scrollIntoView({ block: 'start' });
    });
  }
  // Close a route's own error banner state when the reader navigates away.
  window.addEventListener('hashchange', () => {
    markErrorIfStale();
    void route();
  });
  if (window.location.hash === '') {
    // Normalise so the address bar always names the view (without adding history).
    try { history.replaceState(null, '', '#/'); } catch { /* ignore */ }
  }
  void route();
}

function markErrorIfStale() {
  // A real, already-reported error from the view being left stays in window.__error until the new
  // generation starts; route() clears it. Nothing is invented here.
}

// ---------------------------------------------------------------- boot

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

function boot() {
  startTheme();
  startControls();
  // Keep countdowns honest: refresh "x left" labels in place every 30s without refetching.
  setInterval(() => {
    document.querySelectorAll('[data-countdown]').forEach((node) => {
      const target = Number(node.dataset.countdown);
      if (Number.isFinite(target)) node.textContent = countdownLabel(target);
    });
  }, 30000);
  window.addEventListener('error', (event) => {
    if (event && event.message) markError(event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event && event.reason;
    markError(reason && reason.message ? reason.message : 'an unhandled promise rejected');
  });
}

function countdownLabel(target) {
  const ms = target - Date.now();
  if (ms <= 0) return 'Closed';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}
