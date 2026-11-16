export const API = 'https://make.fun/api';
const cache = new Map();
export function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
export function safeURL(value) {
  try { const url = new URL(value, 'https://make.fun'); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function bountyURL(slug) { return '#/bounty/' + encodeURIComponent(slug); }
export function profileURL(handle) { return '#/u/' + encodeURIComponent(handle); }
export function money(value) { return value == null ? 'Not published' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(value)); }
export function number(value) { return value == null ? '—' : new Intl.NumberFormat('en-US').format(Number(value)); }
export function fee(value) { return value == null || Number(value) === 0 ? 'Free' : money(value); }
export function utc(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not published' : date.toISOString().replace('T',' · ').slice(0,22) + ' UTC'; }
export function countdown(value) {
  const remaining = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(remaining)) return 'Deadline not published';
  if (remaining <= 0) return 'Entries closed';
  const minutes = Math.max(1, Math.ceil(remaining / 60000));
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), mins = minutes % 60;
  return (days ? days + 'd ' : '') + hours + 'h ' + mins + 'm left';
}
export function isAccepting(item) { return item.status !== 'closed' && item.status !== 'resolved' && item.acceptingSubmissions !== false && new Date(item.deadline).getTime() > Date.now(); }
export function clock(value) { return `<span data-deadline="${escape(value)}">${escape(countdown(value))}</span>`; }
export function tickClocks() { document.querySelectorAll('[data-deadline]').forEach(element => { element.textContent = countdown(element.dataset.deadline); }); }
export function invalidate() { cache.clear(); }
export async function request(path, {fresh=false}={}) {
  const stored = cache.get(path);
  if (!fresh && stored && Date.now() - stored.time < 60000) return stored.data;
  for (let attempt=0; attempt<2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(API + path, {signal:controller.signal, cache:fresh?'reload':'default', credentials:'omit'});
      if (!response.ok) { const error = new Error(response.status === 404 ? 'This public resource could not be found.' : `make.fun returned HTTP ${response.status}. Please try again.`); error.status=response.status; throw error; }
      const data = await response.json();
      cache.set(path, {time:Date.now(),data});
      return data;
    } catch (error) {
      if (attempt === 1 || (error.status && error.status < 500 && error.status !== 429)) throw new Error(error.name === 'AbortError' ? 'The public API took too long to respond. Please retry.' : error.message);
      await new Promise(resolve => setTimeout(resolve, 450));
    } finally { clearTimeout(timer); }
  }
}
export function failure(error, retry) {
  const box = document.createElement('section');
  box.className = 'notice error'; box.setAttribute('role','alert');
  box.innerHTML = `<p class="eyebrow">CONNECTION NOTE</p><h2>We couldn’t load this view.</h2><p>${escape(error.message)}</p><button class="button">Try again ↻</button>`;
  box.querySelector('button').addEventListener('click',retry);
  return box;
}
export function heading(kicker,title,description) { return `<section class="heading"><p class="eyebrow">${escape(kicker)}</p><h1>${escape(title)}</h1>${description?`<p class="intro">${escape(description)}</p>`:''}</section>`; }
export function metrics(items) { return `<dl class="metrics">${items.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>`; }
export function displayMetric(row,column) {
  if (row.display?.[column.key] != null) return String(row.display[column.key]);
  const value=row.values?.[column.key];
  if (value == null) return '—';
  if (typeof value !== 'number') return String(value);
  const precision = Math.max(0,Math.min(12,Number(column.precision)||0));
  return value.toFixed(precision);
}
export function avatarMarkup(record) {
  const handle = record.handle || record.username || '?';
  const url = record.avatar?.url_small || record.avatar?.url || record.image;
  return `<span class="avatar" aria-hidden="true"><span>${escape(handle.slice(0,2).toUpperCase())}</span>${url && safeURL(url)?`<img crossorigin="anonymous" data-avatar="${escape(safeURL(url))}" alt="" width="40" height="40">`:''}</span>`;
}
export function hydrateAvatars(root) {
  root.querySelectorAll('img[data-avatar]').forEach(image=>{ image.addEventListener('error',function removeFailedAvatar(){ image.remove(); },{once:true}); image.src=image.dataset.avatar; });
}
export function prose(text) {
  return String(text??'').split(/\n\s*\n/).map(block=>{
    if (/^#{1,6}\s/.test(block)) { const lines=block.split('\n'); const title=lines.shift().replace(/^#+\s/,''); return `<h3>${escape(title)}</h3>${lines.length?`<p>${escape(lines.join('\n'))}</p>`:''}`; }
    if (/^[-*]\s/.test(block)) return `<ul>${block.split('\n').map(line=>`<li>${escape(line.replace(/^[-*]\s/,''))}</li>`).join('')}</ul>`;
    return `<p>${escape(block)}</p>`;
  }).join('');
}
