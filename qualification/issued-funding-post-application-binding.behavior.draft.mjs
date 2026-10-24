// Actual pure application-binding/custody code. All issuance, BOUND, grant and
// TLS-event inputs are DECLARED DATA, not SDK, SQL, signatures or native proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync,lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIssuedFundingPostApplicationBinding as CREATE,
  captureIssuedFundingPostServiceSelection as SELECT } from '../src/x402-issued-funding-post-application-binding.js';
import { createFundingPostNativeResponseCustody as CUSTODY } from '../src/service-credit-funding-post-native-response.js';
import { canonicalJson,paymentIntentDigest } from '../src/canonical.js';
assert.equal(process.version,'v24.19.0');assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
assert.equal(process.argv.length,2);assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE,'1');
assert.equal(process.env.X402_ISSUED_FUNDING_APPLICATION_SELECTION,'sixteen-application-binding-data-cases-only');
for(const key of ['NODE_OPTIONS','NODE_PATH','NODE_TEST_CONTEXT','NODE_V8_COVERAGE'])assert.equal(process.env[key],undefined);
assert.ok(process.permission&&!process.permission.has('child')&&!process.permission.has('worker')&&!process.permission.has('fs.write'));
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PINS=JSON.parse(process.env.X402_ISSUED_FUNDING_APPLICATION_SOURCE_PINS);
const names=['package.json','src/x402-issued-funding-post-application-binding.js','src/x402-issued-funding-post-sdk-resource.js',
  'src/canonical.js','src/x402-wire.js','src/x402-funding-post-checkpoint-route.js','src/service-credit-funding-post-native-response.js',
  'qualification/issued-funding-post-application-binding.behavior.draft.mjs'];
assert.deepEqual(PINS.map(p=>p.path),names);
const identity=s=>[s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String);
function verify(){let total=0;for(const p of PINS){
  const path=resolve(ROOT,p.path),s=lstatSync(path,{bigint:true});assert.ok(s.isFile()&&!s.isSymbolicLink());assert.equal(s.nlink,1n);
  assert.deepEqual(identity(s),p.identity);const b=readFileSync(path);total+=b.length;assert.ok(total<262144);
  assert.equal(b.length,p.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),p.sha256);
  assert.deepEqual(identity(lstatSync(path,{bigint:true})),p.identity);
}}
verify();
const URL='https://application.invalid:8443/funding',F=Object.freeze,OPT={concurrency:false,timeout:2000};
const HASH='a'.repeat(64),COPY=x=>JSON.parse(JSON.stringify(x)),encode=x=>Buffer.from(canonicalJson(x)).toString('base64');
let entered=0,completed=0,hooks=0;
function deep(value){if(value!==null&&typeof value==='object'){for(const k of Reflect.ownKeys(value))deep(value[k]);F(value);}return value;}
function commitment(domain,value){return 'sha256:'+createHash('sha256').update(Buffer.from([...Buffer.from(domain,'ascii'),0])).update(canonicalJson(value),'utf8').digest('hex');}
function selection(){return {offerId:'offer.fixed',offerVersion:1,
  holderId:'z1declaredholder',capabilityCommitment:'sha256:'+'6'.repeat(64)};}
function required(){return {x402Version:2,resource:{url:URL,tags:['x402-service-credit-funding-v1','1'.repeat(32),'2'.repeat(32)]},
  accepts:[{scheme:'exact',network:'zenon:testnet',asset:'zts1declaredasset',amount:'1',payTo:'z1declaredpayee',maxTimeoutSeconds:60,
    extra:{paymentFlow:'upfront',poc:true,settlement:'account-block',zenonChain:{version:1,chainIdentifier:'73479',genesisMomentumHash:'4'.repeat(64)}}}]};}
function fixture(){
  const r=required(),s=selection(),issuedFrame={status:402,paymentRequiredHeader:encode(r),body:'Payment Required'};
  const binding=CREATE({issuedFrame,resourceUrl:URL,serviceSelection:s});
  return {r,s,issuedFrame,binding,grantId:'grant_'+'5'.repeat(64)};
}
function outcome(phase='PENDING',hash=HASH){
  const intake=F(Object.assign(Object.create(null),{status:'BOUND',transactionHash:hash,
    observerRecordKey:'sha256:'+'7'.repeat(64),observerFileName:'funding-observer-'+hash+'.sqlite'}));
  const official=phase==='PENDING'?deep({type:'payment-error',response:{status:402,headers:{'PAYMENT-RESPONSE':'DECLARED_PENDING'},body:'pending'}})
    :phase==='SETTLED'?deep({type:'settled',settlement:{success:true}})
    :deep({type:'observed-settlement',settlement:{success:false},headers:{}});
  return F({phase:'INTAKE_BOUND_OFFICIAL_'+phase,intake,official,transactionHash:hash,
    acknowledgementDomainsIndependent:true,authority:'NONE',grantActivation:'NOT_ESTABLISHED',serviceDelivery:'NOT_ESTABLISHED'});
}
function grant(f){
  const req=f.r.accepts[0],resource=commitment('zenon-x402-service-credit-payment-resource-v1',f.r.resource);
  const requirement=commitment('zenon-x402-service-credit-payment-requirement-v1',req);
  const intent='sha256:'+paymentIntentDigest(f.r,req);
  return {grantId:f.grantId,lifecycle:'ACTIVE',transactionId:'zenontx:'+HASH,
    offerId:f.s.offerId,offerVersion:f.s.offerVersion,holderId:f.s.holderId,capabilityCommitment:f.s.capabilityCommitment,
    activation:{transactionId:'zenontx:'+HASH,offerId:f.s.offerId,offerVersion:f.s.offerVersion,holderId:f.s.holderId,
      capabilityCommitment:f.s.capabilityCommitment,network:req.network,scheme:req.scheme,paymentFlow:'upfront',asset:req.asset,
      amount:req.amount,payee:req.payTo,payer:f.s.holderId,paymentResourceDigest:resource,paymentRequirementDigest:requirement,
      paymentIntentDigest:intent,grantFundingCommitment:'sha256:'+'1'.repeat(32)+'2'.repeat(32),chainProfile:COPY(req.extra.zenonChain)},
    paymentIntent:{intentId:intent,requirementId:requirement}};
}
function refused(fn){assert.throws(fn,e=>e instanceof TypeError&&Object.isFrozen(e)&&e.code==='issued_funding_post_application_binding_rejected');}
async function scenario(name,fn){let complete=false;await test(name,OPT,async()=>{entered++;await fn();completed++;complete=true;});
  if(!complete)throw new Error('ISSUED_FUNDING_APPLICATION_COMPONENT_FAILED_STOP');}
await scenario('fixed holder capability and offer selection is detached without requiring a future grant ID',()=>{
  const s=selection(),chosen=SELECT(s);s.offerId='changed.offer';assert.equal(chosen.offerId,selection().offerId);
  assert.ok(Object.isFrozen(chosen));const trap=()=>{hooks++;throw new Error('HOOK');};
  for(const change of [s=>{s.admittedGrantId='grant.any';},s=>{s.offerVersion=0;},s=>{s.holderId='https://other.invalid';},
    s=>{s.capabilityCommitment={toString:trap};},s=>{Object.defineProperty(s,'offerId',{get:trap,enumerable:true});}]){
    const value=selection();change(value);refused(()=>SELECT(value));
  }assert.equal(hooks,0);
});
await scenario('unpaid POST frame preserves exact original canonical header and existing text contract',()=>{
  const f=fixture(),header=f.issuedFrame.paymentRequiredHeader;f.issuedFrame.paymentRequiredHeader='changed';
  const response=f.binding.getChallenge();assert.deepEqual(response,{statusCode:402,contentType:'text/plain; charset=utf-8',
    body:'Payment Required',headers:{'PAYMENT-REQUIRED':header}});
  assert.equal(f.binding.getChallenge(),response);assert.ok(Object.isFrozen(response)&&Object.isFrozen(response.headers));
});
await scenario('genuine-shaped BOUND domain maps only to 202 text and excludes all protocol and observer details',()=>{
  const f=fixture(),r=f.binding.captureBoundOutcome(outcome());assert.deepEqual(r,{statusCode:202,
    contentType:'text/plain; charset=utf-8',body:'BOUND',headers:{}});
  assert.equal(Buffer.byteLength(r.body),5);assert.equal(JSON.stringify(r).includes('observer'),false);
  assert.equal(JSON.stringify(r).includes(HASH),false);assert.equal(Object.keys(r.headers).length,0);
  assert.equal(f.binding.inspect().officialPhase,'PENDING');assert.equal(f.binding.inspect().serviceGrantPinned,false);
});
await scenario('same original pending result can settle without a new wire authority or another header',()=>{
  const f=fixture(),first=f.binding.captureBoundOutcome(outcome());
  assert.equal(f.binding.captureBoundOutcome(outcome('SETTLED')),first);
  assert.equal(f.binding.inspect().officialPhase,'SETTLED');
  assert.equal(f.binding.captureBoundOutcome(outcome('SETTLED')),first);
});
await scenario('a settlement receipt alone can never manufacture intake BOUND and refusal is sticky',()=>{
  const f=fixture();refused(()=>f.binding.captureBoundOutcome(F({type:'settled',settlement:F({success:true})})));
  assert.equal(f.binding.inspect().held,true);refused(()=>f.binding.captureBoundOutcome(outcome('SETTLED')));
  refused(()=>f.binding.getChallenge());
});
await scenario('different transaction observer identity or a normal-prototype pseudo BOUND record is refused',()=>{
  const f=fixture();f.binding.captureBoundOutcome(outcome());
  refused(()=>f.binding.captureBoundOutcome(outcome('PENDING','b'.repeat(64))));assert.equal(f.binding.inspect().held,true);
  for(const change of [r=>{r.intake.observerRecordKey='sha256:'+'8'.repeat(64);},
    r=>{r.intake.observerFileName='unrelated.sqlite';},r=>{r.transactionHash='b'.repeat(64);} ]){
    const f=fixture(),r=COPY(outcome());f.binding.captureBoundOutcome(outcome());change(r);r.intake=F(Object.assign(Object.create(null),r.intake));deep(r);
    refused(()=>f.binding.captureBoundOutcome(r));
  }
  const g=fixture(),ordinary=COPY(outcome());deep(ordinary);refused(()=>g.binding.captureBoundOutcome(ordinary));
});
await scenario('malformed root domain flags and inconsistent official phase are not converted into success',()=>{
  for(const change of [r=>{r.acknowledgementDomainsIndependent=false;},r=>{r.authority='GRANT';},
    r=>{r.grantActivation='ACTIVE';},r=>{r.serviceDelivery='DELIVERED';},
    r=>{r.phase='INTAKE_BOUND_OFFICIAL_SETTLED';},r=>{r.official={type:'settled',settlement:{success:false}};}]){
    const f=fixture(),r=COPY(outcome());change(r);r.intake=F(Object.assign(Object.create(null),r.intake));deep(r);
    refused(()=>f.binding.captureBoundOutcome(r));
  }
});
await scenario('actual pure native custody takes the wire only after declared complete closure observations',()=>{
  const f=fixture(),r=f.binding.captureBoundOutcome(outcome('SETTLED')),owner=CUSTODY();
  owner.acceptTls();owner.acceptHeaders({statusCode:r.statusCode,rawHeaders:['Content-Type',r.contentType,'Content-Length','5']});
  owner.acceptChunk(Buffer.from(r.body));owner.acceptEnd();owner.acceptRequestClose();owner.acceptSocketClose({hadError:false});
  const taken=owner.takeResponse();assert.equal(taken.statusCode,202);assert.equal(taken.body.toString('utf8'),'BOUND');
  assert.equal(owner.snapshot().nativeEventsAuthenticatedByThisComponent,false);assert.equal(owner.snapshot().authority,'NONE');
});
await scenario('service grant cannot be pinned before independent BOUND and settled evidence data',()=>{
  const f=fixture();refused(()=>f.binding.captureCommittedGrant(grant(f),f.grantId));
  f.binding.captureBoundOutcome(outcome());refused(()=>f.binding.captureCommittedGrant(grant(f),f.grantId));
  assert.equal(f.binding.inspect().held,false);assert.equal(f.binding.inspect().serviceGrantPinned,false);
  f.binding.captureBoundOutcome(outcome('SETTLED'));const chosen=f.binding.captureCommittedGrant(grant(f),f.grantId);
  assert.equal(chosen.admittedGrantId,f.grantId);assert.equal(chosen.transactionHash,HASH);
  assert.equal(chosen.grantActivation,'EXTERNAL_COMMITTED_RECORD_REQUIRED');assert.equal(chosen.authority,'NONE');
  assert.equal(f.binding.inspect().serviceGrantPinned,true);refused(()=>f.binding.captureCommittedGrant(grant(f),f.grantId));
});
await scenario('wrong grant ID offer holder and capability cannot consume a matching later committed read',()=>{
  for(const change of [g=>{g.grantId='grant_'+'8'.repeat(64);},g=>{g.offerId='foreign.offer';},g=>{g.offerVersion=2;},
    g=>{g.holderId='foreign.holder';},g=>{g.capabilityCommitment='sha256:'+'8'.repeat(64);},
    g=>{g.activation.holderId='foreign.holder';},g=>{g.lifecycle='REVOKED';}]){
    const f=fixture();f.binding.captureBoundOutcome(outcome('SETTLED'));const value=grant(f);change(value);
    refused(()=>f.binding.captureCommittedGrant(value,f.grantId));assert.equal(f.binding.inspect().serviceGrantPinned,false);
    assert.equal(f.binding.captureCommittedGrant(grant(f),f.grantId).admittedGrantId,f.grantId);
  }
});
await scenario('transaction chain and payment scope must match the retained original not a receipt alias',()=>{
  for(const change of [g=>{g.transactionId='zenontx:'+'b'.repeat(64);},g=>{g.activation.transactionId='zenontx:'+'b'.repeat(64);},
    g=>{g.activation.chainProfile.genesisMomentumHash='9'.repeat(64);},g=>{g.activation.network='zenon:other';},
    g=>{g.activation.amount='2';},g=>{g.activation.payee='other.payee';},g=>{g.activation.payer='other.payer';},
    g=>{g.activation.asset='other.asset';},g=>{g.activation.paymentFlow='escrow';}]){
    const f=fixture();f.binding.captureBoundOutcome(outcome('SETTLED'));const value=grant(f);change(value);
    refused(()=>f.binding.captureCommittedGrant(value,f.grantId));assert.equal(f.binding.inspect().serviceGrantPinned,false);
  }
});
await scenario('issued resource requirement intent and funding commitments remain distinct exact domains',()=>{
  for(const change of [g=>{g.activation.paymentResourceDigest='sha256:'+'9'.repeat(64);},
    g=>{g.activation.paymentRequirementDigest=g.activation.paymentResourceDigest;},
    g=>{g.activation.paymentIntentDigest='sha256:'+'9'.repeat(64);},
    g=>{g.activation.grantFundingCommitment='sha256:'+'9'.repeat(64);},
    g=>{g.paymentIntent.intentId='sha256:'+'9'.repeat(64);},
    g=>{g.paymentIntent.requirementId='sha256:'+'9'.repeat(64);}]){
    const f=fixture();f.binding.captureBoundOutcome(outcome('SETTLED'));const value=grant(f);change(value);
    refused(()=>f.binding.captureCommittedGrant(value,f.grantId));
  }
});
await scenario('grant records containing getters proxies or serialization hooks execute zero hooks',()=>{
  const trap=()=>{hooks++;throw new Error('HOOK');},proxy=new Proxy({}, {get:trap,ownKeys:trap,getPrototypeOf:trap});
  for(const change of [g=>{Object.defineProperty(g,'activation',{get:trap,enumerable:true});},
    g=>{g.activation=proxy;},g=>{g.toJSON=trap;},g=>{g.activation.then=trap;}]){
    const f=fixture();f.binding.captureBoundOutcome(outcome('SETTLED'));const value=grant(f);change(value);
    refused(()=>f.binding.captureCommittedGrant(value,f.grantId));assert.equal(f.binding.inspect().serviceGrantPinned,false);
  }
  const f=fixture();f.binding.captureBoundOutcome(outcome('SETTLED'));refused(()=>f.binding.captureCommittedGrant(proxy,f.grantId));
  assert.equal(hooks,0);
});
await scenario('outcome descriptors proxies and observer accessors never execute hooks or renew a held binding',()=>{
  const trap=()=>{hooks++;throw new Error('HOOK');},proxy=new Proxy({}, {get:trap,ownKeys:trap,getPrototypeOf:trap});
  const f=fixture();refused(()=>f.binding.captureBoundOutcome(proxy));assert.equal(f.binding.inspect().held,true);
  const g=fixture(),r={...outcome()};Object.defineProperty(r,'intake',{get:trap,enumerable:true});F(r);
  refused(()=>g.binding.captureBoundOutcome(r));assert.equal(hooks,0);
});
await scenario('terminal settlement cannot regress and exhausted observation cannot upgrade to late success',()=>{
  const a=fixture();a.binding.captureBoundOutcome(outcome('SETTLED'));refused(()=>a.binding.captureBoundOutcome(outcome()));
  const b=fixture();b.binding.captureBoundOutcome(outcome());b.binding.captureBoundOutcome(outcome('EXHAUSTED'));
  refused(()=>b.binding.captureBoundOutcome(outcome('SETTLED')));assert.equal(b.binding.inspect().held,true);
});
await scenario('wrong arity never pins service and data inspection asserts no native SQL or activation authority',()=>{
  const f=fixture();refused(()=>SELECT(f.s,true));refused(()=>CREATE());refused(()=>f.binding.getChallenge(true));
  refused(()=>f.binding.captureBoundOutcome());refused(()=>f.binding.captureCommittedGrant());refused(()=>f.binding.inspect(true));
  assert.equal(f.binding.inspect().held,false);assert.equal(f.binding.inspect().committedRecordAuthenticated,false);
  assert.equal(f.binding.inspect().issuanceAuthenticated,false);assert.equal(f.binding.inspect().grantActivation,'NONE');
  assert.equal(f.binding.inspect().authority,'NONE');
  for(const key of ['activate','execute','open','close','sign','send','store','nativePeer'])assert.equal(Object.hasOwn(f.binding,key),false);
});
verify();assert.equal(entered,16);assert.equal(completed,16);assert.equal(hooks,0);
console.log('# issued-funding-application-binding-source '+JSON.stringify({tests:16,entered,completed,hooks,
  actualApplicationBinding:true,actualResponseCustody:true,declaredGrantAndBoundData:true,declaredNativeEvents:true,
  actualOfficialSdk:false,actualIntake:false,actualSQLite:false,actualNative:false,signatures:false,
  grantActivation:false,settlementMappedToBound:false,authority:'NONE',inputs:PINS.map(({identity,...pin})=>pin)}));
