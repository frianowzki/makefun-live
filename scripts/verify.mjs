import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('C:/Users/friok/makefun/node_modules/playwright');
const base='http://127.0.0.1:8125';
const browser=await chromium.launch({headless:true});
const results=[];
async function check(route, viewport={width:1280,height:800}){
 const page=await browser.newPage({viewport}); const errors=[]; const broken=[];
 page.on('console',m=>{if(m.type()==='error') errors.push('console: '+m.text())}); page.on('pageerror',e=>errors.push('page: '+e.message));
 await page.goto(base+'/'+route); await page.waitForFunction(()=>window.__shotReady===true,{timeout:45000});
 await page.evaluate(()=>document.fonts?.ready); await page.waitForTimeout(500);
 await page.locator('img').evaluateAll(xs=>xs.map(x=>x.complete&&x.naturalWidth===0?x.src:null).filter(Boolean)).then(xs=>broken.push(...xs));
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
 results.push({route,ready:await page.evaluate(()=>window.__shotReady),errors,broken,overflow,title:await page.title()});
 return page;
}
const board=await check('/#/');
await board.locator('#search').fill('make.fun');
await board.locator('.skip').focus(); await board.locator('.skip').press('Enter');
const theme=await board.locator('#theme-btn').getAttribute('aria-label'); await board.locator('#theme-btn').click(); const light=await board.evaluate(()=>document.documentElement.dataset.theme); await board.reload(); const persisted=await board.evaluate(()=>document.documentElement.dataset.theme); await board.close();
await check('/#/bounty/makefun-frontend-01');
await check('/#/bounty/makefun-frontend-01/leaderboard');
await check('/#/hunters');
await check('/#/u/gentle-badger-68',{width:390,height:800});
const bad=results.filter(x=>x.errors.length||x.broken.length||x.overflow||!x.ready); if(bad.length) { console.error(JSON.stringify({results,theme,light,persisted},null,2)); process.exitCode=1; } else console.log(JSON.stringify({results,theme,light,persisted},null,2));
await browser.close();
