import {request,escape,heading,metrics,money,fee,number,clock,isAccepting,bountyURL,failure} from './core.js';
export async function render(context) {
  const data=await request('/competitions?status=open&limit=24');
  if(!context.current())return;
  let items=data.items||[], cursor=data.next_cursor;
  context.commit(heading('01 / THE BOUNTY BOARD','Find your next\nworthwhile problem.','Real challenges. Open judging. A reward for the work that moves things forward.')+'<div id="board-summary"></div><section class="board-section"><div class="section-top"><h2>The opportunity index<span class="coral"> /</span></h2><span class="muted">PUBLIC COMPETITIONS</span></div><div class="filters"><label class="search"><span>⌕</span><input id="search" type="search" placeholder="Find a challenge, skill, or idea…" aria-label="Search competitions"></label><label class="sort">Sort by<select id="sort" aria-label="Sort competitions"><option value="featured">Recently opened</option><option value="deadline">Deadline</option><option value="pot">Largest pot</option><option value="entries">Most entries</option></select></label></div><p class="result-note" id="result-count" role="status"></p><div id="cards" class="cards"></div><div id="pagination" class="pagination"></div></section>');
  const search=context.main.querySelector('#search'),sort=context.main.querySelector('#sort');
  function updateSummary() {
    context.main.querySelector('#board-summary').innerHTML=metrics([['Live pots · loaded bounties',escape(money(items.reduce((sum,item)=>sum+Number(item.potUsd??item.rewardAmount??0),0)))],['Accepting entries',escape(number(items.filter(isAccepting).length))],['Public entries · loaded bounties',escape(number(items.reduce((sum,item)=>sum+Number(item.submissionCount||0),0)))]]);
  }
  function paintCards() {
    const query=search.value.trim().toLowerCase();
    const list=items.filter(item=>[item.title,item.category,...(item.skills||[])].join(' ').toLowerCase().includes(query));
    list.sort((a,b)=>sort.value==='pot'?Number(b.potUsd??b.rewardAmount)-Number(a.potUsd??a.rewardAmount):sort.value==='entries'?b.submissionCount-a.submissionCount:sort.value==='deadline'?new Date(a.deadline)-new Date(b.deadline):new Date(b.publishedAt)-new Date(a.publishedAt));
    context.main.querySelector('#result-count').textContent=`${list.length} matching of ${items.length} loaded competitions${cursor?' · more available':''}. Deadline determines whether entries are open.`;
    context.main.querySelector('#cards').innerHTML=list.length?list.map((item,index)=>`<article class="bounty-card"><div class="card-top"><span class="eyebrow">${escape(item.category||'Open challenge')}</span><span class="status ${isAccepting(item)?'accepting':''}">${isAccepting(item)?'Taking entries':'Entries closed'}</span></div><a class="card-title" href="${bountyURL(item.slug)}"><h3>${escape(item.title)}</h3><span aria-hidden="true">↗</span></a><div class="card-pot"><strong>${escape(money(item.potUsd??item.rewardAmount))}</strong><span>LIVE POT <small>USD</small></span></div><div class="card-facts"><span><small>ENTRY FEE</small><b>${escape(fee(item.entryFeeUsd))}</b></span><span><small>ENTRIES</small><b>${escape(number(item.submissionCount))}</b></span><span><small>DEADLINE</small><b>${clock(item.deadline)}</b></span></div><div class="card-bottom"><span>${escape((item.skills||[]).slice(0,2).join(' / ')||'Build something good')}</span><a href="${bountyURL(item.slug)}/leaderboard" aria-label="Leaderboard for ${escape(item.title)}">Standings ↗</a></div></article>`).join(''):'<div class="empty"><h3>No matching challenges.</h3><p>Try another skill or clear your search.</p><button id="clear-search" class="button">Clear search</button></div>';
    context.main.querySelector('#clear-search')?.addEventListener('click',function clearSearch(){ search.value='';paintCards();search.focus(); });
  }
  function pagination() {
    const slot=context.main.querySelector('#pagination');slot.innerHTML=cursor?'<button class="button" id="more">Load more competitions ↓</button>':'<span class="muted">You’re up to date with the returned board.</span>';
    slot.querySelector('button')?.addEventListener('click',async function loadMore(){this.disabled=true;try{const next=await request('/competitions?status=open&limit=24&cursor='+encodeURIComponent(cursor));if(!context.current())return;items=[...new Map([...items,...next.items].map(item=>[item.slug,item])).values()];cursor=next.next_cursor;updateSummary();paintCards();pagination();}catch(error){if(context.current())slot.replaceChildren(failure(error,pagination));}});
  }
  search.addEventListener('input',paintCards);sort.addEventListener('change',paintCards);
  updateSummary();paintCards();pagination();
}
