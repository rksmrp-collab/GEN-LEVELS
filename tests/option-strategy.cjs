const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const Database = require('better-sqlite3');
function load(file, imports, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => imports[name], console, Intl, Date, crypto: require('node:crypto').webcrypto, ...globals });
  return exports;
}
const levels = load('app/lib/option-levels.ts', {});
const grid = levels.calculateOptionLevels(400);
assert.equal(grid.length, 16);
for (let i = 1; i <= 16; i++) {
  assert.equal(grid[i - 1].upper, 400 + i * 30);
  assert.equal(grid[i - 1].lower, 400 - i * 30);
  assert.equal(grid[i - 1].label, `T${i * .75}`);
}
assert.equal(grid[3].label, 'T3');
assert.equal(grid[4].label, 'T3.75');
assert.equal(levels.nextOptionLevelBelow(400, 400), 370);
assert.equal(levels.nextOptionLevelBelow(400, 375), 370);
assert.equal(levels.nextOptionLevelBelow(400, 1), undefined);
assert.equal(levels.touchesOptionLevel({low:280, high:300}, 280), true);
assert.equal(levels.touchesOptionLevel({low:281, high:300}, 280), false);
const fixedNow = new Date('2026-09-17T05:00:00Z').getTime();
const stamp = fixedNow / 1000;
const prior = stamp - 86400;
assert.equal(levels.tradingDayCandles([{timestamp:stamp,open:400},{timestamp:prior,open:900},{timestamp:stamp-60,open:410}], "2026-09-17")[0].open, 410);
const schema = load('db/schema.ts', {});
const db = new Database(':memory:');
db.exec(Object.values(schema).join(';'));
function prepare(sql, values=[]) {return {bind: (...args)=>prepare(sql,args), run:async()=>({meta:{changes:db.prepare(sql).run(...values).changes}}), all:async()=>({results:db.prepare(sql).all(...values)}), first:async()=>db.prepare(sql).get(...values)};}
let sourceSide = 'CE';
const histories = () => {
 const candle = (timestamp, open, low, high, close) => ({timestamp,open,low,high,close});
 return [1,2].map(() => [candle(prior,900,890,910,900),candle(stamp-1800,400,395,405,400),candle(stamp,400,390,410,400)]);
};
const chain = { data: { last_price: 25000, oc: {} } };
const route = load('app/api/paper/tick/route.ts', {
 '@/app/lib/option-levels':levels,
 '@/app/lib/dhan-api': {dhan: async(path,args)=>path.endsWith('expirylist')?{data:['2026-09-24']}:path==='/optionchain'?chain: (()=>{const h=histories()[Number(args.securityId)-1];return Object.fromEntries(['timestamp','open','high','low','close'].map(k=>[k,h.map(c=>c[k])]));})()},
 '@/app/lib/dhan-auth':{dhanHeaders:async()=>({})},
 '@/app/lib/paper-db':{ensurePaperDb:async()=>({prepare,raw:db})},
 'next/server':{NextResponse:{json:(body,options)=>({body,options})}},
}, {Date:class extends Date {constructor(...args){super(...(args.length?args:[fixedNow]));}static now(){return fixedNow;}},fetch:async()=>({ok:true,text:async()=> 'SEM_SMST_SECURITY_ID,SEM_LOT_UNITS\n1,1\n2,1'})});
(async()=>{
 for(const asset of ['NIFTY','BANKNIFTY','SENSEX']) {
 // Asset-specific strikes, with the same contract premium grid.
  const step = asset==='NIFTY'?50:100;
  const entryLevel = asset === 'NIFTY' ? 340 : 280;
  for(sourceSide of ['CE','PE']) {
   db.exec('DELETE FROM paper_positions; DELETE FROM paper_signals; DELETE FROM paper_daily_state');
   chain.data.oc = {};
   for (let offset=-5; offset<=5; offset++) chain.data.oc[25000+offset*step] = {
     ce:{security_id:offset===0?1:100+offset,last_price:offset===0?(sourceSide==='CE'?entryLevel+1:400):20,oi:sourceSide==='PE'?200:100},
     pe:{security_id:offset===0?2:200+offset,last_price:offset===0?(sourceSide==='PE'?entryLevel+1:400):20,oi:sourceSide==='CE'?200:100},
   };
   const request={nextUrl:new URL(`http://local/api/paper/tick?asset=${asset}`)};
   let result=await route.POST(request); assert.equal(result.body.ok,true,JSON.stringify(result));assert.equal(result.body.opened,1);
   const p=db.prepare('SELECT * FROM paper_positions').get();
   assert.equal(p.side,sourceSide);
   assert.equal(p.entry_price,entryLevel+1);
   assert.equal(p.stop_price,asset==='NIFTY'?310:250);
   assert.equal(p.target_price,asset==='NIFTY'?400:340);
   assert.equal(p.signal_level,entryLevel);
   assert.equal(result.body.strikeCount,11);
   assert.equal(sourceSide==='CE' ? result.body.putOi > result.body.callOi : result.body.callOi > result.body.putOi, true);
   const repeated=await Promise.all([route.POST(request),route.POST(request)]);
   assert.equal(repeated.reduce((sum,r)=>sum+r.body.opened,0),0);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM paper_positions').get().n,1);
  }
 }
 console.log('Passed: formula grid, fixed daily ATM, 11-strike OI sums, both CE/PE confirmations, index-specific entry/stop/target levels, and duplicate prevention.');
})().catch(error=>{console.error(error);process.exitCode=1});
