import{createServiceCreditPilotClientPlan as c}from'./service-credit-pilot-client-plan.js';
// In-memory unverified declared data; original full bytes/context/custody stay external.
// New owners do not prove global history or rollback resistance or grant reset/retry/recovery authority.
// Bounds are not whole-native memory/CPU/lifetime guarantees.
export function createServiceCreditPilotClientHistoryPlan(originalIdentityJson,initialObservationJson){
const bad=new Error('INVALID_HISTORY_PLAN_INPUT'),valid=x=>typeof x==='string'&&x.length<=1024;
if(arguments.length!==2||!valid(originalIdentityJson)||!valid(initialObservationJson))throw bad;
let a=[initialObservationJson],j=JSON.stringify(a);
if(j.length>8192)throw bad;
const p=c(originalIdentityJson,initialObservationJson);
const pack=(xs,json,latest)=>Object.freeze({originalIdentityJson,observationsJson:json,observationCount:xs.length,latest});
let s=pack(a,j,p.getSnapshot());
return Object.freeze({
observe(o){
if(arguments.length!==1||!valid(o))throw bad;
if(s.latest.closed)throw new Error('CLIENT_PLAN_CLOSED');
if(a.length===16)throw bad;
const next=[...a,o],json=JSON.stringify(next);
if(json.length>8192)throw bad;
const out=pack(next,json,p.observe(o));
a=next;s=out;return s;
},
getSnapshot(){if(arguments.length)throw bad;return s;},
close(){
if(arguments.length)throw bad;
if(!s.latest.closed)s=pack(a,s.observationsJson,p.close());
return s;
}
});
}
