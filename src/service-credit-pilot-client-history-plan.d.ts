// UNCOMPILED; UNQUALIFIED declared-data only; no runtime authority.
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
