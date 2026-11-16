"""Repair an exported draft; preserve source and question IDs. Run with QSF path."""
import copy, hashlib, json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]); d=json.loads(source.read_text())
elements=d['SurveyElements']
questions={e['PrimaryAttribute']:e['Payload'] for e in elements if e['Element']=='SQ'}
blocks=next(e['Payload'] for e in elements if e['Element']=='BL')
by_name={b['Description']:b for b in blocks.values()}
flow=next(e['Payload'] for e in elements if e['Element']=='FL')
def ed(field,value=None):
    r={'Description':field,'Field':field,'Type':'Custom' if value is not None else 'Recipient','VariableType':'String','DataVisibility':[],'AnalyzeText':False}
    if value is not None:r['Value']=value
    return r
def block(name,id):return {'Type':'Standard','ID':by_name[name]['ID'],'FlowID':id,'Autofill':[]}
def exit_unless(qid,flowid):
    return {'Type':'Branch','FlowID':flowid,'Description':'End unless affirmative consent / eligibility',
      'BranchLogic':{'0':{'0':{'LogicType':'Question','QuestionID':qid,'QuestionIsInLoop':'no','ChoiceLocator':f'q://{qid}/SelectableChoice/1','Operator':'NotSelected','QuestionIDFromLocator':qid,'LeftOperand':f'q://{qid}/SelectableChoice/1','Type':'Expression'},'Type':'If'},'Type':'BooleanExpression'},
      'Flow':[{'Type':'EndSurvey','FlowID':'FL_114' if qid == 'QID7' else 'FL_115','EndingType':'Default'}]}
flow['Flow']=[
 {'Type':'EmbeddedData','FlowID':'FL_100','EmbeddedData':[ed('study_id','ai-disclosure-v1'),ed('scenario','commute'),ed('task_completed','0')]+[ed(x) for x in ['arm','chosen_product','chosen_rank','chosen_from_recs','time_to_choice_ms','stimuli_version']]},
 block('Consent','FL_101'),exit_unless('QID7','FL_102'),block('Screener','FL_103'),exit_unless('QID8','FL_104'),
 {'Type':'BlockRandomizer','FlowID':'FL_105','SubSet':1,'EvenPresentation':True,'Flow':[
  {'Type':'EmbeddedData','FlowID':'FL_106','EmbeddedData':[ed('arm','1')]},
  {'Type':'EmbeddedData','FlowID':'FL_107','EmbeddedData':[ed('arm','2')]}]},
 block('Recommendations task','FL_108'),block('Outcomes','FL_109'),block('Choice explaination','FL_110'),block('Checks','FL_111'),block('Covariates','FL_112'),block('Debrief','FL_113')]
flow['Properties']={'Count':116}
questions['QID19']['QuestionText']='Imagine you are shopping for wireless earbuds for the situation shown below. Review the recommendations and other available products, then confirm the pair you would be most likely to purchase. No actual purchase is required. After your choice is saved, select Next.'
questions['QID19']['QuestionJS']=(ROOT/'qualtrics/embed_question.js').read_text()
questions['QID19']['QuestionDescription']='Shopping task: confirm a product choice before continuing.'
for qid in ['QID7','QID8']:
 questions[qid]['Validation']['Settings']={'ForceResponse':'ON','ForceResponseType':'ON','Type':'None'}
questions['QID20']['Answers']['4']['Display']='Neither agree nor disagree'
questions['QID20']['Answers']['7']['Display']='Strongly agree'
questions['QID20']['Choices']['2']['Display']='I consider these recommendations reliable.'
questions['QID24']['QuestionText']='How were the recommendations described on the shopping page?'
questions['QID24']['Choices']={str(i):{'Display':s} for i,s in enumerate(['Recommended','Recommended by AI','Another description',"I don’t remember"],1)}
questions['QID24']['ChoiceOrder']=[1,2,3,4];questions['QID24']['NextChoiceId']=5
# Remove willingness to pay from flow, retaining the question in Trash for recovery.
by_name['Outcomes']['BlockElements']=[x for x in by_name['Outcomes']['BlockElements'] if x.get('QuestionID')!='QID23']
trash=next(b for b in blocks.values() if b['Type']=='Trash');trash['BlockElements'].append({'Type':'Question','QuestionID':'QID23'})
tags={'QID7':'consent','QID8':'eligible','QID14':'ai_attitudes_post','QID16':'category_knowledge','QID17':'recent_purchase','QID19':'shopping_task','QID20':'trust','QID21':'usefulness','QID22':'confidence','QID23':'wtp_unused','QID24':'label_check','QID25':'attention_check','QID26':'choice_reason'}
for qid,tag in tags.items():questions[qid]['DataExportTag']=tag
# Add a debrief using the same text/graphic question format as the task.
debrief=copy.deepcopy(questions['QID19']);debrief.pop('QuestionJS',None)
debrief.update(QuestionID='QID27',DataExportTag='debrief',QuestionDescription='Study debrief',QuestionText='Thank you for participating. This study tests whether describing product recommendations as “Recommended by AI” changes trust and choice compared with “Recommended”. Participants were randomly assigned a label but saw the same recommendation content. This prototype pilot uses fictional products and an offline scoring rubric, rather than live AI-generated recommendations. The AI label is an experimental stimulus. Pilot responses test the survey and interface and will not be included in the main-study analysis. A main study will require verified AI recommendations and an updated debrief. No actual purchase took place.')
elements.append({'SurveyID':d['SurveyEntry']['SurveyID'],'Element':'SQ','PrimaryAttribute':'QID27','SecondaryAttribute':'Study debrief','TertiaryAttribute':None,'Payload':debrief})
by_name['Debrief']['BlockElements']=[{'Type':'Question','QuestionID':'QID27'}]
for e in elements:
 if e['Element']=='QC': e['SecondaryAttribute']=str(len(questions)+1)
entry=d['SurveyEntry'];entry['SurveyName']='AI Recommendation Labels - Two-Group Pilot (Repaired)';entry['SurveyStatus']='Inactive'
out=ROOT/'qualtrics/AI_Recommendation_Labels_Repaired.qsf';out.write_text(json.dumps(d,ensure_ascii=False,indent=2))
print(out)
# Update study metadata without regenerating or silently replacing frozen content.
config={'arms':{'1':{'content':'A','label':'standard'},'2':{'content':'A','label':'ai'}},'labels':{'standard':'Recommended','ai':'Recommended by AI'}}
(ROOT/'data/arms.json').write_text(json.dumps(config,indent=2)+'\n')
p=ROOT/'src/recs.json';r=json.loads(p.read_text());r['arms']=config
r.pop('stimuli_version',None);r['stimuli_version']=hashlib.sha256(json.dumps(r,sort_keys=True).encode()).hexdigest()[:10]
p.write_text(json.dumps(r,indent=1)+'\n')
