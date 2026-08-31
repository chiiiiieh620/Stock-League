(() => {
  const form = document.getElementById('holdingForm');
  const avgCost = document.getElementById('avgCost');
  const currentPrice = document.getElementById('currentPrice');
  if (!form || !avgCost || !currentPrice) return;

  form.addEventListener('submit', () => {
    const cost = Number(avgCost.value);
    const price = Number(currentPrice.value);
    // New positions wait for the server-side quote job. Until the first quote
    // arrives, use cost as a neutral placeholder so ROI starts at 0%, not -100%.
    if (Number.isFinite(cost) && cost >= 0 && (!Number.isFinite(price) || price <= 0)) {
      currentPrice.value = String(cost);
    }
  }, true);
})();