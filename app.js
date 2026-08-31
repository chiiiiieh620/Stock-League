const cfg = window.STOCK_LEAGUE_CONFIG || {};
const statusEl = document.getElementById('status');
const leaderboardEl = document.getElementById('leaderboard');
const portfoliosEl = document.getElementById('portfolios');
const playerCountEl = document.getElementById('playerCount');
const playerSelect = document.getElementById('holdingPlayer');

let db = null;
let players = [];
let holdings = [];

function money(n){return Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:2});}
function pct(n){const v=Number(n||0);return `${v>=0?'+':''}${v.toFixed(2)}%`;}
function cls(n){return Number(n)>=0?'positive':'negative';}
function esc(s){return String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}

function configured(){return cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('YOUR_') && !cfg.supabaseAnonKey.includes('YOUR_');}

async function load(){
  if(!configured()){
    statusEl.textContent='尚未設定 Supabase。請先填入 config.js 的 Project URL 與 anon key。';
    leaderboardEl.innerHTML='';
    portfoliosEl.innerHTML='<div class="status">資料庫設定完成後，這裡會顯示所有參賽者持倉。</div>';
    return;
  }
  if(!db) db = supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  statusEl.textContent='同步資料中…';
  const [{data:p,error:pe},{data:h,error:he}] = await Promise.all([
    db.from('players').select('*').order('created_at',{ascending:true}),
    db.from('holdings').select('*').order('created_at',{ascending:true})
  ]);
  if(pe||he){statusEl.textContent=`讀取失敗：${pe?.message||he?.message}`;return;}
  players=p||[]; holdings=h||[];
  render();
  statusEl.textContent=`最後更新：${new Date().toLocaleString('zh-TW')}`;
}

function statsFor(playerId){
  const hs=holdings.filter(h=>h.player_id===playerId);
  const cost=hs.reduce((s,h)=>s+Number(h.shares)*Number(h.avg_cost),0);
  const value=hs.reduce((s,h)=>s+Number(h.shares)*Number(h.current_price),0);
  const pnl=value-cost;
  const ret=cost? pnl/cost*100:0;
  return {hs,cost,value,pnl,ret};
}

function render(){
  playerCountEl.textContent=`${players.length} / 15`;
  playerSelect.innerHTML=players.length?players.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''):'<option value="">請先新增參賽者</option>';
  const ranked=players.map(p=>({...p,...statsFor(p.id)})).sort((a,b)=>b.ret-a.ret);
  leaderboardEl.innerHTML=ranked.length?ranked.map((p,i)=>`
    <div class="rank-row">
      <div class="rank">#${i+1}</div>
      <div><div class="name">${esc(p.name)}</div><small>${p.hs.length} 筆持倉</small></div>
      <div class="metric"><small>總報酬率</small><strong class="${cls(p.ret)}">${pct(p.ret)}</strong></div>
      <div class="metric"><small>未實現損益</small><strong class="${cls(p.pnl)}">${money(p.pnl)}</strong></div>
      <div class="metric"><small>目前市值</small><strong>${money(p.value)}</strong></div>
    </div>`).join(''):'<div class="status">還沒有參賽者。</div>';

  portfoliosEl.innerHTML=ranked.length?ranked.map(p=>`
    <section class="portfolio">
      <div class="portfolio-head"><div><strong>${esc(p.name)}</strong><div class="${cls(p.ret)}">${pct(p.ret)}</div></div><div>成本 ${money(p.cost)} · 市值 ${money(p.value)}</div></div>
      ${p.hs.length?p.hs.map(h=>{
        const cost=Number(h.shares)*Number(h.avg_cost), value=Number(h.shares)*Number(h.current_price), pnl=value-cost, ret=cost?pnl/cost*100:0;
        return `<div class="holding">
          <div><strong>${esc(h.symbol)}</strong><small>${esc(h.market)}</small></div>
          <div><small>股數</small>${money(h.shares)}</div>
          <div><small>平均成本</small>${money(h.avg_cost)}</div>
          <div><small>目前價格</small>${money(h.current_price)}</div>
          <div><small>報酬率</small><span class="${cls(ret)}">${pct(ret)}</span></div>
          <button class="delete" data-delete="${h.id}" aria-label="刪除持倉">刪除</button>
        </div>`;
      }).join(''):'<div class="status" style="padding:14px 16px">尚無持倉</div>'}
    </section>`).join(''):'<div class="status">還沒有資料。</div>';
}

document.getElementById('playerForm').addEventListener('submit',async e=>{
  e.preventDefault(); if(!db) return load();
  if(players.length>=15){alert('最多只能有 15 位參賽者。');return;}
  const name=document.getElementById('playerName').value.trim(); if(!name)return;
  const {error}=await db.from('players').insert({name});
  if(error) alert(error.message); else {e.target.reset(); await load();}
});

document.getElementById('holdingForm').addEventListener('submit',async e=>{
  e.preventDefault(); if(!db) return load();
  const payload={
    player_id:playerSelect.value,
    symbol:document.getElementById('symbol').value.trim().toUpperCase(),
    market:document.getElementById('market').value,
    shares:Number(document.getElementById('shares').value),
    avg_cost:Number(document.getElementById('avgCost').value),
    current_price:Number(document.getElementById('currentPrice').value)
  };
  const {error}=await db.from('holdings').insert(payload);
  if(error) alert(error.message); else {e.target.reset(); await load();}
});

portfoliosEl.addEventListener('click',async e=>{
  const id=e.target.dataset.delete; if(!id||!db)return;
  if(!confirm('確定刪除這筆持倉？'))return;
  const {error}=await db.from('holdings').delete().eq('id',id);
  if(error) alert(error.message); else await load();
});

document.getElementById('refreshBtn').addEventListener('click',load);
load();
