const cfg = window.STOCK_LEAGUE_CONFIG || {};
const statusEl = document.getElementById('status');
const leaderboardEl = document.getElementById('leaderboardList');
const portfoliosEl = document.getElementById('portfoliosList');
const playerCountEl = document.getElementById('playerCount');
const syncDot = document.getElementById('syncDot');
const syncText = document.getElementById('syncText');
const priceHint = document.getElementById('priceHint');
const lookupHint = document.getElementById('stockLookupHint');
const authGate = document.getElementById('authGate');
const authMessage = document.getElementById('authMessage');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const displayNameLabel = document.getElementById('displayNameLabel');
const authPassword = document.getElementById('authPassword');
const newPassword = document.getElementById('newPassword');
const newPasswordLabel = document.getElementById('newPasswordLabel');
const passwordLabel = document.getElementById('passwordLabel');
const authSubmit = document.getElementById('authSubmit');
const authTabs = document.getElementById('authTabs');
const authHelpers = document.getElementById('authHelpers');
const authTitle = document.getElementById('authTitle');
const authDescription = document.getElementById('authDescription');

let db = null;
let session = null;
let currentUser = null;
let myPlayer = null;
let players = [];
let holdings = [];
let authMode = 'login';
let resolvedQuote = null;
let lookupTimer = null;

function money(n){return Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:2});}
function pct(n){const v=Number(n||0);return `${v>=0?'+':''}${v.toFixed(2)}%`;}
function cls(n){return Number(n)>=0?'positive':'negative';}
function esc(s){return String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}
function configured(){return cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('YOUR_') && !cfg.supabaseAnonKey.includes('YOUR_');}
function setSync(state,text){syncDot.className=`sync-dot ${state||''}`;syncText.textContent=text;}
function show(el,on){if(el)el.classList.toggle('hidden',!on);}
function siteUrl(){return `${window.location.origin}${window.location.pathname}`;}

async function ensureClient(){
  if(!configured()) return false;
  if(!db) db = supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  return true;
}

async function initAuth(){
  if(!await ensureClient()) return;
  const {data:{session:s}}=await db.auth.getSession();
  await applySession(s);
  db.auth.onAuthStateChange(async(event,newSession)=>{
    if(event==='PASSWORD_RECOVERY'){
      session=newSession; currentUser=newSession?.user||null;
      setAuthMode('recovery');
      authGate.classList.remove('hidden');
      return;
    }
    await applySession(newSession);
  });
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
  const cost=Number(h.shares)*Number(h.avg_cost), value=Number(h.shares)*Number(h.current_price), ret=cost?(value-cost)/cost*100:0;
  const stockName=h.stock_name?`<small>${esc(h.stock_name)} · ${esc(h.market)}</small>`:`<small>${esc(h.market)}</small>`;
  return `<div class="holding"><div class="holding-title"><strong>${esc(h.symbol)}</strong>${stockName}</div><div><small>股數</small>${money(h.shares)}</div><div><small>平均成本</small>${money(h.avg_cost)}</div><div><small>目前價格</small>${money(h.current_price)}</div><div><small>報酬率</small><span class="${cls(ret)}">${pct(ret)}</span></div>${canDelete?`<button class="delete" data-delete="${h.id}" aria-label="刪除持倉">刪除</button>`:'<span></span>'}</div>`;
}

function renderMyDashboard(ranked){
  if(!currentUser) return;
  if(!myPlayer){
    document.getElementById('sideUserName').textContent=currentUser.email||'已登入';
    document.getElementById('sideUserRank').textContent='尚未建立參賽者資料';
    document.getElementById('holdingOwner').textContent='尚未建立參賽者資料';
    document.getElementById('myHoldings').innerHTML='<div class="status">此帳號尚未綁定參賽者名稱。</div>';
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

async function fetchJson(url){
  const candidates=[url,`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`];
  let lastErr=null;
  for(const target of candidates){
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),9000);
      const res=await fetch(target,{signal:controller.signal,headers:{Accept:'application/json'}});
      clearTimeout(timer);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }catch(err){lastErr=err;}
  }
  throw lastErr||new Error('報價服務連線失敗');
}

function marketFromYahooSymbol(sym){
  if(sym.endsWith('.TW')) return 'TWSE';
  if(sym.endsWith('.TWO')) return 'TPEX';
  return 'US';
}

function normalizeYahooSymbol(sym){return sym.replace(/\.TW$|\.TWO$/i,'').toUpperCase();}

async function resolveStock(input,preferredMarket){
  const q=input.trim();
  if(!q) throw new Error('請先輸入股票代號或名稱');
  if(preferredMarket==='OTHER') throw new Error('其他市場目前請手動輸入');

  let directSymbol='';
  if(/^\d{4,6}$/.test(q)){
    if(preferredMarket==='TPEX') directSymbol=`${q}.TWO`;
    else if(preferredMarket==='TWSE') directSymbol=`${q}.TW`;
  }else if(/^[A-Za-z][A-Za-z0-9.\-]{0,14}$/.test(q) && preferredMarket==='US'){
    directSymbol=q.toUpperCase();
  }

  let candidate=null;
  if(!directSymbol || preferredMarket==='AUTO'){
    const searchUrl=`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
    const search=await fetchJson(searchUrl);
    const quotes=(search?.quotes||[]).filter(x=>x?.symbol && ['EQUITY','ETF','MUTUALFUND'].includes(x.quoteType));
    const filtered=quotes.filter(x=>{
      if(preferredMarket==='TWSE') return x.symbol.endsWith('.TW');
      if(preferredMarket==='TPEX') return x.symbol.endsWith('.TWO');
      if(preferredMarket==='US') return !x.symbol.endsWith('.TW')&&!x.symbol.endsWith('.TWO');
      return true;
    });
    candidate=filtered[0]||quotes[0]||null;
    if(candidate) directSymbol=candidate.symbol;
  }

  if(!directSymbol) throw new Error('找不到符合的股票');
  const chartUrl=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(directSymbol)}?range=1d&interval=1m&includePrePost=true`;
  const chart=await fetchJson(chartUrl);
  const result=chart?.chart?.result?.[0];
  const meta=result?.meta;
  if(!meta) throw new Error('找不到此股票報價');
  let price=Number(meta.regularMarketPrice);
  if(!Number.isFinite(price)){
    const closes=result?.indicators?.quote?.[0]?.close||[];
    price=Number([...closes].reverse().find(v=>v!=null));
  }
  if(!Number.isFinite(price)) throw new Error('找不到最新價格');
  const name=candidate?.longname||candidate?.shortname||meta.longName||meta.shortName||normalizeYahooSymbol(directSymbol);
  return {symbol:normalizeYahooSymbol(directSymbol),yahooSymbol:directSymbol,name,price,market:marketFromYahooSymbol(directSymbol),currency:meta.currency||''};
}

async function lookupAndFill(){
  const input=document.getElementById('symbol').value.trim();
  const market=document.getElementById('market').value;
  if(!input){return;}
  lookupHint.textContent='正在搜尋股票…'; lookupHint.className='field-hint';
  priceHint.textContent='正在抓取最新價格…'; priceHint.className='field-hint';
  try{
    const quote=await resolveStock(input,market);
    resolvedQuote=quote;
    document.getElementById('symbol').value=quote.symbol;
    document.getElementById('stockName').value=quote.name;
    document.getElementById('currentPrice').value=quote.price;
    if(market==='AUTO') document.getElementById('market').value=quote.market;
    lookupHint.textContent=`已找到 ${quote.symbol} · ${quote.name}`; lookupHint.className='field-hint ok';
    priceHint.textContent=`已自動帶入 ${quote.price}${quote.currency?' '+quote.currency:''}`; priceHint.className='field-hint ok';
  }catch(err){
    resolvedQuote=null;
    document.getElementById('stockName').value='';
    lookupHint.textContent=`搜尋失敗：${err.message}`; lookupHint.className='field-hint err';
    priceHint.textContent='可先手動輸入現價，或確認市場後再試一次。'; priceHint.className='field-hint err';
  }
}

function setAuthMode(mode){
  authMode=mode;
  const isRegister=mode==='register';
  const isRecovery=mode==='recovery';
  authTabs.classList.toggle('hidden',isRecovery);
  authHelpers.classList.toggle('hidden',isRecovery);
  loginTab.classList.toggle('active',mode==='login');
  registerTab.classList.toggle('active',isRegister);
  displayNameLabel.classList.toggle('hidden',!isRegister);
  passwordLabel.classList.toggle('hidden',isRecovery);
  newPasswordLabel.classList.toggle('hidden',!isRecovery);
  document.getElementById('displayName').required=isRegister;
  authPassword.required=!isRecovery;
  newPassword.required=isRecovery;
  authPassword.autocomplete=isRegister?'new-password':'current-password';
  authSubmit.textContent=isRecovery?'設定新密碼':isRegister?'建立帳號':'登入';
  authTitle.textContent=isRecovery?'設定新密碼':'登入你的投資戰績';
  authDescription.textContent=isRecovery?'請輸入新的登入密碼。完成後即可回到 Stock League。':'使用 Email 與密碼登入。第一次使用先建立帳號，之後直接登入即可。';
  authMessage.textContent=''; authMessage.className='auth-message';
}

loginTab.addEventListener('click',()=>setAuthMode('login'));
registerTab.addEventListener('click',()=>setAuthMode('register'));

document.getElementById('authForm').addEventListener('submit',async e=>{
  e.preventDefault(); if(!await ensureClient()) return;
  if(authMode==='recovery'){
    const password=newPassword.value;
    authMessage.textContent='更新密碼中…';
    const {error}=await db.auth.updateUser({password});
    if(error){authMessage.textContent=`更新失敗：${error.message}`;authMessage.className='auth-message err';return;}
    authMessage.textContent='密碼已更新，現在可以直接使用新密碼登入。';authMessage.className='auth-message ok';
    await db.auth.signOut();
    setTimeout(()=>setAuthMode('login'),800);
    return;
  }

  const email=document.getElementById('authEmail').value.trim();
  const password=authPassword.value;
  const displayName=document.getElementById('displayName').value.trim();
  authMessage.textContent=authMode==='register'?'建立帳號中…':'登入中…'; authMessage.className='auth-message';

  if(authMode==='register'){
    const {data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:siteUrl(),data:{display_name:displayName}}});
    if(error){authMessage.textContent=error.message;authMessage.className='auth-message err';return;}
    if(data.session){authMessage.textContent='帳號建立成功，已登入。';authMessage.className='auth-message ok';}
    else{authMessage.textContent='帳號建立成功！請至 Email 完成驗證，驗證後即可登入。';authMessage.className='auth-message ok';}
  }else{
    const {error}=await db.auth.signInWithPassword({email,password});
    if(error){authMessage.textContent=error.message.toLowerCase().includes('confirm')?'此 Email 尚未完成驗證，請先驗證或按「重新寄送驗證信」。':'登入失敗：Email 或密碼不正確。';authMessage.className='auth-message err';return;}
    authMessage.textContent='登入成功。';authMessage.className='auth-message ok';
  }
});

document.getElementById('resendBtn').addEventListener('click',async()=>{
  if(!await ensureClient()) return;
  const email=document.getElementById('authEmail').value.trim();
  if(!email){authMessage.textContent='請先輸入 Email。';authMessage.className='auth-message err';return;}
  authMessage.textContent='重新寄送驗證信中…';authMessage.className='auth-message';
  const {error}=await db.auth.resend({type:'signup',email,options:{emailRedirectTo:siteUrl()}});
  if(error){authMessage.textContent=`寄送失敗：${error.message}`;authMessage.className='auth-message err';return;}
  authMessage.textContent='驗證信已重新寄出，請到 Email 收信。';authMessage.className='auth-message ok';
});

document.getElementById('forgotBtn').addEventListener('click',async()=>{
  if(!await ensureClient()) return;
  const email=document.getElementById('authEmail').value.trim();
  if(!email){authMessage.textContent='請先輸入要重設密碼的 Email。';authMessage.className='auth-message err';return;}
  authMessage.textContent='寄送密碼重設信中…';authMessage.className='auth-message';
  const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:siteUrl()});
  if(error){authMessage.textContent=`寄送失敗：${error.message}`;authMessage.className='auth-message err';return;}
  authMessage.textContent='密碼重設信已寄出，請點 Email 內的連結設定新密碼。';authMessage.className='auth-message ok';
});

document.getElementById('guestBtn').addEventListener('click',()=>authGate.classList.add('hidden'));
document.getElementById('openLoginBtn').addEventListener('click',()=>{setAuthMode('login');authGate.classList.remove('hidden');});
document.getElementById('logoutBtn').addEventListener('click',async()=>{if(db)await db.auth.signOut();setAuthMode('login');authGate.classList.remove('hidden');});

document.getElementById('holdingForm').addEventListener('submit',async e=>{
  e.preventDefault(); if(!db||!currentUser||!myPlayer){alert('請先登入並建立參賽者資料。');return;}
  const payload={player_id:myPlayer.id,symbol:document.getElementById('symbol').value.trim().toUpperCase(),market:document.getElementById('market').value,shares:Number(document.getElementById('shares').value),avg_cost:Number(document.getElementById('avgCost').value),current_price:Number(document.getElementById('currentPrice').value),stock_name:document.getElementById('stockName').value.trim()||resolvedQuote?.name||null};
  let {error}=await db.from('holdings').insert(payload);
  if(error && /stock_name/i.test(error.message)){
    const fallback={...payload}; delete fallback.stock_name;
    ({error}=await db.from('holdings').insert(fallback));
  }
  if(error) alert(error.message); else {e.target.reset();resolvedQuote=null;lookupHint.textContent='輸入代號或名稱後自動搜尋股票';lookupHint.className='field-hint';priceHint.textContent='輸入股票代號或名稱後會自動抓取現價';priceHint.className='field-hint';await load();}
});

portfoliosEl.addEventListener('click',deleteHolding);
document.getElementById('myHoldings').addEventListener('click',deleteHolding);
async function deleteHolding(e){const id=e.target.dataset.delete;if(!id||!db||!myPlayer)return;if(!confirm('確定刪除這筆持倉？'))return;const {error}=await db.from('holdings').delete().eq('id',id);if(error)alert(error.message);else await load();}

document.getElementById('refreshBtn').addEventListener('click',load);
document.getElementById('fetchPriceBtn').addEventListener('click',lookupAndFill);
document.getElementById('symbol').addEventListener('input',()=>{resolvedQuote=null;document.getElementById('stockName').value='';clearTimeout(lookupTimer);lookupTimer=setTimeout(lookupAndFill,700);});
document.getElementById('symbol').addEventListener('blur',()=>{if(document.getElementById('symbol').value.trim())lookupAndFill();});
document.getElementById('market').addEventListener('change',()=>{if(document.getElementById('symbol').value.trim())lookupAndFill();});

const menuBtn=document.getElementById('menuBtn'); const sidebar=document.getElementById('sidebar'); const backdrop=document.getElementById('backdrop');
function closeMenu(){sidebar.classList.remove('open');backdrop.classList.remove('show');}
menuBtn.addEventListener('click',()=>{sidebar.classList.toggle('open');backdrop.classList.toggle('show');});
backdrop.addEventListener('click',closeMenu);
document.querySelectorAll('.nav-link').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));link.classList.add('active');closeMenu();}));

initAuth();