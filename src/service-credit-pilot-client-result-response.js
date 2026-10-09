import{getServiceCreditPilotClientResultView as view}from'./service-credit-pilot-client-result-view.js';
import{getServiceCreditPilotClientStatusResponse as policy}from'./service-credit-pilot-client-status-response.js';
import{renderServiceCreditPilotClientStatusHtml as html}from'./service-credit-pilot-client-status-html.js';
import{Buffer}from'node:buffer';
// 200: construction only.
export function getServiceCreditPilotClientResultResponse(snapshotJson,resultJson) {
if(arguments.length!==2) throw new Error('INVALID_CLIENT_RESULT_RESPONSE_INPUT');
const v=view(snapshotJson,resultJson),base=policy(snapshotJson);
const code=v.resultCode.replaceAll('&','&amp;').replaceAll('<','&lt;')
.replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const title='Client — declared data';
const body='<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+title+
'</title></head><body>'+html(snapshotJson)+
'<h2>Result code</h2><p>Caller-declared, unverified result; no receipt or delivery proof.</p><p>'+
code+'</p></body></html>';
return Object.freeze({statusCode:base.statusCode,
headers:Object.freeze({...base.headers,'content-length':String(Buffer.byteLength(body,'utf8'))}),body});
}
