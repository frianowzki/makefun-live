// #/bounty/<slug> — one bounty: summary and brief, economics, the entry deadline and clock, the
// reward table, the requirements/gates (loaded only when asked), and the rules.

import { load } from '../lib/api.js';
import { h, markdown, externalLink } from '../lib/dom.js';
import { usd, plainUsd, count, acceptsEntries, countdown, deadlineMs, shortDate, toNumber } from '../lib/format.js';
import { loadingView, errorView, notice } from '../lib/ui.js';

const cache = new Map();
let ctx = null;
let slug = null;
let gateState = 'idle';
let expanded = false;

export function mounts(headEl, bodyEl, context, params) {
  ctx = context;
  slug = params.slug;
  headEl.appendChild(h('p', { class: 'crumbs', id: 'crumbs' }, h('a', { href: '#/' }, 'Board'), h('span', { class: 'sep' }, '/'), h('span', null, 'Bounty')));
  const root = h('div', { id: 'bounty-body' });
  bodyEl.appendChild(root);
  void loadBounty(root);
  return () => { ctx = null; };
}

async function loadBounty(root) {
  root.appendChild(loadingView('Loading this bounty'));
  const path = `/competitions/${encodeURIComponent(slug)}`;
  const res = await load(path, { signal: ctx ? ctx.signal : undefined });
  if (res.aborted || !root.isConnected) return;
  while (root.firstChild) root.removeChild(root.firstChild);
  if (!res.ok) {
    ctx.fail(`Could not load the bounty "${slug}": ${res.error}`);
    root.appendChild(errorView({
      title: 'This bounty could not be loaded',
      message: res.status === 404 ? `make.fun has no bounty at ${slug}.` : res.error,
      hint: res.status === 404 ? 'Check the address, or go back to the board for the open bounties.' : 'make.fun may be briefly unreachable.',
      retry: () => { void loadBounty(root); },
    }));
    return;
  }
  const body = unwrapCompetition(res.data);
  if (!body) {
    ctx.fail('The bounty answer from make.fun held no competition.');
    root.appendChild(errorView({ title: 'Unexpected answer', message: 'make.fun answered without a competition object.' }));
    return;
  }
  cache.set(slug, body);
  root.appendChild(renderBounty(body));
  const main = document.getElementById('main');
  if (main) {
    main.dataset.view = 'bounty';
    main.dataset.slug = body.slug || slug;
  }
  ctx.ready();
}

function unwrapCompetition(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.competition && typeof data.competition === 'object') {
    return { ...data.competition, requirements: data.requirements || data.competition.requirements, deliverables: data.deliverables };
  }
  if (typeof data.slug === 'string') return data;
  if (data.item && typeof data.item === 'object') return data.item;
  return null;
}

function renderBounty(item) {
  const live = acceptsEntries(item);
  const ends = countdown(deadlineMs(item));
  const fee = plainUsd(item.entryFeeUsd);
  const free = toNumber(item.entryFeeUsd) === 0;
  const sponsors = item.sponsor && item.sponsor.name ? item.sponsor.name : 'make.fun';
  const page = document.createDocumentFragment();

  page.appendChild(h('header', { class: 'page-head' },
    h('div', { class: 'row-meta', style: 'margin-bottom:10px' },
      h('span', { class: 'pill ' + (live ? 'pill-open' : 'pill-closed') }, live ? 'Open for entries' : 'Closed for entries'),
      free ? h('span', { class: 'pill pill-free' }, 'Free entry') : fee === null ? h('span', { class: 'pill pill-free' }, 'Free entry') : h('span', { class: 'pill' }, `Entry ${fee}`),
      item.harnessKind ? h('span', { class: 'pill' }, String(item.harnessKind)) : null,
      item.category ? h('span', { class: 'pill' }, String(item.category)) : null),
    h('p', { class: 'eyebrow' }, `${sponsors} · bounty`),
    h('h1', null, String(item.title || item.slug || 'Bounty')),
    item.summary ? h('p', { class: 'lede', style: 'margin-top:12px' }, String(item.summary)) : null));

  const split = h('div', { class: 'split' });
  const mainCol = h('div', { class: 'stack' });
  const sideCol = h('div', { class: 'stack' });

  // The brief.
  const brief = h('section', { class: 'panel' }, h('h2', null, 'The brief'));
  const prose = item.description ? markdown(item.description) : null;
  if (prose) {
    prose.classList.add('clamped');
    brief.appendChild(prose);
    if (item.description.length > 1400) {
      brief.appendChild(h('div', { class: 'actions' },
        h('button', {
          class: 'btn', type: 'button', 'aria-expanded': 'false',
          onclick: (event) => {
            expanded = !expanded;
            prose.classList.toggle('clamped', !expanded);
            event.currentTarget.textContent = expanded ? 'Show less' : 'Read the whole brief';
            event.currentTarget.setAttribute('aria-expanded', String(expanded));
          },
        }, 'Read the whole brief')));
    }
  } else {
    brief.appendChild(h('p', { class: 'muted' }, 'make.fun lists no description for this bounty.'));
  }
  mainCol.appendChild(brief);

  // Requirements and gates, loaded on click only.
  mainCol.appendChild(requirementsPanel(item));
  if (Array.isArray(item.requirements) && item.requirements.length > 0) {
    // Already delivered with the bounty: show without another request.
    gateState = 'ready';
  }

  // Rules.
  if (item.rules) {
    mainCol.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Rules'), markdown(item.rules)));
  }
  if (item.resolution && typeof item.resolution === 'object') {
    mainCol.appendChild(h('section', { class: 'panel' },
      h('h2', null, 'How it is resolved'),
      item.resolution.summary ? h('p', null, String(item.resolution.summary)) : null,
      item.resolution.method ? h('p', { class: 'small muted' }, `Method: ${String(item.resolution.method)}`) : null));
  }

  // Economics.
  sideCol.appendChild(economicsPanel(item, live, ends));

  // Rewards.
  const rewards = Array.isArray(item.rewardsNow) && item.rewardsNow.length > 0
    ? item.rewardsNow
    : Array.isArray(item.rewards) ? item.rewards : [];
  if (rewards.length > 0) {
    const table = h('table', { class: 'rewards' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Place'), h('th', { scope: 'col', class: 'r' }, 'Base'), h('th', { scope: 'col', class: 'r' }, 'Fee share'), h('th', { scope: 'col', class: 'r' }, 'Pays'))),
      h('tbody', null, rewards.map((r) => rewardRow(r))));
    sideCol.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Reward distribution'), table,
      h('p', { class: 'tbl-note' }, item.entryFeesUsd ? `Entry fees collected: ${usd(item.entryFeesUsd)}; the pot is base plus fees, shared top down.` : 'Every prize is paid in USDC on Solana.')));
  }

  // Links.
  sideCol.appendChild(h('section', { class: 'panel' },
    h('h2', null, 'Go deeper'),
    h('div', { class: 'actions' },
      h('a', { class: 'btn btn-primary', href: leaderboardHref(item.slug || slug) }, 'Open the leaderboard'),
      externalLink(`https://make.fun/bounty/${encodeURIComponent(item.slug || slug)}`, 'View on make.fun', { class: 'btn' }))));

  split.appendChild(mainCol);
  split.appendChild(sideCol);
  page.appendChild(split);
  return page;
}

export function leaderboardHref(value) {
  return `#/bounty/${encodeURIComponent(String(value || ''))}/leaderboard`;
}

function economicsPanel(item, live, ends) {
  const deadline = deadlineMs(item);
  const fee = plainUsd(item.entryFeeUsd);
  const rows = [
    ['Live pot', usd(item.potUsd)],
    ['Base reward', usd(item.rewardAmount)],
    ['Entry fee', fee === null || toNumber(item.entryFeeUsd) === 0 ? 'Free' : fee],
    ['Entries', count(item.submissionCount)],
    ['Entry deadline', shortDate(deadline)],
    [live ? 'Time left' : 'Status', live ? (ends ? ends.text : 'open') : 'Closed to new entries'],
    ['Sponsor', item.sponsor && item.sponsor.name ? String(item.sponsor.name) : 'make.fun'],
    ['Harness', item.harnessKind ? String(item.harnessKind) : '—'],
  ];
  const dl = h('dl', { class: 'kv' }, rows.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))));
  const counts = !live
    ? notice({ title: 'Entry window has closed', lines: ['make.fun still lists this bounty as open while results are being settled: the deadline above has passed, so it takes no new entries.'] })
    : null;
  return h('section', { class: 'panel', id: 'economics' },
    h('h2', null, 'Economics & timing'),
    counts, dl,
    deadline ? h('p', { class: 'small muted', style: 'margin-top:10px' }, `Deadline ${new Date(deadline).toISOString()}`) : null);
}

function rewardRow(reward) {
  if (!reward || typeof reward !== 'object') return null;
  const place = reward.place !== undefined ? reward.place : reward.rank;
  const base = reward.baseUsd !== undefined ? reward.baseUsd : reward.amountUsd;
  const share = reward.feeShareUsd;
  const amount = reward.amountUsd;
  return h('tr', null,
    h('td', null, place !== undefined && place !== null ? `#${place}` : '—'),
    h('td', { class: 'r' }, base !== undefined && base !== null ? usd(base) : '—'),
    h('td', { class: 'r' }, share !== undefined && share !== null ? usd(share) : '—'),
    h('td', { class: 'r' }, amount !== undefined && amount !== null ? usd(amount) : '—'));
}

// ---------------------------------------------------------------- requirements

function requirementsPanel(item) {
  const panel = h('section', { class: 'panel', id: 'requirements' });
  panel.appendChild(h('h2', null, 'Requirements & gates'));
  const slot = h('div');
  panel.appendChild(slot);
  const button = h('button', {
    class: 'btn', type: 'button', id: 'load-requirements',
    onclick: () => { void loadRequirements(slot, button); },
  }, 'Load requirements');
  panel.appendChild(h('div', { class: 'actions' }, button));
  if (Array.isArray(item.requirements) && item.requirements.length > 0) {
    slot.appendChild(requirementsList(item.requirements));
    button.remove();
  }
  return panel;
}

async function loadRequirements(slot, button) {
  if (gateState === 'loading') return;
  gateState = 'loading';
  button.disabled = true;
  button.textContent = 'Loading requirements\u2026';
  while (slot.firstChild) slot.removeChild(slot.firstChild);
  slot.appendChild(loadingView('Loading requirements'));
  const res = await load(`/competitions/${encodeURIComponent(slug)}/requirements`, { signal: ctx ? ctx.signal : undefined });
  if (res.aborted) return;
  while (slot.firstChild) slot.removeChild(slot.firstChild);
  if (!res.ok) {
    gateState = 'error';
    button.disabled = false;
    button.textContent = 'Try loading requirements again';
    slot.appendChild(notice({ title: 'Requirements did not load', kind: 'error', lines: [res.error, 'Nothing is invented here: the gates are shown only when make.fun returns them.'] }));
    return;
  }
  gateState = 'ready';
  button.remove();
  // The live API answers with `checks` ({ check, title, description, phase, applies }); older
  // shapes used requirements/items. All gates are rendered in full, whatever the shape.
  const list = Array.isArray(res.data.checks) ? res.data.checks
    : Array.isArray(res.data.requirements) ? res.data.requirements
      : Array.isArray(res.data.items) ? res.data.items : [];
  if (list.length === 0) {
    slot.appendChild(h('p', { class: 'muted' }, 'make.fun lists no separate requirements for this bounty.'));
  } else {
    slot.appendChild(h('p', { class: 'crumbs-note' }, `${list.length} checks make.fun runs on an entry. This is the API's own list; nothing here is re-scored.`));
    slot.appendChild(requirementsList(list));
  }
  const deliverables = Array.isArray(res.data.deliverables) ? res.data.deliverables : [];
  if (deliverables.length > 0) {
    slot.appendChild(deliverablesList(deliverables));
  }
}

function deliverablesList(list) {
  return h('div', null,
    h('h3', null, 'What an entry must carry'),
    h('ul', { class: 'req-list' }, list.map((entry) => h('li', { style: 'margin:0 0 6px' },
      h('strong', null, String(entry && (entry.title || entry.name || entry.check || entry.key) || 'Deliverable')),
      entry && entry.description ? h('span', { class: 'small muted' }, ` — ${String(entry.description)}`) : null,
      entry && entry.required ? h('span', { class: 'pill', style: 'margin-left:6px' }, 'required') : null))));
}

function requirementsList(list) {
  return h('ol', { class: 'req-list', id: 'requirements-list' }, list.map((req) => {
    const label = typeof req === 'string' ? req : String(req && (req.text || req.title || req.name || req.check || req.key || req.id) || 'Requirement');
    const detail = req && typeof req === 'object' ? (req.description || req.detail || req.summary) : null;
    const phase = req && typeof req === 'object' && req.phase ? h('span', { class: 'pill', style: 'margin-left:6px' }, String(req.phase)) : null;
    return h('li', { style: 'margin:0 0 8px' }, label, phase, detail ? h('span', { class: 'small muted' }, ` — ${String(detail)}`) : null);
  }));
}

export function cached() {
  return cache.get(slug) || null;
}

export function gateStatus() {
  return gateState;
}
