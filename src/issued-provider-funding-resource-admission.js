import { types } from 'node:util';
import { Buffer } from 'node:buffer';
import { canonicalJson } from './canonical.js';
import { decodeB64Json, validatePaymentRequired } from './x402-wire.js';
import { captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { captureIssuedFundingGrantRecoveryExpectation, captureIssuedFundingGrantRecoveryRows } from './x402-issued-funding-grant-recovery.js';
import { prepareZenonFundingResource, captureZenonFundingResourceConfiguration } from './service-credit-zenon-funding-evidence.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply;
const RESTORED=F(['RECORDED','JOURNAL','WITNESSED']);
function fail(){throw new TypeError('ISSUED_PROVIDER_FUNDING_RESOURCE_ADMISSION');}
function fields(value,names){
  if(value===null||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==names.length)fail();
  const out={};for(const name of names){const d=D(value,name);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,name,{value:d.value,enumerable:true});}return F(out);
}

/** Shared by the actual native command and owned provider. FRESH keeps the
 * original issuance clock/expiry check. Restoration admits configuration only:
 * no clock/default, issuance, verification, grant or continuation capability. */
export function captureIssuedProviderFundingResourceAdmission(input){
  if(arguments.length!==1||input===null||typeof input!=='object'||types.isProxy(input))fail();
  const mode=D(input,'applicationMode');if(!mode?.enumerable||!Object.hasOwn(mode,'value'))fail();
  if(mode.value!=='FRESH'&&!RESTORED.includes(mode.value))fail();
  const names=['applicationMode','offer','selection','resourceUrl','deriveFundingTerms','authorityProfile'];
  const c=fields(input,mode.value==='FRESH'?[...names,'now']:names);
  const selection=captureIssuedFundingPostServiceSelection(c.selection);
  const common={offer:c.offer,selection,resourceUrl:c.resourceUrl,deriveFundingTerms:c.deriveFundingTerms,authorityProfile:c.authorityProfile};
  const candidate=c.applicationMode==='FRESH'?prepareZenonFundingResource({...common,now:c.now}):captureZenonFundingResourceConfiguration(common);
  return F({applicationMode:c.applicationMode,selection,resourceUrl:c.resourceUrl,offer:candidate.offer,challenge:candidate.challenge,
    authorityRecordDigest:c.applicationMode==='FRESH'?null:candidate.authorityRecordDigest,
    clockEligibilityChecked:c.applicationMode==='FRESH',mayIssueFunding:false,mayActivateGrant:false,authority:'NONE'});
}

/** Rebind the same original persisted challenge and raw authority record before
 * a restored provider is constructed. Independent history pins and two exact
 * bound-row reads remain mandatory. This never refreshes terms or repairs rows. */
export function admitRetainedIssuedProviderFundingResource(input,expectation,authorityRecord,readRows){
  if(arguments.length!==4||typeof authorityRecord!=='string'||!authorityRecord.length||Buffer.byteLength(authorityRecord)>65536
      ||typeof readRows!=='function'||types.isProxy(readRows)||!Object.isFrozen(readRows))fail();
  if(input===null||typeof input!=='object'||types.isProxy(input))fail();
  const mode=D(input,'applicationMode');if(!mode||!Object.hasOwn(mode,'value')||!RESTORED.includes(mode.value))fail();
  const expected=captureIssuedFundingGrantRecoveryExpectation(expectation);
  const selected=captureIssuedProviderFundingResourceAdmission(input);
  const first=captureIssuedFundingGrantRecoveryRows(A(readRows,undefined,[]),selected.selection,selected.resourceUrl,expected);
  const issue=first.row.issue;
  if(issue.authorityRecord!==authorityRecord||issue.authorityRecordDigest!==selected.authorityRecordDigest
      ||canonicalJson(issue.challenge)!==canonicalJson(selected.challenge))fail();
  const required=decodeB64Json(issue.frame?.paymentRequiredHeader,{maxEncodedBytes:5464,maxDecodedBytes:4096});
  validatePaymentRequired(required);
  if(canonicalJson(required)!==canonicalJson(selected.challenge.paymentRequired))fail();
  const last=captureIssuedFundingGrantRecoveryRows(A(readRows,undefined,[]),selected.selection,selected.resourceUrl,expected);
  if(last.rowJson!==first.rowJson)fail();
  return F({applicationMode:selected.applicationMode,rowJson:first.rowJson,boundRowDigest:expected.boundRowDigest,
    outcomeRecordDigest:expected.outcomeRecordDigest,originalTermsMatched:true,clockEligibilityChecked:false,
    historicalObservation:true,outcomeRecordChecked:false,mayIssueFunding:false,mayActivateGrant:false,mayDispatchService:false,authority:'NONE'});
}
