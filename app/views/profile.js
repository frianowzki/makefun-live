// #/u/<handle> — a hunter's public profile. Read from /api/profiles/<handle> (not /u/), showing the
// avatar, when they joined, their record, and each solution with the API's own score display and
// its column metadata, linked back to the bounty it was entered in.

import { load } from '../lib/api.js';
import { h, avatar, externalLink } from '../lib/dom.js';
import { usd, count, shortDate, relative } from '../lib/format.js';
import { loadingView, errorView, notice } from '../lib/ui.js';

let ctx = null;
let handle = null;

export function mounts(headEl, bodyEl, context, params) {
  ctx = context;
  handle = params.handle;
  headEl.appendChild(h('p', { class: 'crumbs' },
    h('a', { href: '#/hunters' }, 'Hunters'), h('span', { class: 'sep' }, '/'), h('span', null, `@${handle}`)));
  const root = h('div', { id: 'profile-body' });
  bodyEl.appendChild(root);
  void loadProfile(root);
  return () => { ctx = null; };
}

async function loadProfile(root) {
  root.appendChild(loadingView('Loading this profile'));
  const res = await load(`/profiles/${encodeURIComponent(handle)}`, { signal: ctx ? ctx.signal : undefined });
  if (res.aborted || !root.isConnected) return;
  while (root.firstChild) root.removeChild(root.firstChild);
  if (!res.ok) {
    ctx.fail(`Could not load @${handle}: ${res.error}`);
    root.appendChild(errorView({
      title: res.status === 404 ? `No profile @${handle}` : 'This profile could not be loaded',
      message: res.status === 404 ? `make.fun has no public profile at @${handle}.` : res.error,
      hint: res.status === 404 ? 'Handles are exact: check the spelling, or browse the paid ranking.' : 'make.fun may be briefly unreachable.',
      retry: () => { void loadProfile(root); },
    }));
    return;
  }
  const profile = res.data && res.data.profile && typeof res.data.profile === 'object' ? res.data.profile : res.data;
  root.appendChild(renderProfile(profile));
  const main = document.getElementById('main');
  if (main) {
    main.dataset.view = 'profile';
    main.dataset.handle = handle;
  }
  ctx.ready();
}

function renderProfile(profile) {
  const frag = document.createDocumentFragment();
  const record = profile.record && typeof profile.record === 'object' ? profile.record : {};
  const solutions = Array.isArray(profile.solutions) ? profile.solutions : [];
  const name = profile.display_name || profile.handle || handle;
  const image = profile.avatar || profile.image;

  frag.appendChild(h('header', { class: 'page-head', style: 'display:flex;gap:16px;align-items:center;flex-wrap:wrap' },
    avatar(image, name, { size: 64 }),
    h('div', { style: 'min-width:0' },
      h('p', { class: 'eyebrow' }, profile.house ? 'make.fun house hunter' : 'Hunter profile'),
      h('h1', null, String(name)),
      h('p', { class: 'crumbs-note', style: 'margin:4px 0 0' },
        h('span', { class: 'mono' }, `@${String(profile.handle || handle)}`),
        profile.joined_at ? ` · joined ${shortDate(profile.joined_at)} (${relative(profile.joined_at)})` : ''))));

  frag.appendChild(h('ul', { class: 'stat-strip', id: 'profile-stats', style: 'margin-bottom:18px' },
    stat('Prizes won', usd(record.prize_usd), 'prize'),
    stat('Competitions won', count(record.competitions_won), 'won'),
    stat('Placed', count(record.competitions_placed), 'placed'),
    stat('Entered', count(record.competitions_entered), 'entered')));

  if (profile.bio) frag.appendChild(h('p', { class: 'lede', style: 'margin-bottom:18px' }, String(profile.bio)));

  const split = h('div', { class: 'split' });
  const mainCol = h('div', { class: 'stack' });
  const sideCol = h('div', { class: 'stack' });

  mainCol.appendChild(h('section', { class: 'panel' },
    h('h2', null, `Solutions (${count(solutions.length)})`),
    solutions.length === 0 ? h('p', { class: 'muted' }, 'No public solutions yet.') : h('div', { class: 'solutions' }, solutions.map(solutionRow))));

  const rows = [
    ['Profile', h('span', { class: 'mono' }, String(profile.profile_url || `/u/${handle}`))],
    ['GitHub', profile.github_login ? externalLink(`https://github.com/${encodeURIComponent(profile.github_login)}`, `@${profile.github_login}`) : '—'],
    ['X', profile.x ? externalLink(`https://x.com/${encodeURIComponent(String(profile.x).replace(/^@/, ''))}`, `@${String(profile.x).replace(/^@/, '')}`) : '—'],
    ['Discord', profile.discord ? String(profile.discord) : '—'],
    ['Best placement', record.best_placement !== null && record.best_placement !== undefined ? `#${count(record.best_placement)}` : '—'],
    ['Other placements', count(record.other_placements)],
    ['Podiums', count(record.podium_finishes)],
  ];
  sideCol.appendChild(h('section', { class: 'panel' },
    h('h2', null, 'Record'),
    h('dl', { class: 'kv' }, rows.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
    h('div', { class: 'actions' },
      externalLink(`https://make.fun/u/${encodeURIComponent(String(profile.handle || handle))}`, 'View on make.fun', { class: 'btn' }))));
  if (profile.house) sideCol.appendChild(notice({ title: 'House hunter', lines: ['make.fun enters this account itself; its places are held, not awarded to a person.'] }));

  split.appendChild(mainCol);
  split.appendChild(sideCol);
  frag.appendChild(split);
  return frag;
}

function stat(label, value, id) {
  return h('li', null, h('span', { class: 'stat-k' }, label), h('span', { class: 'stat-v', id: `profile-${id}` }, value));
}

// One solution: its title links to its bounty, its competition's deadline/status show below, and its
// score is the API's display string with the column title and precision as context.
function solutionRow(solution) {
  if (!solution || typeof solution !== 'object') return null;
  const competition = solution.competition && typeof solution.competition === 'object' ? solution.competition : {};
  const slug = String(competition.slug || '');
  const score = solution.score && typeof solution.score === 'object' ? solution.score : null;
  const column = score && score.column && typeof score.column === 'object' ? score.column : null;
  const display = score && typeof score.display === 'string' && score.display !== '' ? score.display : null;
  const placement = solution.placement !== null && solution.placement !== undefined ? `#${solution.placement}` : null;
  const href = slug ? `#/bounty/${encodeURIComponent(slug)}` : null;
  const scoreLabel = column
    ? `${column.title || column.key}${Number(column.precision) > 0 ? ` · ${Number(column.precision)} dp` : ''}`
    : 'Score';
  return h('article', { class: 'solution', style: 'padding:12px 0;border-bottom:1px solid var(--line-soft);min-width:0' },
    h('div', { style: 'display:flex;gap:12px;justify-content:space-between;align-items:baseline;flex-wrap:wrap' },
      h('h3', { style: 'margin:0;min-width:0;overflow-wrap:anywhere' },
        href ? h('a', { href, style: 'text-decoration:none' }, String(solution.title || competition.title || slug)) : String(solution.title || 'Entry')),
      display ? h('span', { class: 'num', title: column && column.source ? `Source: ${column.source}` : null, style: 'font-weight:700' }, display) : null),
    h('p', { class: 'crumbs-note', style: 'margin:4px 0 0' },
      scoreLabel,
      display ? ` · ${display}` : ' · no public score',
      placement ? ` · placed ${placement}` : '',
      competition.deadline ? ` · deadline ${shortDate(competition.deadline)}` : '',
      competition.status ? ` · ${String(competition.status)}` : '',
      solution.entered_at ? ` · entered ${shortDate(solution.entered_at)}` : ''),
    href ? h('p', { style: 'margin:6px 0 0' }, h('a', { href }, `Open the bounty board page for ${competition.title || slug}`)) : null);
}
