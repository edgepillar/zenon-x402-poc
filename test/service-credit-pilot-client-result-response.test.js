import test from 'node:test';
import a from 'node:assert/strict';
import{Buffer}from'node:buffer';
import{readFileSync}from'node:fs';
import{getServiceCreditPilotClientResultResponse as get}from'../src/service-credit-pilot-client-result-response.js';
import{getServiceCreditPilotClientStatusResponse as policy}from'../src/service-credit-pilot-client-status-response.js';
import{createServiceCreditPilotClientPlan as create}from'../src/service-credit-pilot-client-plan.js';
const J=JSON.stringify,H='a'.repeat(64),R='synthetic';
const I=J({viewVersion:1,paymentHash:H,requestId:R});
const obs=(f='INCLUDED',s='IDLE')=>J({viewVersion:1,paymentHash:H,requestId:R,fundingStatus:f,serviceStatus:s});
const plan=(f,s)=>create(I,obs(f,s)),K=J({ok:true,resultCode:'&<>"\'&lt;<script>'});
const head='<h2>Result code</h2>';
function before(b,t) {const i=b.indexOf(t);a.ok(i>=0&&i<b.indexOf(head));}
test('escape/freeze/UTF8',()=>{
const s=J(plan().getSnapshot()),r=get(s,K);
a.equal(r.statusCode,200);
a.deepEqual(r.headers,{...policy(s).headers,'content-length':String(Buffer.byteLength(r.body,'utf8'))});
a.ok([r,r.headers].every(Object.isFrozen));
const again=get(s,K);a.notStrictEqual(r,again);a.notStrictEqual(r.headers,again.headers);
a.ok(Buffer.byteLength(r.body,'utf8')>r.body.length);
a.match(r.body,/^<!doctype html>[\s\S]*<\/html>$/);
a.ok(r.body.includes('<p>&amp;&lt;&gt;&quot;&#39;&amp;lt;&lt;script&gt;</p>'));
a.doesNotMatch(r.body,/<script\b/i);
a.ok(r.body.includes('Caller-declared, unverified result'));
});
test('sticky success order',()=>{
const p=plan('UNKNOWN','OUTCOME_UNKNOWN');p.observe(obs('INCLUDED','SUCCEEDED'));
const b=get(J(p.getSnapshot()),K).body;
for(const t of [H,R,'Retained funding uncertainty','Retained service uncertainty',
'RECONCILE_FUNDING_AND_REQUEST','Service result reported']) before(b,t);
});
test('pending/close order',()=>{
const p=plan('PENDING','NOT_STARTED');
for(const s of [p.getSnapshot(),p.close()]) {
const b=get(J(s),K).body;before(b,'Funding reported pending');
if(s.closed) before(b,'provider/server/native cleanup unconfirmed.');
a.doesNotMatch(b,/Service reported closed/);
}
});
test('invalid input',()=>{
const s=J(plan().getSnapshot());
for(const args of [[],[s],[s,K,K],['{',K],[' '+s,K],[s,'{}'],[s,' '+K]])
a.throws(()=>get(...args));
});
test('declaration text',()=>{
const d=readFileSync(new URL('../src/service-credit-pilot-client-result-response.d.ts',import.meta.url),'utf8');
a.ok(d.length<=1024);
a.equal(d.replace(/\/\/[^\n]*|\s/g,''),
"importtype{ServiceCreditPilotStatusResponse}from'./service-credit-pilot-status-response.js';"+
'exportfunction'+get.name+'(snapshotJson:string,resultJson:string):ServiceCreditPilotStatusResponse;');
});
