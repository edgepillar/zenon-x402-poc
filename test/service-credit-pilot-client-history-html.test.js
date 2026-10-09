import test from'node:test';
import a from'node:assert/strict';
import{renderServiceCreditPilotClientHistoryHtml as r}from'../src/service-credit-pilot-client-history-html.js';
import{createServiceCreditPilotClientHistoryPlan as c}from'../src/service-credit-pilot-client-history-plan.js';
const J=JSON.stringify,I=J({viewVersion:1,paymentHash:'a'.repeat(64),requestId:'zz'});
const o=(f='INCLUDED',s='IDLE')=>J({...JSON.parse(I),fundingStatus:f,serviceStatus:s});
const S=(xs=[o()])=>{const p=c(I,xs[0]);for(const x of xs.slice(1))p.observe(x);return JSON.parse(J(p.getSnapshot()));};
const bad=v=>a.throws(()=>r(J(v)));
test('pending count',()=>{
const b=r(J(S([o('PENDING')])));
a.match(b,/Count: 1/);a.match(b,/unverified caller history/);a.match(b,/Funding reported pending/);
});
test('sticky prefix',()=>{
let v=S([o('UNKNOWN','OUTCOME_UNKNOWN'),o('INCLUDED','SUCCEEDED')]);
a.match(r(J(v)),/Retained funding uncertainty[\s\S]*Retained service uncertainty/);
v.latest.fundingUncertain=false;v.latest.nextStep='RECONCILE_REQUEST';bad(v);
v=S();
v.latest.fundingUncertain=true;v.latest.nextStep='RECONCILE_FUNDING';bad(v);
});
test('snapshot tamper',()=>{
const v=S();
for(const z of [{originalIdentityJson:I.replace('zz','xx')},{observationCount:2},{latest:{...v.latest,authorization:'YES'}},{observationsJson:J([o('PENDING')])}])bad({...v,...z});
});
test('local close',()=>{
a.match(r(J(S([o('INCLUDED','CLOSED')]))),/Local plan open/);
const p=c(I,o()),v=JSON.parse(J(p.close()));
a.match(r(J(v)),/Locally closed only[\s\S]*Service reported idle/);
v.latest.closed=1;bad(v);
v.latest.closed=true;v.latest.nextStep='REVIEW_IDENTITY_ADMISSION';bad(v);
});
test('input bounds',()=>{
const v=S(),s=J(v);
for(const args of [[],[s,s],[null],[' '+s],[' '.repeat(16385)]])a.throws(()=>r(...args));
for(const z of ['[]',' '+J([o()]),J(Array(17).fill(o())),J([null]),J(['x'.repeat(1025)]),' '.repeat(8193)])bad({...v,observationsJson:z});
});
test('prefix fences',()=>{
const v=S();
for(const xs of [[o('INCLUDED','SUCCEEDED'),o()],[o(),o().replace('a'.repeat(64),'b'.repeat(64))],[o(),o().replace('zz','xx')]])bad({...v,observationsJson:J(xs),observationCount:2});
});
