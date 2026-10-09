import { createServiceCreditPilotClientPlan as create } from './service-credit-pilot-client-plan.js';
import { renderServiceCreditPilotStatusHtml as latest } from './service-credit-pilot-status-html.js';
// Declared consistency; native intrinsics are premises.
export function renderServiceCreditPilotClientStatusHtml(snapshotJson) {
 const bad=new Error('INVALID_CLIENT_STATUS_HTML_INPUT');
 if(arguments.length!==1||typeof snapshotJson!=='string'||snapshotJson.length>4096) throw bad;
 let v,b;
 try {
  v=JSON.parse(snapshotJson);
  if(Object.getPrototypeOf(v)!==Object.prototype) throw bad;
  for(const k of ['fundingUncertain','serviceUncertain','closed'])
   if(typeof v[k]!=='boolean') throw bad;
  b=create(v.originalIdentityJson,v.observationJson).getSnapshot();
 } catch { throw bad; }
 const f=v.fundingUncertain,s=v.serviceUncertain,c=v.closed;
 if((b.fundingUncertain&&!f)||(b.serviceUncertain&&!s)) throw bad;
 const step=c?'LOCALLY_CLOSED':f&&s?'RECONCILE_FUNDING_AND_REQUEST'
  :f?'RECONCILE_FUNDING':s?'RECONCILE_REQUEST':b.nextStep;
 const expected={...b,fundingUncertain:f,serviceUncertain:s,closed:c,nextStep:step};
 if(JSON.stringify(expected)!==snapshotJson) throw bad;
 return '<section aria-label="Client snapshot"><h2>Client snapshot</h2>'+
  '<p><strong>'+(f?'Retained funding uncertainty: reconcile the original.'
   :'No retained funding uncertainty declared; history unverified.')+'</strong></p>'+
  '<p><strong>'+(s?'Retained service uncertainty: reconcile the original.'
   :'No retained service uncertainty declared; history unverified.')+'</strong></p>'+
  '<p><strong>'+(c?'Locally closed only; provider/server/native cleanup unconfirmed.'
   :'Local plan open; no execution authority.')+'</strong></p>'+
  '<p>Advisory next step (no authorization): '+step+'</p>'+
  '<p>Caller-declared snapshot only; not authenticated history, current READY, funding, delivery or durable recovery. '+
  'Original full bytes/context/custody remain external. Recreating a diagnostic owner grants no reset or recovery authority.</p></section>\n'+
  latest(b.originalIdentityJson,b.observationJson);
}
