import { renderServiceCreditPilotClientStatusHtml as validate } from './service-credit-pilot-client-status-html.js';
// Local data, not a receipt/wire contract. Escape raw resultCode for HTML.
// False retained uncertainty proves no global absence; native intrinsics assumed.
export function getServiceCreditPilotClientResultView(snapshotJson,resultJson) {
 const bad=new Error('INVALID_CLIENT_RESULT_VIEW_INPUT');
 if(arguments.length!==2||typeof resultJson!=='string'||resultJson.length>1024) throw bad;
 validate(snapshotJson);
 let r;
 try {
  r=JSON.parse(resultJson);
  if(typeof r.resultCode!=='string'||!/^[\x20-\x7e]{1,128}(?![\s\S])/.test(r.resultCode)||
   JSON.stringify({ok:true,resultCode:r.resultCode})!==resultJson) throw bad;
 } catch { throw bad; }
 const p=JSON.parse(snapshotJson);
 const snapshot=Object.freeze({...p,view:Object.freeze({...p.view})});
 return Object.freeze({snapshot,resultJson,resultCode:r.resultCode,
  retainedUncertainty:snapshot.fundingUncertain||snapshot.serviceUncertain,
  evidence:'CALLER_DECLARED_DATA_ONLY',qualification:'UNQUALIFIED',
  authorization:'NONE',deliveryConfirmed:false});
}
