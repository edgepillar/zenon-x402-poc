// Actual pure resource configuration, fresh preparer and retained-row admission.
// All authority/row/clock inputs are declared synthetic DATA, never signatures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { createFixedZenonFundingPolicy as policy } from '../src/service-credit-zenon-fixed-funding-policy.js';
import { prepareZenonFundingResource as fresh, captureZenonFundingResourceConfiguration as configuration } from '../src/service-credit-zenon-funding-evidence.js';
import { captureIssuedProviderFundingResourceAdmission as capture, admitRetainedIssuedProviderFundingResource as admit } from '../src/issued-provider-funding-resource-admission.js';
import { issuedFundingGrantBoundRowDigest as rowDigest } from '../src/x402-issued-funding-grant-recovery.js';

const F=Object.freeze,clone=v=>JSON.parse(JSON.stringify(v)),checks=[];
function check(id,run){checks.push({id,run});}
function data(){
  const resourceUrl='https://service.example/funding',resourceId='receipt.original';
  const offer={modelVersion:1,providerId:'provider.reference',serviceId:'service.reference',resourceId,
    resourceBinding:'sha256:'+createHash('sha256').update('zenon-x402-service-credit-resource-binding-v1\0').update(canonicalJson({resourceId,resourceUrl})).digest('hex'),
    offerId:'offer.reference',offerVersion:1,costPolicyId:'execution-receipt-unit-v1',fundingPolicyId:'funding.fixed',fundingPolicyVersion:1};
  const selection={offerId:offer.offerId,offerVersion:1,holderId:'z1syntheticpayer',capabilityCommitment:'sha256:'+'a'.repeat(64)};
  const terms={fundingPolicyId:offer.fundingPolicyId,fundingPolicyVersion:1,totalUnits:100,expiresAt:1000,
    requirement:{scheme:'exact',network:'zenon:testnet',asset:'zts1syntheticasset',amount:'7',payTo:'z1syntheticpayee',maxTimeoutSeconds:30,
      extra:{paymentFlow:'upfront',poc:true,settlement:'account-block',zenonChain:{version:1,chainIdentifier:'12345',genesisMomentumHash:'1'.repeat(64)},minimumMomentumConfirmations:2}}};
  const authorityProfile={profileId:'authority.synthetic',profileVersion:1,verifierVersion:1,recordDigest:'sha256:'+'d'.repeat(64),network:'zenon:testnet',
    chainProfile:clone(terms.requirement.extra.zenonChain),confirmationPolicy:{policyId:'zenon.authenticated-momentum-inclusion',policyVersion:1,minimumConfirmations:2}};
  const common={offer,selection,resourceUrl,deriveFundingTerms:policy({offer,selection,terms}),authorityProfile};
  return {common,terms};
}
function fixture(mode='RECORDED'){
  const d=data(),candidate=configuration(d.common),authorityRecord='declared immutable authority DATA';
  const row={issue:{selection:clone(d.common.selection),resourceUrl:d.common.resourceUrl,authorityRecord,authorityRecordDigest:d.common.authorityProfile.recordDigest,
    challenge:clone(candidate.challenge),frame:{paymentRequiredHeader:Buffer.from(JSON.stringify(candidate.challenge.paymentRequired)).toString('base64')}},status:'BOUND',
    binding:{transactionHash:'c'.repeat(64),observerRecordKey:'sha256:'+'b'.repeat(64),observerFileName:'funding-observer-'+'c'.repeat(64)+'.sqlite'}};
  const s={rows:[row],reads:0},expected={boundRowDigest:rowDigest(row),outcomeRecordDigest:'sha256:'+'e'.repeat(64)};
  const read=F(()=>{s.reads++;return s.rows;});return {...d,candidate,authorityRecord,row,s,expected,read,input:{applicationMode:mode,...d.common}};
}

check('retained-resource-static-configuration-equals-fresh-candidate-before-expiry',()=>{const d=data(),a=configuration(d.common),b=fresh({...d.common,now:F(()=>999)});assert.deepEqual(a.offer,b.offer);assert.deepEqual(a.challenge,b.challenge);assert.equal(a.authorityRecordDigest,d.common.authorityProfile.recordDigest);});
check('retained-resource-fresh-still-rejects-at-and-after-original-expiry',()=>{const d=data();for(const now of [1000,1001,Number.MAX_SAFE_INTEGER])assert.throws(()=>capture({applicationMode:'FRESH',...d.common,now:F(()=>now)}));});
check('retained-resource-fresh-enters-the-original-clock-once',()=>{const d=data();let clocks=0;const r=capture({applicationMode:'FRESH',...d.common,now:F(()=>{clocks++;return 999;})});assert.equal(clocks,1);assert.equal(r.clockEligibilityChecked,true);assert.equal(r.mayIssueFunding,false);});
check('retained-resource-all-restored-modes-preserve-the-original-expired-terms',()=>{for(const mode of ['RECORDED','JOURNAL','WITNESSED']){const f=fixture(mode),before=canonicalJson(f.row),r=admit(f.input,f.expected,f.authorityRecord,f.read);assert.equal(r.originalTermsMatched,true);assert.equal(r.clockEligibilityChecked,false);assert.equal(f.candidate.challenge.activationIntent.expiresAt,1000);assert.equal(f.s.reads,2);assert.equal(canonicalJson(f.row),before);}});
check('retained-resource-restoration-has-no-clock-parameter-or-fallback',()=>{const f=fixture();let clocks=0;assert.throws(()=>capture({...f.input,now:F(()=>{clocks++;return 0;})}));assert.equal(clocks,0);});
check('retained-resource-invalid-mode-refuses-before-policy-or-clock',()=>{const d=data();let calls=0;assert.throws(()=>capture({applicationMode:'UNKNOWN',...d.common,deriveFundingTerms:F(()=>{calls++;}),now:F(()=>{calls++;})}));assert.equal(calls,0);});
check('retained-resource-fresh-cannot-enter-the-retained-admission-port',()=>{const f=fixture('FRESH');assert.throws(()=>admit({...f.input,now:F(()=>999)},f.expected,f.authorityRecord,f.read));assert.equal(f.s.reads,0);});
check('retained-resource-missing-or-malformed-independent-pins-refuse-before-row-read',()=>{const f=fixture();for(const expected of [{boundRowDigest:f.expected.boundRowDigest},{...f.expected,boundRowDigest:'bad'}])assert.throws(()=>admit(f.input,expected,f.authorityRecord,f.read));assert.equal(f.s.reads,0);});
check('retained-resource-wrong-bound-pin-refuses-the-original-row',()=>{const f=fixture();assert.throws(()=>admit(f.input,{...f.expected,boundRowDigest:'sha256:'+'f'.repeat(64)},f.authorityRecord,f.read));assert.equal(f.s.reads,1);});
check('retained-resource-no-authority-from-the-unread-outcome-pin',()=>{const f=fixture(),r=admit(f.input,f.expected,f.authorityRecord,f.read);assert.equal(r.outcomeRecordChecked,false);assert.equal(r.outcomeRecordDigest,f.expected.outcomeRecordDigest);for(const k of ['mayIssueFunding','mayActivateGrant','mayDispatchService'])assert.equal(r[k],false);assert.equal(r.authority,'NONE');});
check('retained-resource-configured-expiry-cannot-refresh-the-original',()=>{const f=fixture(),terms={...f.terms,expiresAt:2000};const input={...f.input,deriveFundingTerms:policy({offer:f.common.offer,selection:f.common.selection,terms})};assert.throws(()=>admit(input,f.expected,f.authorityRecord,f.read));assert.equal(f.s.reads,1);});
check('retained-resource-configured-units-cannot-increase-the-original',()=>{const f=fixture(),terms={...f.terms,totalUnits:101};assert.throws(()=>admit({...f.input,deriveFundingTerms:policy({offer:f.common.offer,selection:f.common.selection,terms})},f.expected,f.authorityRecord,f.read));});
check('retained-resource-changed-payee-amount-or-asset-cannot-rebind',()=>{for(const key of ['payTo','amount','asset']){const f=fixture(),terms=clone(f.terms);terms.requirement[key]=key==='amount'?'8':'other';assert.throws(()=>admit({...f.input,deriveFundingTerms:policy({offer:f.common.offer,selection:f.common.selection,terms})},f.expected,f.authorityRecord,f.read));}});
check('retained-resource-foreign-selection-or-resource-refuses',()=>{for(const change of [f=>({...f.input,selection:{...f.common.selection,holderId:'foreign'}}),f=>({...f.input,resourceUrl:'https://other.example/funding'})]){const f=fixture();assert.throws(()=>admit(change(f),f.expected,f.authorityRecord,f.read));}});
check('retained-resource-raw-authority-and-record-digest-must-both-match',()=>{const f=fixture();assert.throws(()=>admit(f.input,f.expected,'other authority',f.read));const q=fixture();q.row.issue.authorityRecordDigest='sha256:'+'f'.repeat(64);q.expected.boundRowDigest=rowDigest(q.row);assert.throws(()=>admit(q.input,q.expected,q.authorityRecord,q.read));});
check('retained-resource-frame-and-challenge-must-describe-the-same-original',()=>{const f=fixture(),required=clone(f.candidate.challenge.paymentRequired);required.accepts[0].amount='8';f.row.issue.frame.paymentRequiredHeader=Buffer.from(JSON.stringify(required)).toString('base64');f.expected.boundRowDigest=rowDigest(f.row);assert.throws(()=>admit(f.input,f.expected,f.authorityRecord,f.read));});
check('retained-resource-row-drift-between-reads-is-not-repaired',()=>{const f=fixture();const read=F(()=>{f.s.reads++;return f.s.reads===1?[f.row]:[];});assert.throws(()=>admit(f.input,f.expected,f.authorityRecord,read));assert.equal(f.s.reads,2);});
check('retained-resource-missing-row-or-promised-row-is-never-awaited-or-created',()=>{for(const rows of [[],Promise.resolve([])]){const f=fixture();assert.throws(()=>admit(f.input,f.expected,f.authorityRecord,F(()=>rows)));}});
check('retained-resource-mode-and-field-getters-are-not-invoked',()=>{let calls=0;for(const name of ['applicationMode','offer']){const f=fixture(),input={...f.input};Object.defineProperty(input,name,{enumerable:true,get(){calls++;return f.input[name];}});assert.throws(()=>capture(input));}assert.equal(calls,0);});
check('retained-resource-proxies-and-extra-fields-refuse-without-entry',()=>{const f=fixture();let calls=0;assert.throws(()=>capture(new Proxy(f.input,{get(){calls++;},getOwnPropertyDescriptor(){calls++;}})));assert.throws(()=>capture({...f.input,refresh:true}));assert.equal(calls,0);});
check('retained-resource-detaches-candidate-from-subsequent-input-mutation',()=>{const d=data(),r=capture({applicationMode:'RECORDED',...d.common}),before=canonicalJson(r);d.common.offer.providerId='other';d.common.selection.holderId='other';d.common.authorityProfile.recordDigest='sha256:'+'f'.repeat(64);assert.equal(canonicalJson(r),before);});
check('retained-resource-policy-is-still-called-with-the-captured-original-selection',()=>{const d=data();let calls=0;const derive=F(input=>{calls++;assert.equal(input.holderId,d.common.selection.holderId);return d.common.deriveFundingTerms(input);});capture({applicationMode:'RECORDED',...d.common,deriveFundingTerms:derive});assert.equal(calls,1);});

export const issuedProviderRetainedResourceDataCases=F([...checks]);
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const cases=[];for(const c of checks){try{c.run();cases.push({id:c.id,status:'PASS'});}catch(e){cases.push({id:c.id,status:'FAIL',error:String(e?.message??'UNKNOWN').slice(0,256)});}}
  const failed=cases.filter(v=>v.status==='FAIL').length;console.log(JSON.stringify({qualification:'G2_ISSUED_PROVIDER_RETAINED_RESOURCE_DATA',passed:cases.length-failed,failed,cases,
    actualFreshAndConfigurationCodecs:true,authorityAndRows:'DECLARED_SYNTHETIC_METADATA',nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
    nativeReopen:'NOT_ESTABLISHED',nativePersistence:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',LinuxAcceptance:'NOT_ESTABLISHED',G0G1G2:'OPEN'}));if(failed)process.exitCode=1;
}
