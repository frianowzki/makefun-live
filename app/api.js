// make.fun's public API, read-only: GET requests to https://make.fun/api, which answers any origin.
// The whole surface is described at https://make.fun/api/openapi.json.
//
// Three layers keep a view to few requests:
//   apiCache     each answer kept by path with its ETag; a repeat revalidates with If-None-Match, and
//                the API answers 304 inside the minute, so a revisit costs headers and no body
//   apiInflight  a second call for a path already on the wire joins it instead of sending again
//   apiFreshFor  how long an answer is shown without asking the network at all
// The API's ETags are bound to the minute, so a revalidation older than that always brings a body.

/** The API root; every path below hangs off it. */
export const API_ROOT = 'https://make.fun/api';

/** How long a cached answer is served before the network is asked, by path kind. */
const FRESH_MS = { list: 60_000, one: 30_000, static: 600_000 };

/** path -> { at, etag, value } */
const apiCache = new Map();
/** path -> Promise, so concurrent callers share one request. */
const apiInflight = new Map();
export function clearCache() { apiCache.clear(); }

/** The API's own error body as an Error, so a view can say what went wrong. */
function apiError(path, status, body) {
  const detail = body?.error?.[0]?.message ?? body?.message ?? `HTTP ${status}`;
  const err = new Error(`${detail} (${path})`);
  err.status = status;
  err.path = path;
  return err;
}

/** How long the answer for `path` is served from cache without asking the network. */
function freshWindow(path) {
  if (path.includes('/leaderboard') || path === '/rankings') return FRESH_MS.static;
  if (/\/(competitions|profiles)\/[^/?]+/.test(path) && !path.includes('?')) return FRESH_MS.one;
  return FRESH_MS.list;
}

/**
 * GET an API path as JSON, through the cache. `force` skips the fresh window (a manual refresh).
 * A 304 keeps the cached value; any other answer replaces it.
 */
export async function apiGet(path, { force = false } = {}) {
  const hit = apiCache.get(path);
  if (hit && !force && Date.now() - hit.at < freshWindow(path)) return hit.value;
  const pending = apiInflight.get(path);
  if (pending) return pending;

  const url = API_ROOT + path;
  const headers = { accept: 'application/json' };
  if (hit?.etag) headers['if-none-match'] = hit.etag;

  const run = (async () => {
    let res;
    try {
      res = await fetch(url, { headers, mode: 'cors' });
    } catch (err) {
      // Offline or blocked: a previously cached answer still beats an empty screen.
      if (hit) return hit.value;
      throw err;
    }
    if (res.status === 304 && hit) {
      hit.at = Date.now();
      return hit.value;
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw apiError(path, res.status, body);
    const etag = res.headers.get('etag');
    apiCache.set(path, { at: Date.now(), etag, value: body });
    return body;
  })().finally(() => apiInflight.delete(path));

  apiInflight.set(path, run);
  return run;
}

/** The live bounties, newest-deadline first as the API orders them: { items, next_cursor }. */
export function fetchBounties({ limit = 24, cursor = null } = {}) {
  const q = new URLSearchParams({ status: 'open', limit: String(limit) });
  if (cursor) q.set('cursor', cursor);
  return apiGet(`/competitions?${q}`);
}

/** One bounty by slug: the board item's fields plus description, rules and the rewards table. */
export function fetchBounty(slug) {
  return apiGet(`/competitions/${encodeURIComponent(slug)}`);
}

/** One bounty's leaderboard: { competition, phase, columns, entries, rank_key, ... }. */
export function fetchLeaderboard(slug) {
  return apiGet(`/competitions/${encodeURIComponent(slug)}/leaderboard`);
}

/**
 * Just the head of a leaderboard. The full answer for a busy bounty is tens of megabytes (every
 * entry carries its judge artifact), and the endpoint takes neither a limit nor a cursor — only
 * `rows=all|first`. `first` answers the top ten plus a lean `rest` array, which is the whole board's
 * order without its payload, so a bounty page can show the leaders for a fraction of the bytes.
 */
export function fetchLeaderboardHead(slug) {
  return apiGet(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`);
}

/** One bounty's entry terms: fee, quota, deadlines, payout curve and checks. */
export function fetchRequirements(slug) {
  return apiGet(`/competitions/${encodeURIComponent(slug)}/requirements`);
}

/** An account's public profile, by handle: record, solutions and payouts. */
export function fetchProfile(handle) {
  return apiGet(`/profiles/${encodeURIComponent(handle)}`);
}

/**
 * Hunters by prize money. The API's `rank` field is ordered by wins unless `order` is given, so
 * the money board asks for `order=paid`, whose `record.prize_usd` descends monotonically.
 */
export function fetchRankings({ order = 'paid', limit = 50, cursor = null } = {}) {
  const q = new URLSearchParams({ order, limit: String(limit) });
  if (cursor) q.set('cursor', cursor);
  return apiGet(`/rankings?${q}`);
}

/** Every absolute URL an avatar path points at (the API answers relative paths). */
export function absolute(path) {
  if (!path) return '';
  return path.startsWith('http') ? path : API_ROOT.replace(/\/api$/, '') + path;
}
