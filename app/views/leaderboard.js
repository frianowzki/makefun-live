// #/bounty/<slug>/leaderboard — the competition's own leaderboard. Column titles and order come
// from the API; every cell shows row.display[column.key] exactly as sent (249 stays 249), with a
// numeric fallback read from the same value at the column's own precision. Rows are entries plus
// rest, deduped by submission_id, and the page says how many rows it actually shows.

import { load } from '../lib/api.js';
import { h } from '../lib/dom.js';
import { count, shortDate, acceptsEntries, deadlineMs, countdown } from '../lib/format.js';
import { loadingView, errorView, collectRows, visibleColumns, sortByRank, leaderboardTable, leaderboardCaption, notice } from '../lib/ui.js';

const FOLD = 30;
let ctx = null;
let slug = null;
let allRows = false;

export function mounts(headEl, bodyEl, context, params) {
  ctx = context;
  slug = params.slug;
  headEl.appendChild(h('p', { class: 'crumbs' },
    h('a', { href: '#/' }, 'Board'), h('span', { class: 'sep' }, '/'),
    h('a', { href: `#/bounty/${encodeURIComponent(slug)}` }, slug), h('span', { class: 'sep' }, '/'),
    h('span', null, 'Leaderboard')));
  headEl.appendChild(h('div', { class: 'page-head' },
    h('p', { class: 'eyebrow' }, 'Competition leaderboard'),
    h('h1', null, 'Standings'),
    h('p', { class: 'lede' }, 'Ranked by make.fun itself. Every figure below is the API\u2019s own formatted value, in its own column order.')));
  const root = h('div', { id: 'leaderboard-body' });
  bodyEl.appendChild(root);
  void loadBoards(root);
  return () => { ctx = null; };
}

async function loadBoards(root) {
  root.appendChild(loadingView('Loading the leaderboard'));
  const path = `/competitions/${encodeURIComponent(slug)}/leaderboard?rows=${allRows ? 'all' : 'first'}`;
  const [board, meta] = await Promise.all([
    load(path, { signal: ctx ? ctx.signal : undefined }),
    load(`/competitions/${encodeURIComponent(slug)}`, { signal: ctx ? ctx.signal : undefined }),
  ]);
  if (board.aborted || !root.isConnected) return;
  while (root.firstChild) root.removeChild(root.firstChild);
  if (!board.ok) {
    ctx.fail(`Could not load the leaderboard of "${slug}": ${board.error}`);
    root.appendChild(errorView({
      title: 'The leaderboard could not be loaded',
      message: board.status === 404 ? `make.fun has no leaderboard for ${slug}.` : board.error,
      hint: 'The leaderboard opens once a bounty has entries.',
      retry: () => { void loadBoards(root); },
    }));
    return;
  }
  const payload = board.data || {};
  const competition = meta.ok ? (meta.data.competition || meta.data) : null;
  root.appendChild(renderBoard(payload, competition));
  const main = document.getElementById('main');
  if (main) {
    main.dataset.view = 'leaderboard';
    main.dataset.slug = slug;
  }
  ctx.ready();
}

function renderBoard(payload, competition) {
  const frag = document.createDocumentFragment();
  const { rows, returned, top, rest } = collectRows(payload);
  const columns = visibleColumns(payload);
  const ordered = sortByRank(rows, payload.rank_key);
  const shown = allRows ? ordered.length : Math.min(ordered.length, FOLD);
  const page = ordered.slice(0, shown);

  const title = (competition && competition.title) || payload.competition && payload.competition.title || slug;
  const live = competition ? acceptsEntries(competition) : null;
  const ends = competition ? countdown(deadlineMs(competition)) : null;

  const headBits = [h('span', { class: 'pill' }, `${count(ordered.length)} ranked`),
    payload.view ? h('span', { class: 'pill' }, `View: ${String(payload.view)}`) : null,
    payload.phase && payload.phase.title ? h('span', { class: 'pill' }, `Phase: ${String(payload.phase.title)}`) : null,
    live === null ? null : h('span', { class: 'pill ' + (live ? 'pill-open' : 'pill-closed') }, live ? (ends ? ends.text : 'Open') : 'Entries closed')];
  frag.appendChild(h('div', { class: 'row-meta', style: 'margin-bottom:14px' }, headBits));
  frag.appendChild(h('p', { style: 'margin:0 0 14px' },
    h('a', { href: `#/bounty/${encodeURIComponent(slug)}` }, `\u2190 ${title}`)));

  if (ordered.length === 0) {
    frag.appendChild(h('div', { class: 'empty' },
      h('h3', null, 'No ranked entries yet'),
      h('p', null, 'make.fun returned no leaderboard rows for this bounty. Once entries are judged they appear here.')));
    return frag;
  }

  if (payload.metrics_withheld) {
    frag.appendChild(notice({ title: 'Some metrics are withheld', lines: ['make.fun withholds the measures of entries still inside their race window; the columns shown are the ones it publishes now.'] }));
  }

  const { wrap, shown: rowCount } = leaderboardTable(page, { columns, rankKey: payload.rank_key, limit: page.length });
  frag.appendChild(wrap);

  const loadedLabel = allRows
    ? `Showing all ${count(rowCount)} rows.`
    : `Showing the top ${count(rowCount)} of ${count(ordered.length)} rows.`;
  frag.appendChild(leaderboardCaption(payload, page.length, loadedLabel));
  frag.appendChild(h('p', { class: 'tbl-note' },
    `make.fun returned ${count(returned)} rows (${count(top)} in entries, ${count(rest)} in rest); ${count(ordered.length)} distinct submissions after removing duplicate submission ids.`));

  if (!allRows && rest > 0 && ordered.length > page.length) {
    frag.appendChild(h('div', { class: 'actions' },
      h('button', {
        class: 'btn', type: 'button', id: 'show-all-rows',
        onclick: () => { allRows = true; const host = document.getElementById('leaderboard-body'); if (host) void loadBoards(host); },
      }, `Show all ${count(ordered.length)} rows`)));
  }

  if (Array.isArray(payload.entries) && payload.entries.length > 0) {
    const latest = payload.entries
      .map((row) => Date.parse(row.received_at || ''))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    if (latest) frag.appendChild(h('p', { class: 'crumbs-note' }, `Most recent ranked entry received ${shortDate(latest)}.`));
  }
  return frag;
}
