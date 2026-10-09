import test from'node:test';
import a from'node:assert/strict';
import{renderServiceCreditPilotClientObservationTimelineHtml as get}from'../src/service-credit-pilot-client-observation-timeline-html.js';
import{createServiceCreditPilotClientPlan as create}from'../src/service-credit-pilot-client-plan.js';
import{renderServiceCreditPilotClientStatusHtml as render}from'../src/service-credit-pilot-client-status-html.js';
const J=JSON.stringify,I=J({viewVersion:1,paymentHash:'a'.repeat(64),requestId:'synthetic'});
const o=(f='INCLUDED',s='IDLE')=>J({...JSON.parse(I),fundingStatus:f,serviceStatus:s});
const R=J({ok:true,resultCode:'<b>HIDDEN_RESULT</b>'}),call=xs=>get(I,J(xs),R);
const rows=s=>s.match(/<li>[\s\S]*?<\/li>/g)||[];
const fail=(args,message)=>a.throws(()=>get(...args),{message});
test('singleton reuse',()=>{
const x=o(),h=call([x]);
a.ok(h.includes(render(J(create(I,x).getSnapshot()))));
a.equal(rows(h).length,1);
a.match(h,/^<section [\s\S]*<ol><li>[\s\S]*<\/li><\/ol><\/section>$/);
});
test('ordered sticky success',()=>{
const b=rows(call([o('UNKNOWN'),o('INCLUDED','OUTCOME_UNKNOWN'),o('INCLUDED','SUCCEEDED')]));
a.equal(b.length,3);
b.forEach((s,n)=>a.ok(s.includes('<h3>Observation '+(n+1)+'</h3>')));
a.match(b[0],/No retained service uncertainty/);
for(const s of b)a.match(s,/Retained funding uncertainty/);
for(const s of b.slice(1))a.match(s,/Retained service uncertainty/);
a.match(b[2],/RECONCILE_FUNDING_AND_REQUEST/);
a.match(b[2],/Service result reported/);
});
test('reported CLOSED',()=>{
const h=call([o('INCLUDED','CLOSED')]);
a.match(h,/Service reported closed/);
a.match(h,/Local plan open/);
a.doesNotMatch(h,/HIDDEN_RESULT|Result code|Locally closed only/);
a.match(h,/not authenticated capture, timing or dispatch history/);
});
test('complete failures',()=>{
for(const args of [[],[I,'[]'],[I,'[]',R,R]])fail(args,'INVALID_TIMELINE_INPUT');
for(const args of [[null,J([o()]),R],[I,[],R],[I,J([o()]),null]])fail(args,'INVALID_HISTORY');
for(const [x,m] of [['{','INVALID_STATUS_VIEW_INPUT'],
[o().replace('synthetic','other'),'ORIGINAL_IDENTITY_MISMATCH']])fail([I,J([o(),x]),R],m);
for(const s of ['SUCCEEDED','CLOSED'])
fail([I,J([o('INCLUDED',s),o()]),R],'CLIENT_PLAN_REGRESSION');
fail([I,J([o(),o()]),'{}'],'INVALID_CLIENT_RESULT_VIEW_INPUT');
});
test('bounds',()=>{
a.equal(rows(call(Array(16).fill(o()))).length,16);
for(const h of ['{','{}','[]',' '+J([o()]),J([null]),J(Array(17).fill(o())),
J([' '.repeat(1025)]),J(Array(9).fill(' '.repeat(1024)))])fail([I,h,R],'INVALID_HISTORY');
fail([I,J([' '.repeat(1024)]),R],'INVALID_STATUS_VIEW_INPUT');
});
