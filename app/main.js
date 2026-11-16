import {escape, failure, invalidate, tickClocks} from './core.js';
window.__shotReady = false;
window.__error = false;
let generation = 0;
const main = document.querySelector('main');
const themeButton = document.querySelector('#theme');
function preferredTheme() { try { return localStorage.getItem('fieldnotes-theme') || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'); } catch { return matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'; } }
function applyTheme(theme) { document.documentElement.dataset.theme=theme; themeButton.setAttribute('aria-pressed',String(theme==='dark')); }
applyTheme(preferredTheme());
themeButton.addEventListener('click',function toggleTheme(){ const theme=document.documentElement.dataset.theme==='dark'?'light':'dark'; applyTheme(theme); try { localStorage.setItem('fieldnotes-theme',theme); } catch {} });
document.querySelector('.skip').addEventListener('click',function skipMain(event){ event.preventDefault(); main.focus(); main.scrollIntoView({block:'start'}); });
document.querySelector('#refresh').addEventListener('click',function refreshRoute(){ invalidate(); route(); });
window.addEventListener('error',function flagError(){ window.__error=true; });
window.addEventListener('unhandledrejection',function flagRejection(){ window.__error=true; });
function parseRoute() {
  const path=location.hash.slice(1) || '/';
  if(path==='/')return {surface:'board'};
  if(path==='/hunters')return {surface:'hunters'};
  let match=path.match(/^\/bounty\/([^/]+)(\/leaderboard)?$/);
  if(match)return {surface:match[2]?'leaderboard':'bounty',slug:decodeURIComponent(match[1])};
  match=path.match(/^\/u\/([^/]+)$/);
  if(match)return {surface:'profile',handle:decodeURIComponent(match[1])};
  return {surface:'unknown'};
}
async function moduleFor(surface) {
  switch(surface) {
    case 'board':return import('./board.js');
    case 'bounty':return import('./bounty.js');
    case 'leaderboard':return import('./leaderboard.js');
    case 'hunters':return import('./hunters.js');
    case 'profile':return import('./profile.js');
    default:return null;
  }
}
async function route() {
  const token=++generation;
  window.__shotReady=false; window.__error=false;
  main.setAttribute('aria-busy','true');
  main.innerHTML='<section class="loading" role="status"><span class="loading-line"></span><p class="eyebrow">READING THE PUBLIC RECORD</p><h1>One moment.</h1><p>Fetching the latest from make.fun…</p></section>';
  const context={current:()=>token===generation,commit:html=>{if(token===generation)main.innerHTML=html;},main,retry:route};
  try {
    const info=parseRoute();
    document.querySelectorAll('[data-nav]').forEach(link=>{const active=link.dataset.nav===info.surface; if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    const module=await moduleFor(info.surface);
    if(!context.current())return;
    if(module)await module.render(context,info);
    else context.commit('<section class="heading"><p class="eyebrow">404 / UNMAPPED</p><h1>This page isn’t here.</h1><p class="intro">The address does not match a public view.</p><a class="button" href="#/">Return to the board ↗</a></section>');
    if(!context.current())return;
    document.title=(main.querySelector('h1')?.textContent||'make.fun')+' / Fieldnotes';
  } catch(error) {
    if(!context.current())return;
    window.__error=true; main.replaceChildren(failure(error,route));
  } finally {
    if(context.current()){main.setAttribute('aria-busy','false'); window.__shotReady=true; document.querySelector('#announcement').textContent=main.querySelector('h1')?.textContent||'View loaded'; tickClocks();}
  }
}
window.addEventListener('hashchange',route);
setInterval(tickClocks,30000);
route();
