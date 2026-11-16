// The board: every open make.fun bounty in one left-aligned list, per the live API's own order
// (soonest deadline first). Each row is a link, so the whole card is one tab stop.
//
// The list is built with strings and escaped once through format.js, which keeps this module and
// the first paint small; the API answers with the pot, the entry fee, the deadline and the count.

import { fetchBounties } from './api.js';
import { acceptsEntries, compact, esc, num, remaining, usd, utcDay } from './format.js';

/** The entries a bounty charges, or 'free'. */
function feeLabel(fee) {
  const n = Number(fee);
  if (fee === null || fee === undefined || fee === '' || !Number.isFinite(n) || n === 0) return 'free';
  return usd(n);
}

/** One bounty as a row: title, a line of facts, then pot and time left hard against the right. */
function rowMarkup(b) {
  const left = remaining(b.deadline);
  const open = acceptsEntries(b);
  const fee = feeLabel(b.entryFeeUsd);
  const pot = usd(b.potUsd);
  const state = !open ? 'closed' : left.ended ? 'closed' : left.urgent ? 'urgent' : 'open';
  const entries = Number(b.submissionCount);
  return `<li class="row" data-state="${state}">
    <a class="row-link" href="#/bounty/${esc(b.slug)}">
      <span class="row-main">
        <span class="row-top">
          <span class="row-title">${esc(b.title)}</span>
          <span class="chip chip-${fee === 'free' ? 'free' : 'paid'}">entry ${esc(fee)}</span>
        </span>
        <span class="row-meta">
          <span class="dot-sep">${esc(b.slug)}</span>
          <span class="dot-sep">${Number.isFinite(entries) ? `${num(entries)} ${entries === 1 ? 'entry' : 'entries'}` : '— entries'}</span>
          <span class="dot-sep">closes ${esc(utcDay(b.deadline))}</span>
        </span>
      </span>
      <span class="row-figure">
        <span class="fig-pot">${esc(pot)}</span>
        <span class="fig-sub">pot</span>
      </span>
      <span class="row-time" data-deadline="${esc(b.deadline)}">${esc(left.text)}</span>
      <span class="row-go" aria-hidden="true">→</span>
    </a>
  </li>`;
}

/** The board's summary line: how many are open, and the pot they hold in total. */
function summaryMarkup(items) {
  const open = items.filter(acceptsEntries).length;
  const pot = items.reduce((sum, b) => sum + (Number(b.potUsd) || 0), 0);
  const entries = items.reduce((sum, b) => sum + (Number(b.submissionCount) || 0), 0);
  return `<dl class="tally">
    <div class="tally-cell"><dt>open now</dt><dd>${num(open)}</dd></div>
    <div class="tally-cell"><dt>on the table</dt><dd>${esc(usd(pot))}</dd></div>
    <div class="tally-cell"><dt>entries in</dt><dd>${compact(entries)}</dd></div>
  </dl>`;
}

/** The board page markup. `signal` aborts the fetch if the hash moves first. */
export async function renderBoard(params, { signal } = {}) {
  const data = await fetchBounties({ limit: 50 });
  if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  const all = Array.isArray(data?.items) ? data.items : [];
  // The API answers status=open, but it keeps bounties whose deadline has already passed: put the
  // live ones first so the first paint is all taking-entries work, and the ended ones last.
  const items = [...all].sort((a, b) => {
    const aOpen = acceptsEntries(a) ? 0 : 1;
    const bOpen = acceptsEntries(b) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  if (!items.length) {
    return `<section class="sect">
      <header class="head"><p class="kicker">the board</p><h1 class="head-h">No open bounties right now</h1></header>
      <p class="lede">Everything on make.fun is resolved or closed. Check back soon, or read the
      <a class="txt-link" href="https://make.fun/api/openapi.json">API</a> directly.</p>
    </section>`;
  }

  return `<section class="sect">
    <header class="head">
      <p class="kicker">the board · live</p>
      <h1 class="head-h">Open bounties</h1>
      <p class="lede">Every competition taking entries, soonest deadline first. The pot is what gets
      paid out; the entry fee is what it costs to hand in a solution.</p>
    </header>
    ${summaryMarkup(items)}
    <label class="search-label" for="search">Find a bounty</label><input id="search" class="search-input" type="search" placeholder="Search titles or slugs…" autocomplete="off">
    <ol class="rows" id="bounty-rows">${items.map(rowMarkup).join('')}</ol>
    <p id="search-empty" class="body-p" hidden>No bounties match your search.</p>
    ${data.next_cursor ? `<button class="btn" id="more-bounties" data-cursor="${esc(data.next_cursor)}">Load more bounties</button>` : ''}
    <p class="foot-note">${data.next_cursor ? 'Summary covers the loaded first page. More bounties are available. ' : ''}Read from the public API — no account, no writes.</p>
  </section>`;
}

export function wireBoard(root) {
  const input = root.querySelector('#search');
  const list = root.querySelector('#bounty-rows');
  const empty = root.querySelector('#search-empty');
  input?.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    list?.querySelectorAll('.row').forEach((row) => {
      const visible = !q || row.textContent.toLowerCase().includes(q);
      row.hidden = !visible;
      if (visible) shown += 1;
    });
    if (empty) empty.hidden = shown !== 0;
  });
  const more = root.querySelector('#more-bounties');
  more?.addEventListener('click', async () => {
    more.disabled = true; more.textContent = 'Loading…';
    try {
      const data = await fetchBounties({ limit: 50, cursor: more.dataset.cursor });
      if (!more.isConnected) return;
      const seen = new Set([...list.querySelectorAll('a')].map(a => a.getAttribute('href')));
      list.insertAdjacentHTML('beforeend', (data.items ?? []).filter(b => !seen.has(`#/bounty/${b.slug}`)).map(rowMarkup).join(''));
      input.dispatchEvent(new Event('input'));
      if (data.next_cursor) { more.dataset.cursor = data.next_cursor; more.disabled = false; more.textContent = 'Load more bounties'; }
      else more.remove();
    } catch { if (more.isConnected) { more.disabled = false; more.textContent = 'Retry loading more'; } }
  });
}
