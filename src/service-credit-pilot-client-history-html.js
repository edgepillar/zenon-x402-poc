import{createServiceCreditPilotClientHistoryPlan as c}from'./service-credit-pilot-client-history-plan.js';
import{renderServiceCreditPilotClientStatusHtml as h}from'./service-credit-pilot-client-status-html.js';
export function renderServiceCreditPilotClientHistoryHtml(historySnapshotJson){
const x=historySnapshotJson,bad=new Error('INVALID_HISTORY');
if(arguments.length!==1||typeof x!=='string'||x.length>16384)throw bad;
let v,a;
try{
v=JSON.parse(x);
if(Object.getPrototypeOf(v)!==Object.prototype||typeof v.observationsJson!=='string'||v.observationsJson.length>8192||typeof v.latest?.closed!=='boolean')throw bad;
a=JSON.parse(v.observationsJson);
if(!Array.isArray(a)||a.length<1||a.length>16||a.some(o=>typeof o!=='string'||o.length>1024)||JSON.stringify(a)!==v.observationsJson)throw bad;
}catch{throw bad;}
const p=c(v.originalIdentityJson,a[0]);
for(let n=1;n<a.length;n++)p.observe(a[n]);
const s=v.latest.closed?p.close():p.getSnapshot();
if(JSON.stringify(s)!==x)throw bad;
return '<p>Count: '+s.observationCount+'; unverified caller history/local close; no rollback proof.</p>'+h(JSON.stringify(s.latest));
}
