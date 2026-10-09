import{renderServiceCreditPilotClientHistoryHtml as validate}from'./service-credit-pilot-client-history-html.js';
// Memory-only unverified data; no global latest, durable recovery or authority reset.
export function createServiceCreditPilotClientHistoryReceiver(initialHistorySnapshotJson){
const bad=new Error('INVALID_HISTORY_RECEIVER_INPUT');
if(arguments.length!==1)throw bad;
const read=json=>{
validate(json);
const s=JSON.parse(json);
return{json,identity:s.originalIdentityJson,prefix:JSON.parse(s.observationsJson),closed:s.latest.closed};
};
let state=read(initialHistorySnapshotJson);
return Object.freeze({
receive(nextHistorySnapshotJson){
if(arguments.length!==1)throw bad;
if(nextHistorySnapshotJson===state.json)return state.json;
const next=read(nextHistorySnapshotJson);
if(state.closed||next.identity!==state.identity||next.prefix.length<state.prefix.length||
state.prefix.some((o,n)=>o!==next.prefix[n]))throw new Error('HISTORY_RECEIVER_CONFLICT');
state=next;return state.json;
},
getSnapshotJson(){if(arguments.length)throw bad;return state.json;}
});
}
