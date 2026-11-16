// One hunter's public record: who they are, what they have taken, and the work that took it.
//
// make.fun serves avatars with `Cross-Origin-Resource-Policy: same-origin`, so a page on another
// origin can never paint one: the header draws the handle's initial instead of a broken image.
//
// The API answers `record` (the totals), `solutions` (one per entered bounty) and `payouts`
// (money actually paid).

import { fetchProfile } from './api.js';
import { compact, esc, num, usd, utcDay } from './format.js';

/** One entered bounty: title, its competition, and the score it drew. */
function solutionMarkup(s) {
  const c = s.competition ?? {};
  const score = s.score?.display ?? null;
  const place = Number(s.placement);
  const prize = Number(s.prize_usd);
  return `<li class="row">
    <a class="row-link" href="#/bounty/${esc(c.slug ?? '')}">
      <span class="row-main">
        <span class="row-top">
          <span class="row-title">${esc(s.title ?? c.title ?? 'Untitled entry')}</span>
          ${Number.isFinite(place) && place > 0 ? `<span class="chip">#${place}</span>` : ''}
        </span>
        <span class="row-meta">
          <span class="dot-sep">${esc(c.title ?? c.slug ?? '—')}</span>
          <span class="dot-sep">entered ${esc(utcDay(s.entered_at))}</span>
          ${score !== null ? `<span class="dot-sep">score ${esc(score)}</span>` : ''}
        </span>
      </span>
      <span class="row-figure">
        <span class="fig-pot">${Number.isFinite(prize) && prize > 0 ? esc(usd(prize)) : '—'}</span>
        <span class="fig-sub">${Number.isFinite(place) && place > 0 ? `place #${place}` : 'unplaced'}</span>
      </span>
    </a>
  </li>`;
}

/** One payout line: the bounty it came from, the place, and the money. */
function payoutMarkup(p) {
  const c = p.competition ?? {};
  return `<li class="row">
    <a class="row-link" href="#/bounty/${esc(c.slug ?? '')}">
      <span class="row-main">
        <span class="row-top">
          <span class="row-title">${esc(c.title ?? c.slug ?? 'A bounty')}</span>
          <span class="chip">place #${esc(String(p.place ?? '—'))}</span>
        </span>
        <span class="row-meta">
          <span class="dot-sep">paid ${esc(utcDay(p.paid_at))}</span>
        </span>
      </span>
      <span class="row-figure">
        <span class="fig-pot">${esc(usd(p.amount_usd))}</span>
        <span class="fig-sub">paid</span>
      </span>
    </a>
  </li>`;
}

export async function renderProfile(params, { signal } = {}) {
  const handle = params?.handle ?? '';
  if (!handle) return { title: 'Hunters · make.fun', tag: 'hunters', html: '<p class="empty">No handle.</p>' };

  const p = await fetchProfile(handle);
  const r = p.record ?? {};
  const solutions = (p.solutions ?? []).slice(0, 20);
  const payouts = (p.payouts ?? []).slice(0, 10);
  const avatar = p.avatar?.url_small || p.avatar?.url || p.image || '';
  const name = p.display_name || p.handle;
  // make.fun's /api/avatars/ endpoint answers 200 with an empty body for every account, so an image
  // that fails to paint falls back to the handle's initial rather than an empty disc.
  const initial = (p.display_name || p.handle || '?').trim().charAt(0).toUpperCase() || '?';

  return {
    title: handle,
    tag: 'hunter',
    rail: { href: `#/u/${handle}`, label: 'This hunter', note: 'record' },
    html: `<nav class="crumbs" aria-label="You are here">
      <a href="#/">Board</a><span class="crumb-sep">/</span>
      <a href="#/hunters">Hunters</a><span class="crumb-sep">/</span>
      <span class="crumb-here">${esc(handle)}</span>
    </nav>

    <header class="head who">
      <span class="avatar avatar-fallback" aria-hidden="true">${esc(initial)}</span>
      <span>
        <h1 class="head-h">${esc(name)}</h1>
        <p class="sub-note">${p.house ? 'house account · ' : ''}joined ${esc(utcDay(p.joined_at))}</p>
        ${p.bio ? `<p class="lede">${esc(p.bio)}</p>` : ''}
      </span>
    </header>

    <dl class="tally">
      <div class="tally-cell"><dt>prize money</dt><dd>${esc(usd(r.prize_usd))}</dd></div>
      <div class="tally-cell"><dt>entered</dt><dd>${Number.isFinite(Number(r.competitions_entered)) ? num(r.competitions_entered) : '—'}</dd></div>
      <div class="tally-cell"><dt>won</dt><dd>${Number.isFinite(Number(r.competitions_won)) ? num(r.competitions_won) : '—'}</dd></div>
      <div class="tally-cell"><dt>podiums</dt><dd>${Number.isFinite(Number(r.podium_finishes)) ? num(r.podium_finishes) : '—'}</dd></div>
      <div class="tally-cell"><dt>best</dt><dd>${Number(r.best_placement) > 0 ? `#${num(r.best_placement)}` : '—'}</dd></div>
    </dl>

    ${
      solutions.length
        ? `<section class="sect sect-block">
      <div class="panel-head"><h2>Entered</h2><p class="sub-note">${solutions.length} shown</p></div>
      <ul class="rows">${solutions.map(solutionMarkup).join('')}</ul>
    </section>`
        : ''
    }

    ${
      payouts.length
        ? `<section class="sect sect-block">
      <div class="panel-head"><h2>Paid out</h2><p class="sub-note">${payouts.length} shown</p></div>
      <ul class="rows">${payouts.map(payoutMarkup).join('')}</ul>
    </section>`
        : ''
    }`,
  };
}
