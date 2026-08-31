import { writeFile } from 'node:fs/promises';

const out = new Map();
const add = (symbol,name,market,yahooSymbol=symbol) => {
  symbol=String(symbol||'').trim(); name=String(name||'').trim();
  if(!symbol||!name) return;
  out.set(`${market}:${symbol}`, {symbol,name,market,yahooSymbol});
};

async function getJson(url){
  const r=await fetch(url,{headers:{'user-agent':'Stock-League/1.0'}});
  if(!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function getText(url){
  const r=await fetch(url,{headers:{'user-agent':'Stock-League/1.0'}});
  if(!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function loadTaiwan(){
  const jobs=[
    ['TWSE','https://openapi.twse.com.tw/v1/opendata/t187ap03_L'],
    ['TPEX','https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O']
  ];
  for(const [market,url] of jobs){
    try{
      const rows=await getJson(url);
      for(const r of rows){
        const symbol=r['公司代號']||r['證券代號']||r['Code']||r['SecuritiesCompanyCode'];
        const name=r['公司簡稱']||r['公司名稱']||r['證券名稱']||r['Name']||r['CompanyAbbreviation'];
        if(symbol && name) add(symbol,name,market,`${symbol}${market==='TWSE'?'.TW':'.TWO'}`);
      }
    }catch(e){console.warn('Taiwan source failed',market,e.message);}
  }
  try{
    const rows=await getJson('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
    for(const r of rows){
      const symbol=r.Code||r['證券代號']; const name=r.Name||r['證券名稱'];
      if(symbol&&name) add(symbol,name,'TWSE',`${symbol}.TW`);
    }
  }catch(e){console.warn('TWSE all-securities source failed',e.message);}
}

function parsePipe(text){
  const lines=text.trim().split(/\r?\n/); const headers=lines.shift().split('|');
  return lines.filter(x=>x && !x.startsWith('File Creation Time')).map(line=>{
    const vals=line.split('|'); return Object.fromEntries(headers.map((h,i)=>[h,vals[i]]));
  });
}

async function loadUS(){
  const nasdaq=await getText('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt');
  for(const r of parsePipe(nasdaq)){
    if(r['Test Issue']==='Y') continue;
    const symbol=r.Symbol; const name=r['Security Name'];
    if(symbol&&name) add(symbol,name,'US',symbol);
  }
  const other=await getText('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt');
  for(const r of parsePipe(other)){
    if(r['Test Issue']==='Y') continue;
    const symbol=r['ACT Symbol']||r['NASDAQ Symbol']; const name=r['Security Name'];
    if(symbol&&name) add(symbol,name,'US',symbol);
  }
}

await Promise.allSettled([loadTaiwan(),loadUS()]);
const rows=[...out.values()].sort((a,b)=>a.market.localeCompare(b.market)||a.symbol.localeCompare(b.symbol,undefined,{numeric:true}));
if(rows.length<1000) throw new Error(`stock master too small: ${rows.length}`);
await writeFile('stock-master.json',JSON.stringify(rows));
console.log(`wrote ${rows.length} securities`);