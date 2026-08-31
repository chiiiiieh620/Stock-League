const cfg = window.STOCK_LEAGUE_CONFIG || {};
const statusEl = document.getElementById('status');
const leaderboardEl = document.getElementById('leaderboardList');
const portfoliosEl = document.getElementById('portfoliosList');
const playerCountEl = document.getElementById('playerCount');
const syncDot = document.getElementById('syncDot');
const syncText = document.getElementById('syncText');
const priceHint = document.getElementById('priceHint');
const authGate = document.getElementById('authGate');
const authMessage = document.getElementById('authMessage');

let db = null;
let session = null;
let currentUser = null;
let myPlayer = null;
let players = [];
let holdings = [];

function money(n){return Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:2});}
function pct(n){const v=Number(n||0);return `${v>=0?'+':''}${v.toFixed(2)}%`;}
function cls(n){return Number(n)>=0?'positive':'negative';}
function esc(s){return String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}
function configured(){return cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('YOUR_') && !cfg.supabaseAnonKey.includes('YOUR_');}
function setSync(state,text){syncDot.className=`sync-dot ${state||''}`;syncText.textContent=text;}
function show(el,on){if(el)el.classList.toggle('hidden',!on);}

async function ensureClient(){
  if(!configured()) return false;
  if(!db) db = supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  return true;
}

async function initAuth(){
  if(!await ensureClient()) return;
  const {data:{session:s}}=await db.auth.getSession();
  await applySession(s);
  db.auth.onAuthStateChange(async(_event,newSession)=>{await applySession(newSession);});
}

async function applySession(s){
  session=s; currentUser=s?.user||null;
  if(currentUser){
    authGate.classList.add('hidden');
    document.getElementById('openLoginBtn').classList.add('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    document.getElementById('topIdentity').textContent=currentUser.email||'已登入';
  }else{
    myPlayer=null;
    document.getElementById('openLoginBtn').classList.remove('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
    document.getElementById('topIdentity').textContent='訪客模式';
    document.getElementById('sideUserName').textContent='訪客';
    document.getElementById('sideUserRank').textContent='尚未登入';
    document.getElementById('userAvatar').textContent='?';
  }
  document.querySelectorAll('.auth-only').forEach(el=>show(el,!!currentUser));
  await load();
}

async function ensurePlayerProfile(){
  if(!currentUser) return null;
  let {data,error}=await db.from('players').select('*').eq('user_id',currentUser.id).maybeSingle();
  if(error) throw error;
  if(data) return data;
  const metaName=(currentUser.user_metadata?.display_name||'').trim();
  if(!metaName) return null;
  const ins=await db.from('players').insert({name:metaName,user_id:currentUser.id}).select().single();
  if(ins.error) throw ins.error;
  return ins.data;
}

async function load(){
  if(!await ensureClient()){
    statusEl.textContent='尚未設定 Supabase。'; setSync('err','尚未設定資料庫'); return;
  }
  statusEl.textContent='同步資料中…'; setSync('','同步中');
  try{
    myPlayer=await ensurePlayerProfile();
    const [{data:p,error:pe},{data:h,error:he}]=await Promise.all([
      db.from('players').select('*').order('created_at',{ascending:true}),
      db.from('holdings').select('*').order('created_at',{ascending:true})
    ]);
    if(pe||he) throw pe||he;
    players=p||[]; holdings=h||[]; render();
    const now=new Date().toLocaleString('zh-TW',{hour:'2-digit',minute:'2-digit'});
    statusEl.textContent=`最後更新：${now}`; setSync('ok','資料已同步');
  }catch(err){
    statusEl.textContent=`讀取失敗：${err.message}`; setSync('err','資料庫連線失敗');
  }
}

function statsFor(playerId){
  const hs=holdings.filter(h=>h.player_id===playerId);
  const cost=hs.reduce((s,h)=>s+Number(h.shares)*Number(h.avg_cost),0);
  const value=hs.reduce((s,h)=>s+Number(h.shares)*Number(h.current_price),0);
  const pnl=value-cost; const ret=cost?pnl/cost*100:0;
  return {hs,cost,value,pnl,ret};
}

function render(){
  playerCountEl.textContent=`${players.length} / 15`;
  const ranked=players.map(p=>({...p,...statsFor(p.id)})).sort((a,b)=>b.ret-a.ret);
  document.getElementById('statPlayers').textContent=players.length;
  document.getElementById('statHoldings').textContent=holdings.length;
  document.getElementById('statValue').textContent=money(ranked.reduce((s,p)=>s+p.value,0));
  document.getElementById('statLeader').textContent=ranked[0]?.name||'—';
  document.getElementById('statLeaderReturn').textContent=ranked[0]?pct(ranked[0].ret):'尚無資料';

  leaderboardEl.innerHTML=ranked.length?ranked.map((p,i)=>`
    <div class="rank-row ${myPlayer?.id===p.id?'is-me':''}">
      <div class="rank">${i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}</div>
      <div><div class="name">${esc(p.name)} ${myPlayer?.id===p.id?'<span class="me-tag">YOU</span>':''}</div><small>${p.hs.length} 筆持倉</small></div>
      <div class="metric"><small>總報酬率</small><strong class="${cls(p.ret)}">${pct(p.ret)}</strong></div>
      <div class="metric"><small>未實現損益</small><strong class="${cls(p.pnl)}">${money(p.pnl)}</strong></div>
      <div class="metric"><small>目前市值</small><strong>${money(p.value)}</strong></div>
    </div>`).join(''):'<div class="status">還沒有參賽者。</div>';

  portfoliosEl.innerHTML=ranked.length?ranked.map(p=>`
    <section class="portfolio">
      <div class="portfolio-head"><div><strong>${esc(p.name)}</strong><div class="${cls(p.ret)}">${pct(p.ret)}</div></div><div>成本 ${money(p.cost)} · 市值 ${money(p.value)} · 損益 <span class="${cls(p.pnl)}">${money(p.pnl)}</span></div></div>
      ${p.hs.length?p.hs.map(h=>holdingRow(h,myPlayer?.id===p.id)).join(''):'<div class="status" style="padding:14px 16px">尚無持倉</div>'}
    </section>`).join(''):'<div class="status">還沒有資料。</div>';

  renderMyDashboard(ranked);
}

function holdingRow(h,canDelete=false){
  const cost=Number(h.shares)*Number(h.avg_cost), value=Number(h.shares)*Number(h.current_price), pnl=value-cost, ret=cost?pnl/cost*100:0;
  return `<div class="holding"><div><strong>${esc(h.symbol)}</strong><small>${esc(h.market)}</small></div><div><small>股數</small>${money(h.shares)}</div><div><small>平均成本</small>${money(h.avg_cost)}</div><div><small>目前價格</small>${money(h.current_price)}</div><div><small>報酬率</small><span class="${cls(ret)}">${pct(ret)}</span></div>${canDelete?`<button class="delete" data-delete="${h.id}" aria-label="刪除持倉">刪除</button>`:'<span></span>'}</div>`;
}

function renderMyDashboard(ranked){
  if(!currentUser) return;
  if(!myPlayer){
    document.getElementById('sideUserName').textContent=currentUser.email||'已登入';
    document.getElementById('sideUserRank').textContent='尚未建立參賽者資料';
    document.getElementById('holdingOwner').textContent='尚未建立參賽者資料';
    document.getElementById('myHoldings').innerHTML='<div class="status">此帳號尚未綁定參賽者名稱，請重新登入並填寫名稱。</div>';
    return;
  }
  const idx=ranked.findIndex(p=>p.id===myPlayer.id); const me=ranked[idx];
  document.getElementById('sideUserName').textContent=myPlayer.name;
  document.getElementById('sideUserRank').textContent=idx>=0?`目前第 ${idx+1} 名`:'尚無排名';
  document.getElementById('userAvatar').textContent=myPlayer.name.slice(0,1).toUpperCase();
  document.getElementById('holdingOwner').textContent=myPlayer.name;
  document.getElementById('myRank').textContent=idx>=0?`#${idx+1}`:'—';
  document.getElementById('myRankPill').textContent=idx>=0?`${idx+1} / ${ranked.length}`:'— / 15';
  document.getElementById('myReturn').textContent=me?pct(me.ret):'—';
  document.getElementById('myReturn').className=me?cls(me.ret):'';
  document.getElementById('myPnl').textContent=me?money(me.pnl):'—';
  document.getElementById('myPnl').className=me?cls(me.pnl):'';
  document.getElementById('myValue').textContent=me?money(me.value):'—';
  document.getElementById('myHoldings').innerHTML=me?.hs.length?me.hs.map(h=>holdingRow(h,true)).join(''):'<div class="status">你還沒有持倉，先新增第一筆吧。</div>';
}

function yahooSymbol(symbol,market){const s=symbol.trim().toUpperCase();if(market==='TWSE')return `${s}.TW`;if(market==='TPEX')return `${s}.TWO`;return s;}
async function fetchCurrentPrice(){
  const symbol=document.getElementById('symbol').value.trim(); const market=document.getElementById('market').value; const currentPrice=document.getElementById('currentPrice');
  if(!symbol){priceHint.textContent='請先輸入股票代號';priceHint.className='field-hint err';return;}
  if(market==='OTHER'){priceHint.textContent='其他市場目前請手動輸入現價';priceHint.className='field-hint';return;}
  const ysym=yahooSymbol(symbol,market); priceHint.textContent='正在抓取最新價格…';priceHint.className='field-hint';
  try{
    const res=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=1d&interval=1m&includePrePost=true`);
    if(!res.ok) throw new Error('報價服務暫時無法使用');
    const json=await res.json(); const result=json?.chart?.result?.[0]; const meta=result?.meta; let price=Number(meta?.regularMarketPrice);
    if(!Number.isFinite(price)){const closes=result?.indicators?.quote?.[0]?.close||[];price=Number([...closes].reverse().find(v=>v!=null));}
    if(!Number.isFinite(price)) throw new Error('找不到此股票報價');
    currentPrice.value=price; priceHint.textContent=`已自動帶入 ${price}${meta?.currency?' '+meta.currency:''}`;priceHint.className='field-hint ok';
  }catch(err){priceHint.textContent=`自動抓價失敗：${err.message}。可先手動輸入現價。`;priceHint.className='field-hint err';}
}

document.getElementById('authForm').addEventListener('submit',async e=>{
  e.preventDefault(); if(!await ensureClient()) return;
  const email=document.getElementById('authEmail').value.trim(); const displayName=document.getElementById('displayName').value.trim();
  authMessage.textContent='寄送登入連結中…'; authMessage.className='auth-message';
  const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.href.split('#')[0],data:displayName?{display_name:displayName}:{}}});
  if(error){authMessage.textContent=error.message;authMessage.className='auth-message err';}
  else{authMessage.textContent='登入連結已寄到信箱，點開後會自動回到 Stock League。';authMessage.className='auth-message ok';}
});

document.getElementById('guestBtn').addEventListener('click',()=>authGate.classList.add('hidden'));
document.getElementById('openLoginBtn').addEventListener('click',()=>authGate.classList.remove('hidden'));
document.getElementById('logoutBtn').addEventListener('click',async()=>{if(db)await db.auth.signOut();authGate.classList.remove('hidden');});

document.getElementById('holdingForm').addEventListener('submit',async e=>{
  e.preventDefault(); if(!db||!currentUser||!myPlayer){alert('請先登入並建立參賽者資料。');return;}
  const payload={player_id:myPlayer.id,symbol:document.getElementById('symbol').value.trim().toUpperCase(),market:document.getElementById('market').value,shares:Number(document.getElementById('shares').value),avg_cost:Number(document.getElementById('avgCost').value),current_price:Number(document.getElementById('currentPrice').value)};
  const {error}=await db.from('holdings').insert(payload);
  if(error) alert(error.message); else {e.target.reset();priceHint.textContent='輸入股票代號後會自動抓取現價';priceHint.className='field-hint';await load();}
});

portfoliosEl.addEventListener('click',deleteHolding);
document.getElementById('myHoldings').addEventListener('click',deleteHolding);
async function deleteHolding(e){const id=e.target.dataset.delete;if(!id||!db||!myPlayer)return;if(!confirm('確定刪除這筆持倉？'))return;const {error}=await db.from('holdings').delete().eq('id',id);if(error)alert(error.message);else await load();}

document.getElementById('refreshBtn').addEventListener('click',load);
document.getElementById('fetchPriceBtn').addEventListener('click',fetchCurrentPrice);
document.getElementById('symbol').addEventListener('blur',fetchCurrentPrice);
document.getElementById('market').addEventListener('change',()=>{if(document.getElementById('symbol').value.trim())fetchCurrentPrice();});

const menuBtn=document.getElementById('menuBtn'); const sidebar=document.getElementById('sidebar'); const backdrop=document.getElementById('backdrop');
function closeMenu(){sidebar.classList.remove('open');backdrop.classList.remove('show');}
menuBtn.addEventListener('click',()=>{sidebar.classList.toggle('open');backdrop.classList.toggle('show');}); backdrop.addEventListener('click',closeMenu);
document.querySelectorAll('.nav-link').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));link.classList.add('active');closeMenu();}));

initAuth();