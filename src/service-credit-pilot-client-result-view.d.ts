// UNCOMPILED; strings/readonly confer no authenticity, pristine/type-resolution proof.
// Escape raw result text for HTML; no receipt/recovery authority. Original bytes/context stay external.
import type { ServiceCreditPilotClientSnapshot } from './service-credit-pilot-client-plan.js';
export type ServiceCreditPilotClientResultView = Readonly<{
 snapshot:ServiceCreditPilotClientSnapshot;
 resultJson:string;
 resultCode:string;
 retainedUncertainty:boolean;
 evidence:'CALLER_DECLARED_DATA_ONLY';
 qualification:'UNQUALIFIED';
 authorization:'NONE';
 deliveryConfirmed:false;
}>;
export function getServiceCreditPilotClientResultView(snapshotJson:string,resultJson:string):ServiceCreditPilotClientResultView;
