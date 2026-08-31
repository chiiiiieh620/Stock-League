(() => {
  const input = document.getElementById('symbol');
  const market = document.getElementById('market');
  const nameInput = document.getElementById('stockName');
  const priceInput = document.getElementById('currentPrice');
  const box = document.getElementById('stockSuggestions');
  const lookupHint = document.getElementById('stockLookupHint');
  const priceHint = document.getElementById('priceHint');
  const fetchBtn = document.getElementById('fetchPriceBtn');
  if (!input || !box) return;

  let master = [];
  let selected = null;

  async function loadMaster(){
    try {
      const r = await fetch(`stock-master.json?v=${Date.now()}`, {cache:'no-store'});
      if (!r.ok) throw new Error('stock-master unavailable');
      master = await r.json();
      lookupHint.textContent = `股票資料庫已載入 ${master.length.toLocaleString()} 檔`;
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
      lookupHint.textContent = '股票總資料庫更新中，先使用暫存清單';
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
      .slice(0,20)
      .map(v => v.x);
  }

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

  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  async function fetchQuote(item){
    priceHint.textContent = '正在抓取最新價格…';
    priceHint.className = 'field-hint';
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.yahooSymbol)}?range=1d&interval=1m&includePrePost=true`;
    const urls = [url, `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`];
    let last;
    for (const target of urls){
      try{
        const c = new AbortController();
        const t = setTimeout(()=>c.abort(),12000);
        const r = await fetch(target,{signal:c.signal});
        clearTimeout(t);
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const result = j?.chart?.result?.[0];
        let p = Number(result?.meta?.regularMarketPrice);
        if(!Number.isFinite(p)){
          const closes = result?.indicators?.quote?.[0]?.close || [];
          p = Number([...closes].reverse().find(v=>v!=null));
        }
        if(!Number.isFinite(p)) throw new Error('找不到價格');
        priceInput.value = p;
        priceHint.textContent = `已自動帶入 ${p}${result?.meta?.currency ? ' '+result.meta.currency : ''}`;
        priceHint.className = 'field-hint ok';
        return;
      }catch(e){last=e;}
    }
    priceHint.textContent = `現價抓取失敗：${last?.message || '連線失敗'}。股票名稱與代碼仍可正常選擇。`;
    priceHint.className = 'field-hint err';
  }

  async function choose(item){
    selected = item;
    input.value = item.symbol;
    nameInput.value = item.name;
    if (market.value === 'AUTO') market.value = item.market;
    box.classList.add('hidden');
    lookupHint.textContent = `已選擇 ${item.symbol} · ${item.name}`;
    lookupHint.className = 'field-hint ok';
    await fetchQuote(item);
  }

  function handleInput(e){
    e.stopImmediatePropagation();
    selected = null;
    nameInput.value = '';
    const q = input.value;
    if(!q.trim()){
      box.classList.add('hidden');
      lookupHint.textContent = '輸入即時顯示相關股票，點選後自動帶入名稱與現價';
      return;
    }
    renderSuggestions(searchLocal(q));
  }

  input.addEventListener('input', handleInput, true);
  input.addEventListener('blur', e => { e.stopImmediatePropagation(); setTimeout(()=>box.classList.add('hidden'),180); }, true);
  input.addEventListener('focus', e => { if(input.value.trim()) renderSuggestions(searchLocal(input.value)); }, true);
  market.addEventListener('change', e => { e.stopImmediatePropagation(); if(input.value.trim()) renderSuggestions(searchLocal(input.value)); }, true);
  fetchBtn.addEventListener('click', e => { e.preventDefault(); e.stopImmediatePropagation(); if(selected) fetchQuote(selected); else { const exact=searchLocal(input.value)[0]; if(exact) choose(exact); } }, true);
  document.addEventListener('click', e => { if(!e.target.closest('.stock-search-wrap')) box.classList.add('hidden'); });

  loadMaster();
})();