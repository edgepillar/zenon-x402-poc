import test from'node:test';
import a from'node:assert/strict';
import{readFileSync}from'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const C='// UNCOMPILED; UNQUALIFIED declared-data only; no runtime authority.\n';
const P='(originalIdentityJson: string, observationsJson: string, resultJson: string)';
test('timeline required strings',()=>{
a.equal(read('../src/service-credit-pilot-client-observation-timeline-html.d.ts'),
C+'export function renderServiceCreditPilotClientObservationTimelineHtml'+P+': string;\n');
});
test('page readonly alias',()=>{
a.equal(read('../src/service-credit-pilot-client-observation-page-response.d.ts'),
C+"import type{ServiceCreditPilotStatusResponse}from'./service-credit-pilot-status-response.js';\n"+
'export function getServiceCreditPilotClientObservationPageResponse'+P+': ServiceCreditPilotStatusResponse;\n');
});
test('inherited readonly response',()=>{
a.equal(read('../src/service-credit-pilot-status-response.d.ts'),
`// Uncompiled declarations: 200 means construction, not service success.
// Types prove no policy enforcement, authority, native freeze, byte length or compiler/runtime qualification.
export interface ServiceCreditPilotStatusResponseHeaders {
  readonly "content-type": "text/html; charset=utf-8";
  readonly "cache-control": "no-store";
  readonly "content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox";
  readonly "referrer-policy": "no-referrer";
  readonly "x-content-type-options": "nosniff";
  readonly "x-frame-options": "DENY";
  readonly "content-length": string;
}

export interface ServiceCreditPilotStatusResponse {
  readonly statusCode: 200;
  readonly headers: ServiceCreditPilotStatusResponseHeaders;
  readonly body: string;
}

export function getServiceCreditPilotStatusResponse(
  originalIdentityJson: string,
  observationJson: string
): ServiceCreditPilotStatusResponse;
`);
});
