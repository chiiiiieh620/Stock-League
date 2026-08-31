import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function yahooSymbol(symbol:string, market:string){
  const s = String(symbol||'').trim().toUpperCase();
  if (market === 'TWSE') return `${s}.TW`;
  if (market === 'TPEX') return `${s}.TWO`;
  return s;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { symbol, market } = await req.json();
    if (!symbol || !market) throw new Error('Missing symbol or market');
    const ysym = yahooSymbol(symbol, market);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=1d&interval=1m&includePrePost=true`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Stock-League/1.0' } });
    if (!r.ok) throw new Error(`Quote provider ${r.status}`);
    const j = await r.json();
    const result = j?.chart?.result?.[0];
    const meta = result?.meta;
    let price = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(price)) {
      const closes = result?.indicators?.quote?.[0]?.close || [];
      price = Number([...closes].reverse().find((v:any)=>v!=null));
    }
    if (!Number.isFinite(price) || price <= 0) throw new Error('No valid price');
    return new Response(JSON.stringify({ symbol, market, yahooSymbol: ysym, price, currency: meta?.currency || '', marketTime: meta?.regularMarketTime || null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'Quote failed' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
