// Bounded SDK-FREE declared-DATA/native-Promise continuation wire contract.
// No installed x402 package, SDK, network, wallet, SQL, payment, signing,
// nonce producer, service process or actual delivery is exercised.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { lstatSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ENTRY = "qualification/x402-pending-continuation-wire.behavior.draft.mjs", SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const SPECS = [
  {
    "path": "src/x402-selected-settlement-server-bridge.js",
    "bytes": 37946,
    "LF": 711,
    "sha256": "8d1e494c89abb340efd7a9a1fd15bca53ed099bf6e72b9d09902449635bc46b4"
  },
  {
    "path": "src/x402-verification-bound-settlement-context.js",
    "bytes": 11311,
    "LF": 221,
    "sha256": "b3ad2fd33dae7e77a77f069cbc1259bf77e18a2bf383aa30f41bcc19221656f5"
  },
  {
    "path": "src/x402-selected-settlement-context.js",
    "bytes": 16818,
    "LF": 456,
    "sha256": "afb6e16603023dd58d6a71cff5790a802dcfa4b98bc9d380b51ccc3d58e10991"
  },
  {
    "path": "src/x402-wire.js",
    "bytes": 39886,
    "LF": 934,
    "sha256": "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  },
  {
    "path": "package.json",
    "bytes": 1413,
    "LF": 40,
    "sha256": "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  }
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.env.X402_WIRE_OPT_IN, 'reviewed-synthetic-data-only');
const PINS = JSON.parse(process.env.X402_WIRE_SOURCE_PINS);
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function sources() {
  assert.equal(PINS.length, 6); assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p.path), ENTRY]);
  let total = 0;
  return PINS.map((p,index) => {
    const filename = join(REPO,p.path), s=lstatSync(filename,{bigint:true});
    assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.uid,BigInt(process.getuid()));
    assert.equal(s.nlink,1n); assert.ok(s.size>0n && s.size<=65536n); assert.deepEqual(ids(s),p.identity);
    const fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW), b=Buffer.alloc(Number(s.size)+1);
    let used=0;
    try {
      assert.deepEqual(ids(fstatSync(fd,{bigint:true})),p.identity);
      while(used<b.length){const n=readSync(fd,b,used,b.length-used,null);if(!n)break;used+=n;}
      assert.deepEqual(ids(fstatSync(fd,{bigint:true})),p.identity);
    } finally {closeSync(fd);}
    assert.deepEqual(ids(lstatSync(filename,{bigint:true})),p.identity);assert.equal(used,Number(s.size));
    const raw=b.subarray(0,used);assert.equal(raw.includes(0),false);assert.equal(raw.some(c=>c>127),false);
    total+=used;assert.ok(total<=196608);assert.equal(sha(raw),p.sha256);assert.equal(raw.length,p.bytes);
    assert.equal(raw.filter(c=>c===10).length,p.LF);
    if(index<SPECS.length)for(const k of ['path','bytes','LF','sha256'])assert.equal(p[k],SPECS[index][k]);
    return {path:p.path,bytes:p.bytes,sha256:p.sha256,identity:p.identity};
  });
}
const before = sources();
const { createSelectedSettlementServerBridgeForOfficialX402Core223: CREATE }
  = await import('../src/x402-selected-settlement-server-bridge.js');
const { makePaymentRequired, validatePaymentRequired, encodeB64Json, decodeB64Json }
  = await import('../src/x402-wire.js');
const OPTIONS={timeout:5000,concurrency:false}, HASH='a'.repeat(64);
const clone=x=>JSON.parse(JSON.stringify(x)); // Bounded test-owned JSON only.
const fixtures=[];
function req(){
 return {scheme:'exact',network:'zenon:mock',asset:'zts1declaredasset',amount:'1',
  payTo:'z1declaredrecipient',maxTimeoutSeconds:60,
  extra:{paymentFlow:'upfront',poc:true,settlement:'account-block',
   zenonChain:{version:1,chainIdentifier:String(Number.MAX_SAFE_INTEGER),genesisMomentumHash:'0'.repeat(64)}}};
}
async function fixture(mode={}){
 const f={mode,calls:{verify:0,first:0,observer:0,sdkShaped:0},seen:[],handler:0};
 fixtures.push(f);f.requirement=req();
 f.challenge=makePaymentRequired({resourceUrl:'https://wire-contract.invalid/paid',
  description:'declared resource',mimeType:'application/json',requirement:f.requirement});
 f.view=f.challenge.accepts[0];
 f.payload={x402Version:2,resource:clone(f.challenge.resource),accepted:clone(f.requirement),
  payload:{transaction:{hash:HASH,signature:'declared-not-a-wallet-signature',nonce:'0000000000000000'},
   intentDigest:'b'.repeat(64)}};
 f.original=[f.payload,f.view,f.challenge].map(x=>JSON.stringify(x));
 function call(role,args){
  f.calls[role]++;assert.equal(args.length,3);
  const texts=args.map(x=>JSON.stringify(x));assert.deepEqual(texts,f.original);f.seen.push(texts);
 }
 function raw(p,r,success){
  return {success,...(success?{payer:'declared-payer'}:{errorReason:'settlement_pending'}),
   transaction:p.payload.transaction.hash,network:r.network,publicationStatus:success?'ACKNOWLEDGED':'UNKNOWN'};
 }
 const facilitator={
  verify(...args){call('verify',args);return {isValid:true,payer:'declared-payer'};},
  settle(...args){call('first',args);return raw(args[0],args[1],false);},
 };
 f.bridge=CREATE({requirement:f.requirement,localFacilitator:facilitator,
  validateChallenge:function(data){assert.equal(this,undefined);validatePaymentRequired(data);},
  reconcilePendingSettlement:function(...args){call('observer',args);return raw(args[0],args[1],mode.pending!==true);},
  maxPendingReconciliations:1,contextLimit:4});
 await f.bridge.schemeServer.enrichPaymentRequiredResponse({
  paymentRequiredResponse:f.challenge,requirements:f.challenge.accepts});
 const pending=await f.bridge.facilitatorClient.settle(f.payload,f.view);
 assert.equal(pending.success,false);assert.equal(pending.errorReason,'settlement_pending');
 assert.deepEqual(f.calls,{verify:1,first:1,observer:0,sdkShaped:0});
 const adapter={declared:true}; // Opaque synthetic adapter; no native transport.
 f.context={request:{adapter,method:'GET',path:'/paid',paymentHeader:'declared-original-header'}};
 f.continuation=f.bridge.createPendingContinuation({paymentPayload:f.payload,requirements:f.view,
  transportContext:f.context,processSettlement:async function(...args){
   f.calls.sdkShaped++;assert.equal(this,undefined);assert.equal(args.length,7);
   assert.equal(args[0],f.payload);assert.equal(args[1],f.view);assert.equal(args[2],undefined);
   assert.equal(args[3],f.context);assert.equal(args[4],undefined);assert.equal(args[5],undefined);
   assert.equal(args[6],'before-handler');
   const result=await f.bridge.facilitatorClient.settle(args[0],args[1]);
   const top=mode.top?mode.top(clone(result)):clone(result);
   const header=mode.header?mode.header(clone(result)):encodeB64Json(mode.wire?mode.wire(clone(top)):top);
   f.returnedHeader=header;return {...top,headers:{'PAYMENT-RESPONSE':header}};
  }});
 return f;
}
function retained(f){
 assert.deepEqual([f.payload,f.view,f.challenge].map(x=>JSON.stringify(x)),f.original);
 assert.equal(f.context.request.paymentHeader,'declared-original-header');
 assert.deepEqual(f.calls,{verify:1,first:1,observer:1,sdkShaped:1});
 const owner=f.bridge.getSnapshot().contexts[0].boundOwner;
 assert.equal(owner.verificationCalls,1);assert.equal(owner.settlement.firstAttempts,1);
 assert.equal(owner.settlement.pendingReconciliations,1);assert.equal(owner.settlement.firstAuthorityConsumed,true);
 assert.equal(owner.settlement.publication.uncertaintyRetained,true);
}
async function terminal(f,phase,positive){
 const s=f.continuation.getSnapshot();assert.equal(s.phase,phase);assert.equal(s.active,false);
 assert.equal(s.sdkContinuationCalls,1);assert.equal(s.positiveReplies,positive);assert.equal(s.referencesReleased,true);
 await assert.rejects(f.continuation.resume(),e=>e.code==='x402_selected_server_bridge_stage_rejected');
 assert.throws(()=>f.bridge.createPendingContinuation({paymentPayload:f.payload,requirements:f.view,
  transportContext:f.context,processSettlement:async()=>undefined}));
 retained(f);
}
function diagnostic(t,scenario,fs,accepted,rejected){
 t.diagnostic(JSON.stringify({kind:'CONTINUATION_WIRE_BINDING',version:1,scenario,cases:fs.length,
  accepted,rejected,sdkShapedCalls:fs.reduce((n,f)=>n+f.calls.sdkShaped,0),
  verifications:fs.reduce((n,f)=>n+f.calls.verify,0),firstSettlements:fs.reduce((n,f)=>n+f.calls.first,0),
  reconciliations:fs.reduce((n,f)=>n+f.calls.observer,0),
  positiveContinuationReplies:fs.reduce((n,f)=>n+f.continuation.getSnapshot().positiveReplies,0),
  modeledHandlerCalls:fs.reduce((n,f)=>n+f.handler,0),
  originalPreserved:true,authorityConsumed:true,furtherCallsBlocked:true,
  officialSdkImported:false,networkCalls:0,signatures:0,replacements:0,
  serviceDelivery:'NOT_ESTABLISHED',sameProcessOnly:true}));
}
after(()=>{assert.deepEqual(sources(),before);});

async function rejectedWire(mode){
 const f=await fixture(mode);
 await assert.rejects(f.continuation.resume(),e=>e.code==='x402_selected_server_bridge_continuation_rejected');
 assert.equal(f.handler,0);await terminal(f,'UNKNOWN',0);return f;
}
test("continuation wire binding accepts matching bounded success and pending controls",OPTIONS,async t=>{
 const used=[];
 for(const pending of [false,true]){
  const f=await fixture({pending});used.push(f);
  const reply=await f.continuation.resume(), wire=decodeB64Json(reply.headers['PAYMENT-RESPONSE']);
  assert.equal(reply.settlement.success,!pending);assert.equal(wire.success,!pending);
  assert.equal(wire.transaction,HASH);assert.equal(wire.network,f.requirement.network);
  if(!pending)f.handler++;
  await terminal(f,pending?'PENDING_EXHAUSTED':'SUCCEEDED',pending?0:1);
 }
 diagnostic(t,'MATCHING_CONTROLS',used,2,0);
});
test("continuation wire binding rejects foreign or conflicting receipts without renewed authority",OPTIONS,async t=>{
 const modes=[
  {wire:x=>({...x,transaction:'c'.repeat(64)})},
  {wire:x=>({...x,network:'zenon:foreign'})},
  {wire:x=>({...x,payer:'different-declared-payer'})},
  {wire:x=>({...x,success:false,errorReason:'settlement_pending'})},
  {pending:true,wire:x=>({success:true,payer:'declared-payer',transaction:x.transaction,network:x.network})},
  {wire:x=>({...x,transaction:''})},
  {wire:x=>({...x,transaction:'A'.repeat(64)})},
  {wire:x=>({...x,success:'true'})},
 ];
 const used=[];for(const mode of modes)used.push(await rejectedWire(mode));
 diagnostic(t,'MISMATCHED_RECEIPTS',used,0,modes.length);
});
test("continuation wire binding rejects malformed or oversized headers after the same original reconciliation",OPTIONS,async t=>{
 const b64=text=>Buffer.from(text,'utf8').toString('base64');
 const headers=[
  ()=>'*',()=> 'e30',x=>' '+encodeB64Json(x),()=>b64('[]'),()=>b64('null'),
  ()=>b64('"not-an-object"'),()=>b64('{'),()=>Buffer.from([255]).toString('base64'),
  ()=> 'A'.repeat(8196),()=>'',()=>0,
 ];
 const used=[];for(const header of headers)used.push(await rejectedWire({header}));
 diagnostic(t,'MALFORMED_HEADERS',used,0,headers.length);
});
test("continuation wire binding compares declared publication metadata without clearing uncertainty",OPTIONS,async t=>{
 const used=[];
 const top=x=>({...x,publicationStatus:'ACKNOWLEDGED'});
 const f=await fixture({top});used.push(f);
 const reply=await f.continuation.resume();
 assert.equal(reply.settlement.success,true);f.handler++;
 const wire=decodeB64Json(reply.headers['PAYMENT-RESPONSE']);assert.equal(wire.publicationStatus,'ACKNOWLEDGED');
 await terminal(f,'SUCCEEDED',1);
 const g=await rejectedWire({top,wire:x=>({...x,publicationStatus:'UNKNOWN'})});used.push(g);
 const h=await rejectedWire({top,wire:x=>({...x,publicationStatus:'NOT_ESTABLISHED'})});used.push(h);
 for(const item of used){
  const publication=item.bridge.getSnapshot().contexts[0].boundOwner.settlement.publication;
  assert.equal(publication.uncertaintyRetained,true);assert.equal(publication.acknowledgementDeclared,true);
 }
 diagnostic(t,'PUBLICATION_BINDING',used,1,2);
});
