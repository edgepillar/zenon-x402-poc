// Actual inert configuration/selection owners and declared memory ports only.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../src/canonical.js';
import { apiCreditApplicationDataFixtures as fixtures } from './api-credit-application.behavior.mjs';
import { captureApiCreditCliArguments } from '../src/api-credit-cli-arguments.js';
import { captureNativeFundingServiceOperationalConfiguration as captureDpOperational,
  captureNativeNonDpFundingServiceOperationalConfiguration as captureOperational } from '../src/zenon/native-funding-service-configuration.js';
import { captureSdk105NonDpFundingServiceConfiguration as captureConfiguration } from '../src/zenon/sdk105-funding-service-lifecycle.js';
import { captureSdk105ApiCreditSelection as selectDp, consumeSdk105ApiCreditSelection as consumeDp,
  captureSdk105NonDpApiCreditSelection as select, consumeSdk105NonDpApiCreditSelection as consume } from '../src/zenon/sdk105-api-credit-selection.js';
import { captureSdk105ApiCreditProductSelection as selectDpProduct, assertSdk105ApiCreditProductSelection as assertDpProduct,
  consumeSdk105ApiCreditProductSelection as consumeDpProduct, captureSdk105NonDpApiCreditProductOperatorData as admitProduct,
  captureSdk105NonDpApiCreditProductSelection as selectProduct, assertSdk105NonDpApiCreditProductSelection as assertProduct,
  consumeSdk105NonDpApiCreditProductSelection as consumeProduct } from '../src/zenon/sdk105-api-credit-product-profile.js';
import { decodeApiCreditOperatorBootstrap as decodeDp, decodeNonDpApiCreditOperatorBootstrap as decode,
  bindApiCreditOperatorBootstrap as bind } from '../src/api-credit-operator-bootstrap.js';
import { createNonDpApiCreditOperatorCoordinator as coordinate } from '../src/api-credit-operator-coordinator.js';

const F = Object.freeze, checks = [], roots = [], copy = value => JSON.parse(JSON.stringify(value));
const FUNDING_FIELDS = ['deadlineMs','expectedPublicKey','fundingTransportOptions','readSessionOptions'];
function check(id,run) { checks.push({id,run}); }
function fixture(nonDp = true) {
  const r = fixtures.capturedConfiguration(); roots.push(r.h.root);
  if (nonDp) {
    const f = r.input.configuration.fundingOptions, publicKey = f.materialOptions.publicKey;
    delete f.materialOptions; delete f.materialWaitMs; f.expectedPublicKey = publicKey;
  }
  return r;
}
function operational(r) {
  const {keyPair,expectedAddress,...fundingOptions} = r.input.configuration.fundingOptions;
  return {...r.input.configuration,fundingOptions};
}
function product(r, keyless = false) {
  const c = r.input.configuration, {official,...service} = c.serviceOptions;
  const {keyPair,...withoutKey} = c.fundingOptions;
  return {...r.input, productProfileVersion:2, paymentRequiredHeader:r.h.f.input.challenge.paymentRequiredHeader,
    purchaseExpectationJson:r.h.f.purchaseExpectationJson,
    configuration:{...c,fundingOptions:keyless?withoutKey:c.fundingOptions,
      serviceOptions:{...service,assetInfo:official.assetInfo,contextLimit:official.contextLimit}},
    spending:keyless?{paymentId:r.input.spending.paymentId}:r.input.spending};
}
function bootstrap(r) {
  const c = product(r,true), f = c.configuration.fundingOptions, s = c.configuration.serviceOptions;
  const {ca:fundingCa,...ft} = f.fundingTransportOptions, {ca:serviceCa,...st} = s.transportOptions;
  return {operatorBootstrapVersion:2,productProfileVersion:2,paymentRequiredHeader:c.paymentRequiredHeader,
    purchaseExpectationJson:c.purchaseExpectationJson,publicCaPem:'-----BEGIN CERTIFICATE-----\nU1lOVEhFVElDLURBVEE=\n-----END CERTIFICATE-----\n',
    configuration:{...c.configuration,fundingOptions:{...f,fundingTransportOptions:ft},serviceOptions:{...s,transportOptions:st}},
    spendingFile:c.spendingFile,spending:c.spending,limits:{}};
}
function noKeyCalls(r) { assert.equal(r.keyCalls,0); assert.equal(r.clockCalls,0); }
check('non-dp-operational-configuration-has-identity-without-work-or-material-fields',()=>{
  const r=fixture(), c=captureOperational(operational(r));
  assert.deepEqual(Object.keys(c.fundingOptions).sort(),FUNDING_FIELDS);
  assert.equal(c.fundingOptions.expectedPublicKey,r.input.configuration.fundingOptions.expectedPublicKey);
  assert.ok(Object.isFrozen(c.fundingOptions));noKeyCalls(r);
});
check('non-dp-operational-admission-rejects-every-work-field-without-reading-getters',()=>{
  let entered=0;
  for(const name of ['materialOptions','materialWaitMs','startNonce','maxAttempts','maxDifficulty']) {
    const r=fixture(),c=operational(r);Object.defineProperty(c.fundingOptions,name,{enumerable:true,get(){entered++;throw Error('getter');}});
    assert.throws(()=>captureOperational(c));noKeyCalls(r);
  }
  assert.equal(entered,0);
});
check('non-dp-operational-public-key-is-explicit-and-canonical-32-byte-data',()=>{
  for(const key of [undefined,null,'','A'.repeat(44),'A'.repeat(42)+'==',Buffer.alloc(31).toString('base64')]) {
    const r=fixture(),c=operational(r);c.fundingOptions.expectedPublicKey=key;assert.throws(()=>captureOperational(c));noKeyCalls(r);
  }
  const r=fixture(),c=operational(r);delete c.fundingOptions.expectedPublicKey;assert.throws(()=>captureOperational(c));
});
check('non-dp-keeps-public-read-routing-and-rejects-a-local-qualification-mode',()=>{
  const r=fixture(),c=operational(r), reads=c.fundingOptions.readSessionOptions;
  c.fundingOptions.readSessionOptions=F({...reads,endpoints:F([reads.endpoints[0],reads.endpoints[0]])});
  assert.throws(()=>captureOperational(c));assert.throws(()=>captureOperational(operational(r),'LOCAL_QUALIFICATION'));noKeyCalls(r);
});
check('non-dp-keeps-one-funding-request-and-existing-close-deadline-bounds',()=>{
  for(const edit of [c=>{c.fundingOptions.fundingTransportOptions={...c.fundingOptions.fundingTransportOptions,maxRequestStarts:2};},
    c=>{c.fundingOptions.deadlineMs=0;},c=>{c.serviceOptions.transportOptions={...c.serviceOptions.transportOptions,maxConcurrentRequests:2};}]) {
    const r=fixture(),c=operational(r);edit(c);assert.throws(()=>captureOperational(c));noKeyCalls(r);
  }
});
check('non-dp-keeps-original-store-and-service-path-relationship',()=>{
  const r=fixture(),c=operational(r);c.storeOptions={...c.storeOptions,allowedRoot:'/unrelated-root'};assert.throws(()=>captureOperational(c));noKeyCalls(r);
});
check('non-dp-and-dp-operational-grammars-never-infer-or-downgrade-each-other',()=>{
  const a=fixture(),b=fixture(false);assert.throws(()=>captureDpOperational(operational(a)));assert.throws(()=>captureOperational(operational(b)));
  assert.doesNotThrow(()=>captureDpOperational(operational(b)));noKeyCalls(a);noKeyCalls(b);
});
check('non-dp-existing-key-configuration-preserves-the-exact-key-object',()=>{
  const r=fixture(),c=captureConfiguration(r.input.configuration);assert.equal(c.walletOptions.keyPair,r.input.configuration.fundingOptions.keyPair);
  assert.equal(c.walletOptions.expectedPublicKey,r.input.configuration.fundingOptions.expectedPublicKey);
  assert.deepEqual(Object.keys(c.fundingOptions).sort(),FUNDING_FIELDS);noKeyCalls(r);
});
check('non-dp-selection-detaches-public-ca-without-entering-key-or-day-capabilities',()=>{
  const r=fixture(),s=select(r.input),ca=s.configuration.fundingOptions.fundingTransportOptions.ca;
  assert.notEqual(ca,r.ca);assert.deepEqual(ca,r.ca);assert.equal(consume(s),s);noKeyCalls(r);s.release();
  assert.ok(ca.every(x=>x===0));assert.ok(r.ca.some(x=>x!==0));
});
check('legacy-selection-consumer-refuses-non-dp-without-consuming-it',()=>{
  const r=fixture(),s=select(r.input);assert.throws(()=>consumeDp(s));assert.equal(consume(s),s);assert.throws(()=>consume(s));s.release();noKeyCalls(r);
});
check('non-dp-selection-consumer-refuses-dp-without-consuming-it',()=>{
  const r=fixture(false),s=selectDp(r.input);assert.throws(()=>consume(s));assert.equal(consumeDp(s),s);s.release();noKeyCalls(r);
});
check('non-dp-selection-identity-cannot-be-cloned-or-forged-by-copying-its-fields',()=>{
  const r=fixture(),s=select(r.input);assert.throws(()=>consume(F({...s})));assert.equal(consume(s),s);s.release();noKeyCalls(r);
});
check('non-dp-released-selection-never-reenters-configuration-custody',()=>{
  const r=fixture(),s=select(r.input);s.release();s.release();assert.throws(()=>consume(s));assert.throws(()=>consumeDp(s));noKeyCalls(r);
});
check('non-dp-caller-cannot-add-a-work-mode-loader-or-factory-to-selection-data',()=>{
  for(const field of ['nonDp','mode','keyLoader','module','materialExchange']) {
    const r=fixture();r.input[field]='unused';assert.throws(()=>select(r.input));noKeyCalls(r);
  }
});
check('non-dp-keyless-product-admission-uses-only-public-identity-and-original-offer',()=>{
  const r=fixture(),c=admitProduct(product(r,true));assert.equal(c.walletIdentity.expectedPublicKey,r.input.configuration.fundingOptions.expectedPublicKey);
  assert.equal(c.profile.fundingResourceUrl,r.h.f.resourceUrl);assert.equal(c.profile.nativeAcceptance,'NOT_ESTABLISHED');
  assert.deepEqual(Object.keys(c.configuration.fundingOptions).sort(),FUNDING_FIELDS);noKeyCalls(r);
});
check('non-dp-product-retains-the-100-request-floor-and-spending-recipient-checks',()=>{
  for(const edit of [c=>{c.configuration.serviceOptions.transportOptions={...c.configuration.serviceOptions.transportOptions,maxRequestStarts:99};},
    c=>{c.spendingFile.storageProfile.policy={...c.spendingFile.storageProfile.policy,recipients:['foreign']};}]) {
    const r=fixture(),c=product(r,true);edit(c);assert.throws(()=>admitProduct(c));noKeyCalls(r);
  }
});
check('non-dp-product-public-address-must-still-match-the-spending-account',()=>{
  const r=fixture(),c=product(r,true);c.configuration.fundingOptions={...c.configuration.fundingOptions,expectedAddress:'foreign'};
  assert.throws(()=>admitProduct(c));noKeyCalls(r);
});
check('non-dp-product-token-is-inert-and-preserves-the-original-key-identity',()=>{
  const r=fixture(),s=selectProduct(product(r));assert.equal(assertProduct(s),s);assert.equal(s.configuration.fundingOptions.keyPair,r.input.configuration.fundingOptions.keyPair);
  const t=consumeProduct(s);assert.equal(consume(t.selection),t.selection);s.release();noKeyCalls(r);
});
check('legacy-product-assertion-and-consumer-refuse-non-dp-before-consumption',()=>{
  const r=fixture(),s=selectProduct(product(r));assert.throws(()=>assertDpProduct(s));assert.throws(()=>consumeDpProduct(s));
  assert.equal(assertProduct(s),s);consumeProduct(s);assert.throws(()=>consumeProduct(s));s.release();noKeyCalls(r);
});
check('non-dp-product-assertion-and-consumer-refuse-legacy-dp-before-consumption',()=>{
  const r=fixture(false),s=selectDpProduct(product(r));assert.throws(()=>assertProduct(s));assert.throws(()=>consumeProduct(s));
  assert.equal(assertDpProduct(s),s);consumeDpProduct(s);s.release();noKeyCalls(r);
});
check('non-dp-product-token-clone-and-released-token-never-acquire-authority',()=>{
  const r=fixture(),s=selectProduct(product(r));assert.throws(()=>assertProduct(F({...s})));s.release();assert.throws(()=>assertProduct(s));noKeyCalls(r);
});
check('non-dp-bootstrap-admits-public-identity-without-dummy-work-fields',()=>{
  const r=fixture(),p=decode(canonicalJson(bootstrap(r)));assert.equal(p.expectedIdentity.expectedPublicKey,r.input.configuration.fundingOptions.expectedPublicKey);
  assert.equal(p.product.nativeAcceptance,'NOT_ESTABLISHED');assert.ok(p.limits.maxCommands>=106);p.release();noKeyCalls(r);
});
check('bootstrap-parser-selection-is-fixed-and-never-chosen-by-json-work-or-mode',()=>{
  const a=fixture(),b=fixture(false);assert.throws(()=>decodeDp(canonicalJson(bootstrap(a))));assert.throws(()=>decode(canonicalJson(bootstrap(b))));
  const old=decodeDp(canonicalJson(bootstrap(b)));old.release();
  for(const field of ['nonDp','mode','materialOptions','module']) {const data=bootstrap(a);data[field]='unused';assert.throws(()=>decode(canonicalJson(data)));}
  noKeyCalls(a);noKeyCalls(b);
});
check('non-dp-bootstrap-binding-preserves-typed-selection-and-is-one-use',()=>{
  const r=fixture(),p=decode(canonicalJson(bootstrap(r))),s=bind(p,r.input.configuration.fundingOptions.keyPair,r.input.spending.readDay);
  assert.equal(assertProduct(s),s);assert.throws(()=>assertDpProduct(s));assert.throws(()=>bind(p,r.input.configuration.fundingOptions.keyPair,r.input.spending.readDay));
  const q=consumeProduct(s);assert.equal(consume(q.selection),q.selection);s.release();noKeyCalls(r);
});
check('non-dp-bootstrap-release-prevents-later-binding-without-key-entry',()=>{
  const r=fixture(),p=decode(canonicalJson(bootstrap(r)));p.release();p.release();assert.throws(()=>bind(p,r.input.configuration.fundingOptions.keyPair,r.input.spending.readDay));noKeyCalls(r);
});
check('non-dp-bootstrap-rejects-a-missing-public-key-before-credential-binding',()=>{
  const r=fixture(),data=bootstrap(r);delete data.configuration.fundingOptions.expectedPublicKey;assert.throws(()=>decode(canonicalJson(data)));noKeyCalls(r);
});
function declaredCoordinator(nonDpProfile=true,options={}) {
  const r=fixture(nonDpProfile),keyPair=r.input.configuration.fundingOptions.keyPair;
  const q={trace:[],credential:Buffer.alloc(32,9),profile:Buffer.from(canonicalJson(bootstrap(r))),keyStops:0,sessionStops:0,inputs:0,timers:[]};
  const key=F({keyPair,close:F(()=>{q.keyStops++;return Promise.resolve(undefined);}),inspect:F(()=>F({sdk105ExistingKeyLeaseVersion:1,lifecycle:'CLOSED',held:false,rawClearCalls:1,rawClearReturned:true}))});
  const session=F({close:F(()=>{q.sessionStops++;return Promise.resolve(undefined);}),inspect:F(()=>F({declaredSession:true}))});
  const ports=F({
    readProfile:F(g=>{g();q.trace.push('profile');return Promise.resolve(q.profile);}),
    readCredential:F(g=>{g();q.trace.push('credential');return Promise.resolve(q.credential);}),
    createKeyLease:F((bytes,identity,g)=>{g();q.trace.push('key');assert.equal(bytes,q.credential);assert.equal(identity.expectedPublicKey,r.input.configuration.fundingOptions.expectedPublicKey);return Promise.resolve(key);}),
    openSession:F((selection,g,limits)=>{g();q.trace.push('session');assert.equal(assertProduct(selection),selection);assert.ok(limits.maxCommands>=106);selection.release();return Promise.resolve(session);}),
    runHost:F(s=>{q.trace.push('host');assert.equal(s,session);return options.runHost?options.runHost():Promise.resolve(F({buyerOriginalCommandHostResultVersion:1,mode:'FUNDING_API_CREDIT',status:'CLOSED',exitCode:0,
      ownersClosedObserved:true,sessionLifecycle:'CLOSED',sessionHeld:false,outputOutcomeUnknown:false,fundingOutcomeUnknown:false,recoveryOutcomeUnknown:false}));}),
    closeInputs:F(()=>{q.inputs++;return Promise.resolve(undefined);}),readDay:r.input.spending.readDay,clock:F(()=>0n),
    armTimer:F((budget,callback)=>{const token={budget,callback};q.timers.push(token);return token;}),cancelTimer:F(()=>{})});
  q.coordinator=coordinate({arguments:captureApiCreditCliArguments(['--profile-fd','3','--key-fd','4','--input-fd','5','--output-fd','6','--bootstrap-ms','1000']),ports});
  q.fixture=r;return q;
}
check('fixed-non-dp-coordinator-admits-profile-before-credential-and-transfers-the-same-selection',async()=>{
  const q=declaredCoordinator(),result=await q.coordinator.run();assert.deepEqual(q.trace,['profile','credential','key','session','host']);
  assert.equal(result.status,'CLOSED');assert.equal(result.exitCode,0);assert.equal(q.keyStops,1);assert.equal(q.sessionStops,1);assert.equal(q.inputs,1);
  assert.ok(q.credential.every(x=>x===0));assert.ok(q.profile.every(x=>x===0));noKeyCalls(q.fixture);
});
check('fixed-non-dp-coordinator-refuses-dp-profile-before-reading-a-credential',async()=>{
  const q=declaredCoordinator(false);const result=await q.coordinator.run();assert.deepEqual(q.trace,['profile']);assert.equal(result.exitCode,1);
  assert.equal(q.keyStops,0);assert.equal(q.sessionStops,0);assert.equal(q.inputs,1);noKeyCalls(q.fixture);
});
check('fixed-non-dp-coordinator-keeps-unknown-host-output-held-without-another-session',async()=>{
  const q=declaredCoordinator(true,{runHost:()=>Promise.reject(new Error('declared lost host response'))});
  const result=await q.coordinator.run();assert.equal(result.status,'CLOSE_UNKNOWN');assert.equal(result.exitCode,4);assert.equal(q.trace.filter(x=>x==='session').length,1);
  assert.equal(q.keyStops,1);assert.equal(q.sessionStops,1);noKeyCalls(q.fixture);
});
export const nonDpConfigurationDataCases=F(checks.map(F));
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const results=[];
  for(const c of checks) {try {await c.run();results.push({id:c.id,status:'PASS'});}catch(e){results.push({id:c.id,status:'FAIL',message:String(e?.message??e)});break;}}
  for(const root of roots) await root.close();
  const passed=results.filter(c=>c.status==='PASS').length,failed=results.filter(c=>c.status==='FAIL').length;
  process.stdout.write(JSON.stringify({qualification:'G1_NON_DP_CONFIGURATION_DATA',passed,failed,cases:results,
    nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
    componentTimers:'DECLARED_CALLBACKS_ONLY',profileAndSelectionCustody:'ACTUAL_SOURCE',G0G5Acceptance:'OPEN'})+'\n');
  if(failed)process.exitCode=1;
}
