// UNCOMPILED diagnostics; no TS/type-resolution proof. Readonly is not native freeze.
// Strings prove no bounded canonical JSON/hash/history/custody/READY/authorization/restart/recovery.
// Planner/close/UI grant no reset/signing/dispatch/payment/recovery authority; original full bytes/context stay external.
import type { ServiceCreditPilotStatusView } from './service-credit-pilot-status-view.js';
export type ServiceCreditPilotClientStep =
 'RECONCILE_FUNDING_AND_REQUEST'|'RECONCILE_FUNDING'|'RECONCILE_REQUEST'|
 'OBSERVE_FUNDING'|'REVIEW_FUNDING'|'DECLARED_CLOSED'|'OBSERVE_REQUEST'|
 'READ_ORIGINAL_RESULT_ONLY'|'REVIEW_AVAILABILITY'|'REVIEW_IDENTITY_ADMISSION'|'LOCALLY_CLOSED';
export type ServiceCreditPilotClientSnapshot = Readonly<{
 originalIdentityJson:string;
 observationJson:string;
 paymentHash:string;
 requestId:string;
 view:ServiceCreditPilotStatusView & Readonly<{paymentHash:string;requestId:string}>;
 fundingUncertain:boolean;
 serviceUncertain:boolean;
 terminal:'SUCCEEDED'|'CLOSED'|null;
 closed:boolean;
 nextStep:ServiceCreditPilotClientStep;
 qualification:'UNQUALIFIED';
 authorization:'NONE';
 mayStartPayment:false;
 maySignPayment:false;
 mayDispatchService:false;
 deliveryConfirmed:false;
}>;
export type ServiceCreditPilotClientPlan = Readonly<{
 observe:(observationJson:string)=>ServiceCreditPilotClientSnapshot;
 getSnapshot:()=>ServiceCreditPilotClientSnapshot;
 close:()=>ServiceCreditPilotClientSnapshot;
}>;
export function createServiceCreditPilotClientPlan(originalIdentityJson:string,initialObservationJson:string):ServiceCreditPilotClientPlan;
