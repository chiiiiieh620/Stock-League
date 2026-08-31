(() => {
  const stockNames = new Map();

  function e(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmtPct(n){const v=Number(n||0);return `${v>=0?'+':''}${v.toFixed(2)}%`;}
  function fmtMoney(n){return Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:2});}
  function tone(n){return Number(n)>=0?'positive':'negative';}
  function key(symbol,market){return `${String(symbol||'').toUpperCase()}|${market||''}`;}

  async function loadNames(){
    try{
      const r=await fetch(`stock-master.json?v=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)return;
      const rows=await r.json();
      rows.forEach(x=>stockNames.set(key(x.symbol,x.market),x.name));
      if(typeof render==='function') render();
    }catch(_e){}
  }

  function displayStockName(h){
    return h.stock_name || stockNames.get(key(h.symbol,h.market)) || '';
  }

  function holdingStats(h){
    const cost=Number(h.shares)*Number(h.avg_cost);
    const value=Number(h.shares)*Number(h.current_price);
    const pnl=value-cost;
    const ret=cost?pnl/cost*100:0;
    return {cost,value,pnl,ret};
  }

  function playerStats(p){
    const hs=holdings.filter(h=>h.player_id===p.id);
    const cost=hs.reduce((s,h)=>s+holdingStats(h).cost,0);
    const value=hs.reduce((s,h)=>s+holdingStats(h).value,0);
    const pnl=value-cost;
    const ret=cost?pnl/cost*100:0;
    return {...p,hs,cost,value,pnl,ret};
  }

  function stockTitle(h){
    const name=displayStockName(h);
    return `<div class="holding-title"><strong>${e(h.symbol)}${name?` <span class="holding-name">${e(name)}</span>`:''}</strong><small>${e(h.market)}</small></div>`;
  }

  window.holdingRow = function(h,canDelete=false){
    const s=holdingStats(h);
    return `<div class="holding">${stockTitle(h)}<div><small>股數</small>${fmtMoney(h.shares)}</div><div><small>平均成本</small>${fmtMoney(h.avg_cost)}</div><div><small>目前價格</small>${fmtMoney(h.current_price)}</div><div><small>報酬率</small><span class="${tone(s.ret)}">${fmtPct(s.ret)}</span></div>${canDelete?`<button class="delete" data-delete="${h.id}" aria-label="刪除持倉">刪除</button>`:'<span></span>'}</div>`;
  };

  window.render = function(){
    playerCountEl.textContent=`${players.length} / 15`;
    const ranked=players.map(playerStats).sort((a,b)=>b.ret-a.ret);
    document.getElementById('statPlayers').textContent=players.length;
    document.getElementById('statHoldings').textContent=holdings.length;
    document.getElementById('statLeader').textContent=ranked[0]?.name||'—';
    document.getElementById('statLeaderReturn').textContent=ranked[0]?fmtPct(ranked[0].ret):'尚無資料';
    const avgRoi=ranked.length?ranked.reduce((s,p)=>s+p.ret,0)/ranked.length:0;
    document.getElementById('statValue').textContent=ranked.length?fmtPct(avgRoi):'—';

    if(currentUser && myPlayer) document.getElementById('topIdentity').textContent=myPlayer.name;

    leaderboardEl.innerHTML=ranked.length?ranked.map((p,i)=>`
      <button type="button" class="rank-row rank-click ${myPlayer?.id===p.id?'is-me':''}" data-player-id="${p.id}">
        <div class="rank">${i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}</div>
        <div><div class="name">${e(p.name)} ${myPlayer?.id===p.id?'<span class="me-tag">YOU</span>':''}</div><small>${p.hs.length} 筆持倉 · 點擊查看配置</small></div>
        <div class="metric"><small>ROI</small><strong class="${tone(p.ret)}">${fmtPct(p.ret)}</strong></div>
        <div class="metric privacy-metric"><small>隱私</small><strong>金額隱藏</strong></div>
        <div class="metric"><small>排名依據</small><strong>ROI</strong></div>
      </button>`).join(''):'<div class="status">還沒有參賽者。</div>';

    portfoliosEl.innerHTML=ranked.length?ranked.map(p=>`
      <button type="button" class="portfolio portfolio-public" data-player-id="${p.id}">
        <div class="portfolio-head"><div><strong>${e(p.name)}</strong><div class="${tone(p.ret)}">ROI ${fmtPct(p.ret)}</div></div><div>${p.hs.length} 檔持倉 · 點擊查看持倉比例與報酬率</div></div>
      </button>`).join(''):'<div class="status">還沒有資料。</div>';

    renderMyDashboard(ranked);
    bindPlayerOpen();
  };

  window.renderMyDashboard = function(ranked){
    if(!currentUser)return;
    if(!myPlayer){
      document.getElementById('sideUserName').textContent=currentUser.email||'已登入';
      document.getElementById('sideUserRank').textContent='尚未建立參賽者資料';
      document.getElementById('holdingOwner').textContent='尚未建立參賽者資料';
      document.getElementById('myHoldings').innerHTML='<div class="status">此帳號尚未綁定參賽者名稱。</div>';
      return;
    }
    const idx=ranked.findIndex(p=>p.id===myPlayer.id), me=ranked[idx];
    document.getElementById('topIdentity').textContent=myPlayer.name;
    document.getElementById('sideUserName').textContent=myPlayer.name;
    document.getElementById('sideUserRank').textContent=idx>=0?`目前第 ${idx+1} 名`:'尚無排名';
    document.getElementById('userAvatar').textContent=myPlayer.name.slice(0,1).toUpperCase();
    document.getElementById('holdingOwner').textContent=myPlayer.name;
    document.getElementById('myRank').textContent=idx>=0?`#${idx+1}`:'—';
    document.getElementById('myRankPill').textContent=idx>=0?`${idx+1} / ${ranked.length}`:'— / 15';
    document.getElementById('myReturn').textContent=me?fmtPct(me.ret):'—';
    document.getElementById('myReturn').className=me?tone(me.ret):'';
    document.getElementById('myPnl').textContent=me?fmtMoney(me.pnl):'—';
    document.getElementById('myPnl').className=me?tone(me.pnl):'';
    document.getElementById('myValue').textContent=me?fmtMoney(me.value):'—';
    document.getElementById('myHoldings').innerHTML=me?.hs.length?me.hs.map(h=>holdingRow(h,true)).join(''):'<div class="status">你還沒有持倉，先新增第一筆吧。</div>';
  };

  function openPlayer(playerId){
    const p=players.find(x=>x.id===playerId); if(!p)return;
    const s=playerStats(p); const isMe=myPlayer?.id===p.id;
    const rows=s.hs.map(h=>{
      const x=holdingStats(h); const weight=s.value?x.value/s.value*100:0; const name=displayStockName(h);
      return `<div class="public-holding"><div><strong>${e(h.symbol)}${name?` <span>${e(name)}</span>`:''}</strong><small>${e(h.market)}</small></div><div><small>持倉比例</small><b>${weight.toFixed(1)}%</b><div class="weight-bar"><i style="width:${Math.min(100,Math.max(0,weight))}%"></i></div></div><div><small>個股 ROI</small><b class="${tone(x.ret)}">${fmtPct(x.ret)}</b></div>${isMe?`<div><small>未實現損益</small><b class="${tone(x.pnl)}">${fmtMoney(x.pnl)}</b></div>`:''}</div>`;
    }).join('')||'<div class="status">尚無持倉</div>';
    const modal=document.getElementById('playerDetailModal');
    modal.querySelector('.player-detail-body').innerHTML=`<div class="player-detail-head"><div><span class="eyebrow">PORTFOLIO</span><h2>${e(p.name)}</h2></div><div><small>總 ROI</small><strong class="${tone(s.ret)}">${fmtPct(s.ret)}</strong></div></div>${isMe?`<div class="own-private-note">只有你看得到實際損益與金額資料。</div>`:'<div class="privacy-note">公開資訊僅顯示持倉比例與報酬率，不顯示股數、成本、市值或實際投入金額。</div>'}<div class="public-holdings">${rows}</div>`;
    modal.classList.remove('hidden');
  }

  function bindPlayerOpen(){
    document.querySelectorAll('[data-player-id]').forEach(el=>{el.onclick=()=>openPlayer(el.dataset.playerId);});
  }

  const modal=document.createElement('div');
  modal.id='playerDetailModal'; modal.className='player-detail-modal hidden';
  modal.innerHTML='<div class="player-detail-card"><button type="button" class="player-detail-close" aria-label="關閉">×</button><div class="player-detail-body"></div></div>';
  document.body.appendChild(modal);
  modal.querySelector('.player-detail-close').onclick=()=>modal.classList.add('hidden');
  modal.onclick=e=>{if(e.target===modal)modal.classList.add('hidden');};

  const style=document.createElement('style');
  style.textContent=`.rank-click,.portfolio-public{width:100%;color:inherit;text-align:left}.rank-click{background:#0f151d}.rank-click:first-child{background:linear-gradient(90deg,rgba(218,164,100,.10),#0f151d 25%)}.privacy-metric strong{color:var(--muted);font-size:12px}.holding-name{color:var(--text);font-weight:700;margin-left:5px}.portfolio-public{padding:0;background:transparent}.player-detail-modal{position:fixed;inset:0;z-index:120;background:rgba(5,8,12,.82);backdrop-filter:blur(14px);display:grid;place-items:center;padding:18px}.player-detail-card{position:relative;width:min(760px,100%);max-height:88vh;overflow:auto;background:#111720;border:1px solid var(--line);border-radius:22px;padding:22px;box-shadow:0 30px 80px rgba(0,0,0,.5)}.player-detail-close{position:absolute;right:14px;top:14px;width:38px;height:38px;padding:0;background:#1b2430;color:var(--text);font-size:24px}.player-detail-head{display:flex;align-items:end;justify-content:space-between;gap:20px;padding-right:45px}.player-detail-head h2{margin:5px 0 0;font-size:30px}.player-detail-head small{display:block;color:var(--muted);font-size:11px}.player-detail-head strong{font-size:24px}.privacy-note,.own-private-note{margin:16px 0;padding:11px 13px;border:1px solid var(--line);border-radius:12px;color:var(--muted);font-size:12px}.public-holdings{display:grid;gap:9px}.public-holding{display:grid;grid-template-columns:1.4fr 1fr .8fr;gap:14px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:14px;background:#0f151d}.public-holding>div>small,.public-holding div:first-child small{display:block;color:var(--muted);font-size:11px;margin-top:3px}.public-holding div:first-child span{font-weight:650;color:var(--text)}.weight-bar{height:5px;margin-top:6px;background:#252e3b;border-radius:99px;overflow:hidden}.weight-bar i{display:block;height:100%;background:var(--accent);border-radius:99px}@media(max-width:800px){.public-holding{grid-template-columns:1.3fr .9fr}.public-holding>div:nth-child(3){grid-column:2}.player-detail-card{padding:18px}.rank-click{grid-template-columns:42px 1fr auto}.rank-click .privacy-metric,.rank-click .metric:last-child{display:none}}`;
  document.head.appendChild(style);

  loadNames();
  setTimeout(()=>{if(typeof render==='function' && Array.isArray(players))render();},700);
})();