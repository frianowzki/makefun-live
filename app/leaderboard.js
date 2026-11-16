import { fetchBounty, fetchLeaderboardHead } from './api.js';
import { esc, num } from './format.js';

/** Prefer the API's human-readable value; units differ for each competition. */
export function metricValue(row, column) {
  const display = row.display?.[column.key];
  if (display !== null && display !== undefined) return String(display);
  const value = row.values?.[column.key];
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const precision = Math.max(0, Math.min(12, Number(column.precision) || 0));
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: precision }) : String(value);
}

export function resultsMarkup(data, limit = 50) {
  const columns = (data.columns ?? []).filter(c => !c.hidden);
  const head = Array.isArray(data.entries) ? data.entries : [];
  const rest = Array.isArray(data.rest) ? data.rest : [];
  const seen = new Set();
  const rows = [...head, ...rest].filter(row => {
    const id = row.submission_id ?? `${row.handle}:${row.rank}:${row.title}`;
    if (seen.has(id)) return false;
    seen.add(id); return true;
  });
  if (!rows.length) return '<p class="body-p">No public results are available for this phase yet.</p>';
  return `<div class="table-wrap"><table class="table result-table">
    <thead><tr><th scope="col">Rank</th><th scope="col">Hunter / entry</th>${columns.map(c => `<th scope="col" class="n">${esc(c.title ?? c.key)}</th>`).join('')}</tr></thead>
    <tbody>${rows.slice(0, limit).map(row => `<tr data-entry-id="${esc(row.submission_id ?? '')}">
      <td class="rank">${esc(row.rank ?? row.performance ?? '—')}</td>
      <td class="result-person"><a class="lb-link" href="#/u/${esc(encodeURIComponent(row.handle ?? ''))}">${esc(row.handle ?? 'Anonymous')}</a>${row.title ? `<span class="lb-title">${esc(row.title)}</span>` : ''}</td>
      ${columns.map(c => `<td class="n metric" data-metric="${esc(c.key)}">${esc(metricValue(row, c))}</td>`).join('')}
    </tr>`).join('')}</tbody>
  </table></div><p class="foot-note">Showing ${num(Math.min(rows.length, limit))} of ${num(rows.length)} returned rows. Ranked by ${esc(columns.find(c => c.key === data.rank_key)?.title ?? data.rank_key ?? 'the published rank')}.${data.metrics_withheld ? ' Some metrics are withheld by the competition.' : ''}</p>`;
}

export async function renderLeaderboard({ slug }, { signal } = {}) {
  const [bounty, data] = await Promise.all([fetchBounty(slug), fetchLeaderboardHead(slug)]);
  if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  const href = `#/bounty/${encodeURIComponent(slug)}`;
  return { title: `${bounty.title} · Leaderboard`, tag: 'results',
    rail: { href: href + '/leaderboard', label: 'Leaderboard', note: bounty.title },
    html: `<article class="sect"><nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Board</a><span>/</span><a href="${esc(href)}">${esc(bounty.title)}</a><span>/</span><span>Leaderboard</span></nav>
      <header class="head"><p class="kicker">Live results · ${esc(data.phase?.title ?? data.phase?.key ?? '')}</p><h1 class="head-h head-h-big">${esc(bounty.title)}</h1><p class="lede">The leaderboard. Published ranks and metric units come directly from make.fun.</p></header>
      ${resultsMarkup(data)}<a class="txt-link" href="https://make.fun/bounty/${esc(encodeURIComponent(slug))}/leaderboard" target="_blank" rel="noopener noreferrer">Full leaderboard on make.fun ↗</a></article>` };
}
