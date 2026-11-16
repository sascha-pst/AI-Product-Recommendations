import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {makeWorker} from '../src/worker.js';
test('staging smoke command exercises both arms against the real worker',async()=>{
 const raw=new DatabaseSync(':memory:');raw.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){return {bind(...args){return {async run(){return raw.prepare(sql).run(...args)},async first(){return raw.prepare(sql).get(...args)}}}}},async batch(rows){return Promise.all(rows.map(x=>x.run()))}};
 const env={DB,ALLOW_PREVIEW:'true',STUDY_OPEN:'false',QUALTRICS_SURVEY_ID:'SV_test',QUALTRICS_LAUNCH_SECRET:'test-only-secret-at-least-32-characters'};
 const worker=makeWorker(JSON.parse(readFileSync(new URL('../src/recs.json',import.meta.url),'utf8')));
 const fetch=globalThis.fetch, saved={};
 for(const key of ['STAGING_URL','QUALTRICS_SURVEY_ID','QUALTRICS_LAUNCH_SECRET'])saved[key]=process.env[key];
 Object.assign(process.env,{STAGING_URL:'https://staging.test',QUALTRICS_SURVEY_ID:env.QUALTRICS_SURVEY_ID,QUALTRICS_LAUNCH_SECRET:env.QUALTRICS_LAUNCH_SECRET});
 globalThis.fetch=(url,options)=>worker.fetch(new Request(url,options),env);
 try{await import('../scripts/test_staging.mjs')}finally{
  globalThis.fetch=fetch;raw.close();for(const [key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
