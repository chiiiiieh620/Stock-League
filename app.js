const cfg = window.STOCK_LEAGUE_CONFIG || {};
const statusEl = document.getElementById('status');
const leaderboardEl = document.getElementById('leaderboardList');
const portfoliosEl = document.getElementById('portfoliosList');
const playerCountEl = document.getElementById('playerCount');
const playerSelect = document.getElementById('holdingPlayer');
const syncDot = document.getElementById('syncDot');
const syncText = document.getElementById('syncText');
const priceHint = document.getElementById('priceHint');

let db = null;
let players = [];
let holdings = [];

function money(n){return Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:2});}
function pct(n){const v=Number(n||0);return `${v>=0?'+':''}${v.toFixed(2)}%`;}
function cls(n){return Number(n)>=0?'positive':'negative';}
function esc(s){return String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}
function configured(){return cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('YOUR_') && !cfg.supabaseAnonKey.includes('YOUR_');}
function setSync(state,text){syncDot.className=`sync-dot ${state||''}`;syncText.textContent=text;}

async function load(){
  if(!configured()){
    statusEl.textContent='尚未設定 Supabase。';
    setSync('err','尚未設定資料庫');
    return;
  }
  if(!db) db = supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  statusEl.textContent='同步資料中…';
  setSync('','同步中');
  const [{data:p,error:pe},{data:h,error:he}] = await Promise.all([
    db.from('players').select('*').order('created_at',{ascending:true}),
    db.from('holdings').select('*').order('created_at',{ascending:true})
  ]);
  if(pe||he){
    const msg=pe?.message||he?.message;
    statusEl.textContent=`讀取失敗：${msg}`;
    setSync('err','資料庫連線失敗');
    return;
  }
  players=p||[]; holdings=h||[];
  render();
  const now=new Date().toLocaleString('zh-TW',{hour:'2-digit',minute:'2-digit'});
  statusEl.textContent=`最後更新：${now}`;
  setSync('ok','資料已同步');
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

  document.getElementById('statPlayers').textContent=players.length;
  document.getElementById('statHoldings').textContent=holdings.length;
  document.getElementById('statValue').textContent=money(ranked.reduce((s,p)=>s+p.value,0));
  document.getElementById('statLeader').textContent=ranked[0]?.name||'—';
  document.getElementById('statLeaderReturn').textContent=ranked[0]?pct(ranked[0].ret):'尚無資料';

  leaderboardEl.innerHTML=ranked.length?ranked.map((p,i)=>`
    <div class="rank-row">
      <div class="rank">${i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}</div>
      <div><div class="name">${esc(p.name)}</div><small>${p.hs.length} 筆持倉</small></div>
      <div class="metric"><small>總報酬率</small><strong class="${cls(p.ret)}">${pct(p.ret)}</strong></div>
      <div class="metric"><small>未實現損益</small><strong class="${cls(p.pnl)}">${money(p.pnl)}</strong></div>
      <div class="metric"><small>目前市值</small><strong>${money(p.value)}</strong></div>
    </div>`).join(''):'<div class="status">還沒有參賽者。</div>';

  portfoliosEl.innerHTML=ranked.length?ranked.map(p=>`
    <section class="portfolio">
      <div class="portfolio-head"><div><strong>${esc(p.name)}</strong><div class="${cls(p.ret)}">${pct(p.ret)}</div></div><div>成本 ${money(p.cost)} · 市值 ${money(p.value)} · 損益 <span class="${cls(p.pnl)}">${money(p.pnl)}</span></div></div>
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

function yahooSymbol(symbol,market){
  const s=symbol.trim().toUpperCase();
  if(market==='TWSE') return `${s}.TW`;
  if(market==='TPEX') return `${s}.TWO`;
  return s;
}

async function fetchCurrentPrice(){
  const symbol=document.getElementById('symbol').value.trim();
  const market=document.getElementById('market').value;
  const currentPrice=document.getElementById('currentPrice');
  if(!symbol){priceHint.textContent='請先輸入股票代號';priceHint.className='field-hint err';return;}
  if(market==='OTHER'){priceHint.textContent='其他市場目前請手動輸入現價';priceHint.className='field-hint';return;}
  const ysym=yahooSymbol(symbol,market);
  priceHint.textContent='正在抓取最新價格…';priceHint.className='field-hint';
  try{
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=1d&interval=1m&includePrePost=true`;
    const res=await fetch(url);
    if(!res.ok) throw new Error('報價服務暫時無法使用');
    const json=await res.json();
    const result=json?.chart?.result?.[0];
    const meta=result?.meta;
    let price=Number(meta?.regularMarketPrice);
    if(!Number.isFinite(price)){
      const closes=result?.indicators?.quote?.[0]?.close||[];
      price=Number([...closes].reverse().find(v=>v!=null));
    }
    if(!Number.isFinite(price)) throw new Error('找不到此股票報價');
    currentPrice.value=price;
    const currency=meta?.currency?` ${meta.currency}`:'';
    priceHint.textContent=`已自動帶入 ${price}${currency} · ${meta?.exchangeName||'Yahoo Finance'}`;
    priceHint.className='field-hint ok';
  }catch(err){
    priceHint.textContent=`自動抓價失敗：${err.message}。可先手動輸入現價。`;
    priceHint.className='field-hint err';
  }
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
  if(error) alert(error.message); else {e.target.reset();priceHint.textContent='輸入股票代號後會自動抓取現價';priceHint.className='field-hint';await load();}
});

portfoliosEl.addEventListener('click',async e=>{
  const id=e.target.dataset.delete; if(!id||!db)return;
  if(!confirm('確定刪除這筆持倉？'))return;
  const {error}=await db.from('holdings').delete().eq('id',id);
  if(error) alert(error.message); else await load();
});

document.getElementById('refreshBtn').addEventListener('click',load);
document.getElementById('fetchPriceBtn').addEventListener('click',fetchCurrentPrice);
document.getElementById('symbol').addEventListener('blur',fetchCurrentPrice);
document.getElementById('market').addEventListener('change',()=>{if(document.getElementById('symbol').value.trim())fetchCurrentPrice();});

const menuBtn=document.getElementById('menuBtn');
const sidebar=document.getElementById('sidebar');
const backdrop=document.getElementById('backdrop');
function closeMenu(){sidebar.classList.remove('open');backdrop.classList.remove('show');}
menuBtn.addEventListener('click',()=>{sidebar.classList.toggle('open');backdrop.classList.toggle('show');});
backdrop.addEventListener('click',closeMenu);
document.querySelectorAll('.nav-link').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));link.classList.add('active');closeMenu();}));

load();
