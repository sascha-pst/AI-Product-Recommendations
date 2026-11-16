// Never deploys the default/main-study Worker or uses its database.
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const {QUALTRICS_SURVEY_ID,QUALTRICS_LAUNCH_SECRET,CLOUDFLARE_ACCOUNT_ID}=process.env;
if(!/^SV_[A-Za-z0-9]+$/.test(QUALTRICS_SURVEY_ID||''))throw Error('Set QUALTRICS_SURVEY_ID to the pilot survey ID.');
if(!QUALTRICS_LAUNCH_SECRET || QUALTRICS_LAUNCH_SECRET.length<32)throw Error('Set QUALTRICS_LAUNCH_SECRET to a random secret of at least 32 characters.');
function run(args,{input,capture=false}={}){
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{encoding:'utf8',input,stdio:capture?['pipe','pipe','pipe']:['pipe','inherit','inherit'],env:{...process.env,WRANGLER_LOG_PATH:'.wrangler/logs'}});
 if(result.status!==0)throw Error(`Wrangler ${args[0]} failed. Check authentication and account selection; no main-study deployment was attempted.`);
 return result.stdout;
}
run(['whoami']);
const databases=JSON.parse(run(['d1','list','--json'],{capture:true}));
let db=databases.find(x=>x.name==='rec-engine-staging');
if(!db){run(['d1','create','rec-engine-staging']);db=JSON.parse(run(['d1','list','--json'],{capture:true})).find(x=>x.name==='rec-engine-staging');}
if(!db?.uuid)throw Error('Could not resolve the dedicated staging D1 database.');
// Root-level generated config keeps paths relative to this repository. Contains no secret.
const config={name:'rec-engine-staging',main:'src/index.js',compatibility_date:'2026-11-01',...(CLOUDFLARE_ACCOUNT_ID?{account_id:CLOUDFLARE_ACCOUNT_ID}:{}),assets:{directory:'./public',binding:'ASSETS',run_worker_first:['/api/*','/','/index.html','/demo','/demo.html']},vars:{QUALTRICS_SURVEY_ID,ALLOW_PREVIEW:'true',STUDY_OPEN:'false',ALLOW_SAMPLE_DATA:'false',FRAME_ANCESTORS:'https://*.qualtrics.com'},d1_databases:[{binding:'DB',database_name:'rec-engine-staging',database_id:db.uuid}]};
writeFileSync('wrangler.staging.local.json',JSON.stringify(config,null,2)+'\n');
const args=['--config','wrangler.staging.local.json'];
run(['d1','execute','rec-engine-staging','--remote','--file=schema.sql',...args]);
// Deploy fails closed until the secret is installed; this also creates the staging Worker.
run(['deploy',...args]);
// Secrets are sent on stdin, never command arguments or generated config.
run(['secret','put','QUALTRICS_LAUNCH_SECRET',...args],{input:QUALTRICS_LAUNCH_SECRET+'\n'});
console.log('Set STAGING_URL to the Worker URL above, then run npm run test:staging with the same survey ID and secret.');
