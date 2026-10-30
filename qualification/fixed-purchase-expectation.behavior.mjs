// Actual purchase/product/bootstrap gates over public DATA and declared memory
// application/credential ports. No native application, SDK, SQL or crypto key.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { canonicalJson } from '../src/canonical.js';
import { encodeB64Json } from '../src/x402-wire.js';
import { captureApiCreditPurchaseExpectation as capture } from '../src/api-credit-purchase-expectation.js';
import { captureSdk105ApiCreditProductSelection as select, consumeSdk105ApiCreditProductSelection as consume,
 bindSdk105ApiCreditProductLifecycle as bindProduct } from '../src/zenon/sdk105-api-credit-product-profile.js';
import { decodeApiCreditOperatorBootstrap as decode, bindApiCreditOperatorBootstrap as bindBootstrap } from '../src/api-credit-operator-bootstrap.js';
import { apiCreditApplicationDataFixtures as applications } from './api-credit-application.behavior.mjs';
import { apiCreditOperatorDataFixtures as operators, closeApiCreditOperatorDataFixtures } from './api-credit-operator.behavior.mjs';
import { purchaseExpectationFixture as fixture, purchaseExpectationIndependentVector as vector } from './api-credit-purchase-expectation.fixture.mjs';

const F=Object.freeze,copy=x=>JSON.parse(JSON.stringify(x)),checks=[],roots=[],selections=[];
function check(id,run){checks.push({id,run});}
function admitted(f=fixture()){return capture(f.purchaseExpectationJson,f.paymentRequiredHeader,f.resourceUrl);}
function mismatch(edit){const original=fixture(),changed=fixture(edit);assert.throws(()=>capture(changed.purchaseExpectationJson,original.paymentRequiredHeader,original.resourceUrl));}
function product(){
 const r=applications.capturedConfiguration(),c=r.input.configuration,{official,...rest}=c.serviceOptions;
 c.serviceOptions={...rest,assetInfo:official.assetInfo,contextLimit:official.contextLimit};
 r.input.productProfileVersion=2;r.input.paymentRequiredHeader=r.h.f.input.challenge.paymentRequiredHeader;
 r.input.purchaseExpectationJson=r.h.f.purchaseExpectationJson;roots.push(r.h);return r;
}
function selected(r){const s=select(r.input);selections.push(s);return s;}
function declaredKey(){const refuse=F(()=>{throw Error('declared key method must not be entered');});return F({getAddress:refuse,getPublicKey:refuse,sign:refuse,clear:refuse});}

check('independent-python-canonical-vector-matches-the-existing-provider-commitment-and-buyer-comparison',()=>{
 const f=fixture();assert.equal(f.purchaseExpectationJson,vector.purchaseExpectationJson);
 assert.equal(canonicalJson(f.paymentRequired),vector.paymentRequiredJson);assert.equal(f.fundingCommitment,vector.fundingCommitment);
 assert.equal(f.expectation.offer.resourceBinding,vector.resourceBinding);
 const result=capture(vector.purchaseExpectationJson,vector.paymentRequiredHeader,f.resourceUrl);
 assert.equal(result.fundingCommitment,vector.fundingCommitment);assert.equal(result.totalUnits,100);assert.equal(result.expiresAt,2000000010000);
});
check('purchase-projection-is-frozen-powerless-data-with-explicit-unestablished-evidence',()=>{
 const r=admitted();assert.ok(Object.isFrozen(r));assert.equal(r.termsSource,'OPERATOR_SELECTED_DECLARED_DATA');
 assert.equal(r.authority,'NONE');assert.equal(r.providerAuthentication,'NOT_ESTABLISHED');assert.equal(r.fundingVerification,'NOT_PERFORMED');
 assert.equal(r.serviceDelivery,'NOT_ESTABLISHED');assert.ok(Object.values(r).every(v=>typeof v!=='function'&&typeof v!=='object'));
 assert.throws(()=>{r.totalUnits=1;});assert.equal(r.totalUnits,100);
});
check('unit-or-absolute-expiry-drift-cannot-match-the-original-header',()=>{
 mismatch(e=>{e.terms.totalUnits=101;});mismatch(e=>{e.terms.expiresAt++;});
});
check('provider-service-and-offer-identity-drift-cannot-match-the-original-header',()=>{
 mismatch(e=>{e.offer.providerId='provider.changed';});mismatch(e=>{e.offer.serviceId='api.changed';});
 mismatch(e=>{e.offer.offerId=e.selection.offerId='offer.changed';});mismatch(e=>{e.offer.offerVersion=e.selection.offerVersion=2;});
});
check('holder-or-capability-drift-cannot-match-the-original-header',()=>{
 mismatch(e=>{e.selection.holderId='holder.changed';});mismatch(e=>{e.selection.capabilityCommitment='sha256:'+'b'.repeat(64);});
});
check('cost-or-funding-policy-identity-and-version-drift-cannot-match-the-original-header',()=>{
 mismatch(e=>{e.offer.costPolicyId='cost.changed';});mismatch(e=>{e.offer.fundingPolicyId=e.terms.fundingPolicyId='funding.changed';});
 mismatch(e=>{e.offer.fundingPolicyVersion=e.terms.fundingPolicyVersion=2;});
});
check('authority-profile-version-verifier-or-record-drift-cannot-match-the-original-header',()=>{
 mismatch(e=>{e.authorityProfile.profileId='authority.changed';});mismatch(e=>{e.authorityProfile.profileVersion=2;});
 mismatch(e=>{e.authorityProfile.verifierVersion=2;});mismatch(e=>{e.authorityProfile.recordDigest='sha256:'+'b'.repeat(64);});
});
check('coherent-chain-genesis-and-confirmation-drift-cannot-match-the-original-header',()=>{
 mismatch(e=>{e.authorityProfile.chainProfile.chainIdentifier=e.terms.requirement.extra.zenonChain.chainIdentifier='73405';});
 mismatch(e=>{e.authorityProfile.chainProfile.genesisMomentumHash=e.terms.requirement.extra.zenonChain.genesisMomentumHash='22'.repeat(32);});
 mismatch(e=>{e.authorityProfile.confirmationPolicy.minimumConfirmations=e.terms.requirement.extra.minimumMomentumConfirmations=3;});
});
check('coherent-price-asset-payee-and-timeout-drift-cannot-match-the-original-header',()=>{
 mismatch(e=>{e.terms.requirement.amount='4';});mismatch(e=>{e.terms.requirement.asset='zts1qsrxxxxxxxxxxxxxmrhjll';});
 mismatch(e=>{e.terms.requirement.payTo='z1qrv8fqk3ha78tpwegtmx2k5qyp6g28kymvqlfy';});mismatch(e=>{e.terms.requirement.maxTimeoutSeconds=59;});
});
check('a-coherent-new-selection-keeps-its-explicit-units-expiry-and-price-without-defaults',()=>{
 const f=fixture(e=>{e.terms.totalUnits=125;e.terms.expiresAt=2000000020000;e.terms.requirement.amount='4';
  e.offer.offerVersion=e.selection.offerVersion=2;e.offer.fundingPolicyVersion=e.terms.fundingPolicyVersion=2;});
 const r=admitted(f);assert.equal(r.totalUnits,125);assert.equal(r.expiresAt,2000000020000);assert.equal(r.offerVersion,2);
 assert.notEqual(r.fundingCommitment,vector.fundingCommitment);
});
check('fewer-than-100-units-refuse-even-with-a-coherent-header-and-100-is-admitted',()=>{
 assert.throws(()=>admitted(fixture(e=>{e.terms.totalUnits=99;})));assert.equal(admitted().totalUnits,100);
});
check('absolute-expiry-is-compared-without-reading-a-clock-or-renewing-a-lifetime',()=>{
 const f=fixture(e=>{e.terms.expiresAt=1;});assert.equal(admitted(f).expiresAt,1);assert.equal(admitted(f).expiresAt,1);
 // Metadata equality intentionally does not establish issuance eligibility.
 assert.equal(admitted(f).fundingVerification,'NOT_PERFORMED');
});
check('missing-economics-or-relative-lifetime-is-refused-instead-of-defaulted',()=>{
 const f=fixture();for(const name of ['totalUnits','expiresAt','requirement']){const e=copy(f.expectation);delete e.terms[name];assert.throws(()=>capture(canonicalJson(e),f.paymentRequiredHeader,f.resourceUrl));}
 const e=copy(f.expectation);e.terms.lifetimeMs=10000;assert.throws(()=>capture(canonicalJson(e),f.paymentRequiredHeader,f.resourceUrl));
});
check('generic-or-changed-resource-tags-are-not-rewritten-into-an-issued-header',()=>{
 const f=fixture();for(const edit of [q=>{q.resource={url:f.resourceUrl,description:'generic',mimeType:'application/json'};},
  q=>{q.resource.tags[1]='0'.repeat(32);},q=>{q.resource.extra='unselected';}]){
  const q=copy(f.paymentRequired);edit(q);const header=encodeB64Json(q);assert.throws(()=>capture(f.purchaseExpectationJson,header,f.resourceUrl));assert.equal(header,encodeB64Json(q));
 }
});
check('resource-binding-and-authority-chain-inconsistency-refuse-before-any-product-owner',()=>{
 const f=fixture();for(const edit of [e=>{e.offer.resourceBinding='sha256:'+'e'.repeat(64);},
  e=>{e.offer.resourceId='resource.changed';},e=>{e.authorityProfile.network='zenon:other';},
  e=>{e.authorityProfile.chainProfile.chainIdentifier='73405';}]){
  const e=copy(f.expectation);edit(e);assert.throws(()=>capture(canonicalJson(e),f.paymentRequiredHeader,f.resourceUrl));
 }
 assert.throws(()=>capture(f.purchaseExpectationJson,f.paymentRequiredHeader,'https://foreign.invalid/funding'));
});
check('expectation-json-must-be-canonical-without-duplicates-or-ambiguous-numbers',()=>{
 const f=fixture(),text=f.purchaseExpectationJson;
 for(const value of [' '+text,text+'\n',text.replace('"purchaseExpectationVersion":1','"purchaseExpectationVersion":1,"purchaseExpectationVersion":1'),
  text.replace('"totalUnits":100','"totalUnits":1e2'),text.replace('"offerVersion":1','"offerVersion":1.0')])assert.throws(()=>capture(value,f.paymentRequiredHeader,f.resourceUrl));
});
check('expectation-json-has-fixed-byte-utf8-type-and-argument-bounds-without-accessor-entry',()=>{
 const f=fixture();let entered=0;const opaque=new Proxy({},{get(){entered++;throw Error('not entered');},getPrototypeOf(){entered++;return null;}});
 for(const value of [undefined,null,opaque,{},[], 'x'.repeat(16385),f.purchaseExpectationJson+'\ud800'])assert.throws(()=>capture(value,f.paymentRequiredHeader,f.resourceUrl));
 assert.throws(()=>capture(f.purchaseExpectationJson,f.paymentRequiredHeader));assert.throws(()=>capture(f.purchaseExpectationJson,f.paymentRequiredHeader,f.resourceUrl,1));
 assert.throws(()=>new capture(f.purchaseExpectationJson,f.paymentRequiredHeader,f.resourceUrl));assert.equal(entered,0);
});
check('purchase-json-is-closed-and-cannot-supply-policy-callbacks-authority-or-activation-ports',()=>{
 const f=fixture();for(const name of ['deriveFundingTerms','now','store','activation','module']){
  const e=copy(f.expectation);e[name]='unselected';assert.throws(()=>capture(canonicalJson(e),f.paymentRequiredHeader,f.resourceUrl));
 }
 const e=copy(f.expectation);e.terms.requirement.extra.authority='READY';assert.throws(()=>capture(canonicalJson(e),f.paymentRequiredHeader,f.resourceUrl));
});
check('fixed-product-v2-exposes-the-same-detached-purchase-without-key-or-day-entry',()=>{
 const r=product(),s=selected(r);assert.equal(s.profile.productProfileVersion,2);assert.equal(s.profile.purchase.fundingCommitment,vector.fundingCommitment);
 assert.equal(s.profile.purchase.totalUnits,100);assert.equal(r.keyCalls+r.clockCalls,0);assert.ok(Object.isFrozen(s.profile.purchase));
});
check('legacy-or-missing-product-expectation-refuses-without-key-or-clock-entry',()=>{
 for(const edit of [r=>{r.input.productProfileVersion=1;},r=>{delete r.input.purchaseExpectationJson;},r=>{r.input.purchaseExpectationJson={};}]){
  const r=product();edit(r);assert.throws(()=>select(r.input));assert.equal(r.keyCalls+r.clockCalls,0);
 }
});
check('real-product-rejects-a-different-purchase-before-native-selection-acquisition',()=>{
 const r=product();r.input.purchaseExpectationJson=fixture(e=>{e.terms.totalUnits=101;}).purchaseExpectationJson;
 assert.throws(()=>select(r.input));assert.equal(r.keyCalls+r.clockCalls,0);assert.equal(r.h.counts.prepares+r.h.counts.funding,0);
});
check('product-capture-detaches-terms-and-the-exact-challenge-from-later-input-mutation',()=>{
 const r=product(),s=selected(r);r.input.purchaseExpectationJson=fixture(e=>{e.terms.totalUnits=101;}).purchaseExpectationJson;r.input.paymentRequiredHeader='bad';
 assert.equal(s.profile.purchase.totalUnits,100);assert.equal(s.profile.purchase.fundingCommitment,vector.fundingCommitment);
 assert.doesNotThrow(()=>s.configuration.serviceOptions.official.validateChallenge(r.h.f.input.challenge.paymentRequired));assert.equal(r.keyCalls+r.clockCalls,0);
});
check('product-preparation-with-a-coherent-new-purchase-cannot-enter-the-spending-or-child-ports',async()=>{
 const r=product(),s=selected(r),root=bindProduct(r.h.root,consume(s).profile),f=fixture(e=>{e.terms.totalUnits=101;}),input=copy(r.h.f.input);
 input.challenge.paymentRequired=copy(f.paymentRequired);input.challenge.paymentRequiredHeader=f.paymentRequiredHeader;
 input.plannerContext.readInput.paymentRequired=copy(f.paymentRequired);input.plannerContext.readInput.accepted=copy(f.paymentRequired.accepts[0]);
 await assert.rejects(root.prepareOriginalFunding(input));assert.equal(r.h.raw(),null);assert.equal(r.h.counts.prepares+r.h.counts.funding,0);
});
check('operator-bootstrap-v2-publishes-the-compared-terms-before-credential-acquisition',()=>{
 const d=operators.publicData(),p=decode(canonicalJson(d));assert.equal(p.operatorBootstrapVersion,2);assert.equal(p.product.productProfileVersion,2);
 assert.equal(p.product.purchase.totalUnits,100);assert.equal(p.product.purchase.fundingCommitment,vector.fundingCommitment);p.release();
});
check('operator-bootstrap-old-versions-and-missing-expectation-have-no-implicit-migration',()=>{
 for(const edit of [d=>{d.operatorBootstrapVersion=1;},d=>{d.productProfileVersion=1;},d=>{delete d.purchaseExpectationJson;}]){
  const d=operators.publicData();edit(d);assert.throws(()=>decode(canonicalJson(d)));
 }
});
check('actual-coordinator-refuses-changed-purchase-before-reading-credential-or-opening-key-session',async()=>{
 const r=operators.declaredOperator({edit:d=>{d.purchaseExpectationJson=fixture(e=>{e.terms.totalUnits=101;}).purchaseExpectationJson;}}),out=await r.start();
 assert.equal(out.status,'BOOTSTRAP_REFUSED');assert.deepEqual(r.trace,['profile','inputs-close']);assert.equal(r.calls.key+r.calls.session+r.calls.host,0);
});
check('actual-coordinator-refuses-a-changed-issued-header-with-unchanged-explicit-purchase',async()=>{
 const r=operators.declaredOperator({edit:d=>{d.paymentRequiredHeader=fixture(e=>{e.terms.expiresAt++;}).paymentRequiredHeader;}}),out=await r.start();
 assert.equal(out.status,'BOOTSTRAP_REFUSED');assert.deepEqual(r.trace,['profile','inputs-close']);assert.equal(r.calls.key+r.calls.session,0);
});
check('bootstrap-binding-rechecks-the-same-captured-terms-and-does-not-call-key-methods',()=>{
 const d=operators.publicData(),p=decode(canonicalJson(d));d.purchaseExpectationJson=fixture(e=>{e.terms.totalUnits=101;}).purchaseExpectationJson;d.paymentRequiredHeader='bad';
 const s=bindBootstrap(p,declaredKey(),F(()=>{throw Error('day reader not entered');}));selections.push(s);
 assert.equal(s.profile.purchase.totalUnits,100);assert.equal(s.profile.purchase.fundingCommitment,vector.fundingCommitment);
 assert.throws(()=>bindBootstrap(p,declaredKey(),F(()=>10)));s.release();
});

const cases=[];for(const{id,run}of checks){try{await run();cases.push({id,status:'PASS'});}catch(e){cases.push({id,status:'FAIL',error:String(e?.message??e)});}}
for(const s of selections)s.release();
for(const h of roots){try{await h.root.close();}catch{}h.input.destroy();h.output.destroy();}
await closeApiCreditOperatorDataFixtures();const failed=cases.filter(c=>c.status!=='PASS').length;
console.log(JSON.stringify({qualification:'G1_FIXED_PURCHASE_EXPECTATION_DATA',passed:cases.length-failed,failed,cases,
 actualProductBootstrapAndCoordinator:true,independentPublicMetadataVector:true,declaredMemoryApplicationAndCredentialPortsOnly:true,
 nativeExecutions:0,SDK:0,SQLite:0,keys:0,signatures:0,sockets:0,nonceSearches:0,nodeChildren:0,actualPrepare:0,payouts:0,
 providerAuthentication:'NOT_ESTABLISHED',nativeDurability:'NOT_ESTABLISHED',serviceDelivery:'NOT_ESTABLISHED',G1:'OPEN',G2:'OPEN'}));
if(failed)process.exitCode=1;
