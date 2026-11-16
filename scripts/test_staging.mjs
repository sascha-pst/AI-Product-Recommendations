// Runs against staging only. Uses synthetic response IDs, never participant data.
import assert from 'node:assert/strict';
const {STAGING_URL,QUALTRICS_SURVEY_ID,QUALTRICS_LAUNCH_SECRET}=process.env;
if (!STAGING_URL || !QUALTRICS_SURVEY_ID || !QUALTRICS_LAUNCH_SECRET) throw Error('Set STAGING_URL, QUALTRICS_SURVEY_ID, and QUALTRICS_LAUNCH_SECRET. Do not paste secrets into logs.');
const base=new URL(STAGING_URL);
if(base.protocol!=='https:')throw Error('Staging URL must use HTTPS');
async function call(path,{body,token}={}) {
 const res=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 return {status:res.status,body:await res.json()};
}
const health=await call('/api/health');assert.equal(health.status,200);assert.equal(health.body.study_open,false,'Refusing to test an open main study');
for(const arm of ['1','2']){
 const rid=`R_staging_smoke_${crypto.randomUUID()}`;
 const assignment={survey_id:QUALTRICS_SURVEY_ID,rid,arm,scenario:'commute',preview:true};
 const path=`/api/recs?rid=${rid}&arm=${arm}&scenario=commute&preview=1`;
 assert.equal((await call(path)).status,403);
 assert.equal((await call('/api/launch',{body:assignment,token:'wrong'})).status,403);
 const launch=await call('/api/launch',{body:assignment,token:QUALTRICS_LAUNCH_SECRET});assert.equal(launch.status,200);
 const token=launch.body.launch_token;assert.match(token,/^[a-f0-9]{64}$/);
 const retry=await call('/api/launch',{body:assignment,token:QUALTRICS_LAUNCH_SECRET});assert.equal(retry.body.launch_token,token);
 const first=await call(path,{token});assert.equal(first.status,200);assert.equal(first.body.arm,arm);
 const reload=await call(path,{token});assert.equal(reload.status,200);assert.equal(reload.body.session_token,first.body.session_token);assert.deepEqual(reload.body.picks,first.body.picks);
 assert.equal((await call(path.replace(`arm=${arm}`,`arm=${arm==='1'?'2':'1'}`),{token})).status,409);
 assert.equal((await call(path.replace(rid,'R_unverified'),{token})).status,403);
 const choice={rid,session_token:first.body.session_token,product_id:first.body.picks[0].product.id,time_to_choice_ms:1000};
 assert.equal((await call('/api/choice',{body:choice})).status,403);
 const saved=await call('/api/choice',{body:choice,token});assert.equal(saved.status,200);assert.equal(saved.body.saved,true);
 const savedAgain=await call('/api/choice',{body:choice,token});assert.deepEqual(savedAgain.body.choice,saved.body.choice);
 const resumed=await call(path,{token});assert.deepEqual(resumed.body.saved_choice,saved.body.choice);
 console.log(`Arm ${arm}: authenticated launch, denial checks, reload, save, retry, and completion resume passed.`);
}
console.log('Staging API checks passed. Synthetic test records remain in staging; real Qualtrics import/preview still requires manual testing.');
