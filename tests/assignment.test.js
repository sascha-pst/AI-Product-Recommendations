import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {makeWorker} from '../src/worker.js';
import {resolveView} from '../src/resolve.js';
const recs=JSON.parse(readFileSync(new URL('../src/recs.json',import.meta.url)));
function setup() {
 const raw=new DatabaseSync(':memory:');raw.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){return {bind(...args){return {async run(){return raw.prepare(sql).run(...args)},async first(){return raw.prepare(sql).get(...args)}}}}},async batch(stmts){return Promise.all(stmts.map(s=>s.run()))}};
 const env={DB,ALLOW_PREVIEW:'true',STUDY_OPEN:'false',QUALTRICS_SURVEY_ID:'SV_test',QUALTRICS_LAUNCH_SECRET:'test-only-secret-at-least-32-characters'},worker=makeWorker(recs);
 const tokens=new Map();
 return {raw,env,tokens,call(path,body,authorization){
 const rid=body?.rid || new URL('https://store.test'+path).searchParams.get('rid');
 const credential=authorization===undefined?tokens.get(rid):authorization;
 return worker.fetch(new Request('https://store.test'+path,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:credential?{authorization:`Bearer ${credential}`}:{}}),env)
 },async issue(rid='R_test',arm='1',preview=true){
 const response=await this.call('/api/launch',{rid,arm,scenario:'commute',survey_id:'SV_test',preview},env.QUALTRICS_LAUNCH_SECRET);
 if(response.ok) tokens.set(rid,(await response.clone().json()).launch_token);
 return response;
 }};
}
const load=async(s,rid='R_test',arm='1')=>{if(!s.tokens.has(rid))await s.issue(rid,arm);return s.call(`/api/recs?rid=${rid}&arm=${arm}&scenario=commute&preview=1`)};
test('only label differs; both groups use Engine A',()=>{
 const a=resolveView(recs,{rid:'R',arm:'1',scenario:'commute'}),b=resolveView(recs,{rid:'R',arm:'2',scenario:'commute'});
 assert.equal(a.public.label_text,'Recommended');assert.equal(b.public.label_text,'Recommended by AI');
 for(const key of ['picks','others','title','brief','budget_usd','stimuli_version'])assert.deepEqual(a.public[key],b.public[key]);
 assert.equal(a.server.content_source,'A');assert.equal(b.server.content_source,'A');
 assert.throws(()=>resolveView(recs,{rid:'R',arm:'6',scenario:'commute'}));
});
test('rejects missing assignment and closes unverified main study',async()=>{
 const s=setup();for(const q of ['','?rid=R&arm=6&scenario=commute','?rid=R&arm=1&scenario=gym'])assert.equal((await s.call('/api/recs'+q)).status,400);
 await s.issue('R','1',false);
 assert.equal((await s.call('/api/recs?rid=R&arm=1&scenario=commute')).status,503);
 s.env.STUDY_OPEN='true';assert.equal((await s.call('/api/recs?rid=R&arm=1&scenario=commute')).status,503);
});
test('assignment persists across reload; changed URL rejected',async()=>{
 const s=setup(),a=await(await load(s)).json(),b=await(await load(s)).json();
 assert.equal(a.session_token,b.session_token);assert.equal((await load(s,'R_test','2')).status,409);
 assert.equal(s.raw.prepare('SELECT count(*) AS n FROM study_assignments').get().n,1);
});
test('both groups durably save, retry and resume confirmed choice',async()=>{
 for(const arm of ['1','2']){
 const s=setup(),v=await(await load(s,'R_'+arm,arm)).json();
 const p={rid:v.rid,session_token:v.session_token,product_id:v.picks[0].product.id,time_to_choice_ms:1234,rank:0};
 const a=await(await s.call('/api/choice',p)).json();assert.equal(a.saved,true);assert.equal(a.choice.rank,1);assert.equal(a.choice.from_recs,true);
 const b=await(await s.call('/api/choice',{...p,time_to_choice_ms:999})).json();assert.deepEqual(b.choice,a.choice);
 assert.equal((await s.call('/api/choice',{...p,product_id:v.picks[1].product.id})).status,409);
 assert.deepEqual((await(await load(s,v.rid,arm)).json()).saved_choice,a.choice);
 }
});
test('nonrecommended choice, authentication and invalid products',async()=>{
 const s=setup(),v=await(await load(s)).json(),auth={rid:v.rid,session_token:v.session_token};assert.ok(v.others.length);
 assert.equal((await s.call('/api/choice',{...auth,session_token:'fake',product_id:v.others[0].id,time_to_choice_ms:1})).status,403);
 assert.equal((await s.call('/api/choice',{...auth,product_id:'missing',time_to_choice_ms:1})).status,400);
 const a=await(await s.call('/api/choice',{...auth,product_id:v.others[0].id,time_to_choice_ms:10})).json();assert.equal(a.choice.rank,0);assert.equal(a.choice.from_recs,false);
});
test('events use server assignment; storage errors never acknowledge a choice',async()=>{
 const s=setup(),v=await(await load(s)).json(),auth={rid:v.rid,session_token:v.session_token};
 assert.equal((await s.call('/api/event',{...auth,events:[{type:'page_view',arm:'2',scenario:'gym'},{type:'choose_confirm'}]})).status,200);
 const row=s.raw.prepare('SELECT * FROM study_events').get();assert.equal(row.arm,'1');assert.equal(row.scenario,'commute');assert.equal(row.type,'page_view');
 s.env.DB={prepare(){throw Error('offline')}};assert.equal((await s.call('/api/choice',{...auth,product_id:v.picks[0].product.id,time_to_choice_ms:1})).status,503);
});

test('only authenticated survey service can issue a launch; arbitrary IDs and preview cannot bypass verification',async()=>{
 const s=setup(),body={rid:'R_fake',arm:'1',scenario:'commute',survey_id:'SV_test',preview:true};
 for(const secret of ['', 'wrong']) assert.equal((await s.call('/api/launch',body,secret)).status,403);
 assert.equal((await s.call('/api/launch',{...body,survey_id:'SV_other'},s.env.QUALTRICS_LAUNCH_SECRET)).status,400);
 assert.equal((await s.call('/api/recs?rid=R_fake&arm=1&scenario=commute&preview=1')).status,403);
 assert.equal(s.raw.prepare('SELECT count(*) AS n FROM study_assignments').get().n,0);
 s.env.QUALTRICS_LAUNCH_SECRET='';assert.equal((await s.issue()).status,503);
});
test('launch retries and concurrent reloads share one task; credentials cannot cross responses',async()=>{
 const s=setup();await s.issue();const token=s.tokens.get('R_test');await s.issue();assert.equal(s.tokens.get('R_test'),token);
 const views=await Promise.all([load(s),load(s)]);for(const v of views)assert.equal((await v.json()).session_token,token);
 assert.equal(s.raw.prepare('SELECT count(*) AS n FROM study_assignments').get().n,1);
 await s.issue('R_other');assert.equal((await s.call('/api/recs?rid=R_other&arm=1&scenario=commute',undefined,token)).status,403);
 assert.equal((await s.issue('R_test','2')).status,409);
 const v=await(await load(s)).json();
 assert.equal((await s.call('/api/choice',{rid:v.rid,session_token:token,product_id:v.picks[0].product.id,time_to_choice_ms:1},'')).status,403);
 s.raw.prepare('UPDATE verified_study_sessions SET expires_at=0').run();assert.equal((await load(s)).status,403);assert.equal((await s.issue()).status,403);
});
test('expired, wrong survey, version changes and disabled preview fail closed on loading and saving',async()=>{
 for(const mutate of [s=>{s.env.QUALTRICS_SURVEY_ID='SV_other'},s=>{s.env.ALLOW_PREVIEW='false'},s=>{s.raw.prepare("UPDATE verified_study_sessions SET stimuli_version='old'").run()}]){
 const s=setup(),v=await(await load(s)).json();mutate(s);assert.equal((await load(s)).status,403);
 assert.equal((await s.call('/api/choice',{rid:v.rid,session_token:v.session_token,product_id:v.picks[0].product.id,time_to_choice_ms:1})).status,403);
 }
});
