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

  function displayStockName(h){return h.stock_name || stockNames.get(key(h.symbol,h.market)) || '';}
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

  window.holdingRow=function(h,canDelete=false){
    const s=holdingStats(h);
    return `<div class="holding">${stockTitle(h)}<div><small>股數</small>${fmtMoney(h.shares)}</div><div><small>平均成本</small>${fmtMoney(h.avg_cost)}</div><div><small>目前價格</small>${fmtMoney(h.current_price)}</div><div><small>報酬率</small><span class="${tone(s.ret)}">${fmtPct(s.ret)}</span></div>${canDelete?`<button class="delete" data-delete="${h.id}" aria-label="刪除持倉">刪除</button>`:'<span></span>'}</div>`;
  };

  window.render=function(){
    playerCountEl.textContent=`${players.length} / 15`;
    const ranked=players.map(playerStats).sort((a,b)=>b.ret-a.ret);
    document.getElementById('statPlayers').textContent=players.length;
    document.getElementById('statHoldings').textContent=holdings.length;
    document.getElementById('statLeader').textContent=ranked[0]?.name||'—';
    document.getElementById('statLeaderReturn').textContent=ranked[0]?fmtPct(ranked[0].ret):'尚無資料';
    const avgRoi=ranked.length?ranked.reduce((s,p)=>s+p.ret,0)/ranked.length:0;
    document.getElementById('statValue').textContent=ranked.length?fmtPct(avgRoi):'—';
    if(currentUser&&myPlayer)document.getElementById('topIdentity').textContent=myPlayer.name;

    leaderboardEl.innerHTML=ranked.length?ranked.map((p,i)=>`
      <button type="button" class="rank-row rank-click ${myPlayer?.id===p.id?'is-me':''}" data-player-id="${p.id}">
        <div class="rank">${i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}</div>
        <div><div class="name">${e(p.name)} ${myPlayer?.id===p.id?'<span class="me-tag">YOU</span>':''}</div><small>${p.hs.length} 筆持倉 · 點擊查看配置</small></div>
        <div class="metric"><small>ROI</small><strong class="${tone(p.ret)}">${fmtPct(p.ret)}</strong></div>
        <div class="metric privacy-metric"><small>持倉公開</small><strong>比例模式</strong></div>
        <div class="metric"><small>排名依據</small><strong>ROI</strong></div>
      </button>`).join(''):'<div class="status">還沒有參賽者。</div>';

    portfoliosEl.innerHTML=ranked.length?ranked.map(p=>`
      <button type="button" class="portfolio portfolio-public" data-player-id="${p.id}">
        <div class="portfolio-head"><div><strong>${e(p.name)}</strong><div class="${tone(p.ret)}">ROI ${fmtPct(p.ret)}</div></div><div>${p.hs.length} 檔持倉 · 點擊查看持倉配置</div></div>
      </button>`).join(''):'<div class="status">還沒有資料。</div>';
    renderMyDashboard(ranked);
    bindPlayerOpen();
  };

  window.renderMyDashboard=function(ranked){
    if(!currentUser)return;
    if(!myPlayer){
      document.getElementById('sideUserName').textContent=currentUser.email||'已登入';
      document.getElementById('sideUserRank').textContent='尚未建立參賽者資料';
      document.getElementById('holdingOwner').textContent='尚未建立參賽者資料';
      document.getElementById('myHoldings').innerHTML='<div class="status">此帳號尚未綁定參賽者名稱。</div>';
      return;
    }
    const idx=ranked.findIndex(p=>p.id===myPlayer.id),me=ranked[idx];
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

  function marketGroup(m){
    if(m==='TWSE'||m==='TPEX')return '台股';
    if(m==='US')return '美股';
    return '其他';
  }
  function marketEmoji(m){return m==='台股'?'🇹🇼':m==='美股'?'🇺🇸':'🌐';}
  function marketDistribution(s){
    const sums={台股:0,美股:0,其他:0};
    s.hs.forEach(h=>{const x=holdingStats(h);sums[marketGroup(h.market)]+=x.value;});
    const total=Object.values(sums).reduce((a,b)=>a+b,0)||1;
    return Object.entries(sums).map(([name,value])=>({name,value,pct:value/total*100})).filter(x=>x.value>0);
  }

  function openPlayer(playerId){
    const p=players.find(x=>x.id===playerId);if(!p)return;
    const s=playerStats(p),isMe=myPlayer?.id===p.id;
    const weekly=Number(p.weekly_champions||0),monthly=Number(p.monthly_champions||0);
    const dist=marketDistribution(s);
    const segments=dist.map(x=>`<i class="market-seg market-${x.name}" style="width:${x.pct}%"></i>`).join('');
    const distText=dist.map(x=>`${marketEmoji(x.name)} ${x.name} ${x.pct.toFixed(1)}%`).join(' · ')||'尚無持倉';
    const rows=s.hs.map(h=>{
      const x=holdingStats(h),weight=s.value?x.value/s.value*100:0,name=displayStockName(h);
      return `<div class="broker-row">
        <div class="broker-stock"><strong>${e(h.symbol)} <span>${e(name||'未命名')}</span></strong><small>${e(h.market)}</small></div>
        <div class="broker-weight"><b>${weight.toFixed(1)}%</b><small>持倉比例</small></div>
        <div class="broker-roi ${tone(x.ret)}"><b>${fmtPct(x.ret)}</b><small>ROI</small></div>
        ${isMe?`<div class="broker-private ${tone(x.pnl)}"><b>${fmtMoney(x.pnl)}</b><small>我的損益</small></div>`:''}
      </div>`;
    }).join('')||'<div class="status">尚無持倉</div>';

    const modal=document.getElementById('playerDetailModal');
    modal.querySelector('.player-detail-body').innerHTML=`
      <div class="detail-kicker">📈 持倉一覽 · 純配置比例</div>
      <div class="player-detail-head"><div><h2>📈 ${e(p.name)} 的持倉配置</h2><p>投資組合與策略公開檢視</p></div><div class="roi-orb"><small>總 ROI</small><strong class="${tone(s.ret)}">${fmtPct(s.ret)}</strong></div></div>
      <div class="award-grid"><div class="award-card">👑 <span>週冠軍榮譽</span><strong>${weekly} 次</strong></div><div class="award-card">🏆 <span>月冠軍金盃</span><strong>${monthly} 次</strong></div></div>
      <section class="detail-section"><div class="detail-title">🌍 市場分布比</div><div class="market-summary">${distText}</div><div class="market-bar">${segments}</div><div class="market-legend">${dist.map(x=>`<span>${marketEmoji(x.name)} ${x.name} <b>${x.pct.toFixed(1)}%</b></span>`).join('')}</div></section>
      <section class="detail-section"><div class="detail-title">📋 全部持倉配置清單 <span>共 ${s.hs.length} 項</span></div><div class="broker-list">${rows}</div></section>
      ${isMe?'<div class="own-private-note">🔒 只有你看得到實際損益；其他人只會看到持倉比例與 ROI。</div>':'<div class="privacy-note">🔒 隱私模式：不公開股數、平均成本、市值或實際投入金額。</div>'}`;
    modal.classList.remove('hidden');
  }

  function bindPlayerOpen(){document.querySelectorAll('[data-player-id]').forEach(el=>{el.onclick=()=>openPlayer(el.dataset.playerId);});}

  const modal=document.createElement('div');
  modal.id='playerDetailModal';modal.className='player-detail-modal hidden';
  modal.innerHTML='<div class="player-detail-card"><button type="button" class="player-detail-close" aria-label="關閉">×</button><div class="player-detail-body"></div></div>';
  document.body.appendChild(modal);
  modal.querySelector('.player-detail-close').onclick=()=>modal.classList.add('hidden');
  modal.onclick=e=>{if(e.target===modal)modal.classList.add('hidden');};

  const style=document.createElement('style');
  style.textContent=`
  .rank-click,.portfolio-public{width:100%;color:inherit;text-align:left}.rank-click{background:#0f151d}.rank-click:first-child{background:linear-gradient(90deg,rgba(218,164,100,.10),#0f151d 25%)}.privacy-metric strong{color:var(--muted);font-size:12px}.holding-name{color:var(--text);font-weight:700;margin-left:5px}.portfolio-public{padding:0;background:transparent}
  .player-detail-modal{position:fixed;inset:0;z-index:120;background:rgba(5,8,12,.84);backdrop-filter:blur(14px);display:grid;place-items:center;padding:16px}.player-detail-card{position:relative;width:min(820px,100%);max-height:92vh;overflow:auto;background:linear-gradient(180deg,#131a24 0,#0d1219 100%);border:1px solid #2b3543;border-radius:28px;padding:24px;box-shadow:0 32px 90px rgba(0,0,0,.58)}.player-detail-close{position:absolute;right:16px;top:16px;width:42px;height:42px;padding:0;border-radius:50%;background:#1a2330;color:var(--text);font-size:24px;border:1px solid var(--line)}
  .detail-kicker{color:var(--accent2);font-size:12px;letter-spacing:.08em;margin-bottom:12px}.player-detail-head{display:flex;justify-content:space-between;gap:18px;align-items:center;padding-right:52px}.player-detail-head h2{font-size:30px;line-height:1.2;margin:0}.player-detail-head p{margin:6px 0 0;color:var(--muted);font-size:12px}.roi-orb{min-width:120px;padding:14px 16px;border-radius:18px;background:#0c1118;border:1px solid var(--line);text-align:right}.roi-orb small,.roi-orb strong{display:block}.roi-orb small{color:var(--muted);font-size:10px}.roi-orb strong{font-size:24px;margin-top:4px}
  .award-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.award-card{display:flex;gap:8px;align-items:center;padding:13px 15px;border-radius:15px;background:linear-gradient(135deg,rgba(218,164,100,.13),rgba(222,195,132,.06));border:1px solid rgba(218,164,100,.38);font-size:18px}.award-card span{color:var(--accent2);font-size:12px;font-weight:700}.award-card strong{margin-left:auto;color:var(--accent2)}
  .detail-section{margin-top:18px}.detail-title{font-size:15px;font-weight:900;margin-bottom:10px}.detail-title span{color:var(--muted);font-size:11px;font-weight:600}.market-summary{color:var(--muted);font-size:12px;line-height:1.6}.market-bar{height:14px;border-radius:999px;background:#202937;overflow:hidden;display:flex;margin:12px 0 10px}.market-seg{display:block;height:100%}.market-台股{background:#4f8df7}.market-美股{background:#8b5cf6}.market-其他{background:#21b6ae}.market-legend{display:flex;flex-wrap:wrap;gap:10px 16px;color:var(--muted);font-size:11px}.market-legend b{color:var(--text)}
  .broker-list{display:grid;gap:9px}.broker-row{display:grid;grid-template-columns:minmax(0,1.55fr) .7fr .7fr;gap:12px;align-items:center;padding:14px 15px;border-radius:15px;background:#111923;border:1px solid var(--line)}.broker-row:has(.broker-private){grid-template-columns:minmax(0,1.45fr) .65fr .65fr .8fr}.broker-stock strong{display:block;font-size:15px}.broker-stock strong span{font-weight:650;color:var(--text)}.broker-stock small,.broker-weight small,.broker-roi small,.broker-private small{display:block;color:var(--muted);font-size:10px;margin-top:3px}.broker-weight,.broker-roi,.broker-private{text-align:right}.broker-weight b,.broker-roi b,.broker-private b{font-size:15px}.privacy-note,.own-private-note{margin-top:18px;padding:11px 13px;border:1px solid var(--line);border-radius:12px;color:var(--muted);font-size:11px;background:#0c1118}
  @media(max-width:800px){.player-detail-card{padding:18px;border-radius:22px}.player-detail-head{align-items:flex-start;flex-direction:column;padding-right:46px}.player-detail-head h2{font-size:24px}.roi-orb{width:100%;text-align:left}.award-grid{grid-template-columns:1fr}.broker-row,.broker-row:has(.broker-private){grid-template-columns:minmax(0,1.4fr) .65fr .65fr}.broker-private{grid-column:2/4}.rank-click{grid-template-columns:42px 1fr auto}.rank-click .privacy-metric,.rank-click .metric:last-child{display:none}.market-legend{gap:7px 12px}}
  `;
  document.head.appendChild(style);
  loadNames();
  setTimeout(()=>{if(typeof render==='function'&&Array.isArray(players))render();},700);
})();