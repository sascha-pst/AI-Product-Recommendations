import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolveView} from '../src/resolve.js';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
async function boot({credential='a'.repeat(64),ok=true,status=403,fresh=false}={}) {
 const app={innerHTML:'',querySelectorAll(){return []}},requests=[];
 const location=new URL(`https://store.test/?rid=R_test&arm=1&scenario=commute#launch_token=${credential}`);
 const window={};window.parent=window;
 const document={querySelector(s){if(s==='#browse')return {addEventListener(){}};assert.equal(s,'#app');return app}};
 const choice={rid:'R_test',product_id:'p1'};
 const context=vm.createContext({window,location,document,URL,URLSearchParams,Map,performance,console,
  setInterval(){},addEventListener(){},IntersectionObserver:class {disconnect(){} observe(){}},
  async fetch(url,options){requests.push({url,options});return {ok,status,json:async()=>fresh ? resolveView(JSON.parse(readFileSync(new URL('../src/recs.json',import.meta.url),'utf8')),{rid:'R_test',arm:'1',scenario:'commute'}).public : ({rid:'R_test',session_token:credential,saved_choice:choice})}}
 });
 await vm.runInContext(source,context);
 return {app,requests};
}
test('reload keeps credential in fragment, authenticates API, and resumes saved completion',async()=>{
 for(let i=0;i<2;i++){
 const s=await boot();assert.match(s.app.innerHTML,/Your choice is saved/);
 assert.equal(s.requests.length,1);assert.equal(s.requests[0].options.headers.authorization,`Bearer ${'a'.repeat(64)}`);
 assert.equal(s.requests[0].url.searchParams.has('launch_token'),false);
 }
});
test('rejected engine session renders an error instead of recommendations or completion',async()=>{
 const s=await boot({credential:'',ok:false});assert.match(s.app.innerHTML,/Your choice has not been recorded/);
 assert.doesNotMatch(s.app.innerHTML,/Your choice is saved/);
});

test('fresh task renders recommendation cards from the real stimulus data',async()=>{
 const s=await boot({fresh:true});assert.match(s.app.innerHTML,/Top 3 picks for you/);assert.match(s.app.innerHTML,/Ion Pods 2/);assert.doesNotMatch(s.app.innerHTML,/TASK_RENDER/);
});
test('failed task loads identify the HTTP error without exposing session credentials',async()=>{
 for(const status of [400,403,409,503]){
 const s=await boot({ok:false,status});assert.match(s.app.innerHTML,new RegExp(`TASK_HTTP_${status}`));assert.doesNotMatch(s.app.innerHTML,/a{64}/);
 }
});
