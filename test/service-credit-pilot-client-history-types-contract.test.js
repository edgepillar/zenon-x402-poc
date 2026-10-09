import test from'node:test';
import a from'node:assert/strict';
import{readFileSync as read}from'node:fs';
const p=read(new URL('../src/service-credit-pilot-client-history-plan.d.ts',import.meta.url),'utf8');
const h=read(new URL('../src/service-credit-pilot-client-history-html.d.ts',import.meta.url),'utf8');
const r=read(new URL('../src/service-credit-pilot-client-history-receiver.d.ts',import.meta.url),'utf8');
const P=`// UNCOMPILED; UNQUALIFIED declared-data only; no runtime authority.
import type{createServiceCreditPilotClientPlan}from'./service-credit-pilot-client-plan.js';
export type ServiceCreditPilotClientHistorySnapshot=Readonly<{
originalIdentityJson:string;
observationsJson:string;
observationCount:number;
latest:ReturnType<ReturnType<typeof createServiceCreditPilotClientPlan>['getSnapshot']>;
}>;
export type ServiceCreditPilotClientHistoryPlan=Readonly<{
observe:(observationJson:string)=>ServiceCreditPilotClientHistorySnapshot;
getSnapshot:()=>ServiceCreditPilotClientHistorySnapshot;
close:()=>ServiceCreditPilotClientHistorySnapshot;
}>;
export declare function createServiceCreditPilotClientHistoryPlan(originalIdentityJson:string,initialObservationJson:string):ServiceCreditPilotClientHistoryPlan;
`;
const H=`// UNCOMPILED; UNQUALIFIED declared-data only; no runtime authority.
export declare function renderServiceCreditPilotClientHistoryHtml(historySnapshotJson:string):string;
`;
const R=`// UNCOMPILED; UNQUALIFIED declared-data only; no runtime authority.
export type ServiceCreditPilotClientHistoryReceiver=Readonly<{
receive:(nextHistorySnapshotJson:string)=>string;
getSnapshotJson:()=>string;
}>;
export declare function createServiceCreditPilotClientHistoryReceiver(initialHistorySnapshotJson:string):ServiceCreditPilotClientHistoryReceiver;
`;
test('history owner text',()=>a.equal(p,P));
test('history HTML text',()=>a.equal(h,H));
test('history receiver text',()=>a.equal(r,R));
test('text mutation rejection',()=>{
for(const [s,e]of[
[p.replace('observationJson:string','observationJson?:string'),P],
[r.replace('receive:','extra:()=>string;\nreceive:'),R],
[p.replace('import type{','import{'),P]
])a.throws(()=>a.equal(s,e));
});
