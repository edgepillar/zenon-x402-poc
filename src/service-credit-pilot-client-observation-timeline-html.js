import{getServiceCreditPilotClientObservationResponse as validate}from'./service-credit-pilot-client-observation-response.js';
import{createServiceCreditPilotClientPlan as create}from'./service-credit-pilot-client-plan.js';
import{renderServiceCreditPilotClientStatusHtml as render}from'./service-credit-pilot-client-status-html.js';
export function renderServiceCreditPilotClientObservationTimelineHtml(i,a,r){
if(arguments.length!==3)throw new Error('INVALID_TIMELINE_INPUT');
validate(i,a,r);
const xs=JSON.parse(a),p=create(i,xs[0]);
let out='<section aria-label="Declared observation timeline"><p>Local ordinals only; not authenticated capture, timing or dispatch history.</p><ol>';
for(let n=0;n<xs.length;n++)out+='<li><h3>Observation '+(n+1)+'</h3>'+
render(JSON.stringify(n?p.observe(xs[n]):p.getSnapshot()))+'</li>';
return out+'</ol></section>';
}
