import test from'node:test';
import a from'node:assert/strict';
import{Buffer}from'node:buffer';
import{getServiceCreditPilotClientObservationPageResponse as get}from'../src/service-credit-pilot-client-observation-page-response.js';
import{getServiceCreditPilotClientObservationResponse as base}from'../src/service-credit-pilot-client-observation-response.js';
import{renderServiceCreditPilotClientObservationTimelineHtml as html}from'../src/service-credit-pilot-client-observation-timeline-html.js';
const J=JSON.stringify,I=J({viewVersion:1,paymentHash:'a'.repeat(64),requestId:'synthetic'});
const o=(f='INCLUDED',s='IDLE')=>J({...JSON.parse(I),fundingStatus:f,serviceStatus:s});
const R=J({ok:true,resultCode:'OK'}),M='<h2>Result code</h2>',call=xs=>get(I,J(xs),R);
const fail=(args,message)=>a.throws(()=>get(...args),{message});
test('composition',()=>{
const h=J([o()]),p=get(I,h,R),b=base(I,h,R),n=b.body.indexOf(M);
a.deepEqual(p,{statusCode:200,headers:{...b.headers,
'content-length':String(Buffer.byteLength(p.body,'utf8'))},
body:b.body.slice(0,n)+html(I,h,R)+b.body.slice(n)});
a.ok(Object.isFrozen(p)&&Object.isFrozen(p.headers));
a.ok(Buffer.byteLength(p.body,'utf8')>p.body.length);
});
test('literal escaping',()=>{
const q=String.fromCharCode(96),code="$& $"+q+" $' $$ $1 $<x> &<>\"' <h2>Result code</h2>";
const b=get(I,J([o()]),J({ok:true,resultCode:code})).body;
a.ok(b.includes("<p>$&amp; $"+q+" $&#39; $$ $1 $&lt;x&gt; &amp;&lt;&gt;&quot;&#39; &lt;h2&gt;Result code&lt;/h2&gt;</p>"));
a.equal(b.split(M).length,2);
});
test('sticky/closed',()=>{
const b=call([o('UNKNOWN','OUTCOME_UNKNOWN'),o('INCLUDED','SUCCEEDED')]).body;
const n=b.indexOf('<h3>Observation 2</h3>'),end=b.indexOf(M);
a.ok(n>=0&&end>n);
for(const t of ['Retained funding uncertainty','Retained service uncertainty',
'RECONCILE_FUNDING_AND_REQUEST','Service result reported'])a.ok(b.slice(n,end).includes(t));
const c=call([o('INCLUDED','CLOSED')]).body;
a.match(c,/Service reported closed/);
a.match(c,/Local plan open/);
a.doesNotMatch(c,/Locally closed only/);
});
test('complete failures',()=>{
for(const args of [[],[I,'[]'],[I,'[]',R,R]])fail(args,'INVALID_PAGE_INPUT');
for(const args of [[null,J([o()]),R],[I,[],R],[I,J([o()]),null]])fail(args,'INVALID_HISTORY');
for(const [x,m] of [['{','INVALID_STATUS_VIEW_INPUT'],
[o().replace('synthetic','other'),'ORIGINAL_IDENTITY_MISMATCH']])fail([I,J([o(),x]),R],m);
fail([I,J([o('INCLUDED','SUCCEEDED'),o()]),R],'CLIENT_PLAN_REGRESSION');
fail([I,J([o(),o()]),'{}'],'INVALID_CLIENT_RESULT_VIEW_INPUT');
});
test('bounds',()=>{
a.equal(call(Array(16).fill(o())).body.split('<li>').length,17);
for(const h of ['[]',' '+J([o()]),J(Array(17).fill(o()))])fail([I,h,R],'INVALID_HISTORY');
});
