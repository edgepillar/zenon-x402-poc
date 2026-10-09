import { getServiceCreditPilotStatusView as viewOf } from './service-credit-pilot-status-view.js';
const BAD='INVALID_CLIENT_PLAN_INPUT';
/**
 * Declared diagnostics under the DTO's bounds and native-intrinsic premises.
 * No dispatch, durability or restart assurance; original bytes/context stay external.
 * Recreating an owner grants no reset or recovery authority.
 */
export function createServiceCreditPilotClientPlan(originalIdentityJson,initialObservationJson) {
 if(arguments.length!==2) throw new Error(BAD);
 let state;
 function accept(o) {
  const view=viewOf(originalIdentityJson,o);
  if(view.paymentHash===null||view.requestId===null) throw new Error(BAD);
  const {fundingStatus:f,serviceStatus:s}=JSON.parse(o);
  if(state&&state.terminal!==null&&state.terminal!==s) throw new Error('CLIENT_PLAN_REGRESSION');
  const F=state?.fundingUncertain===true||f==='UNKNOWN';
  const U=state?.serviceUncertain===true||s==='OUTCOME_UNKNOWN';
  const nextStep=F&&U?'RECONCILE_FUNDING_AND_REQUEST':F?'RECONCILE_FUNDING'
   :U?'RECONCILE_REQUEST':f==='PENDING'?'OBSERVE_FUNDING'
   :f==='FAILED'?'REVIEW_FUNDING':s==='CLOSED'?'DECLARED_CLOSED'
   :f==='NOT_STARTED'?'REVIEW_FUNDING':s==='EXECUTING'?'OBSERVE_REQUEST'
   :s==='SUCCEEDED'?'READ_ORIGINAL_RESULT_ONLY'
   :s==='UNAVAILABLE'?'REVIEW_AVAILABILITY':'REVIEW_IDENTITY_ADMISSION';
  state=Object.freeze({
   originalIdentityJson,observationJson:o,paymentHash:view.paymentHash,requestId:view.requestId,
   view,fundingUncertain:F,serviceUncertain:U,
   terminal:state?.terminal??(s==='SUCCEEDED'||s==='CLOSED'?s:null),closed:false,nextStep,
   qualification:'UNQUALIFIED',authorization:'NONE',mayStartPayment:false,
   maySignPayment:false,mayDispatchService:false,deliveryConfirmed:false
  });
  return state;
 }
 accept(initialObservationJson);
 return Object.freeze({
  observe(o) {
   if(arguments.length!==1) throw new Error(BAD);
   if(state.closed) throw new Error('CLIENT_PLAN_CLOSED');
   return accept(o);
  },
  getSnapshot() {
   if(arguments.length) throw new Error(BAD);
   return state;
  },
  close() {
   if(arguments.length) throw new Error(BAD);
   if(!state.closed) state=Object.freeze({...state,closed:true,nextStep:'LOCALLY_CLOSED'});
   return state;
  }
 });
}
