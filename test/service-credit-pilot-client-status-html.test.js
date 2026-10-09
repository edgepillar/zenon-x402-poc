import test from 'node:test';
import a from 'node:assert/strict';
import { renderServiceCreditPilotClientStatusHtml as render } from '../src/service-credit-pilot-client-status-html.js';
import { createServiceCreditPilotClientPlan as create } from '../src/service-credit-pilot-client-plan.js';
const J=JSON.stringify,H='a'.repeat(64),R='synthetic-request',F='UNKNOWN',U='OUTCOME_UNKNOWN';
const id=(h=H,r=R)=>J({viewVersion:1,paymentHash:h,requestId:r});
const obs=(f='INCLUDED',s='IDLE',h=H,r=R)=>J({
 viewVersion:1,paymentHash:h,requestId:r,fundingStatus:f,serviceStatus:s
});
const plan=(f,s)=>create(id(),obs(f,s));
const bad=(...args)=>a.throws(()=>render(...args),{message:'INVALID_CLIENT_STATUS_HTML_INPUT'});
const has=(h,t)=>a.ok(h.includes(t));
function changed(fn,text=J(plan().getSnapshot())) {
 const v=JSON.parse(text); fn(v); bad(J(v));
}
test('normal/success display',()=>{
 const p=plan();
 for(const s of [p.getSnapshot(),p.observe(obs('INCLUDED','SUCCEEDED'))]) {
  const before=p.getSnapshot(),text=J(s),h=render(text);
  a.equal(render(text),h); a.strictEqual(p.getSnapshot(),before); a.equal(J(s),text);
  for(const t of [H,R,s.nextStep,'no authorization',
   'Caller-declared snapshot','full bytes/context/custody',
   'no reset or recovery authority']) has(h,t);
  a.doesNotMatch(h,/<(?:button|form|a|link|script|input)\b/i);
 }
 has(render(J(p.getSnapshot())),'delivery remains unconfirmed.');
});
test('sticky success display',()=>{
 for(const [f,s,step] of [[F,'IDLE','RECONCILE_FUNDING'],
  ['INCLUDED',U,'RECONCILE_REQUEST'],[F,U,'RECONCILE_FUNDING_AND_REQUEST']]) {
  const p=plan(f,s),v=p.observe(obs('INCLUDED','SUCCEEDED')),h=render(J(v));
  a.equal(v.view.phase,'RESULT_REPORTED'); a.equal(v.view.reconciliationRequired,false);
  has(h,step); has(h,'Service result reported');
  for(const [kind,on] of [['funding',f===F],['service',s===U]]) {
   a.equal(h.includes('Retained '+kind+' uncertainty'),on);
   a.equal(h.includes('No retained '+kind+' uncertainty'),!on);
  }
 }
});
test('local close display',()=>{
 const p=plan(F,U);
 p.observe(obs('INCLUDED','SUCCEEDED'));
 const h=render(J(p.close()));
 for(const t of ['Retained funding uncertainty','Retained service uncertainty','LOCALLY_CLOSED',
  'Locally closed only; provider/server/native cleanup unconfirmed.']) has(h,t);
 a.doesNotMatch(h,/Service reported closed/);
});
test('bad input and arity',()=>{
 const text=J(plan().getSnapshot());
 for(const x of [null,{},'null','[]','1','{','{}',' '+text,text+'\n',
  ' '.repeat(4096),' '.repeat(4097),'{"closed":false,'+text.slice(1)]) bad(x);
 bad(); bad(text,text);
});
test('bad snapshot fields',()=>{
 for(const fn of [
  v=>delete v.authorization,v=>v.extra=true,
  v=>{const x=v.originalIdentityJson;delete v.originalIdentityJson;v.originalIdentityJson=x;},
  v=>v.paymentHash='b'.repeat(64),v=>v.requestId='other',
  v=>v.originalIdentityJson=id('b'.repeat(64)),
  v=>v.observationJson=obs('INCLUDED','IDLE',H,'other'),
  v=>v.view.phase='RESULT_REPORTED',v=>v.view.paymentHash='b'.repeat(64),
  v=>v.terminal='SUCCEEDED',v=>v.nextStep='READ_ORIGINAL_RESULT_ONLY',
  v=>v.qualification='QUALIFIED',v=>v.authorization='ALLOW'
 ]) changed(fn);
 for(const k of ['fundingUncertain','serviceUncertain','closed']) {
  changed(v=>v[k]='true'); changed(v=>v[k]=true);
 }
 for(const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])
  changed(v=>v[k]=true);
});
test('current unknown flags',()=>{
 for(const [f,s,k] of [[F,'IDLE','fundingUncertain'],['INCLUDED',U,'serviceUncertain']])
  for(const closed of [false,true]) changed(v=>{
   v[k]=false;
   if(closed) {v.closed=true;v.nextStep='LOCALLY_CLOSED';}
  },J(plan(f,s).getSnapshot()));
 changed(v=>{v.fundingUncertain=false;v.serviceUncertain=false;},J(plan(F,U).getSnapshot()));
});
