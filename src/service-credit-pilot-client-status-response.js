import { renderServiceCreditPilotClientStatusHtml as render } from './service-credit-pilot-client-status-html.js';
import { getServiceCreditPilotStatusResponse as policy } from './service-credit-pilot-status-response.js';
import { Buffer } from 'node:buffer';
// Diagnostic data; 200 is not acknowledgement.
export function getServiceCreditPilotClientStatusResponse(snapshotJson) {
 if(arguments.length!==1) throw new Error('INVALID_CLIENT_STATUS_RESPONSE_INPUT');
 const fragment=render(snapshotJson);
 const {originalIdentityJson:i,observationJson:o}=JSON.parse(snapshotJson);
 const base=policy(i,o);
 const title='Client snapshot — declared data';
 const body='<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>'+title+
  '</title></head>\n<body><h1>'+title+'</h1>\n'+fragment+'\n</body>\n</html>';
 return Object.freeze({statusCode:base.statusCode,
  headers:Object.freeze({...base.headers,'content-length':String(Buffer.byteLength(body,'utf8'))}),body});
}
