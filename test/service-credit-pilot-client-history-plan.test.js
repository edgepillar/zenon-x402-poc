import test from'node:test';
import a from'node:assert/strict';
import{createServiceCreditPilotClientHistoryPlan as make}from'../src/service-credit-pilot-client-history-plan.js';
const J=JSON.stringify,I=J({viewVersion:1,paymentHash:'a'.repeat(64),requestId:'zz'});
const o=(f='INCLUDED',s='IDLE')=>J({...JSON.parse(I),fundingStatus:f,serviceStatus:s});
const reject=(p,...args)=>{const s=p.getSnapshot();a.throws(()=>p.observe(...args));a.equal(p.getSnapshot(),s);};
test('prefix and immutable snapshots',()=>{
const x=o(),y=o('INCLUDED','EXECUTING'),p=make(I,x),s=p.getSnapshot(),n=p.observe(y);
a.deepEqual(Object.keys(n),['originalIdentityJson','observationsJson','observationCount','latest']);
a.deepEqual([n.originalIdentityJson,s.observationsJson,n.observationsJson,n.observationCount,n.latest.observationJson],[I,J([x]),J([x,y]),2,y]);
a.ok([p,s,n,n.latest,n.latest.view].every(Object.isFrozen));
a.equal(p.getSnapshot(),n);
});
test('rejected append preserves history',()=>{
const p=make(I,o());
for(const x of [o().replace('a'.repeat(64),'b'.repeat(64)),o().replace('zz','xx'),'{',' '+o(),null])reject(p,x);
reject(p);reject(p,o(),o());
p.observe(o('INCLUDED','EXECUTING'));
});
test('bounded original prefix',()=>{
for(const args of [[I],[I,o(),o()],[null,o()],[I,null],['x'.repeat(1025),o()],[I,'x'.repeat(1025)]])a.throws(()=>make(...args));
const p=make(I,o());
for(let n=1;n<16;n++)p.observe(o());
a.equal(p.getSnapshot().observationCount,16);
reject(p,o('UNKNOWN','OUTCOME_UNKNOWN'));
reject(p,'x'.repeat(1025));reject(p,{});
const t=p.close().latest;
a.deepEqual([t.fundingUncertain,t.serviceUncertain],[false,false]);
});
test('uncertainty stays in retained history',()=>{
const x=o('UNKNOWN','OUTCOME_UNKNOWN'),y=o('INCLUDED','SUCCEEDED'),p=make(I,x),s=p.observe(y),v=s.latest;
a.equal(s.observationsJson,J([x,y]));
a.deepEqual([v.fundingUncertain,v.serviceUncertain,v.authorization,v.mayStartPayment,v.maySignPayment,v.mayDispatchService,v.deliveryConfirmed],[true,true,'NONE',false,false,false,false]);
});
test('terminal append rejection',()=>{
for(const t of ['SUCCEEDED','CLOSED']){
const p=make(I,o('INCLUDED',t));reject(p,o());
a.equal(p.getSnapshot().observationCount,1);
}
});
test('local close retains history',()=>{
const p=make(I,o()),b=p.getSnapshot(),s=p.close();
a.deepEqual({...s,latest:b.latest},b);
a.equal(s.latest.closed,true);
a.equal(s.latest.nextStep,'LOCALLY_CLOSED');
a.equal(p.close(),s);reject(p,o());
a.throws(()=>p.getSnapshot(1));a.throws(()=>p.close(1));
a.equal(p.getSnapshot(),s);
});
