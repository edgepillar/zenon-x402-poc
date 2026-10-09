import test from 'node:test';
import a from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { getServiceCreditPilotClientStatusResponse as get } from '../src/service-credit-pilot-client-status-response.js';
import { getServiceCreditPilotStatusResponse as policy } from '../src/service-credit-pilot-status-response.js';
import { createServiceCreditPilotClientPlan as create } from '../src/service-credit-pilot-client-plan.js';
const J=JSON.stringify,H='a'.repeat(64),R='synthetic-request',F='UNKNOWN',U='OUTCOME_UNKNOWN';
const I=J({viewVersion:1,paymentHash:H,requestId:R});
const obs=(f='INCLUDED',s='IDLE')=>J({
 viewVersion:1,paymentHash:H,requestId:R,fundingStatus:f,serviceStatus:s
});
const plan=(f,s)=>create(I,obs(f,s)),has=(s,t)=>a.ok(s.includes(t));
const bad=x=>a.throws(()=>get(x),{message:'INVALID_CLIENT_STATUS_HTML_INPUT'});
test('frozen UTF8 response',()=>{
 const text=J(plan().getSnapshot()),base=policy(I,obs()),r=get(text),again=get(text);
 a.deepEqual(Object.keys(r),['statusCode','headers','body']); a.equal(r.statusCode,200);
 a.deepEqual(r.headers,{...base.headers,'content-length':String(Buffer.byteLength(r.body,'utf8'))});
 a.ok(Buffer.byteLength(r.body,'utf8')>r.body.length);
 a.ok(Object.isFrozen(r)&&Object.isFrozen(r.headers));
 a.notStrictEqual(r,again); a.notStrictEqual(r.headers,again.headers);
 a.match(r.body,/^<!doctype html>[\s\S]*<\/html>$/);
});
test('sticky success and close',()=>{
 for(const [f,s,step,close] of [[F,'IDLE','RECONCILE_FUNDING'],
  ['INCLUDED',U,'RECONCILE_REQUEST'],[F,U,'RECONCILE_FUNDING_AND_REQUEST'],
  [F,U,'LOCALLY_CLOSED',true]]) {
  const p=plan(f,s); p.observe(obs('INCLUDED','SUCCEEDED'));
  const v=close?p.close():p.getSnapshot(),body=get(J(v)).body;
  for(const t of [H,R,step,'delivery remains unconfirmed','no authorization']) has(body,t);
  for(const [kind,on] of [['funding',f===F],['service',s===U]]) {
   a.equal(body.includes('Retained '+kind+' uncertainty'),on);
   a.equal(body.includes('No retained '+kind+' uncertainty'),!on);
  }
  if(close) {
   has(body,'Locally closed only; provider/server/native cleanup unconfirmed.');
   a.doesNotMatch(body,/Service reported closed/);
  }
  a.strictEqual(p.getSnapshot(),v);
  a.doesNotMatch(body,/<(?:button|form|a|link|script|input)\b/i);
 }
});
test('invalid snapshot and arity',()=>{
 const text=J(plan().getSnapshot());
 for(const args of [[],[text,text]])
  a.throws(()=>get(...args),{message:'INVALID_CLIENT_STATUS_RESPONSE_INPUT'});
 for(const x of [null,{},'{',' '+text,' '.repeat(4097)]) bad(x);
 for(const k of ['paymentHash','requestId']) {
  const v=JSON.parse(text); v[k]=k==='paymentHash'?'b'.repeat(64):'other'; bad(J(v));
 }
 const v=JSON.parse(J(plan(F,U).getSnapshot()));
 v.fundingUncertain=false; v.serviceUncertain=false; bad(J(v));
});
test('declaration text reuse',()=>{
 const [d,old]=['../src/service-credit-pilot-client-status-response.d.ts',
  '../src/service-credit-pilot-status-response.d.ts'].map(p=>readFileSync(new URL(p,import.meta.url),'utf8'));
 a.ok(d.length<=2048&&old.length<=2048);
 a.equal(d.replace(/\/\/[^\n]*|\s/g,''),
  "importtype{ServiceCreditPilotStatusResponse}from'./service-credit-pilot-status-response.js';"+
  'exportfunctiongetServiceCreditPilotClientStatusResponse(snapshotJson:string):ServiceCreditPilotStatusResponse;');
 a.ok(old.includes('interface ServiceCreditPilotStatusResponse {'));
 a.match(d,/UNCOMPILED/);
});
