import test from'node:test';
import a from'node:assert/strict';
import{createServiceCreditPilotClientHistoryReceiver as make}from'../src/service-credit-pilot-client-history-receiver.js';
import{createServiceCreditPilotClientHistoryPlan as c}from'../src/service-credit-pilot-client-history-plan.js';
import{renderServiceCreditPilotClientHistoryHtml as h}from'../src/service-credit-pilot-client-history-html.js';
const J=JSON.stringify,I=J({viewVersion:1,paymentHash:'a'.repeat(64),requestId:'zz'});
const o=(f='INCLUDED',s='IDLE',i=I)=>J({...JSON.parse(i),fundingStatus:f,serviceStatus:s});
const S=(xs=[o()],i=I,closed=false)=>{const p=c(i,xs[0]);for(const x of xs.slice(1))p.observe(x);return J(closed?p.close():p.getSnapshot());};
const reject=(p,j)=>{const s=p.getSnapshotJson();h(j);a.throws(()=>p.receive(j));a.equal(p.getSnapshotJson(),s);};
test('extension and repeat',()=>{
const s=S(),p=make(s),t=S([o(),o('INCLUDED','EXECUTING')]);
a.deepEqual(Object.keys(p),['receive','getSnapshotJson']);
a.ok(Object.isFrozen(p));
a.equal(p.getSnapshotJson(),s);a.equal(p.receive(s),s);
a.equal(p.receive(t),t);a.equal(p.receive(t),t);a.equal(p.getSnapshotJson(),t);
a.equal(typeof p.getSnapshotJson(),'string');
});
test('coherent truncation',()=>{
const s=S([o('PENDING'),o()]),p=make(s);
reject(p,S([o()]));
const t=S([o('PENDING'),o(),o()]);a.equal(p.receive(t),t);
});
test('coherent prefix rewrite',()=>{
const p=make(S([o('PENDING'),o()]));
for(const xs of [[o('FAILED'),o()],[o('FAILED'),o(),o()]])reject(p,S(xs));
});
test('coherent identity substitution',()=>{
const p=make(S());
for(const i of [I.replace('a'.repeat(64),'b'.repeat(64)),I.replace('zz','xx')])reject(p,S([o('INCLUDED','IDLE',i)],i));
});
test('uncertainty continuity',()=>{
const u=o('UNKNOWN','OUTCOME_UNKNOWN'),s=o('INCLUDED','SUCCEEDED'),p=make(S([u])),t=S([u,s]);
a.equal(p.receive(t),t);
const v=JSON.parse(p.getSnapshotJson()).latest;
a.deepEqual([v.fundingUncertain,v.serviceUncertain],[true,true]);
reject(p,S([o(),s]));
});
test('local close latch',()=>{
const s=S(),p=make(s),t=S([o()],I,true);
a.equal(p.receive(t),t);
reject(p,s);reject(p,S([o(),o()],I,true));
a.equal(p.receive(t),t);a.equal(p.getSnapshotJson(),t);
});
test('reported service closed',()=>{
const x=o('INCLUDED','CLOSED'),s=S([x]),t=S([x,x]),p=make(s);
a.equal(p.receive(t),t);
const v=JSON.parse(p.getSnapshotJson());
a.equal(v.latest.closed,false);a.equal(v.observationCount,2);
});
test('guards and capacity',()=>{
const s=S(),p=make(s);
for(const args of [[],[s,s],[null],[{}],[' '+s],[' '.repeat(16385)]]){
a.throws(()=>make(...args));a.throws(()=>p.receive(...args));a.equal(p.getSnapshotJson(),s);
}
a.throws(()=>p.getSnapshotJson(s));a.equal(p.getSnapshotJson(),s);
const t=S(Array(16).fill(o())),q=make(t),v=JSON.parse(t);
v.observationsJson=J(Array(17).fill(o()));v.observationCount=17;
a.throws(()=>q.receive(J(v)));a.equal(q.getSnapshotJson(),t);
});
