// One bounty. The page opens on the competition record alone: title, pot, entry fee, deadline,
// description, the rewards table and the judging rule. That answer is small (tens of KB).
//
// The leaderboard is a separate, heavy answer — a few thousand entries of a few KB each — so it is
// only asked for when the reader opens it, and then only the top rows (`rows=first`: the first ten
// plus a lean `rest`). Nothing on this page loads every entry.

import { fetchBounty, fetchRequirements } from './api.js';
import { acceptsEntries, esc, markdown, num, remaining, usd, utcDate } from './format.js';

/** The rewards table: place, base purse, the entry-fee share, and the payout it adds up to. */
function rewardsMarkup(rewardsNow) {
  const rows = Array.isArray(rewardsNow) ? rewardsNow : [];
  if (!rows.length) return '';
  const total = rows.reduce((sum, r) => sum + (Number(r.amountUsd) || 0), 0);
  return `<section class="sect sect-block" id="rewards">
    <h2 class="sub-h">What the places pay</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th scope="col">Place</th><th scope="col" class="n">Base</th><th scope="col" class="n">Fee share</th><th scope="col" class="n">Pays</th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
              <td>${esc(r.place)}</td>
              <td class="n">${esc(usd(r.baseUsd))}</td>
              <td class="n">${esc(usd(r.feeShareUsd))}</td>
              <td class="n strong">${esc(usd(r.amountUsd))}</td>
            </tr>`,
          )
          .join('')}</tbody>
        <tfoot><tr><td>${rows.length} places</td><td class="n"></td><td class="n"></td><td class="n strong">${esc(usd(total))}</td></tr></tfoot>
      </table>
    </div>
    <p class="foot-note">The fee share is every entry fee already paid, split down the curve; it moves while entries keep arriving.</p>
  </section>`;
}

/** The judging rule, in the API's own words. */
function resolutionMarkup(resolution) {
  if (!resolution) return '';
  const criteria = Array.isArray(resolution.criteria) ? resolution.criteria : [];
  return `<section class="sect sect-block" id="judged">
    <h2 class="sub-h">How it is judged <span class="sub-note">${esc(resolution.method ?? '')}</span></h2>
    ${resolution.summary ? `<p class="body-p">${esc(resolution.summary)}</p>` : ''}
    ${criteria.length ? `<ul class="criteria">${criteria.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

/** The rules block, rendered from markdown but capped so the page stays scannable. */
function rulesMarkup(rules) {
  if (!rules) return '';
  return `<details class="more" id="rules">
    <summary class="more-sum">The full rules <span class="more-n">${num(String(rules).length)} characters</span></summary>
    <div class="prose">${markdown(rules)}</div>
  </details>`;
}

/** The leaderboard panel, fetched only on demand. */
function leaderboardShell(slug) {
  return `<section class="sect sect-block" id="results-panel" data-slug="${esc(slug)}">
    <div class="panel-head"><h2 class="sub-h">Leaderboard</h2>
    <a class="btn btn-quiet" href="#/bounty/${esc(encodeURIComponent(slug))}/leaderboard">View live rankings →</a></div>
    <p class="foot-note">Compare published ranks and competition-specific metrics on the dedicated leaderboard.</p>
  </section>`;
}

/** Fetch the requirements only when requested, without delaying the brief. */
function wireResults(root, slug) {
  const section = root.querySelector('#rules') ?? root.querySelector('#results-panel');
  if (!section) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'btn'; button.id = 'load-requirements';
  button.textContent = 'Load entry requirements';
  section.before(button);
  button.addEventListener('click', async () => {
    button.disabled = true; button.textContent = 'Loading requirements…';
    try {
      const data = await fetchRequirements(slug);
      if (!button.isConnected) return;
      const block = document.createElement('details'); block.className = 'more'; block.open = true;
      block.innerHTML = `<summary class="more-sum">Entry requirements</summary><div class="prose">${(data.checks ?? []).map(c => `<h3>${esc(c.title ?? c.check)}</h3><p>${esc(c.description ?? '')}</p>`).join('') || '<p>No additional checks published.</p>'}</div>`;
      button.replaceWith(block);
    } catch {
      if (button.isConnected) { button.disabled = false; button.textContent = 'Retry entry requirements'; }
    }
  });
}

/** The bounty page markup. */
export async function renderBounty({ slug }, { signal } = {}) {
  if (!slug) return { title: 'Not found', html: `<section class="sect"><h1 class="head-h">No bounty named</h1><p class="lede"><a class="txt-link" href="#/">Back to the board</a></p></section>` };
  const b = await fetchBounty(slug);
  if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });

  const left = remaining(b.deadline);
  const open = acceptsEntries(b);
  const fee = Number(b.entryFeeUsd);
  const feeText = b.entryFeeUsd === null || b.entryFeeUsd === undefined ? 'free' : Number.isFinite(fee) && fee === 0 ? 'free' : usd(fee);
  const payers = Number(b.entryFeePayers);

  const html = `<article class="sect bounty">
    <nav class="crumbs" aria-label="Breadcrumb"><a class="crumb" href="#/">board</a><span class="crumb-sep" aria-hidden="true">/</span><span class="crumb-here">${esc(b.slug)}</span></nav>

    <header class="head head-bounty">
      <p class="kicker">${esc(b.category ?? 'bounty')}${b.sponsor?.name ? ` · sponsored by ${esc(b.sponsor.name)}` : ''}</p>
      <h1 class="head-h head-h-big">${esc(b.title)}</h1>
      ${b.summary ? `<p class="lede">${esc(b.summary)}</p>` : ''}
      <ul class="skills">${(b.skills ?? []).map((s) => `<li class="skill">${esc(s)}</li>`).join('')}</ul>
    </header>

    <dl class="facts">
      <div class="fact fact-pot"><dt>pot</dt><dd>${esc(usd(b.potUsd))}</dd></div>
      <div class="fact"><dt>entry fee</dt><dd>${esc(feeText)}</dd></div>
      <div class="fact"><dt>${open ? 'time left' : 'closed'}</dt><dd${open ? ` data-deadline="${esc(b.deadline)}"` : ''} class="${open ? (left.urgent ? 'is-urgent' : '') : 'is-urgent'}">${open ? esc(left.text) : 'ended'}</dd></div>
      <div class="fact"><dt>entries</dt><dd>${num(b.submissionCount)}</dd></div>
      <div class="fact"><dt>closes</dt><dd class="fact-sm">${esc(utcDate(b.deadline))}</dd></div>
    </dl>

    <section class="sect sect-block" id="brief">
      <h2 class="sub-h">The brief</h2>
      <div class="prose">${markdown(b.description)}</div>
    </section>

    ${rewardsMarkup(b.rewardsNow)}
    ${resolutionMarkup(b.resolution)}
    ${leaderboardShell(b.slug)}
    ${rulesMarkup(b.rules)}

    <p class="foot-note">Status ${esc(b.status ?? '—')}${open ? '' : ', not taking entries'}
    ${payers ? `, ${num(payers)} entrant${payers === 1 ? '' : 's'} paid the fee` : ''}. Read at ${esc(utcDate(new Date().toISOString()))}.</p>
  </article>`;

  return { title: b.title, tag: acceptsEntries(b) ? 'open' : 'closed', html, rail: { href: `#/bounty/${b.slug}`, label: 'This bounty', note: b.slug }, after: (root) => wireResults(root, b.slug) };
}
