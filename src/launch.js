import { STUDY_ID } from './resolve.js';
export const validID = x => typeof x === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(x);
export const bearer = request => /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') || '')?.[1];
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
// Hash before comparison so secrets have fixed length and comparison does not exit early.
async function sameSecret(a, b) {
  const digest = x => crypto.subtle.digest('SHA-256', new TextEncoder().encode(x));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  return new Uint8Array(x).reduce((diff, value, i) => diff | (value ^ new Uint8Array(y)[i]), 0) === 0;
}
export async function issueLaunch(request, env, recs, json) {
  if (!env.DB || !env.QUALTRICS_SURVEY_ID || typeof env.QUALTRICS_LAUNCH_SECRET !== 'string' || env.QUALTRICS_LAUNCH_SECRET.length < 32) return json({error:'Qualtrics verification is not configured'},503);
  const supplied = request.headers.get('authorization') || '';
  if (!await sameSecret(supplied, `Bearer ${env.QUALTRICS_LAUNCH_SECRET}`)) return json({error:'Unauthorized survey launch'},403);
  const text = await request.text();
  if (text.length > 2000) return json({error:'Request too large'},413);
  let body; try { body = JSON.parse(text); } catch { return json({error:'Invalid JSON'},400); }
  if (!body || !validID(body.rid) || body.survey_id !== env.QUALTRICS_SURVEY_ID || !['1','2'].includes(body.arm) || body.scenario !== 'commute' || typeof body.preview !== 'boolean') return json({error:'Invalid survey assignment'},400);
  if (body.preview && env.ALLOW_PREVIEW !== 'true') return json({error:'Preview is disabled'},403);
  const now = Date.now();
  await env.DB.prepare(`INSERT OR IGNORE INTO verified_study_sessions (study_id,rid,survey_id,arm,scenario,stimuli_version,token,preview,created_at,expires_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
    .bind(STUDY_ID,body.rid,body.survey_id,body.arm,body.scenario,recs.stimuli_version,token(),body.preview?1:0,now,now+7*86400000).run();
  const row = await env.DB.prepare('SELECT * FROM verified_study_sessions WHERE study_id=?1 AND rid=?2').bind(STUDY_ID,body.rid).first();
  if (!row || row.survey_id !== body.survey_id || row.arm !== body.arm || row.scenario !== body.scenario || row.stimuli_version !== recs.stimuli_version || row.preview !== (body.preview?1:0)) return json({error:'Survey assignment changed'},409);
  if (row.expires_at <= now) return json({error:'Survey session expired'},403);
  return json({launch_token:row.token});
}
export async function verifiedSession(request, env, recs, rid) {
  const credential = bearer(request);
  if (!credential || !env.DB || !env.QUALTRICS_SURVEY_ID) return null;
  const row = await env.DB.prepare('SELECT * FROM verified_study_sessions WHERE study_id=?1 AND rid=?2').bind(STUDY_ID,rid).first();
  if (!row || row.token !== credential || row.survey_id !== env.QUALTRICS_SURVEY_ID || row.stimuli_version !== recs.stimuli_version || row.expires_at <= Date.now() || (row.preview && env.ALLOW_PREVIEW !== 'true')) return null;
  return row;
}
