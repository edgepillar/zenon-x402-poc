import test from'node:test';
import a from'node:assert/strict';
import{Buffer}from'node:buffer';
import{getServiceCreditPilotClientLifecycleHistoryResponse as get}from'../src/service-credit-pilot-client-lifecycle-history-response.js';
import{getServiceCreditPilotStatusResponse as base}from'../src/service-credit-pilot-status-response.js';
const J=JSON.stringify,I=J({viewVersion:1,paymentHash:'a'.repeat(64),requestId:'zz'});
const o=(f='INCLUDED',s='IDLE')=>J({...JSON.parse(I),fundingStatus:f,serviceStatus:s});
const call=xs=>get(I,J(xs));
const fail=(args,message='INVALID_LIFECYCLE_HISTORY_INPUT')=>a.throws(()=>get(...args),{message});
test('pending without result',()=>{
const b=call([o('PENDING'),o('INCLUDED','EXECUTING')]).body;
a.match(b,/Original service result not supplied/);
a.match(b,/Funding reported pending[\s\S]*Service execution reported/);
});
test('sticky history without result',()=>{
const b=call([o('UNKNOWN','OUTCOME_UNKNOWN'),o('INCLUDED','SUCCEEDED')]).body.split('<li>')[2];
for(const t of ['Retained funding uncertainty','Retained service uncertainty',
'RECONCILE_FUNDING_AND_REQUEST','delivery remains unconfirmed'])a.ok(b.includes(t));
const c=call([o('INCLUDED','CLOSED')]).body;
a.match(c,/No .*cleanup proof[\s\S]*Local plan open[\s\S]*Service reported closed/);
});
test('original and terminal fences',()=>{
fail([I,J([o(),o().replace('zz','x')])],'ORIGINAL_IDENTITY_MISMATCH');
for(const x of ['{',o().replace('zz','<b>')])
fail([I,J([o(),x])],'INVALID_STATUS_VIEW_INPUT');
for(const s of ['SUCCEEDED','CLOSED'])fail([I,J([o('INCLUDED',s),o()])],'CLIENT_PLAN_REGRESSION');
});
test('canonical history bounds',()=>{
for(const args of [[],[I],[I,J([o()]),'extra'],[null,J([o()])],[I,[]]])fail(args);
for(const h of ['{','{}','[]',' '+J([o()]),J([null]),J(Array(17).fill(o())),
J([' '.repeat(1025)]),J(Array(9).fill(' '.repeat(1024)))])fail([I,h]);
a.equal(call(Array(16).fill(o())).body.split('<li>').length,17);
});
test('fixed response policy',()=>{
const p=call([o()]),b=base(I,o());
a.deepEqual(p.headers,{...b.headers,'content-length':String(Buffer.byteLength(p.body,'utf8'))});
a.ok(p.statusCode===200&&[p,p.headers].every(Object.isFrozen));
a.ok(+p.headers['content-length']>p.body.length);
a.match(p.body,/^<!doctype html>[\s\S]*<\/html>$/);
a.doesNotMatch(p.body,/Result code/);
});
