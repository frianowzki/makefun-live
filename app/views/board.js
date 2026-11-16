// #/ — the live board: every open bounty with its pot, fee, entries and deadline. Search and sort
// run over the loaded pages; "Load more" follows the API's next_cursor and the summary line says
// honestly how much of the board is on screen and what the API returned.

import { load } from '../lib/api.js';
import { h, frag } from '../lib/dom.js';
import { usd, count, acceptsEntries, countdown, deadlineMs, shortDate, toNumber, plainUsd } from '../lib/format.js';
import { loadingView, errorView, emptyView } from '../lib/ui.js';

const PAGE = 24;
const SORTS = {
  pot: 'Live pot, largest',
  entries: 'Entries, most',
  closing: 'Closing soonest',
  fee: 'Entry fee, lowest',
  title: 'Title A–Z',
};

const state = {
  items: [],
  cursor: null,
  exhausted: false,
  loading: false,
  settled: false,
  error: null,
  query: '',
  sort: 'pot',
  liveOnly: false,
  fetchedAt: null,
};

let ctx = null;
let root = null;
let summary = 'Loading…';

export function mounts(headEl, bodyEl, context) {
  ctx = context;
  root = h('div', { id: 'board-body' });
  headEl.appendChild(headShell());
  bodyEl.appendChild(root);
  if (state.items.length === 0) void fetchPage({ first: true });
  else paint();
  return () => { ctx = null; };
}

export function update(context) { ctx = context; }

export function refresh() {
  state.settled = false;
  void fetchPage({ first: true });
}

export function current() {
  return { items: state.items, visible: visibleItems(), loading: state.loading, error: state.error, settled: state.settled };
}

export function summaryText() {
  return summary;
}

function headShell() {
  return frag(
    h('div', { class: 'board-head' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'Live board'),
        h('h1', null, 'Bounties being hunted right now'),
        h('p', { class: 'lede' }, 'Open bounties on make.fun with each live pot, the entry fee (or free), the entries so far and the time left. Read from make.fun’s public API, nothing else.')),
      h('ul', { class: 'stat-strip' },
        statSlot('Loaded', 'loaded'), statSlot('Accepting entries', 'live'),
        statSlot('Pots loaded', 'pots'), statSlot('Entries loaded', 'entries'))),
    h('form', { class: 'toolbar', onsubmit: (event) => event.preventDefault() },
      h('div', { class: 'field' },
        h('label', { for: 'q' }, 'Search'),
        h('input', {
          id: 'q', type: 'search', name: 'q', autocomplete: 'off', 'aria-controls': 'bounty-area',
          placeholder: 'Title, sponsor, category, skill…', value: state.query, oninput: onSearch,
        })),
      h('div', { class: 'field' },
        h('label', { for: 'sort' }, 'Sort by'),
        h('select', { id: 'sort', name: 'sort', onchange: onSort },
          Object.entries(SORTS).map(([value, label]) => h('option', { value, selected: state.sort === value }, label)))),
      h('label', { class: 'toggle', for: 'live-only' },
        h('input', { id: 'live-only', type: 'checkbox', checked: state.liveOnly, onchange: onLiveOnly }),
        'Accepting entries only')));
}

function statSlot(label, id) {
  return h('li', null, h('span', { class: 'stat-k' }, label), h('span', { class: 'stat-v', id: `stat-${id}` }, '—'));
}

function onSearch(event) {
  state.query = event.target.value;
  paint();
}

function onSort(event) {
  state.sort = event.target.value;
  paint();
  const again = document.getElementById('sort');
  if (again) again.focus({ preventScroll: true });
}

function onLiveOnly(event) {
  state.liveOnly = event.target.checked;
  paint();
}

async function fetchPage({ first = false } = {}) {
  if (state.loading) return;
  if (!first && (state.exhausted || state.cursor === null)) return;
  state.loading = true;
  state.error = null;
  if (first) {
    state.items = [];
    state.cursor = null;
    state.exhausted = false;
    state.settled = false;
  }
  paint();
  const path = first
    ? `/competitions?status=open&limit=${PAGE}`
    : `/competitions?status=open&limit=${PAGE}&cursor=${encodeURIComponent(state.cursor)}`;
  const res = await load(path, { signal: ctx ? ctx.signal : undefined });
  state.loading = false;
  if (res.aborted) return;
  if (!res.ok) {
    state.error = res;
    state.settled = true;
    paint();
    markReady();
    return;
  }
  const items = Array.isArray(res.data.items) ? res.data.items : [];
  const seen = new Set(state.items.map((item) => item.slug));
  for (const item of items) if (item && item.slug && !seen.has(item.slug)) { seen.add(item.slug); state.items.push(item); }
  state.cursor = typeof res.data.next_cursor === 'string' && res.data.next_cursor !== '' ? res.data.next_cursor : null;
  state.exhausted = state.cursor === null || items.length === 0;
  state.fetchedAt = Date.now();
  state.settled = true;
  paint();
  markReady();
}

function markReady() {
  if (!ctx) return;
  const main = document.getElementById('main');
  if (main) {
    main.dataset.view = 'board';
    main.dataset.loaded = String(state.items.length);
  }
  ctx.ready();
}

// ---------------------------------------------------------------- filtering and sorting

function haystack(item) {
  return [item.title, item.slug, item.category, item.sponsor && item.sponsor.name, ...(Array.isArray(item.skills) ? item.skills : [])]
    .filter(Boolean).join(' ').toLowerCase();
}

function feeOf(item) {
  const n = toNumber(item.entryFeeUsd);
  return n === null ? 0 : n;
}

function visibleItems() {
  const now = Date.now();
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = state.items.filter((item) => {
    if (state.liveOnly && !acceptsEntries(item, now)) return false;
    return terms.every((term) => haystack(item).includes(term));
  });
  const sorted = filtered.slice();
  const by = state.sort;
  sorted.sort((a, b) => {
    if (by === 'entries') return (toNumber(b.submissionCount) || 0) - (toNumber(a.submissionCount) || 0);
    if (by === 'closing') return (deadlineMs(a) ?? Number.POSITIVE_INFINITY) - (deadlineMs(b) ?? Number.POSITIVE_INFINITY);
    if (by === 'fee') return feeOf(a) - feeOf(b);
    if (by === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
    return (toNumber(b.potUsd) || 0) - (toNumber(a.potUsd) || 0);
  });
  return sorted;
}

// ---------------------------------------------------------------- render

function paint() {
  if (!root) return;
  const focus = captureFocus();
  while (root.firstChild) root.removeChild(root.firstChild);
  if (!state.settled && state.items.length === 0) {
    root.appendChild(loadingView('Loading the board'));
    paintStats();
    return;
  }
  if (state.error && state.items.length === 0) {
    summary = 'Nothing loaded yet.';
    root.appendChild(errorView({
      title: 'The board could not be loaded',
      message: state.error.error,
      hint: 'make.fun’s public API may be briefly unreachable, or this browser is offline.',
      retry: () => refresh(),
    }));
    root.appendChild(h('p', { class: 'tbl-note', id: 'board-summary' }, summary));
    paintStats();
    return;
  }
  if (state.error) {
    root.appendChild(errorView({
      title: 'Loading more bounties failed',
      message: state.error.error,
      retry: () => { void fetchPage(); },
    }));
  }
  const items = visibleItems();
  root.appendChild(summaryLine(items));
  const area = h('div', { id: 'bounty-area' });
  if (items.length === 0) {
    area.appendChild(state.items.length === 0
      ? emptyView({ title: 'No open bounties right now', message: 'make.fun lists no bounty with status open at the moment.' })
      : emptyView({
        title: 'Nothing matches that search',
        message: state.query ? `No loaded bounty mentions “${state.query}”. Clear the search or widen the filter.` : 'No loaded bounty is accepting entries right now.',
        action: h('button', { class: 'btn', type: 'button', onclick: resetFilters }, 'Reset search and filters'),
      }));
  } else {
    const list = h('div', { class: 'bounty-list', id: 'bounty-list', role: 'list' });
    for (const item of items) list.appendChild(row(item));
    area.appendChild(list);
  }
  root.appendChild(area);
  root.appendChild(pager());
  paintStats();
  restoreFocus(focus);
}

function captureFocus() {
  const active = document.activeElement;
  if (!active || !root.contains(active) || !active.id) return null;
  const selection = typeof active.selectionStart === 'number' ? active.selectionStart : null;
  return { id: active.id, selection };
}

function restoreFocus(saved) {
  if (!saved) return;
  const node = document.getElementById(saved.id);
  if (!node) return;
  node.focus({ preventScroll: true });
  if (saved.selection !== null && typeof node.setSelectionRange === 'function') {
    try { node.setSelectionRange(saved.selection, saved.selection); } catch { /* not a text field */ }
  }
}

function summaryLine(items) {
  const loaded = state.items.length;
  const shown = items.length;
  const liveCount = state.items.filter((item) => acceptsEntries(item)).length;
  const parts = [`Showing ${count(shown)} of ${count(loaded)} loaded bounties (API status open; ${count(liveCount)} still accepting entries)`];
  if (shown !== loaded) parts.push(`filtered from ${count(loaded)}`);
  if (state.query !== '') parts.push(`search "${state.query}"`);
  parts.push(state.exhausted ? 'the API has no further pages' : 'more pages available');
  if (state.fetchedAt) parts.push(`fetched ${shortDate(state.fetchedAt)}`);
  summary = parts.join(' · ');
  return h('p', { class: 'tbl-note', id: 'board-summary', style: 'margin:0 0 10px' }, summary);
}

function row(item) {
  const live = acceptsEntries(item);
  const ends = countdown(deadlineMs(item));
  const fee = plainUsd(item.entryFeeUsd);
  const href = `#/bounty/${encodeURIComponent(item.slug)}`;
  return h('article', { class: 'bounty-row', role: 'listitem' },
    h('div', null,
      h('div', { class: 'row-meta' },
        h('span', { class: 'pill ' + (live ? 'pill-open' : 'pill-closed') }, live ? 'Open' : 'Closed'),
        fee === null ? h('span', { class: 'pill pill-free' }, 'Free entry') : h('span', { class: 'pill' }, `Entry ${fee}`),
        item.category ? h('span', null, String(item.category)) : null,
        item.sponsor && item.sponsor.name ? h('span', null, `by ${item.sponsor.name}`) : null),
      h('h2', { class: 'row-title' }, h('a', { href }, String(item.title || item.slug)))),
    h('div', { class: 'row-facts' },
      fact('Live pot', usd(item.potUsd), true),
      fact('Entries', count(item.submissionCount)),
      fact(live ? 'Closes' : 'Closed', ends ? ends.text : shortDate(item.deadline))));
}

function fact(label, value, accent = false) {
  return h('div', null, h('span', { class: 'fact-k' }, label), h('span', { class: 'fact-v' + (accent ? ' accent' : '') }, value));
}

function pager() {
  const more = !state.exhausted && state.cursor !== null;
  return h('div', { class: 'actions', style: 'margin-top:18px' },
    more ? h('button', { class: 'btn btn-primary', type: 'button', id: 'load-more', disabled: state.loading, onclick: () => { void fetchPage(); } }, state.loading ? 'Loading…' : `Load ${PAGE} more`) : null,
    state.loading && state.items.length > 0 ? h('span', { class: 'small muted' }, 'Fetching the next page…') : null,
    !more && state.items.length > 0 ? h('span', { class: 'small muted' }, state.exhausted ? 'That is every open bounty the API lists.' : 'No more pages.') : null,
    state.loading ? null : h('button', { class: 'btn', type: 'button', onclick: () => refresh() }, 'Reload board'));
}

function paintStats() {
  const now = Date.now();
  const items = state.items;
  setText('stat-loaded', count(items.length));
  setText('stat-live', count(items.filter((item) => acceptsEntries(item, now)).length));
  setText('stat-pots', usd(items.reduce((n, item) => n + (toNumber(item.potUsd) || 0), 0)));
  setText('stat-entries', count(items.reduce((n, item) => n + (toNumber(item.submissionCount) || 0), 0)));
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function resetFilters() {
  state.query = '';
  state.sort = 'pot';
  state.liveOnly = false;
  const q = document.getElementById('q');
  const sort = document.getElementById('sort');
  const liveOnly = document.getElementById('live-only');
  if (q) q.value = '';
  if (sort) sort.value = 'pot';
  if (liveOnly) liveOnly.checked = false;
  paint();
}
