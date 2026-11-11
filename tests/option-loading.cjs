const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports, globals = {}) {
 const exports = {};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:name=>imports[name],Intl,Date,Map,Promise,setTimeout,AbortSignal,...globals});
 return exports;
}
(async()=>{
 // Slow chain calls cannot block the chart data lane.
 let unblock;
 const blocked = new Promise(resolve=>unblock=resolve);
 const api=load('app/lib/dhan-api.ts',{'./dhan-auth':{dhanHeaders:async()=>({})}},{fetch:async(url)=>{
  if(url.endsWith('/optionchain')) await blocked;
  return {ok:true,json:async()=>({ok:true})};
 }});
 const chain=api.dhan('/optionchain',{});
 const chart=api.dhan('/charts/intraday',{securityId:'1'});
 const winner=await Promise.race([chart.then(()=> 'chart'),new Promise(resolve=>setTimeout(()=>resolve('timeout'),1000))]);
 assert.equal(winner,'chart');unblock();await chain;
 const optionLevels=load('app/lib/option-levels.ts',{});
 const start=Math.floor(new Date(`${optionLevels.tradingDate()}T03:45:00Z`).getTime()/1000);
 const calls=[];
 const route=load('app/api/dhan/snapshot/route.ts',{
  '@/app/lib/option-levels':optionLevels,
  '@/app/lib/dhan-auth':{dhanHeaders:async()=>({})},
  '@/app/lib/dhan-api':{dhan:async(path,body)=>{
   calls.push({path,body});assert.equal(path,'/charts/intraday');
   // More than the old 180-candle window. The chart must retain the complete
   // response so users can pan back to the session open.
   const timestamp=Array.from({length:250},(_,i)=>start+i*60);
   return {timestamp,open:timestamp.map((_,i)=>i?999:400),high:timestamp.map(()=>1000),low:timestamp.map(()=>390),close:timestamp.map(()=>999)};
  }},
  'next/server':{NextResponse:{json:(body,options)=>({body,options})}},
 });
 const request=id=>({nextUrl:new URL(`http://local/api?asset=NIFTY&side=PE&strike=25100&timeframe=5m&optionsOnly=1&optionSecurityId=${id}`)});
 let result=await route.GET(request(123));
 assert.equal(result.body.optionsOnly,true);assert.equal(result.body.side,'PE');assert.equal(result.body.optionDayOpen,400);
 assert.equal(result.body.optionCandles.length,250);assert.equal(calls.length,3);
 assert.equal(calls[2].body.fromDate,`${optionLevels.tradingDate()} 09:15:00`);
 calls.length=0;result=await route.GET(request(123));assert.equal(result.body.optionDayOpen,400);assert.equal(calls.length,1);
 calls.length=0;result=await route.GET(request(124));assert.equal(result.body.optionDayOpen,400);assert.equal(calls.length,3);
 const invalid=await route.GET(request(0));assert.equal(invalid.options.status,400);
 console.log('Passed: chart requests bypass slow option-chain calls; option-only loads retain enough history to pan to the session open; session open is cached separately per contract.');
})().catch(error=>{console.error(error);process.exitCode=1});
