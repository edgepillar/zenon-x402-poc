import test from 'node:test';
import a from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getServiceCreditPilotClientResultView as get } from '../src/service-credit-pilot-client-result-view.js';
import { createServiceCreditPilotClientPlan as create } from '../src/service-credit-pilot-client-plan.js';
const J=JSON.stringify,H='a'.repeat(64),R='synthetic-request',F='UNKNOWN',U='OUTCOME_UNKNOWN';
const I=J({viewVersion:1,paymentHash:H,requestId:R});
const obs=(f='INCLUDED',s='IDLE')=>J({
 viewVersion:1,paymentHash:H,requestId:R,fundingStatus:f,serviceStatus:s
});
const plan=(f,s)=>create(I,obs(f,s)),packet=c=>J({ok:true,resultCode:c});
const bad=(...args)=>a.throws(()=>get(...args),{message:'INVALID_CLIENT_RESULT_VIEW_INPUT'});
test('raw frozen identity',()=>{
 const p=plan(),original=p.getSnapshot(),s=J(original);
 for(const c of [' ','~','x'.repeat(128),'<tag>&"\\']) {
  const r=packet(c),v=get(s,r);
  a.equal(v.resultJson,r); a.equal(v.resultCode,c); a.equal(J(v.snapshot),s);
  a.notStrictEqual(v.snapshot,original);
  a.ok([v,v.snapshot,v.snapshot.view].every(Object.isFrozen));
  a.deepEqual([v.evidence,v.qualification,v.authorization,v.deliveryConfirmed],
   ['CALLER_DECLARED_DATA_ONLY','UNQUALIFIED','NONE',false]);
  a.equal(v.retainedUncertainty,false);
 }
});
test('unknown success and close',()=>{
 for(const [f,s] of [[F,'IDLE'],['INCLUDED',U],[F,U]]) {
  const p=plan(f,s);
  for(const v of [p.getSnapshot(),p.observe(obs('INCLUDED','SUCCEEDED')),p.close()]) {
   const r=get(J(v),packet('SUCCESS'));
   a.equal(J(r.snapshot),J(v)); a.equal(r.retainedUncertainty,true);
  }
 }
 const v=get(J(plan('PENDING','NOT_STARTED').getSnapshot()),packet('SUCCESS'));
 a.equal(v.retainedUncertainty,false); a.equal(v.snapshot.view.reconciliationRequired,true);
});
test('invalid calls',()=>{
 const s=J(plan().getSnapshot()),r=packet('x');
 bad(); bad(s); bad(s,r,r);
 for(const x of [null,'{',' '+s]) a.throws(()=>get(x,r),{message:'INVALID_CLIENT_STATUS_HTML_INPUT'});
 const v=JSON.parse(s); v.requestId='other';
 a.throws(()=>get(J(v),r),{message:'INVALID_CLIENT_STATUS_HTML_INPUT'});
});
test('packet rejection',()=>{
 const s=J(plan().getSnapshot());
 for(const r of [null,{},'null','[]','{}','{',' '.repeat(1025),
  '{"ok":false,"resultCode":"x"}','{"ok":true}',
  '{"resultCode":"x","ok":true}','{"ok":true,"resultCode":"x","extra":0}',
  '{"ok":true,"ok":true,"resultCode":"x"}','{"ok":true,"resultCode":"\\u0078"}',
  ' '+packet('x'),packet('x')+'\n']) bad(s,r);
 for(const c of ['',1,null,'x'.repeat(129),'\x1f','\x7f','x\n','\u0080']) bad(s,packet(c));
});
test('type text reuse',()=>{
 const [d,old]=['../src/service-credit-pilot-client-result-view.d.ts',
  '../src/service-credit-pilot-client-plan.d.ts'].map(p=>readFileSync(new URL(p,import.meta.url),'utf8'));
 a.ok(d.length<=2048&&old.length<=2048);
 a.ok(d.includes("import type { ServiceCreditPilotClientSnapshot } from './service-credit-pilot-client-plan.js';"));
 a.ok(d.includes('snapshot:ServiceCreditPilotClientSnapshot;'));
 a.ok(old.includes('export type ServiceCreditPilotClientSnapshot = Readonly<{'));
});
