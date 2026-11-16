import { resolveView, EVENT_TYPES, STUDY_ID } from './resolve.js';
import { validID, issueLaunch, verifiedSession } from './launch.js';
const headers = {'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers});
export function makeWorker(recs) {
  return { async fetch(request,env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/launch' && request.method === 'POST') return await issueLaunch(request,env,recs,json);
      if (url.pathname === '/api/health') return json({ok:true,study_id:STUDY_ID,stimuli_version:recs.stimuli_version,sample_data:recs.sample_data,engine_a_mode:recs.engine_a?.mode,study_open:env.STUDY_OPEN==='true',db:!!env.DB});
      if (url.pathname === '/api/recs' && request.method === 'GET') {
        const rid=url.searchParams.get('rid'), arm=url.searchParams.get('arm'), scenario=url.searchParams.get('scenario');
        if (!validID(rid) || !['1','2'].includes(arm) || scenario!=='commute') return json({error:'Invalid study assignment. Return to Qualtrics; do not change the URL.'},400);
        const verified=await verifiedSession(request,env,recs,rid);
        if (!verified) return json({error:'A verified Qualtrics session is required'},403);
        if (verified.arm!==arm || verified.scenario!==scenario) return json({error:'Survey assignment changed'},409);
        const preview=!!verified.preview;
        if (!preview && (env.STUDY_OPEN!=='true' || recs.engine_a?.mode!=='claude' || (recs.sample_data && env.ALLOW_SAMPLE_DATA!=='true'))) return json({error:'The study is not open. Recommendations and study settings require researcher verification.'},503);
        if (!env.DB) return json({error:'Study storage is unavailable.'},503);
        const v=resolveView(recs,{rid,arm,scenario}).public;
        await env.DB.prepare(`INSERT OR IGNORE INTO study_assignments (study_id,rid,arm,scenario,content_source,label,stimuli_version,token,created_at) VALUES (?1,?2,?3,?4,'A',?5,?6,?7,?8)`)
          .bind(STUDY_ID,rid,arm,scenario,v.label_key,v.stimuli_version,verified.token,Date.now()).run();
        const session=await env.DB.prepare('SELECT * FROM study_assignments WHERE study_id=?1 AND rid=?2').bind(STUDY_ID,rid).first();
        if (!session || session.token!==verified.token || session.arm!==arm || session.scenario!==scenario || session.stimuli_version!==v.stimuli_version) return json({error:'Assignment or stimulus version changed. Contact the researcher.'},409);
        return json({...v,session_token:session.token,saved_choice:session.choice_json?JSON.parse(session.choice_json):null,...(preview?{content_source:'A'}:{})});
      }
      if (['/api/event','/api/choice'].includes(url.pathname) && request.method==='POST') {
        if (!env.DB) return json({error:'Study storage is unavailable.'},503);
        const raw=await request.text();
        if (raw.length>20000) return json({error:'Request too large'},413);
        let body; try { body=JSON.parse(raw); } catch { return json({error:'Invalid JSON'},400); }
        if (!body || typeof body!=='object' || !validID(body.rid) || typeof body.session_token!=='string') return json({error:'Invalid session'},400);
        const verified=await verifiedSession(request,env,recs,body.rid);
        if (!verified) return json({error:'A verified Qualtrics session is required'},403);
        const session=await env.DB.prepare('SELECT * FROM study_assignments WHERE study_id=?1 AND rid=?2').bind(STUDY_ID,body.rid).first();
        if (!session || session.token!==body.session_token || session.token!==verified.token) return json({error:'Unknown session'},403);
        if (session.stimuli_version!==recs.stimuli_version) return json({error:'Stimulus version changed'},409);
        if (url.pathname==='/api/event') {
          if (!Array.isArray(body.events) || body.events.length>50) return json({error:'Invalid events'},400);
          const rows=body.events.filter(e=>e && EVENT_TYPES.has(e.type));
          const stmt=env.DB.prepare(`INSERT INTO study_events (study_id,rid,arm,scenario,type,product_id,value,client_ts,server_ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`);
          if(rows.length) await env.DB.batch(rows.map(e=>stmt.bind(STUDY_ID,session.rid,session.arm,session.scenario,e.type,validID(e.product_id)?e.product_id:null,Number.isFinite(e.value)?e.value:null,Number.isFinite(e.client_ts)?e.client_ts:null,Date.now())));
          return json({stored:rows.length});
        }
        const v=resolveView(recs,session).public;
        const pick=v.picks.find(p=>p.product.id===body.product_id);
        if (!pick && !v.others.some(p=>p.id===body.product_id)) return json({error:'Invalid product'},400);
        if (!Number.isFinite(body.time_to_choice_ms) || body.time_to_choice_ms<0 || body.time_to_choice_ms>86400000) return json({error:'Invalid choice time'},400);
        const choice={source:'rec-engine',type:'choice',study_id:STUDY_ID,rid:session.rid,arm:session.arm,scenario:session.scenario,stimuli_version:session.stimuli_version,product_id:body.product_id,rank:pick?.rank||0,from_recs:!!pick,time_to_choice_ms:Math.round(body.time_to_choice_ms)};
        await env.DB.prepare('UPDATE study_assignments SET choice_json=?1,completed_at=?2 WHERE study_id=?3 AND rid=?4 AND choice_json IS NULL').bind(JSON.stringify(choice),Date.now(),STUDY_ID,session.rid).run();
        const saved=await env.DB.prepare('SELECT * FROM study_assignments WHERE study_id=?1 AND rid=?2').bind(STUDY_ID,session.rid).first();
        const confirmed=JSON.parse(saved.choice_json);
        if(confirmed.product_id!==body.product_id) return json({error:'A different choice was already confirmed.'},409);
        return json({saved:true,choice:confirmed});
      }
      if(url.pathname.startsWith('/api/')) return json({error:'Not found'},404);
      if(['/demo','/demo.html'].includes(url.pathname)) return new Response('Not found',{status:404});
      const res=await env.ASSETS.fetch(request), out=new Response(res.body,res);
      out.headers.set('content-security-policy',`frame-ancestors 'self' ${env.FRAME_ANCESTORS||'https://*.qualtrics.com'}`);
      out.headers.set('referrer-policy','no-referrer');
      return out;
    } catch(error) {
      // Fail closed: never acknowledge unsaved choices or expose database errors.
      return json({error:'Unable to save or load the study. Please retry or contact the researcher.'},503);
    }
  }};
}
