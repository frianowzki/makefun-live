// Shared blocks: state views (loading / error / empty) and the leaderboard table, used by both the
// bounty leaderboard route and the hunter profile's "results" list.

import { h, avatar, esc } from './dom.js';
import { columnText, columnNumber, count } from './format.js';

export function loadingView(label) {
  return h('div', { class: 'skeleton', 'aria-label': label || 'Loading', role: 'status' },
    h('div', { class: 'sk-line w40' }), h('div', { class: 'sk-line w70' }),
    h('div', { class: 'sk-row' }), h('div', { class: 'sk-row' }), h('div', { class: 'sk-row' }));
}

export function errorView({ title = 'That did not load', message = '', retry = null, hint = '' } = {}) {
  return h('div', { class: 'notice notice-error', role: 'alert' },
    h('p', { class: 'notice-title' }, title),
    message ? h('p', null, message) : null,
    hint ? h('p', { class: 'small muted' }, hint) : null,
    retry ? h('p', null, h('button', { class: 'btn', type: 'button', onclick: retry }, 'Try again')) : null);
}

export function emptyView({ title, message, action = null }) {
  return h('div', { class: 'empty' },
    h('h3', null, title),
    message ? h('p', null, message) : null,
    action);
}

export function notice({ title, lines = [], kind = 'warn' }) {
  return h('div', { class: 'notice' + (kind === 'error' ? ' notice-error' : '') },
    title ? h('p', { class: 'notice-title' }, title) : null,
    lines.filter(Boolean).map((line) => h('p', { class: 'small' }, line)));
}

export function profileHref(handle) {
  const clean = String(handle || '').replace(/^@/, '').trim();
  if (clean === '') return '#/hunters';
  return `#/u/${encodeURIComponent(clean)}`;
}

// Leaderboard view model: the API sends `entries` (top rows) and `rest` (the long tail). We dedupe
// by submission_id, keep first-seen order, and report exactly how many rows we actually show.
export function collectRows(payload) {
  const byId = new Map();
  let returned = 0;
  const add = (row) => {
    if (!row || typeof row !== 'object') return;
    returned++;
    const key = row.submission_id || `${row.handle || ''}:${row.rank || ''}`;
    if (byId.has(key)) return;
    byId.set(key, row);
  };
  for (const row of Array.isArray(payload.entries) ? payload.entries : []) add(row);
  for (const row of Array.isArray(payload.rest) ? payload.rest : []) add(row);
  return { rows: [...byId.values()], returned, top: Array.isArray(payload.entries) ? payload.entries.length : 0, rest: Array.isArray(payload.rest) ? payload.rest.length : 0 };
}

// Columns to show: the API's own, visible ones, ordered by their declared index.
export function visibleColumns(payload) {
  const cols = Array.isArray(payload.columns) ? payload.columns : [];
  return cols
    .filter((c) => c && !c.hidden && typeof c.key === 'string')
    .slice()
    .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
}

// Rows sorted by the board's rank_key (fallback: `rank`), stable, rank shown as the API's own
// `rank` where present, else its position.
export function sortByRank(rows, rankKey) {
  const key = rankKey && rows.some((r) => r.values && Object.hasOwn(r.values, rankKey)) ? rankKey : null;
  const withIndex = rows.map((row, i) => ({ row, i }));
  withIndex.sort((a, b) => {
    if (key) {
      const av = columnNumber(a.row, { key });
      const bv = columnNumber(b.row, { key });
      if (av !== null && bv !== null && av !== bv) return bv - av;
    }
    const ar = Number(a.row.rank);
    const br = Number(b.row.rank);
    if (Number.isFinite(ar) && Number.isFinite(br) && ar !== br) return ar - br;
    return a.i - b.i;
  });
  return withIndex.map((w) => w.row);
}

// The competition leaderboard table. Rows carry display[column.key] as the API formatted it
// ("249" stays 249 — no scaling), plus the handle link and entry title.
export function leaderboardTable(rows, { columns, rankKey, limit = 60 }) {
  const shown = rows.slice(0, limit);
  const wrap = h('div', { class: 'table-wrap' });
  const table = h('table', { class: 'data leaderboard' });
  const head = h('tr', null,
    h('th', { scope: 'col', class: 'r', title: 'Place on this leaderboard' }, 'Rank'),
    h('th', { scope: 'col' }, 'Hunter & entry'));
  for (const col of columns) {
    const isRank = col.key === rankKey;
    head.appendChild(h('th', { scope: 'col', class: 'r', title: col.source ? `Source: ${col.source}` : col.title }, col.title, isRank ? h('span', { class: 'muted', 'aria-hidden': 'true' }, ' ·') : null));
  }
  table.appendChild(h('thead', null, head));
  const tbody = h('tbody');
  shown.forEach((row, i) => {
    const rank = Number.isFinite(Number(row.rank)) ? Number(row.rank) : i + 1;
    const handle = String(row.handle || '').replace(/^@/, '');
    const tr = h('tr', { class: rank <= 3 ? `top-${rank}` : null });
    tr.appendChild(h('td', { class: 'r rank-cell' }, String(rank)));
    tr.appendChild(h('td', null,
      h('div', { class: 'who' },
        avatar(row.image || row.avatar, handle, { size: 30 }),
        h('div', { class: 'who-txt' },
          handle ? h('a', { href: profileHref(handle) }, `@${handle}`) : h('span', null, 'anonymous'),
          row.title ? h('span', { class: 'sub', title: String(row.title) }, String(row.title)) : null))));
    for (const col of columns) {
      const value = columnText(row, col);
      const missing = value === '—';
      tr.appendChild(h('td', { class: 'r' + (missing ? ' muted' : ''), dataset: { metric: col.key, value } }, value));
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return { wrap, shown: shown.length };
}

export function leaderboardCaption(payload, shown, loadedLabel) {
  const cols = visibleColumns(payload);
  const keyCol = cols.find((c) => c.key === payload.rank_key) || cols[0];
  const parts = [];
  if (keyCol) parts.push(`Ranked by ${keyCol.title}${typeof keyCol.source === 'string' ? ` (${keyCol.source})` : ''}, highest first.`);
  if (loadedLabel) parts.push(loadedLabel);
  parts.push('Figures are shown exactly as make.fun returns them.');
  return h('p', { class: 'tbl-note' }, parts.join(' '));
}

export function recordLine(record) {
  if (!record || typeof record !== 'object') return 'No record yet';
  const entered = Number(record.competitions_entered) || 0;
  const won = Number(record.competitions_won) || 0;
  const placed = Number(record.competitions_placed) || 0;
  const bits = [`${count(entered)} entered`, `${count(won)} won`, `${count(placed)} placed`];
  if (record.best_placement !== null && record.best_placement !== undefined) bits.push(`best #${count(record.best_placement)}`);
  return bits.join(' · ');
}

export { esc };
