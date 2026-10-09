import test from'node:test';
import a from'node:assert/strict';
import{createServiceCreditPilotClientHistoryDisplayOwner as make}from'../src/service-credit-pilot-client-history-display-owner.js';
import{renderServiceCreditPilotClientHistoryHtml as h}from'../src/service-credit-pilot-client-history-html.js';
import{createServiceCreditPilotClientHistoryPlan as c}from'../src/service-credit-pilot-client-history-plan.js';
const J=JSON.stringify,I=J({viewVersion:1,paymentHash:'a'.repeat(64),requestId:'zz'});
const o=(f='INCLUDED',s='IDLE',i=I)=>J({...JSON.parse(i),fundingStatus:f,serviceStatus:s});
const S=(xs=[o()],i=I,closed=false)=>{const p=c(i,xs[0]);for(const x of xs.slice(1))p.observe(x);return J(closed?p.close():p.getSnapshot());};
const pair=p=>[p.getSnapshotJson(),p.getHtml()];
const check=(p,s)=>a.deepEqual(pair(p),[s,h(s)]);
const accept=(p,s)=>{a.equal(p.receive(s),h(s));check(p,s);};
const reject=(p,s)=>{const b=pair(p);a.throws(()=>p.receive(s));a.deepEqual(pair(p),b);};
const coherent=(p,s)=>{h(s);reject(p,s);};
test('display pairing',()=>{
const s=S(),p=make(s),t=S([o(),o('INCLUDED','EXECUTING')]);
a.ok(Object.isFrozen(p));a.deepEqual(Object.keys(p),['receive','getHtml','getSnapshotJson']);
check(p,s);accept(p,s);accept(p,t);accept(p,t);
});
test('render rejection',()=>{
const s=S(),p=make(s);
for(const v of [null,{},' '+s,s.replace('"observationCount":1','"observationCount":2')])reject(p,v);
});
test('coherent conflicts',()=>{
const p=make(S([o('PENDING'),o()]));
for(const xs of [[o()],[o('FAILED'),o()],[o('FAILED'),o(),o()]])coherent(p,S(xs));
const i=I.replace('zz','xx');
coherent(p,S([o('PENDING','IDLE',i),o('INCLUDED','IDLE',i)],i));
accept(p,S([o('PENDING'),o(),o()]));
});
test('retained uncertainty',()=>{
const u=o('UNKNOWN','OUTCOME_UNKNOWN'),k=o(),p=make(S([u,k]));
for(const s of ['funding','service'])a.ok(p.getHtml().includes('Retained '+s+' uncertainty'));
coherent(p,S([k,k]));accept(p,S([u,k,k]));
});
test('closure separation',()=>{
const s=S(),p=make(s),t=S([o()],I,true);
accept(p,t);a.match(p.getHtml(),/Locally closed only/);
coherent(p,s);coherent(p,S([o(),o()],I,true));accept(p,t);
const x=o('INCLUDED','CLOSED'),q=make(S([x])),v=S([x,x]);
accept(q,v);a.match(q.getHtml(),/Local plan open; no execution authority/);
});
test('arity guards',()=>{
const s=S(),p=make(s),before=pair(p);
for(const args of [[],[s,s]]){a.throws(()=>make(...args));a.throws(()=>p.receive(...args));a.deepEqual(pair(p),before);}
for(const method of ['getHtml','getSnapshotJson']){a.throws(()=>p[method](s));a.deepEqual(pair(p),before);}
});
