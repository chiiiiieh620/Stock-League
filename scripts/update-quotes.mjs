const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const HISTORY_START = new Date('2026-08-31T00:00:00Z');
const headers = {apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json'};

async function rpc(name, body={}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {method:'POST',headers,body:JSON.stringify(body)});
  if (!r.ok) throw new Error(`${name}: ${r.status} ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

function yahooSymbol(h){
  const s=String(h.symbol||'').toUpperCase();
  if(h.market==='TWSE')return `${s}.TW`;
  if(h.market==='TPEX')return `${s}.TWO`;
  return s;
}

async function quote(ysym){
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=1d&interval=1m&includePrePost=true`;
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 Stock-League/1.0','Accept':'application/json'}});
  if(!r.ok)throw new Error(`Yahoo ${r.status}`);
  const j=await r.json();
  const result=j?.chart?.result?.[0];
  let price=Number(result?.meta?.regularMarketPrice);
  if(!Number.isFinite(price)){
    const closes=result?.indicators?.quote?.[0]?.close||[];
    price=Number([...closes].reverse().find(v=>v!=null));
  }
  if(!Number.isFinite(price)||price<=0)throw new Error('No price');
  return price;
}

const holdings = await rpc('get_holdings_for_quote');
console.log(`Found ${holdings?.length||0} holding(s) to update.`);

const groups=new Map();
for(const h of holdings||[]){
  const ys=yahooSymbol(h);
  if(!groups.has(ys))groups.set(ys,[]);
  groups.get(ys).push(h);
}

let updated=0;
for(const [ys,rows] of groups){
  try{
    const price=await quote(ys);
    for(const h of rows){
      await rpc('set_holding_price',{p_holding_id:h.id,p_price:price});
      updated++;
    }
    console.log(`${ys}: ${price} -> ${rows.length} holding(s)`);
  }catch(e){
    console.warn(`${ys}: ${e.message}`);
  }
}

function pad(n){return String(n).padStart(2,'0');}
function startOfIsoWeek(date){const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()-day+1);return d;}
function isoWeekKey(date){const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const y=d.getUTCFullYear();const y0=new Date(Date.UTC(y,0,1));const w=Math.ceil((((d-y0)/86400000)+1)/7);return `${y}-W${pad(w)}`;}
function previousWeek(){const d=new Date();d.setUTCDate(d.getUTCDate()-7);return {start:startOfIsoWeek(d),key:isoWeekKey(d)};}
function previousMonth(){const d=new Date();d.setUTCDate(1);d.setUTCHours(0,0,0,0);d.setUTCMonth(d.getUTCMonth()-1);return {start:new Date(d),key:`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}`};}

async function capture(type,key){
  const result=await rpc('capture_champion',{p_period_type:type,p_period_key:key});
  console.log(`${type} ${key}:`,result);
}

const pw=previousWeek();
if(pw.start>=HISTORY_START) await capture('weekly',pw.key);
const pm=previousMonth();
if(pm.start>=HISTORY_START) await capture('monthly',pm.key);

console.log(`Updated ${updated}/${holdings?.length||0} holdings.`);
