import{createServiceCreditPilotClientPlan as c}from'./service-credit-pilot-client-plan.js';
import{renderServiceCreditPilotClientStatusHtml as h}from'./service-credit-pilot-client-status-html.js';
import{getServiceCreditPilotStatusResponse as p}from'./service-credit-pilot-status-response.js';
import{Buffer}from'node:buffer';
export function getServiceCreditPilotClientLifecycleHistoryResponse(originalIdentityJson,observationsJson){
const i=originalIdentityJson,j=observationsJson,bad=new Error('INVALID_LIFECYCLE_HISTORY_INPUT');
if(arguments.length!==2||typeof i!=='string'||typeof j!=='string'||j.length>8192)throw bad;
let a;
try{a=JSON.parse(j);}catch{throw bad;}
if(!Array.isArray(a)||a.length<1||a.length>16)throw bad;
for(const x of a)if(typeof x!=='string'||x.length>1024)throw bad;
if(JSON.stringify(a)!==j)throw bad;
const q=c(i,a[0]),s=[q.getSnapshot()];
for(let n=1;n<a.length;n++)s.push(q.observe(a[n]));
const b=p(i,a[a.length-1]);
let body='<!doctype html><html lang="en"><head><meta charset="utf-8"><title>History — declared data</title></head><body><p>Original service result not supplied.</p><p>Unverified order; local ordinals only. No timing, dispatch, receipt or cleanup proof.</p><ol>';
body+=s.map(x=>'<li>'+h(JSON.stringify(x))+'</li>').join('')+'</ol></body></html>';
return Object.freeze({statusCode:b.statusCode,
headers:Object.freeze({...b.headers,'content-length':String(Buffer.byteLength(body,'utf8'))}),body});
}
