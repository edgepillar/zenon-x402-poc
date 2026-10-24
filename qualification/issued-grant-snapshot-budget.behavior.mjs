// Actual pure binding only. Frames, BOUND and grant records are DECLARED DATA.
// No SDK, SQLite, native transport, keys/signatures, nonce or activation authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createIssuedFundingPostApplicationBinding as CREATE } from '../src/x402-issued-funding-post-application-binding.js';
import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
assert.equal(process.version,'v24.19.0'); assert.equal(process.platform,'darwin'); assert.equal(process.arch,'arm64');
assert.equal(process.argv.length,2); assert.equal(process.env.NODE_DISABLE_COMPILE_CACHE,'1');
assert.equal(process.env.X402_GRANT_SNAPSHOT_SELECTION,'ten-key-and-value-budget-cases');
assert.ok(process.permission && !process.permission.has('fs.write')
  && !process.permission.has('child') && !process.permission.has('worker'));
const F=Object.freeze, LIMIT=131072, HASH='a'.repeat(64), URL='https://application.invalid:8443/funding';
const options={concurrency:false,timeout:2000},totals={entered:0,completed:0,rejections:0,successfulPins:0,hooks:0};
const copy=x=>JSON.parse(JSON.stringify(x));
function deep(v){if(v!==null&&typeof v==='object'){for(const k of Reflect.ownKeys(v))deep(v[k]);F(v);}return v;}
function digest(domain,v){return 'sha256:'+createHash('sha256').update(domain,'ascii').update(Buffer.from([0]))
  .update(canonicalJson(v),'utf8').digest('hex');}
function fixture(){
  const s={offerId:'offer.fixed',offerVersion:1,holderId:'z1declaredholder',capabilityCommitment:'sha256:'+'6'.repeat(64)};
  const r={x402Version:2,resource:{url:URL,tags:['x402-service-credit-funding-v1','1'.repeat(32),'2'.repeat(32)]},
    accepts:[{scheme:'exact',network:'zenon:testnet',asset:'zts1declaredasset',amount:'1',payTo:'z1declaredpayee',maxTimeoutSeconds:60,
      extra:{paymentFlow:'upfront',poc:true,settlement:'account-block',zenonChain:{version:1,chainIdentifier:'73479',genesisMomentumHash:'4'.repeat(64)}}}]};
  const binding=CREATE({issuedFrame:{status:402,paymentRequiredHeader:Buffer.from(canonicalJson(r)).toString('base64'),body:'Payment Required'},
    resourceUrl:URL,serviceSelection:s});
  const intake=F(Object.assign(Object.create(null),{status:'BOUND',transactionHash:HASH,
    observerRecordKey:'sha256:'+'7'.repeat(64),observerFileName:'funding-observer-'+HASH+'.sqlite'}));
  binding.captureBoundOutcome(F({phase:'INTAKE_BOUND_OFFICIAL_SETTLED',intake,
    official:deep({type:'settled',settlement:{success:true}}),transactionHash:HASH,
    acknowledgementDomainsIndependent:true,authority:'NONE',grantActivation:'NOT_ESTABLISHED',serviceDelivery:'NOT_ESTABLISHED'}));
  const req=r.accepts[0],resource=digest('zenon-x402-service-credit-payment-resource-v1',r.resource);
  const requirement=digest('zenon-x402-service-credit-payment-requirement-v1',req),intent='sha256:'+paymentIntentDigest(r,req);
  const grantId='grant_'+'5'.repeat(64);
  const grant={grantId,lifecycle:'ACTIVE',transactionId:'zenontx:'+HASH,
    offerId:s.offerId,offerVersion:s.offerVersion,holderId:s.holderId,capabilityCommitment:s.capabilityCommitment,
    activation:{transactionId:'zenontx:'+HASH,offerId:s.offerId,offerVersion:s.offerVersion,holderId:s.holderId,
      capabilityCommitment:s.capabilityCommitment,network:req.network,scheme:req.scheme,paymentFlow:'upfront',asset:req.asset,
      amount:req.amount,payee:req.payTo,payer:s.holderId,paymentResourceDigest:resource,paymentRequirementDigest:requirement,
      paymentIntentDigest:intent,grantFundingCommitment:'sha256:'+'1'.repeat(32)+'2'.repeat(32),chainProfile:copy(req.extra.zenonChain)},
    paymentIntent:{intentId:intent,requirementId:requirement}};
  return {binding,grant,grantId};
}
function refused(f,g){
  assert.throws(()=>f.binding.captureCommittedGrant(g,f.grantId),{code:'issued_funding_post_application_binding_rejected'});
  totals.rejections++; assert.equal(f.binding.inspect().serviceGrantPinned,false);
  assert.equal(f.binding.inspect().held,false);
}
function pin(f,g=f.grant){
  const result=f.binding.captureCommittedGrant(g,f.grantId);totals.successfulPins++;
  assert.equal(result.admittedGrantId,f.grantId);assert.equal(result.transactionHash,HASH);assert.equal(result.authority,'NONE');
  assert.equal(f.binding.inspect().serviceGrantPinned,true);assert.equal(result.grantActivation,'EXTERNAL_COMMITTED_RECORD_REQUIRED');
  return result;
}
// Independent accounting oracle: dense array indices/structure are governed by
// the unchanged depth/node caps; user field names and string values cost UTF-8.
function textBytes(v){
  if(typeof v==='string')return Buffer.byteLength(v);
  if(v===null||typeof v!=='object')return 0;
  if(Array.isArray(v))return v.reduce((n,item)=>n+textBytes(item),0);
  return Object.keys(v).reduce((n,k)=>n+Buffer.byteLength(k)+textBytes(v[k]),0);
}
async function selected(name,work){
  let complete=false;
  await test(name,options,()=>{totals.entered++;work();totals.completed++;complete=true;});
  if(!complete)throw Error('GRANT_SNAPSHOT_BUDGET_CASE_FAILED_STOP');
}
await selected('an oversized field name is rejected before it can consume the original grant pin',()=>{
  const f=fixture(),g=copy(f.grant);g['k'.repeat(LIMIT+1)]=true;
  assert.ok(textBytes(g)>LIMIT);refused(f,g);pin(f);
});
await selected('many individually smaller names share one aggregate snapshot budget',()=>{
  const f=fixture(),g=copy(f.grant);
  for(let i=0;i<33;i++)g[String(i)+'.'+'k'.repeat(4096)]=true;
  assert.ok(Object.keys(g).length<128);assert.ok(textBytes(g)>LIMIT);refused(f,g);pin(f);
});
await selected('nested extension field names consume the same parent budget',()=>{
  const f=fixture(),g=copy(f.grant);g.extension={['k'.repeat(LIMIT+1)]:true};
  refused(f,g);pin(f);
});
await selected('UTF-8 bytes rather than JavaScript character counts bound non-ASCII names',()=>{
  for(const text of ['\u00e9'.repeat(LIMIT/2),'\ud83d\ude07'.repeat(LIMIT/4)]){
    assert.equal(text.length,LIMIT/2);assert.equal(Buffer.byteLength(text),LIMIT);
    const f=fixture(),g=copy(f.grant);g[text]=true;refused(f,g);pin(f);
  }
});
await selected('the exact remaining byte boundary succeeds while one additional name byte fails',()=>{
  const f=fixture(),base=textBytes(f.grant),remaining=LIMIT-base;
  assert.ok(remaining>100000);const good=copy(f.grant);good['k'.repeat(remaining)]=false;
  assert.equal(textBytes(good),LIMIT);pin(f,good);
  const other=fixture(),bad=copy(other.grant);bad['k'.repeat(remaining+1)]=false;
  assert.equal(textBytes(bad),LIMIT+1);refused(other,bad);pin(other);
});
await selected('field names and string values cannot each spend an independent full budget',()=>{
  const f=fixture(),g=copy(f.grant);g['k'.repeat(LIMIT/2)]='v'.repeat(LIMIT/2);
  assert.ok(textBytes(g)>LIMIT);refused(f,g);pin(f);
});
await selected('ordinary bounded extension data stays accepted without rewriting original scope',()=>{
  const f=fixture(),g=copy(f.grant);g.extension={'\u00e9':'value',list:[null,false,2,'short']};
  const before=canonicalJson(g),result=pin(f,g);assert.equal(canonicalJson(g),before);
  assert.equal(result.capabilityCommitment,f.grant.capabilityCommitment);
  assert.equal(f.binding.inspect().issuanceAuthenticated,false);assert.equal(f.binding.inspect().committedRecordAuthenticated,false);
});
await selected('budget failure accessors proxies and serialization hooks never invoke caller code',()=>{
  const trap=()=>{totals.hooks++;throw Error('HOOK');};
  const f=fixture(),g=copy(f.grant);Object.defineProperty(g,'k'.repeat(LIMIT+1),{enumerable:true,get:trap});refused(f,g);pin(f);
  const other=fixture(),proxy=new Proxy(other.grant,{ownKeys:trap,getPrototypeOf:trap,getOwnPropertyDescriptor:trap});
  refused(other,proxy);pin(other);assert.equal(totals.hooks,0);
});
await selected('unchanged depth and shared node limits still reject oversized structural work',()=>{
  const f=fixture(),g=copy(f.grant);let deepValue=false;
  for(let i=0;i<20;i++)deepValue={nested:deepValue};g.extension=deepValue;refused(f,g);pin(f);
  const other=fixture(),wide=copy(other.grant);wide.extension=Array(128).fill(Array(128).fill(false));
  refused(other,wide);pin(other);
});
await selected('bounded wrong-scope records remain refused without granting a later retry authority',()=>{
  const f=fixture(),g=copy(f.grant);g.offerId='foreign.offer';g.extension={'\u00e9':'small'};
  refused(f,g);pin(f);assert.throws(()=>f.binding.captureCommittedGrant(f.grant,f.grantId),
    {code:'issued_funding_post_application_binding_rejected'});
});
assert.equal(totals.entered,10);assert.equal(totals.completed,10);assert.equal(totals.hooks,0);
console.log('# grant-snapshot-budget '+JSON.stringify({...totals,stringAndFieldNameUtf8Limit:LIMIT,
  scope:'ACTUAL_PURE_BINDING_DECLARED_GRANT_DATA',nodeLimit:4096,depthLimit:16,
  SDK:false,SQLite:false,native:false,keysOrSignatures:false,nonce:false,grantActivation:false,authority:'NONE'}));
