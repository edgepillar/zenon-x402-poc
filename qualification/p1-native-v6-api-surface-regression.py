"""Selected read-only source-gate regressions; no JS parse/import or native execution."""
import importlib.util,json,hashlib,sys
from pathlib import Path
assert len(sys.argv)==1 and sys.version_info[:3]==(3,12,14)
repo=Path(__file__).absolute().parent.parent;path=repo/'qualification/review-p1-native-v6-api-surface.py';before=path.read_bytes()
spec=importlib.util.spec_from_file_location('p1_surface_gate_selected',path);gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
rows=[];reviews={}
for version in [1,2,3,4]:
 name='qualification/p1-native-v6-two-sqlite-once.behavior'+(''if version==1 else'-v'+str(version))+'.draft.mjs'
 raw=gate.load_sources(repo,name);texts={n:b.decode()for n,b in raw.items()};result=gate.analyze(texts[name],texts)
 expected=[]if version==4 else['Backend.open']if version==3 else['Backend.open','f.raw.getOriginalCustodyQuarantine']
 assert result['missing']==expected and not result['unsupported']
 rows.append({'name':'historical_V'+str(version)+'_versus_actual_named_surface','status':'PASS','expectedMissing':expected,'observedMissing':result['missing']})
 reviews[str(version)]={'entry':name,'sourceGraph':[gate.public_pin(n,b)for n,b in sorted(raw.items())],'result':result}
 if version==4:entry=texts[name];sources=texts
for old,new,missing in [
 ('f.backend.getGrant(', 'f.backend.missingFixtureApi(', 'f.backend.missingFixtureApi'),
 ('f.raw.getOriginalRequestCustodyQuarantine(', 'f.raw.getOriginalCustodyQuarantine(', 'f.raw.getOriginalCustodyQuarantine'),
 ('f.client.submitOriginal(', 'f.client.missingFixtureApi(', 'f.client.missingFixtureApi'),
 ('client.snapshot(', 'client.missingFixtureApi(', 'client.missingFixtureApi'),
 ('f.native.requestImpl(', 'f.native.missingFixtureApi(', 'f.native.missingFixtureApi'),
 ('f.app.close(', 'f.app.missingFixtureApi(', 'f.app.missingFixtureApi')]:
 assert old in entry
 result=gate.analyze(entry.replace(old,new,1),sources);assert missing in result['missing']
 rows.append({'name':'refuse_named_typo_'+missing,'status':'PASS'})
result=gate.analyze(entry.replace('f.backend.load()',"f.backend['load']()",1),sources)
assert 'f.backend:computed_member'in result['unsupported'];rows.append({'name':'refuse_computed_backend_member','status':'PASS'})
result=gate.analyze(entry.replace('const client = f.client, closing = client.close();','const renamed = f.client, closing = renamed.close();'),sources)
assert 'client:unreviewed_alias'in result['unsupported'];rows.append({'name':'refuse_unreviewed_client_alias','status':'PASS'})
changed=dict(sources);changed[gate.TRANSPORT]=changed[gate.TRANSPORT].replace('  return FREEZE({ requestImpl, close, snapshot });','  return FREEZE({ requestImpl, close, renamedSnapshot });')
try:gate.analyze(entry,changed);raise AssertionError('FORMAT_GUARD_NOT_ENFORCED')
except ValueError as error:assert str(error)=='FACTORY_RETURN_CHANGED'
rows.append({'name':'refuse_changed_native_factory_surface','status':'PASS'})
result=gate.analyze(entry.replace('ServiceCreditSqliteStore: Backend','MissingFixtureStoreExport: Backend',1),sources)
assert gate.BACKEND+':MissingFixtureStoreExport'in result['missing'];rows.append({'name':'refuse_missing_named_import_export','status':'PASS'})
result=gate.analyze(entry,sources)
client_alias_lines={r['line']for r in result['directCalls']if r['receiver']=='client'};client_owner_lines={r['line']for r in result['directCalls']if r['receiver']=='f.client'}
assert not client_alias_lines.intersection(client_owner_lines);rows.append({'name':'do_not_count_client_suffix_as_a_separate_receiver','status':'PASS'})
assert path.read_bytes()==before
runner=gate.public_pin('qualification/p1-native-v6-api-surface-regression.py',gate.checked_read(repo,'qualification/p1-native-v6-api-surface-regression.py'))
print(json.dumps({'status':'SOURCE_GATE_REGRESSION_CASES_PASS_NOT_NATIVE_QUALIFICATION','counts':{'tests':len(rows),'pass':len(rows),'fail':0},'cases':rows,'runner':runner,'gate':gate.public_pin('qualification/review-p1-native-v6-api-surface.py',before),'reviews':reviews,'PythonVersion':sys.version.split()[0],'NodeCommands':0,'JavaScriptParsed':False,'JavaScriptImported':False,'SQLiteConnections':0,'sockets':0,'signatures':0,'newTasks':0,'newScratch':0}))

