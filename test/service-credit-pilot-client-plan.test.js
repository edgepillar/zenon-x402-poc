import test from 'node:test';
import a from 'node:assert/strict';
import { createServiceCreditPilotClientPlan as create } from '../src/service-credit-pilot-client-plan.js';
const H='a'.repeat(64),R='synthetic-request',BAD='INVALID_CLIENT_PLAN_INPUT';
const F='UNKNOWN',U='OUTCOME_UNKNOWN';
const id=(h=H,r=R)=>JSON.stringify({viewVersion:1,paymentHash:h,requestId:r});
const obs=(f='INCLUDED',s='IDLE',h=H,r=R)=>JSON.stringify({
 viewVersion:1,paymentHash:h,requestId:r,fundingStatus:f,serviceStatus:s
});
const I=id(),plan=(f,s)=>create(I,obs(f,s));
function inert(s) {
 a.ok(Object.isFrozen(s)&&Object.isFrozen(s.view));
 a.equal(s.qualification,'UNQUALIFIED'); a.equal(s.authorization,'NONE');
 for(const k of ['mayStartPayment','maySignPayment','mayDispatchService','deliveryConfirmed'])
  a.equal(s[k],false);
 return s;
}
function unchanged(p,fn,message) {
 const before=p.getSnapshot();
 a.throws(fn,{message}); a.strictEqual(p.getSnapshot(),before);
}
test('bound immutable identity',()=>{
 const o=obs(),p=create(I,o),s=inert(p.getSnapshot());
 a.deepEqual(Object.keys(p),['observe','getSnapshot','close']); a.ok(Object.isFrozen(p));
 a.deepEqual([s.originalIdentityJson,s.observationJson,s.paymentHash,s.requestId,s.nextStep],
  [I,o,H,R,'REVIEW_IDENTITY_ADMISSION']);
});
test('success never enables actions',()=>{
 const p=plan('PENDING','NOT_STARTED');
 a.equal(inert(p.getSnapshot()).nextStep,'OBSERVE_FUNDING');
 for(const [s,step] of [['IDLE','REVIEW_IDENTITY_ADMISSION'],
  ['EXECUTING','OBSERVE_REQUEST'],['SUCCEEDED','READ_ORIGINAL_RESULT_ONLY']])
  a.equal(inert(p.observe(obs('INCLUDED',s))).nextStep,step);
});
test('reject retargeting atomically',()=>{
 const p=plan();
 for(const o of [obs('INCLUDED','IDLE','b'.repeat(64)),obs('INCLUDED','IDLE',H,'other')])
  unchanged(p,()=>p.observe(o),'ORIGINAL_IDENTITY_MISMATCH');
 unchanged(p,()=>p.observe(obs(),id('b'.repeat(64))),BAD);
});
test('uncertainty stays latched',()=>{
 for(const [f,s,step] of [[F,'IDLE','RECONCILE_FUNDING'],
  ['INCLUDED',U,'RECONCILE_REQUEST'],
  [F,U,'RECONCILE_FUNDING_AND_REQUEST']]) {
  const p=plan(f,s);
  for(const v of [p.getSnapshot(),p.observe(obs()),p.observe(obs('INCLUDED','SUCCEEDED'))]) {
   a.equal(inert(v).nextStep,step);
   a.deepEqual([v.fundingUncertain,v.serviceUncertain],[f===F,s===U]);
  }
 }
});
test('terminal replay and regression',()=>{
 for(const t of ['SUCCEEDED','CLOSED']) {
  const o=obs('INCLUDED',t),p=create(I,o),before=p.getSnapshot();
  a.equal(before.terminal,t); a.deepEqual(inert(p.observe(o)),before);
  for(const s of ['NOT_STARTED','IDLE','EXECUTING',U,'SUCCEEDED','CLOSED','UNAVAILABLE'])
   if(s!==t) unchanged(p,()=>p.observe(obs(F,s)),'CLIENT_PLAN_REGRESSION');
 }
});
test('input and arity are atomic',()=>{
 for(const args of [[],[I],[I,obs(),I]]) a.throws(()=>create(...args),{message:BAD});
 for(const [h,r] of [[null,null],[H,null]])
  a.throws(()=>create(id(h,r),obs('NOT_STARTED','NOT_STARTED',h,r)),{message:BAD});
 const p=plan();
 for(const v of [null,'{',' '+obs(),' '.repeat(1025),'{"viewVersion":1,'+obs().slice(1)])
  unchanged(p,()=>p.observe(v),'INVALID_STATUS_VIEW_INPUT');
 for(const fn of [()=>p.observe(),()=>p.getSnapshot(null),()=>p.close(null)])
  unchanged(p,fn,BAD);
});
test('idempotent close, no reset',()=>{
 const p=plan(F,U),before=p.getSnapshot(),s=inert(p.close());
 a.equal(s.closed,true); a.equal(s.nextStep,'LOCALLY_CLOSED');
 a.ok(s.fundingUncertain&&s.serviceUncertain); a.strictEqual(s.view,before.view);
 a.strictEqual(p.close(),s); a.strictEqual(p.getSnapshot(),s);
 unchanged(p,()=>p.observe(obs()),'CLIENT_PLAN_CLOSED'); a.equal(p.reset,undefined);
 for(const fn of [()=>s.authorization='YES',()=>s.view.paymentHash='changed',()=>p.observe=null])
  a.throws(fn,TypeError);
});
