import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../qualtrics/embed_question.js',import.meta.url),'utf8').replaceAll('${e://Field/ResponseID}','R_test').replaceAll('${e://Field/arm}','1').replaceAll('${e://Field/scenario}','commute');
function setup(){
 const values={},nodes=[],callbacks={},listeners={};let visible=false;
 const q={hideNextButton(){visible=false},showNextButton(){visible=true},getQuestionContainer(){return {appendChild(n){nodes.push(n)}}}};
 const window={location:{origin:'https://berkeley.qualtrics.com'},addEventListener(type,fn){listeners[type]=fn},removeEventListener(type){delete listeners[type]}};
 const Qualtrics={SurveyEngine:{addOnReady(fn){callbacks.ready=fn},addOnUnload(fn){callbacks.unload=fn},setEmbeddedData(k,v){values[k]=v}}};
 const document={createElement(tag){return {tag,style:{},contentWindow:{},setAttribute(){},remove(){}}}};
 vm.runInNewContext(source,{window,document,Qualtrics,URL,Number});callbacks.ready.call(q);
 const frame=nodes.find(n=>n.tag==='iframe');
 const choice={source:'rec-engine',type:'choice',study_id:'ai-disclosure-v1',rid:'R_test',arm:'1',scenario:'commute',stimuli_version:'v1',product_id:'p1',rank:1,from_recs:true,time_to_choice_ms:12};
 return {values,frame,callbacks,listeners,get visible(){return visible},send(overrides={}){listeners.message({origin:'https://rec-engine.sashaschaps.workers.dev',source:frame.contentWindow,data:choice,...overrides})}};
}
test('iframe carries correct assignment; Next waits for confirmed matching message',()=>{
 const s=setup(),u=new URL(s.frame.src);assert.equal(u.searchParams.get('rid'),'R_test');assert.equal(u.searchParams.get('arm'),'1');assert.equal(u.searchParams.get('scenario'),'commute');assert.equal(s.visible,false);
 s.send({origin:'https://evil.example'});assert.equal(s.visible,false);
 s.send({source:{}});assert.equal(s.visible,false);
 s.send({data:{source:'rec-engine',type:'choice',rid:'R_other'}});assert.equal(s.visible,false);
 s.send();assert.equal(s.visible,true);assert.equal(s.values.task_completed,'1');assert.equal(s.values.chosen_product,'p1');
 s.callbacks.unload();assert.equal(s.listeners.message,undefined);
});
