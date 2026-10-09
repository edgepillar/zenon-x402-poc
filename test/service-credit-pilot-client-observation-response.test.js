import test from 'node:test';
import a from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{getServiceCreditPilotClientObservationResponse as get}from'../src/service-credit-pilot-client-observation-response.js';
import{getServiceCreditPilotClientResultResponse as response}from'../src/service-credit-pilot-client-result-response.js';
import{createServiceCreditPilotClientPlan as create}from'../src/service-credit-pilot-client-plan.js';
const J=JSON.stringify,I=J({viewVersion:1,paymentHash:'a'.repeat(64),requestId:'synthetic'});
const o=(f='INCLUDED',s='IDLE')=>J({...JSON.parse(I),fundingStatus:f,serviceStatus:s});
const K=J({ok:true,resultCode:'OK'}),call=xs=>get(I,J(xs),K);
const bad=(...args)=>a.throws(()=>get(...args),{message:'INVALID_HISTORY'});
test('singleton',()=>{
for(const s of ['IDLE','CLOSED']) {
const x=o('INCLUDED',s),r=call([x]);
a.deepEqual(r,response(J(create(I,x).getSnapshot()),K));
a.ok([r,r.headers].every(Object.isFrozen));
a.match(r.body,/Local plan open/);
}
});
test('sticky success',()=>{
const b=call([o('UNKNOWN','OUTCOME_UNKNOWN'),o('INCLUDED','SUCCEEDED')]).body;
for(const t of ['Retained funding uncertainty','Retained service uncertainty',
'RECONCILE_FUNDING_AND_REQUEST','Service result reported']) a.ok(b.includes(t));
});
test('rejection',()=>{
for(const s of ['SUCCEEDED','CLOSED'])
a.throws(()=>call([o('INCLUDED',s),o()]),{message:'CLIENT_PLAN_REGRESSION'});
a.throws(()=>call([o(),o().replace('synthetic','other')]),{message:'ORIGINAL_IDENTITY_MISMATCH'});
a.throws(()=>call([o(),'{']),{message:'INVALID_STATUS_VIEW_INPUT'});
a.throws(()=>get(I,J([o()]),'{}'),{message:'INVALID_CLIENT_RESULT_VIEW_INPUT'});
});
test('bounds',()=>{
const h=J([o()]);
for(const args of [[],[I,h],[I,h,K,K],[null,h,K],[I,[],K],[I,h,null]]) bad(...args);
for(const h of ['{','{}','[]',J([null]),' '+J([o()]),J(Array(17).fill(o())),
J([' '.repeat(1025)]),J(Array(9).fill(' '.repeat(1024)))]) bad(I,h,K);
a.deepEqual(call(Array(16).fill(o())),call([o()]));
a.throws(()=>call([' '.repeat(1024)]),{message:'INVALID_STATUS_VIEW_INPUT'});
});
test('types',()=>{
const d=readFileSync(new URL('../src/service-credit-pilot-client-observation-response.d.ts',import.meta.url),'utf8');
a.ok(d.length<=1024);
a.equal(d.replace(/\/\/[^\n]*|\s/g,''),
"importtype{ServiceCreditPilotStatusResponse}from'./service-credit-pilot-status-response.js';"+
'exportfunction'+get.name+'(originalIdentityJson:string,observationsJson:string,resultJson:string):ServiceCreditPilotStatusResponse;');
});
