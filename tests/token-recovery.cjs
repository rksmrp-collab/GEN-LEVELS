const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
let token = 'rejected';
let refreshes = 0;
let calls = 0;
const code = ts.transpileModule(fs.readFileSync('app/lib/dhan-api.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code, {exports: exportsObject, require: () => ({
  dhanHeaders: async () => ({'access-token': token}),
  invalidateToken: rejected => {if (token === rejected) {token = 'fresh'; refreshes++;}},
}), Date, Map, Promise, setTimeout, AbortSignal,
fetch: async (_url, options) => {
  calls++;
  const rejected = options.headers['access-token'] === 'rejected';
  return {ok: !rejected, status: rejected ? 401 : 200, json: async () => rejected ? {status: 'failure', remarks: {error_code: 'DH-901', error_message: 'Invalid Token'}} : {data: 'candles'}};
}});
(async () => {
  const result = await exportsObject.dhan('/charts/intraday', {securityId: '1'});
  assert.equal(result.data, 'candles');
  assert.equal(refreshes, 1);
  assert.equal(calls, 2);
  await exportsObject.dhan('/charts/intraday', {securityId: '1'});
  assert.equal(calls, 2);
  console.log('Passed: rejected token refreshes once, retries chart request, and caches successful result.');
})().catch(e => {console.error(e); process.exitCode = 1;});
