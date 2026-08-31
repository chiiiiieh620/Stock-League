(() => {
  async function loadChampionHistory(){
    try {
      if (!db) return;
      const {data,error} = await db.from('ranking_snapshots').select('period_type,winner_player_id');
      if (error) return;
      const weekly = new Map();
      const monthly = new Map();
      for (const row of data || []) {
        const target = row.period_type === 'weekly' ? weekly : monthly;
        target.set(row.winner_player_id, (target.get(row.winner_player_id) || 0) + 1);
      }
      for (const p of players) {
        p.weekly_champions = weekly.get(p.id) || 0;
        p.monthly_champions = monthly.get(p.id) || 0;
      }
      if (typeof render === 'function') render();
    } catch (_) {}
  }

  const originalLoad = window.load;
  if (typeof originalLoad === 'function') {
    window.load = async function(...args){
      const result = await originalLoad(...args);
      await loadChampionHistory();
      return result;
    };
  }

  setTimeout(loadChampionHistory, 1200);
})();