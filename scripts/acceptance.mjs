import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/Users/friok/makefun/node_modules/playwright')); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.resolve(root, '../rebuild-evidence');
await fs.mkdir(evidence, {recursive:true});
let server;
if (!process.env.APP_URL) {
  server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      let name=decodeURIComponent(url.pathname);
      if(name==='/')name='/index.html';
      const target=path.resolve(root,'app','.'+name);
      if(!target.startsWith(path.join(root,'app')+path.sep))throw Error('invalid path');
      const data=await fs.readFile(target);
      const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(target)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(data);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
}
const base=process.env.APP_URL||`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const results=[],errors=[];
const context=await browser.newContext({viewport:{width:1280,height:800},colorScheme:'dark'});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
let lastLeaderboard;
page.on('response',async r=>{if(r.url().includes('/leaderboard?rows=first')&&r.status()===200){try{lastLeaderboard=await r.json();}catch{}}});
async function visit(route){
  await page.goto(base+'/'+route,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__shotReady||window.__error,{timeout:45000});
  const state=await page.evaluate(()=>({ready:window.__shotReady,error:window.__error,overflow:document.documentElement.scrollWidth>innerWidth+1,broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src)}));
  assert.equal(state.error,null,`${route}: ${state.error}`);
  assert.equal(state.ready,true,route);
  assert.equal(state.overflow,false,`${route}: overflow`);
  assert.deepEqual(state.broken,[],route);
  results.push({route,viewport:page.viewportSize().width,...state});
}
try {
  await visit('#/');
  assert.ok(await page.locator('#bounty-rows .row').count()>0);
  await page.fill('#search','zz-no-such-bounty-zz');
  assert.equal(await page.locator('#bounty-rows .row:visible').count(),0);
  assert.equal(await page.locator('#search-empty').isVisible(),true);
  await page.fill('#search','');
  await page.locator('.skip').focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'main');
  assert.equal(await page.evaluate(()=>location.hash),'#/');
  const before=await page.evaluate(()=>document.documentElement.dataset.theme);
  await page.click('#theme-btn');
  const changed=await page.evaluate(()=>document.documentElement.dataset.theme);
  assert.notEqual(before,changed);
  await page.reload();await page.waitForFunction(()=>window.__shotReady||window.__error);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),changed);
  await page.click('#theme-btn');
  const refresh=page.waitForResponse(r=>r.url().includes('/api/competitions?')&&r.status()===200);
  await page.click('#refresh-btn');await refresh;await page.waitForFunction(()=>window.__shotReady);
  await visit('#/bounty/bring-the-humans-01');
  await page.click('#load-requirements');
  await page.waitForFunction(()=>!document.querySelector('#load-requirements'),{timeout:30000});
  assert.ok(await page.locator('details.more[open] .prose h3').count()>0);
  await visit('#/bounty/bring-the-humans-01/leaderboard');
  assert.ok(await page.locator('[data-metric="provisional_signups"]').count()>0);
  const first=lastLeaderboard.entries[0];
  const actual=await page.locator('[data-metric="provisional_signups"]').first().textContent();
  assert.equal(actual,first.display.provisional_signups);
  assert.ok(!actual.includes('%'));
  const profile=await page.locator('.result-person a').first().getAttribute('href');
  await visit(profile);
  await visit('#/hunters');
  assert.ok(await page.locator('.lb-row a').count()>0);
  for(const width of [390,768]){
    await page.setViewportSize({width,height:844});
    for(const route of ['#/','#/bounty/makefun-frontend-01','#/bounty/bring-the-humans-01/leaderboard','#/hunters',profile])await visit(route);
    await page.screenshot({path:path.join(evidence,`profile-${width}.jpg`),type:'jpeg',quality:80});
  }
  await page.setViewportSize({width:1280,height:800});
  if(!process.env.APP_URL){
    const shots=[['1-board.jpg','#/'],['2-bounty.jpg','#/bounty/makefun-frontend-01'],['3-leaderboard.jpg','#/bounty/bring-the-humans-01/leaderboard']];
    // Only final evidence belongs in the harness screenshot directory.
    const dir=path.join(root,'screenshots');await fs.mkdir(dir,{recursive:true});
    for(const name of await fs.readdir(dir))if(/\.(jpg|jpeg|png|webp)$/i.test(name))await fs.rename(path.join(dir,name),path.join(evidence,'previous-'+name)).catch(()=>fs.unlink(path.join(dir,name)));
    for(const [file,route] of shots){await visit(route);await page.screenshot({path:path.join(dir,file),type:'jpeg',quality:85});assert.ok((await fs.stat(path.join(dir,file))).size<256*1024);}
    await fs.writeFile(path.join(root,'shots.json'),JSON.stringify(shots.map(([file,route])=>({file,path:route,viewport:{width:1280,height:800}})),null,2)+'\n');
  }
  await page.goto(base+'/#/not-a-route');await page.waitForFunction(()=>window.__error);
  assert.match(await page.locator('.fail').innerText(),/not found/i);
  await visit('#/');
  await page.evaluate(()=>{location.hash='#/bounty/makefun-frontend-01';setTimeout(()=>{location.hash='#/hunters'},25)});
  await page.waitForFunction(()=>window.__shotReady&&document.title.startsWith('Hunters'));
  assert.deepEqual(errors,[]);
  const report={base,pass:true,views:results.length,metric:{api:first.display.provisional_signups,rendered:actual},themePersistence:true,search:true,refresh:true,skip:true,routeRace:true,errors,results};
  await fs.writeFile(path.join(evidence,process.env.APP_URL?'live-acceptance.json':'local-acceptance.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,results:undefined},null,2));
} finally {await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
