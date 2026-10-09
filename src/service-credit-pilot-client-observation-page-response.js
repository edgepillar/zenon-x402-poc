import{getServiceCreditPilotClientObservationResponse as v}from'./service-credit-pilot-client-observation-response.js';
import{renderServiceCreditPilotClientObservationTimelineHtml as h}from'./service-credit-pilot-client-observation-timeline-html.js';
import{Buffer}from'node:buffer';
export function getServiceCreditPilotClientObservationPageResponse(i,a,r){
if(arguments.length!==3)throw new Error('INVALID_PAGE_INPUT');
const b=v(i,a,r),m='<h2>Result code</h2>',n=b.body.indexOf(m);
if(n<0||n!==b.body.lastIndexOf(m))throw new Error('INVALID_RESULT_MARKER');
const body=b.body.slice(0,n)+h(i,a,r)+b.body.slice(n);
return Object.freeze({statusCode:b.statusCode,
headers:Object.freeze({...b.headers,'content-length':String(Buffer.byteLength(body,'utf8'))}),body});
}
