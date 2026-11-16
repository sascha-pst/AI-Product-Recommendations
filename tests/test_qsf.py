import json
from pathlib import Path
r=Path(__file__).resolve().parents[1]
d=json.loads((r/'qualtrics/AI_Recommendation_Labels_Repaired.qsf').read_text());e=d['SurveyElements']
f=next(x['Payload']['Flow'] for x in e if x['Element']=='FL');rs=[x for x in f if x['Type']=='BlockRandomizer']
assert len(rs)==1 and rs[0]['SubSet']==1 and rs[0]['EvenPresentation']
assert [x['EmbeddedData'][0]['Value'] for x in rs[0]['Flow']]==['1','2']
assert all(len(x['EmbeddedData'])==1 for x in rs[0]['Flow'])
assert len([x for x in f if x['Type']=='Branch'])==2
q={x['PrimaryAttribute']:x['Payload'] for x in e if x['Element']=='SQ'}
assert q['QID19']['QuestionJS']==(r/'qualtrics/embed_question.js').read_text()
assert 'event.source !== frame.contentWindow' in q['QID19']['QuestionJS']
assert len(set(x['DataExportTag'] for x in q.values()))==len(q)
assert all('Create New Field' not in z['Field'] for x in f if x['Type']=='EmbeddedData' for z in x['EmbeddedData'])
assert any(z['Field']=='launch_token' and z.get('Value')=='' for x in f if x['Type']=='EmbeddedData' for z in x['EmbeddedData'])
assert 'QUALTRICS_LAUNCH_SECRET' not in q['QID19']['QuestionJS']
assert d['SurveyEntry']['SurveyStatus']=='Inactive'
print('QSF structural checks passed; Qualtrics import/browser preview still required.')
