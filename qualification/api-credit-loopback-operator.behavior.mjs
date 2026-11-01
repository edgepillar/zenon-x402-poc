// Actual bootstrap/product/selection/coordinator code over declared memory.
// No native launcher, SDK, TLS, SQLite, key or signature implementation loads.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { decodeApiCreditOperatorBootstrap as dp,decodeNonDpApiCreditOperatorBootstrap as decode,bindApiCreditOperatorBootstrap as bind } from '../src/api-credit-operator-bootstrap.js';
import { createNonDpApiCreditOperatorCoordinator } from '../src/api-credit-operator-coordinator.js';
import { consumeSdk105NonDpApiCreditProductSelection as product } from '../src/zenon/sdk105-api-credit-product-profile.js';
import { captureSdk105NonDpApiCreditSelection as publicSelect,captureSdk105NonDpApiCreditSelectionForLocalQualification as localSelect,
  consumeSdk105NonDpApiCreditSelection as consume,requireCurrentSdk105ApiCreditSelection as current } from '../src/zenon/sdk105-api-credit-selection.js';
import { apiCreditOperatorDataFixtures,closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { createApiCreditLinuxProviderDataFixture } from './api-credit-linux-provider.fixture.mjs';
import { captureApiCreditProviderAcceptanceSelection,apiCreditProviderAcceptanceSignerSelection } from './api-credit-linux-provider-contract.mjs';

const F=Object.freeze,checks=[],copy=v=>JSON.parse(JSON.stringify(v));let saved=null;
function check(id,run){checks.push(F({id,run}));}
function fixture(){
  if(saved===null){saved=copy(apiCreditOperatorDataFixtures.publicData());const f=saved.configuration.fundingOptions;
    f.expectedPublicKey=f.materialOptions.publicKey;delete f.materialOptions;delete f.materialWaitMs;}
  const raw=copy(saved);raw.operatorBootstrapVersion=3;raw.productProfileVersion=3;
  raw.loopbackRead={profile:'LOOPBACK_QUALIFICATION_V1',port:4444};
  const endpoint=path=>({route:{hostname:'localhost',ipv4Address:'127.0.0.1',path},timeoutMs:200,closeGraceMs:100});
  raw.configuration.fundingOptions.readSessionOptions={endpoints:[endpoint('/rpc/first'),endpoint('/rpc/second')],accountEndpoint:endpoint('/rpc/account')};
  return raw;
}
function selected(raw=fixture()){
  const calls={key:0,day:0},forbidden=F(()=>{calls.key++;throw Error('unselected key method');});
  const key=F({getAddress:forbidden,getPublicKey:forbidden,sign:forbidden,clear:forbidden});
  const prepared=decode(canonicalJson(raw)),selection=bind(prepared,key,F(()=>{calls.day++;throw Error('unselected day read');}));
  return {raw,prepared,selection,calls};
}
function low(r=selected()){const p=product(r.selection);return {...r,p,low:consume(p.selection)};}
function refused(change){const raw=fixture();change(raw);assert.throws(()=>decode(canonicalJson(raw)),/API_CREDIT_OPERATOR_BOOTSTRAP/);}

check('loopback-bootstrap-v3-admits-only-the-explicit-non-dp-profile-without-credentials',()=>{
  const raw=fixture(),t=decode(canonicalJson(raw));assert.equal(t.operatorBootstrapVersion,3);assert.equal(t.product.productProfileVersion,3);
  assert.equal(t.product.readSessionProfile,'LOOPBACK_QUALIFICATION_V1');assert.equal(t.product.productionRouteQualified,false);
  assert.equal(t.product.nativeAcceptance,'NOT_ESTABLISHED');assert.equal(t.product.fundingResourceUrl,raw.configuration.storeOptions.resourceUrl);t.release();
});
check('loopback-bootstrap-version-profile-marker-and-shape-must-all-match',()=>{
  for(const change of [r=>r.productProfileVersion=2,r=>r.operatorBootstrapVersion=2,r=>delete r.loopbackRead,
    r=>r.loopbackRead.profile='PUBLIC',r=>r.loopbackRead.module='another-loader',r=>r.loopbackRead.ca='another-ca'])refused(change);
});
check('loopback-bootstrap-cannot-select-the-dp-or-legacy-public-decoder',()=>{
  const raw=fixture();assert.throws(()=>dp(canonicalJson(raw)));refused(r=>r.configuration.fundingOptions.materialOptions={});
});
check('loopback-bootstrap-keeps-the-existing-v2-public-route-selection',()=>{
  fixture();const raw=copy(saved),t=decode(canonicalJson(raw));assert.equal(t.operatorBootstrapVersion,2);assert.equal(t.product.productProfileVersion,2);
  assert.equal(Object.hasOwn(t.product,'readSessionProfile'),false);t.release();
  const local=fixture();local.operatorBootstrapVersion=2;local.productProfileVersion=2;delete local.loopbackRead;assert.throws(()=>decode(canonicalJson(local)));
});
check('loopback-bootstrap-has-no-external-address-or-hostname-fallback',()=>{
  for(const value of ['8.8.8.8','0.0.0.0','::1','127.0.0.2'])refused(r=>r.configuration.fundingOptions.readSessionOptions.endpoints[0].route.ipv4Address=value);
  for(const value of ['127.0.0.1','rpc.zenon.network','localhost.invalid'])refused(r=>r.configuration.fundingOptions.readSessionOptions.endpoints[1].route.hostname=value);
});
check('loopback-bootstrap-retains-the-closed-three-role-paths',()=>{
  for(const value of ['/rpc/foreign','/rpc/first?changed','/rpc/../first'])refused(r=>r.configuration.fundingOptions.readSessionOptions.endpoints[0].route.path=value);
  refused(r=>r.configuration.fundingOptions.readSessionOptions.endpoints[1].route.path='/rpc/first');
  refused(r=>r.configuration.fundingOptions.readSessionOptions.accountEndpoint.route.path='/rpc/second');
});
check('loopback-bootstrap-port-is-explicit-unprivileged-and-canonical',()=>{
  for(const port of [1024,65535]){const raw=fixture();raw.loopbackRead.port=port;const t=decode(canonicalJson(raw));t.release();}
  for(const port of [0,1023,65536,1.5,'4444',null])refused(r=>r.loopbackRead.port=port);
});
check('loopback-bootstrap-timing-does-not-relax-the-existing-owner-bounds',()=>{
  refused(r=>r.configuration.fundingOptions.readSessionOptions.endpoints[0].timeoutMs=0);
  refused(r=>r.configuration.fundingOptions.readSessionOptions.accountEndpoint.closeGraceMs=60001);
});
check('loopback-bootstrap-purchase-and-original-terms-are-unchanged',()=>{
  const raw=fixture(),t=decode(canonicalJson(raw)),p=JSON.parse(raw.purchaseExpectationJson);
  assert.equal(t.product.purchase.offerId,p.offer.offerId);assert.equal(t.product.amount,p.terms.requirement.amount);
  assert.equal(t.product.purchase.holderId,p.selection.holderId);assert.equal(t.product.purchase.totalUnits,p.terms.totalUnits);t.release();
});
check('loopback-bootstrap-binding-enters-no-key-or-day-method',()=>{
  const r=selected();assert.deepEqual(r.calls,{key:0,day:0});assert.equal(r.selection.profile.readSessionProfile,'LOOPBACK_QUALIFICATION_V1');r.selection.release();
});
check('loopback-selection-captures-three-equal-distinct-owned-ca-copies',()=>{
  const r=low(),c=r.low.configuration,local=r.low.localReadOptions;
  assert.equal(local.port,4444);assert.ok(Buffer.isBuffer(local.ca));
  const a=c.fundingOptions.fundingTransportOptions.ca,b=c.serviceOptions.transportOptions.ca;
  assert.deepEqual(a,b);assert.deepEqual(a,local.ca);assert.notEqual(a,b);assert.notEqual(a,local.ca);assert.notEqual(b,local.ca);
  current(r.low);r.selection.release();assert.equal(a.every(v=>v===0)&&b.every(v=>v===0)&&local.ca.every(v=>v===0),true);
  assert.deepEqual(r.calls,{key:0,day:0});
});
check('loopback-selection-has-no-work-material-or-nonce-switch',()=>{
  const r=low();for(const key of ['materialOptions','materialWaitMs','startNonce'])assert.equal(Object.hasOwn(r.low.configuration.fundingOptions,key),false);
  r.selection.release();
});
check('loopback-selection-cannot-be-consumed-as-another-original-or-twice',()=>{
  const r=low();assert.throws(()=>consume(r.low));assert.throws(()=>product(r.selection));current(r.low);r.selection.release();assert.throws(()=>current(r.low));
});
check('loopback-selection-input-mutation-cannot-change-the-captured-routes',()=>{
  const r=selected();r.raw.loopbackRead.port=5555;r.raw.configuration.fundingOptions.readSessionOptions.endpoints[0].route.ipv4Address='8.8.8.8';
  const p=product(r.selection),s=consume(p.selection);assert.equal(s.localReadOptions.port,4444);
  assert.equal(s.configuration.fundingOptions.readSessionOptions.endpoints[0].route.ipv4Address,'127.0.0.1');r.selection.release();
});
check('loopback-selection-ca-mutation-before-consumption-refuses-without-a-key-call',()=>{
  const r=selected();r.selection.configuration.fundingOptions.fundingTransportOptions.ca[0]^=1;
  const p=product(r.selection);assert.throws(()=>consume(p.selection));assert.deepEqual(r.calls,{key:0,day:0});r.selection.release();
});
check('loopback-selection-deferred-guard-refuses-any-of-the-three-changed-ca-copies',()=>{
  for(const which of ['funding','service','local']){
    const r=low(),c=r.low.configuration,bytes=which==='funding'?c.fundingOptions.fundingTransportOptions.ca:which==='service'?c.serviceOptions.transportOptions.ca:r.low.localReadOptions.ca;
    bytes[0]^=1;assert.throws(()=>current(r.low));assert.equal(r.low.localReadOptions.ca.every(v=>v===0),true);
    assert.throws(()=>current(r.low));assert.deepEqual(r.calls,{key:0,day:0});r.selection.release();
  }
});
check('loopback-selection-changing-all-ca-copies-does-not-rebind-the-deferred-trust',()=>{
  const r=low(),c=r.low.configuration;for(const b of [c.fundingOptions.fundingTransportOptions.ca,c.serviceOptions.transportOptions.ca,r.low.localReadOptions.ca])b[0]^=1;
  assert.throws(()=>current(r.low));assert.deepEqual(r.calls,{key:0,day:0});r.selection.release();
});
check('loopback-selection-repeated-current-checks-cannot-renew-or-consume-an-owner',()=>{
  const r=low();for(let i=0;i<8;i++)assert.equal(current(r.low),undefined);assert.throws(()=>consume(r.low));r.selection.release();
});
check('loopback-selection-copied-or-proxy-tokens-enter-no-hooks-or-guards',()=>{
  const r=low();let hooks=0;assert.throws(()=>current(F({...r.low})));
  assert.throws(()=>current(new Proxy({},{get(){hooks++;throw Error();}})));assert.equal(hooks,0);r.selection.release();
});
check('loopback-selection-legacy-low-selector-refuses-an-added-local-capability',()=>{
  const r=selected(),p=product(r.selection),configuration=p.selection.configuration;
  assert.throws(()=>publicSelect({configuration,spendingFile:p.selection.spendingFile,spending:p.selection.spending,localReadOptions:F({port:4444,ca:configuration.fundingOptions.fundingTransportOptions.ca})}));
  r.selection.release();
});
check('loopback-selection-explicit-low-selector-requires-the-same-ca-and-port',()=>{
  const r=selected(),p=product(r.selection),c=p.selection;
  for(const localReadOptions of [F({port:4444,ca:Buffer.from('different-ca')}),F({port:443,ca:c.configuration.fundingOptions.fundingTransportOptions.ca})])
    assert.throws(()=>localSelect({configuration:c.configuration,spendingFile:c.spendingFile,spending:c.spending,localReadOptions}));
  r.selection.release();
});
check('loopback-selection-explicit-low-selector-does-not-read-accessors-or-proxies',()=>{
  const r=selected(),p=product(r.selection),c=p.selection;let hooks=0;
  const v={configuration:c.configuration,spendingFile:c.spendingFile,spending:c.spending};Object.defineProperty(v,'localReadOptions',{enumerable:true,get(){hooks++;return {};}});
  assert.throws(()=>localSelect(v));assert.throws(()=>localSelect(new Proxy({},{ownKeys(){hooks++;return [];}})));assert.equal(hooks,0);r.selection.release();
});
check('loopback-selection-current-check-before-consumption-does-not-spend-the-token',()=>{
  const r=selected(),p=product(r.selection);assert.throws(()=>current(p.selection));const s=consume(p.selection);current(s);r.selection.release();
});

async function coordinator(raw){
  const s={credential:0,key:0,session:0,host:0,inputs:0,keyClosed:false,sessionClosed:false,selected:null},fn=F(()=>{throw Error('unselected real key method');});
  const keyPair=F({getAddress:fn,getPublicKey:fn,sign:fn,clear:fn});
  const key=F({keyPair,close:F(()=>{s.keyClosed=true;return Promise.resolve(undefined);}),inspect:F(()=>F({sdk105ExistingKeyLeaseVersion:1,lifecycle:s.keyClosed?'CLOSED':'CLAIMED',held:false,rawClearCalls:s.keyClosed?1:0,rawClearReturned:s.keyClosed}))});
  const session=F({close:F(()=>{s.sessionClosed=true;return Promise.resolve(undefined);}),inspect:F(()=>F({declaredMemory:true}))});
  const ports=F({readProfile:F(g=>{g();return Promise.resolve(Buffer.from(canonicalJson(raw)));}),readCredential:F(g=>{g();s.credential++;return Promise.resolve(Buffer.alloc(32,7));}),
    createKeyLease:F((bytes,identity,g)=>{g();s.key++;return Promise.resolve(key);}),openSession:F((selection,g)=>{g();s.session++;s.selected=selection;
      const p=product(selection),c=consume(p.selection);assert.equal(c.localReadOptions.port,4444);current(c);selection.release();return Promise.resolve(session);}),
    runHost:F(()=>{s.host++;return Promise.resolve(F({buyerOriginalCommandHostResultVersion:1,mode:'FUNDING_API_CREDIT',status:'CLOSED',exitCode:0,ownersClosedObserved:true,
      sessionLifecycle:'CLOSED',sessionHeld:false,outputOutcomeUnknown:false,fundingOutcomeUnknown:false,recoveryOutcomeUnknown:false}));}),
    closeInputs:F(()=>{s.inputs++;return Promise.resolve(undefined);}),readDay:F(()=>{throw Error('unselected day read');}),clock:F(()=>0n),armTimer:F(()=>F({declaredMemoryTimer:true})),cancelTimer:F(()=>{})});
  const owner=createNonDpApiCreditOperatorCoordinator({arguments:{mode:'RUN',profileFd:3,keyFd:4,inputFd:5,outputFd:6,bootstrapMs:1000},ports});
  return {result:await owner.run(),s};
}
check('loopback-coordinator-refuses-incompatible-routes-before-credential-key-and-session',async()=>{
  const raw=fixture();raw.configuration.fundingOptions.readSessionOptions.endpoints[0].route.ipv4Address='8.8.8.8';
  const r=await coordinator(raw);assert.equal(r.result.status,'BOOTSTRAP_REFUSED');assert.equal(r.result.exitCode,1);
  assert.equal(r.s.credential+r.s.key+r.s.session+r.s.host,0);assert.equal(r.s.inputs,1);
});
check('loopback-coordinator-binds-the-existing-product-path-with-declared-owners-only',async()=>{
  const r=await coordinator(fixture());assert.equal(r.result.status,'CLOSED');assert.equal(r.result.exitCode,0);
  assert.equal(r.s.credential,1);assert.equal(r.s.key,1);assert.equal(r.s.session,1);assert.equal(r.s.host,1);assert.equal(r.s.inputs,1);
  assert.equal(r.result.nativeResourceRelease,'NOT_ESTABLISHED');assert.equal(r.result.authority,'NONE');
});
check('loopback-linux-provider-selection-binds-v3-through-the-existing-full-transcript',async()=>{
  const f=await createApiCreditLinuxProviderDataFixture(),raw=JSON.parse(f.input.runProfile),local=fixture();
  raw.operatorBootstrapVersion=3;raw.productProfileVersion=3;raw.loopbackRead=local.loopbackRead;
  raw.configuration.fundingOptions.readSessionOptions=local.configuration.fundingOptions.readSessionOptions;
  const t=captureApiCreditProviderAcceptanceSelection({...f.input,runProfile:canonicalJson(raw)});
  assert.equal(t.summary.selectedBuyerReadProfile,'LOOPBACK_QUALIFICATION_V1');assert.equal(t.summary.buyerPublicReadFallback,false);
  assert.equal(t.summary.publicReadRoutePolicyChanged,false);assert.equal(t.summary.commandFrames,106);assert.equal(t.summary.distinctRequests,100);
  assert.equal(apiCreditProviderAcceptanceSignerSelection(t).summary.version,4);assert.equal(t.summary.nativeFixtureAcceptance,'NOT_ESTABLISHED');
});
check('loopback-bootstrap-result-is-source-selection-not-native-or-chain-acceptance',()=>{
  const r=low();assert.equal(r.p.profile.nativeAcceptance,'NOT_ESTABLISHED');assert.equal(r.p.profile.providerAuthentication,'NOT_ESTABLISHED');
  assert.equal(r.p.profile.productionRouteQualified,false);assert.equal(r.low.configuration.fundingOptions.readSessionOptions.endpoints.length,2);r.selection.release();
});

export const apiCreditLoopbackOperatorDataCases=F(checks);
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const cases=[];for(const {id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??'unknown').slice(0,160),stage:typeof e?.stage==='string'?e.stage:null});break;}}
  await closeApiCreditOperatorDataFixtures();const failed=cases.filter(c=>c.status==='FAIL').length;
  console.log(JSON.stringify({qualification:'G1_NON_DP_LOOPBACK_OPERATOR_DATA',passed:cases.length-failed,failed,cases,nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,
    Linux:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED',G0G5:'OPEN'}));if(failed)process.exitCode=1;
}
