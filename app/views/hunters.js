// #/hunters — the paid ranking of make.fun's hunters (/api/rankings?order=paid). Each row shows
// the API's rank, the record's prizes, wins and entries, an avatar with a fallback, and links to
// the hunter's profile. More pages come from the API's next_cursor.

import { load } from '../lib/api.js';
import { h, avatar, externalLink } from '../lib/dom.js';
import { usd, count, shortDate } from '../lib/format.js';
import { loadingView, errorView, emptyView, profileHref } from '../lib/ui.js';

const PAGE = 24;
const state = { items: [], cursor: null, exhausted: false, loading: false, settled: false, error: null, total: null };

let ctx = null;
let root = null;

export function mounts(headEl, bodyEl, context) {
  ctx = context;
  headEl.appendChild(h('div', { class: 'page-head' },
    h('p', { class: 'eyebrow' }, 'Hunters'),
    h('h1', null, 'The paid ranking'),
    h('p', { class: 'lede' }, 'Hunters ordered by prize money make.fun has paid them, with the record behind the number: prizes, wins and competitions entered.')));
  root = h('div', { id: 'hunters-body' });
  bodyEl.appendChild(root);
  if (state.items.length === 0) void fetchPage({ first: true });
  else paint();
  return () => { ctx = null; };
}

export function refresh() {
  state.settled = false;
  void fetchPage({ first: true });
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
    ? `/rankings?order=paid&limit=${PAGE}`
    : `/rankings?order=paid&limit=${PAGE}&cursor=${encodeURIComponent(state.cursor)}`;
  const res = await load(path, { signal: ctx ? ctx.signal : undefined });
  state.loading = false;
  if (res.aborted) return;
  if (!res.ok) {
    state.error = res;
    state.settled = true;
    paint();
    if (ctx) ctx.ready();
    return;
  }
  const items = Array.isArray(res.data.items) ? res.data.items : [];
  const seen = new Set(state.items.map((row) => row.handle));
  for (const row of items) {
    const key = String(row && row.handle || '');
    if (key && !seen.has(key)) { seen.add(key); state.items.push(row); }
  }
  state.cursor = typeof res.data.next_cursor === 'string' && res.data.next_cursor !== '' ? res.data.next_cursor : null;
  state.exhausted = state.cursor === null || items.length === 0;
  if (typeof res.data.total === 'number') state.total = res.data.total;
  state.settled = true;
  paint();
  if (ctx) ctx.ready();
}

function paint() {
  if (!root || !ctx) return;
  while (root.firstChild) root.removeChild(root.firstChild);
  if (!state.settled && state.items.length === 0) {
    root.appendChild(loadingView('Loading the ranking'));
    return;
  }
  if (state.error && state.items.length === 0) {
    ctx.fail(`Could not load the paid ranking: ${state.error.error}`);
    root.appendChild(errorView({
      title: 'The ranking could not be loaded',
      message: state.error.error,
      hint: 'make.fun\u2019s rankings endpoint may be briefly unreachable.',
      retry: () => refresh(),
    }));
    return;
  }
  if (state.error) {
    root.appendChild(errorView({ title: 'Loading more hunters failed', message: state.error.error, retry: () => { void fetchPage(); } }));
  }
  if (state.items.length === 0) {
    root.appendChild(emptyView({ title: 'No ranked hunters yet', message: 'make.fun returned no hunters for the paid ranking.' }));
    return;
  }
  const shownSummary = state.total !== null
    ? `Showing ${count(state.items.length)} of ${count(state.total)} hunters in the paid ranking.`
    : `Showing ${count(state.items.length)} hunters in the paid ranking.`;
  root.appendChild(h('p', { class: 'tbl-note', id: 'hunters-summary', style: 'margin:0 0 10px' },
    `${shownSummary} ${state.exhausted ? 'The API has no further pages.' : 'More pages available below.'}`));

  const wrap = h('div', { class: 'table-wrap' });
  const table = h('table', { class: 'data hunters' });
  table.appendChild(h('thead', null, h('tr', null,
    h('th', { scope: 'col', class: 'r' }, 'Rank'),
    h('th', { scope: 'col' }, 'Hunter'),
    h('th', { scope: 'col', class: 'r' }, 'Prizes won'),
    h('th', { scope: 'col', class: 'r' }, 'Wins'),
    h('th', { scope: 'col', class: 'r' }, 'Entered'),
    h('th', { scope: 'col', class: 'r' }, 'Best'))));
  const tbody = h('tbody');
  state.items.forEach((row, i) => {
    const handle = String(row.handle || '').replace(/^@/, '');
    const record = row.record && typeof row.record === 'object' ? row.record : {};
    const rank = Number.isFinite(Number(row.rank)) ? Number(row.rank) : i + 1;
    const best = record.best_placement === null || record.best_placement === undefined ? '\u2014' : `#${count(record.best_placement)}`;
    tbody.appendChild(h('tr', { class: rank <= 3 ? `top-${rank}` : null },
      h('td', { class: 'r rank-cell' }, String(rank)),
      h('td', null,
        h('div', { class: 'who' },
          avatar(row.image || row.avatar, handle || row.display_name, { size: 30 }),
          h('div', { class: 'who-txt' },
            handle ? h('a', { href: profileHref(handle) }, `@${handle}`) : h('span', null, String(row.display_name || 'anonymous')),
            row.display_name && handle ? h('span', { class: 'sub' }, String(row.display_name)) : null))),
      h('td', { class: 'r' }, usd(record.prize_usd)),
      h('td', { class: 'r' }, count(record.competitions_won)),
      h('td', { class: 'r' }, count(record.competitions_entered)),
      h('td', { class: 'r' }, best)));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  root.appendChild(wrap);
  root.appendChild(h('p', { class: 'tbl-note' }, 'Prizes are what make.fun has paid, in USDC. Wins count first places; entered counts every competition a hunter entered.'));

  const actions = h('div', { class: 'actions', style: 'margin-top:16px' });
  if (!state.exhausted && state.cursor !== null) {
    actions.appendChild(h('button', { class: 'btn btn-primary', type: 'button', id: 'hunters-more', disabled: state.loading, onclick: () => { void fetchPage(); } }, state.loading ? 'Loading\u2026' : `Load ${PAGE} more hunters`));
  } else {
    actions.appendChild(h('span', { class: 'small muted' }, 'That is every hunter in this ranking.'));
  }
  actions.appendChild(externalLink('https://make.fun/rankings', 'The ranking on make.fun', { class: 'btn' }));
  root.appendChild(actions);
}

export function summaryText() {
  const node = document.getElementById('hunters-summary');
  return node ? node.textContent : '';
}
