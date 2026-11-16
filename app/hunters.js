// The hunters leaderboard: every account ranked by the prize money it has taken off make.fun.
//
// The API orders by prize money only when asked (`order=paid`); its default order is wins, which
// puts a $410 account below a $278 one. Ranking by wins is a different page, so ask for paid here.

import { fetchRankings } from './api.js';
import { compact, esc, num, usd } from './format.js';

/** One hunter as a row: rank, handle, then the money it has taken, right-aligned. */
function rowMarkup(item) {
  const r = item.record ?? {};
  const handle = item.handle ?? '';
  const rank = Number.isFinite(Number(item.rank)) ? Number(item.rank) : 0;
  const money = usd(r.prize_usd);
  const entered = Number(r.competitions_entered);
  const podiums = Number(r.podium_finishes);
  const best = Number(r.best_placement);
  return `<li class="lb-row">
    <span class="lb-rank">${rank ? String(rank).padStart(2, '0') : '—'}</span>
    <span class="lb-name"><a href="#/u/${esc(handle)}">${esc(handle)}</a></span>
    <span class="lb-score">${esc(money)}</span>
    <span class="lb-title">
      ${Number.isFinite(entered) ? `${num(entered)} entered` : '— entered'}
      · ${Number.isFinite(podiums) ? `${num(podiums)} ${podiums === 1 ? 'podium' : 'podiums'}` : '— podiums'}
      ${Number.isFinite(best) && best > 0 ? `· best #${best}` : ''}
    </span>
  </li>`;
}

/** The whole page: a head, a tally, then the ranked list. */
export async function renderHunters(params, { signal } = {}) {
  const data = await fetchRankings({ limit: 100 });
  const items = data.items ?? [];
  const total = Number(data.total);
  const paidOut = items.reduce((sum, it) => {
    const n = Number(it.record?.prize_usd);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const rows = items.map(rowMarkup).join('');

  return `<section class="sect">
      <header class="head">
        <p class="kicker">the hunters · all time</p>
        <h1 class="head-h">Who is winning</h1>
        <p class="lede">Every account ranked by the prize money it has taken off make.fun.
        A podium is a top-three finish in a bounty; the best placement is its highest one.</p>
      </header>

      <dl class="tally">
        <div class="tally-cell"><dt>accounts</dt><dd>${Number.isFinite(total) ? num(total) : '—'}</dd></div>
        <div class="tally-cell"><dt>paid, top ${items.length}</dt><dd>${esc(usd(paidOut))}</dd></div>
        <div class="tally-cell"><dt>ranked by</dt><dd>prize money</dd></div>
      </dl>

      <div class="panel-head">
        <h2>Prize money</h2>
        <p class="sub-note">all time</p>
      </div>
      <ul class="lb" aria-label="Hunters ranked by prize money">
        ${rows || '<li class="lb-row"><span class="lb-title">No accounts yet.</span></li>'}
      </ul>
    </section>`;
}
