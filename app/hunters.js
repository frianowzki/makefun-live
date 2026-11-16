import {request,escape,heading,money,number,profileURL,avatarMarkup,hydrateAvatars,failure} from './core.js';
export async function render(context) {
  const data=await request('/rankings?order=paid&limit=24');
  if(!context.current())return;
  let items=data.items||[],cursor=data.next_cursor;
  context.commit(heading('04 / THE PEOPLE','Meet the makers.','A public record of showing up, making things, and seeing them through.')+`<div class="section-top"><h2>Ranked by prize money paid</h2><span class="muted">ORDER / PAID</span></div><p class="note">Prize money paid is the API’s public record, not an estimate of pending awards.</p><div class="table-scroll" tabindex="0" aria-label="Maker rankings"><table class="hunters-table"><thead><tr><th>Rank</th><th>Maker</th><th>Prize money paid · USD</th><th>Competitions won</th><th>Entered</th></tr></thead><tbody id="hunters-rows"></tbody></table></div><p id="hunters-count" class="note"></p><div id="hunter-pagination" class="pagination"></div>`);
  function paint() {
    context.main.querySelector('#hunters-rows').innerHTML=items.map(item=>`<tr><td class="rank">${escape(item.rank)}</td><td><a class="person" href="${profileURL(item.handle)}">${avatarMarkup(item)}<span><strong>@${escape(item.handle)}</strong>${item.display_name?`<small>${escape(item.display_name)}</small>`:''}</span></a></td><td class="primary-metric">${escape(money(item.record?.prize_usd))}</td><td>${escape(number(item.record?.competitions_won))}</td><td>${escape(number(item.record?.competitions_entered))}</td></tr>`).join('');
    hydrateAvatars(context.main);
    context.main.querySelector('#hunters-count').textContent=`${items.length} makers loaded${data.total!=null?' of '+number(data.total):''}. Ranks are supplied by make.fun.`;
    const slot=context.main.querySelector('#hunter-pagination');slot.innerHTML=cursor?'<button class="button">Load more makers ↓</button>':'<p class="muted">End of returned rankings.</p>';
    slot.querySelector('button')?.addEventListener('click',async function loadMore(){this.disabled=true;try{const next=await request('/rankings?order=paid&limit=24&cursor='+encodeURIComponent(cursor));if(!context.current())return;items=[...new Map([...items,...next.items].map(item=>[item.handle,item])).values()];cursor=next.next_cursor;paint();}catch(error){if(context.current())slot.replaceChildren(failure(error,paint));}});
  }
  paint();
}
