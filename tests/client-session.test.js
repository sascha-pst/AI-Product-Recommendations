import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
async function boot({credential='a'.repeat(64),ok=true}={}) {
 const app={innerHTML:''},requests=[];
 const location=new URL(`https://store.test/?rid=R_test&arm=1&scenario=commute#launch_token=${credential}`);
 const window={};window.parent=window;
 const document={querySelector(s){assert.equal(s,'#app');return app}};
 const choice={rid:'R_test',product_id:'p1'};
 const context=vm.createContext({window,location,document,URL,URLSearchParams,Map,performance,console,
  setInterval(){},addEventListener(){},IntersectionObserver:class {disconnect(){}},
  async fetch(url,options){requests.push({url,options});return {ok,json:async()=>({rid:'R_test',session_token:credential,saved_choice:choice})}}
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
