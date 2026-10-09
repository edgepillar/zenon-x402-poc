import{createServiceCreditPilotClientHistoryReceiver as c}from'./service-credit-pilot-client-history-receiver.js';
import{renderServiceCreditPilotClientHistoryHtml as h}from'./service-credit-pilot-client-history-html.js';
// Memory-only unverified declared diagnostic display; no delivery/READY/authority or global/durable recovery.
export function createServiceCreditPilotClientHistoryDisplayOwner(initialHistorySnapshotJson){
const bad=new Error('INVALID_HISTORY_DISPLAY_INPUT');
if(arguments.length!==1)throw bad;
let html=h(initialHistorySnapshotJson);
const p=c(initialHistorySnapshotJson);
return Object.freeze({
receive(nextHistorySnapshotJson){
if(arguments.length!==1)throw bad;
if(nextHistorySnapshotJson===p.getSnapshotJson())return html;
const next=h(nextHistorySnapshotJson);
p.receive(nextHistorySnapshotJson);
html=next;return html;
},
getHtml(){if(arguments.length)throw bad;return html;},
getSnapshotJson(){if(arguments.length)throw bad;return p.getSnapshotJson();}
});
}
