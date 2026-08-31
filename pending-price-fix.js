(() => {
  const form = document.getElementById('holdingForm');
  const symbol = document.getElementById('symbol');
  const market = document.getElementById('market');
  const currentPrice = document.getElementById('currentPrice');
  const priceHint = document.getElementById('priceHint');
  if (!form || !symbol || !market || !currentPrice) return;

  form.addEventListener('submit', (e) => {
    const price = Number(currentPrice.value);
    const quotedSymbol = currentPrice.dataset.quotedSymbol || '';
    const quotedMarket = currentPrice.dataset.quotedMarket || '';
    const ok = Number.isFinite(price) && price > 0 && quotedSymbol === symbol.value.trim().toUpperCase() && quotedMarket === market.value;
    if (!ok) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (priceHint) {
        priceHint.textContent = '請先從搜尋結果選擇股票並等最新價格載入完成，再新增持倉。';
        priceHint.className = 'field-hint err';
      }
    }
  }, true);
})();