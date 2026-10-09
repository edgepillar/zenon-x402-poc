import{createServiceCreditPilotClientPlan as c}from'./service-credit-pilot-client-plan.js';
import{getServiceCreditPilotClientResultResponse as r}from'./service-credit-pilot-client-result-response.js';
// No reset/recovery authority.
export function getServiceCreditPilotClientObservationResponse(originalIdentityJson,observationsJson,resultJson){
const bad=new Error('INVALID_HISTORY');
if(arguments.length!==3)throw bad;
for(const v of arguments) if(typeof v!=='string')throw bad;
if(observationsJson.length>8192)throw bad;
let a;
try{a=JSON.parse(observationsJson);}catch{throw bad;}
if(!Array.isArray(a)||a.length<1||a.length>16)throw bad;
for(const s of a) if(typeof s!=='string'||s.length>1024)throw bad;
if(JSON.stringify(a)!==observationsJson)throw bad;
const p=c(originalIdentityJson,a[0]);
for(let n=1;n<a.length;n++)p.observe(a[n]);
return r(JSON.stringify(p.getSnapshot()),resultJson);
}
