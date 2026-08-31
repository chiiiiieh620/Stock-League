(() => {
  const input = document.getElementById('symbol');
  const market = document.getElementById('market');
  const nameInput = document.getElementById('stockName');
  const box = document.getElementById('stockSuggestions');
  const lookupHint = document.getElementById('stockLookupHint');
  const priceHint = document.getElementById('priceHint');
  const currentPrice = document.getElementById('currentPrice');
  if (!input || !box) return;

  let master = [];
  let quoteClient = null;

  async function loadMaster(){
    try {
      const r = await fetch(`stock-master.json?v=${Date.now()}`, {cache:'no-store'});
      if (!r.ok) throw new Error('stock-master unavailable');
      master = await r.json();
      lookupHint.textContent = `股票資料庫已載入 ${master.length.toLocaleString()} 檔，輸入即時搜尋`;
    } catch (e) {
      master = [
        {symbol:'2330',name:'台積電',market:'TWSE',yahooSymbol:'2330.TW'},
        {symbol:'2308',name:'台達電',market:'TWSE',yahooSymbol:'2308.TW'},
        {symbol:'2383',name:'台光電',market:'TWSE',yahooSymbol:'2383.TW'},
        {symbol:'3017',name:'奇鋐',market:'TWSE',yahooSymbol:'3017.TW'},
        {symbol:'8299',name:'群聯',market:'TPEX',yahooSymbol:'8299.TWO'},
        {symbol:'NVDA',name:'NVIDIA Corporation',market:'US',yahooSymbol:'NVDA'},
        {symbol:'AAPL',name:'Apple Inc.',market:'US',yahooSymbol:'AAPL'},
        {symbol:'MSFT',name:'Microsoft Corporation',market:'US',yahooSymbol:'MSFT'}
      ];
      lookupHint.textContent = '股票總資料庫載入失敗，暫時使用常用清單';
    }
  }

  function marketAllowed(item){
    const m = market.value;
    return m === 'AUTO' || m === 'OTHER' || item.market === m;
  }

  function searchLocal(q){
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return master
      .filter(marketAllowed)
      .map(x => {
        const symbol = String(x.symbol || '').toLowerCase();
        const name = String(x.name || '').toLowerCase();
        let score = 99;
        if (symbol === s) score = 0;
        else if (symbol.startsWith(s)) score = 1;
        else if (name.startsWith(s)) score = 2;
        else if (name.includes(s)) score = 3;
        else if (symbol.includes(s)) score = 4;
        return {x,score};
      })
      .filter(v => v.score < 99)
      .sort((a,b) => a.score - b.score || String(a.x.symbol).localeCompare(String(b.x.symbol)))
      .slice(0,30)
      .map(v => v.x);
  }

  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function renderSuggestions(rows){
    if (!rows.length){
      box.innerHTML = '<div class="stock-empty">找不到相符股票</div>';
      box.classList.remove('hidden');
      return;
    }
    box.innerHTML = rows.map((x,i)=>`<button type="button" class="stock-option" data-i="${i}"><span class="stock-option-symbol">${escapeHtml(x.symbol)}</span><span class="stock-option-name">${escapeHtml(x.name)}</span><span class="stock-option-market">${escapeHtml(x.market)}</span></button>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('.stock-option').forEach((el,i)=>el.addEventListener('click',()=>choose(rows[i])));
  }

  async function fetchLiveQuote(item){
    try {
      if (!window.supabase || !window.STOCK_LEAGUE_CONFIG) throw new Error('報價服務尚未初始化');
      if (!quoteClient) quoteClient = window.supabase.createClient(window.STOCK_LEAGUE_CONFIG.supabaseUrl, window.STOCK_LEAGUE_CONFIG.supabaseAnonKey);
      currentPrice.value = '0';
      if (priceHint) { priceHint.textContent = '⚡ 正在取得最新價格…'; priceHint.className = 'field-hint'; }
      const { data, error } = await quoteClient.functions.invoke('quote', { body: { symbol:item.symbol, market:item.market } });
      if (error) throw error;
      const price = Number(data?.price);
      if (!Number.isFinite(price) || price <= 0) throw new Error('沒有有效報價');
      currentPrice.value = String(price);
      currentPrice.dataset.quotedSymbol = item.symbol;
      currentPrice.dataset.quotedMarket = item.market;
      if (priceHint) { priceHint.textContent = `⚡ 最新價格 ${price.toLocaleString('zh-TW')}，可直接新增持倉`; priceHint.className = 'field-hint ok'; }
      window.dispatchEvent(new CustomEvent('stockleague:quote-ready',{detail:{...item,price}}));
    } catch (e) {
      currentPrice.value = '0';
      delete currentPrice.dataset.quotedSymbol;
      delete currentPrice.dataset.quotedMarket;
      if (priceHint) { priceHint.textContent = `報價取得失敗：${e?.message || '未知錯誤'}，請重新選擇股票`; priceHint.className = 'field-hint err'; }
    }
  }

  function choose(item){
    input.value = item.symbol;
    nameInput.value = item.name;
    if (market.value === 'AUTO') market.value = item.market;
    box.classList.add('hidden');
    lookupHint.textContent = `已選擇 ${item.symbol} · ${item.name}`;
    lookupHint.className = 'field-hint ok';
    fetchLiveQuote(item);
  }

  function handleInput(e){
    e.stopImmediatePropagation();
    nameInput.value = '';
    currentPrice.value = '0';
    delete currentPrice.dataset.quotedSymbol;
    delete currentPrice.dataset.quotedMarket;
    const q = input.value;
    if(!q.trim()){
      box.classList.add('hidden');
      lookupHint.textContent = '輸入即時顯示相關股票，點選後自動帶入名稱';
      return;
    }
    renderSuggestions(searchLocal(q));
  }

  input.addEventListener('input', handleInput, true);
  input.addEventListener('blur', e => { e.stopImmediatePropagation(); setTimeout(()=>box.classList.add('hidden'),180); }, true);
  input.addEventListener('focus', e => { if(input.value.trim()) renderSuggestions(searchLocal(input.value)); }, true);
  market.addEventListener('change', e => { e.stopImmediatePropagation(); currentPrice.value='0'; if(input.value.trim()) renderSuggestions(searchLocal(input.value)); }, true);
  document.addEventListener('click', e => { if(!e.target.closest('.stock-search-wrap')) box.classList.add('hidden'); });

  loadMaster();
})();