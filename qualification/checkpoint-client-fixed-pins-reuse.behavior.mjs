import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { createOriginalPaymentCheckpointClient as GET,
  createFundingPostOriginalPaymentCheckpointClient as POST } from '../src/x402-original-payment-checkpoint-client.js';
import { captureOriginalPaymentCheckpoint, encodeOriginalPaymentCheckpoint } from '../src/service-credit-pilot-original-payment-checkpoint.js';
import { encodeB64Json } from '../src/x402-wire.js';

const phase=process.env.X402_CHECKPOINT_REUSE_PHASE;
assert.ok(phase==='baseline'||phase==='optimized');
const nativeHash=crypto.createHash, apply=Reflect.apply, parse=JSON.parse, stringify=JSON.stringify;
const rows=[], copy=x=>parse(stringify(x)), F=Object.freeze;
const origin='https://checkpoint-reuse.invalid', prefix='x402_original_payment_checkpoint_client_';
const bindingFields=['requestId','paymentHash','origin','contextId'];
const digestFields=['requestBody','paymentPayload','paymentRequirements','context'];
const code=suffix=>error=>error instanceof TypeError&&error.code===prefix+suffix&&Object.isFrozen(error);
const hash=s=>apply(nativeHash,crypto,['sha256']).update(s,'utf8').digest('hex');
function fixture(post=false){
  const url=origin+(post?'/funding':'/paid');
  const requirement={scheme:'exact',network:'zenon:mock',asset:'zts1declaredasset',amount:'1',
    payTo:'z1declaredrecipient',maxTimeoutSeconds:60,extra:{paymentFlow:'upfront',poc:true,settlement:'account-block',
      zenonChain:{version:1,chainIdentifier:String(Number.MAX_SAFE_INTEGER),genesisMomentumHash:'0'.repeat(64)}}};
  const required={x402Version:2,resource:{url,description:'Exact retained original',mimeType:'application/json'},accepts:[requirement]};
  const payload={x402Version:2,resource:copy(required.resource),accepted:copy(requirement),
    payload:{transaction:{hash:'a'.repeat(64),signature:'DECLARED_NOT_A_SIGNATURE',nonce:'0000000000000000'},intentDigest:'b'.repeat(64)}};
  const requiredHeader=encodeB64Json(required),header=encodeB64Json(payload);
  const captured=captureOriginalPaymentCheckpoint({binding:{requestId:'request.original',paymentHash:'a'.repeat(64),
    origin,contextId:'context.original'},originalBytes:{requestBody:'',paymentPayload:header,paymentRequirements:requiredHeader,
      context:Buffer.from('{}').toString('base64')}});
  const f={post,required,payload,requiredHeader,header,checkpoint:captured.checkpoint,pins:captured.pins,
    readCount:0,readPins:[],impl:null,closedStores:0};
  f.options={resourceUrl:url,serializedCheckpoint:encodeOriginalPaymentCheckpoint(f.checkpoint),expectedPins:copy(f.pins),
    readOriginalPaymentCheckpoint(pins){f.readCount++;f.readPins.push(pins);
      assert.deepEqual(pins,f.pins);assert.ok(Object.isFrozen(pins)&&Object.isFrozen(pins.binding)&&Object.isFrozen(pins.digests));
      return f.impl===null?f.checkpoint:f.impl(pins);}};
  f.start=()=>{f.client=(post?POST:GET)(f.options);return f;};
  f.admit=pins=>f.client.captureChallenge({paymentRequiredHeader:f.requiredHeader,expectedPins:pins??copy(f.pins)});
  f.create=()=>f.client.localClient.createPaymentPayload(f.required,f.required.accepts[0]);
  f.sdk=()=>encodeB64Json({x402Version:2,payload:f.payload.payload,accepted:f.payload.accepted,resource:f.payload.resource});
  f.select=pins=>f.client.selectOriginalPaymentHeader(f.sdk(),pins??copy(f.pins));
  return f;
}
function observe(label,kind,fn){
  const pd=Object.getOwnPropertyDescriptor(JSON,'parse'),sd=Object.getOwnPropertyDescriptor(JSON,'stringify');
  const hd=Object.getOwnPropertyDescriptor(crypto,'createHash'),counts={hashCalls:0,jsonParses:0,jsonStringifies:0};
  let text;
  try{
    Object.defineProperty(JSON,'parse',{...pd,value:function(...args){counts.jsonParses++;return apply(parse,JSON,args);}});
    Object.defineProperty(JSON,'stringify',{...sd,value:function(...args){counts.jsonStringifies++;return apply(stringify,JSON,args);}});
    Object.defineProperty(crypto,'createHash',{...hd,value:function(...args){counts.hashCalls++;return apply(nativeHash,crypto,args);}});
    syncBuiltinESMExports();text=fn();
  }finally{
    Object.defineProperty(JSON,'parse',pd);Object.defineProperty(JSON,'stringify',sd);
    Object.defineProperty(crypto,'createHash',hd);syncBuiltinESMExports();
  }
  assert.equal(typeof text,'string');
  if(kind==='construction')assert.equal(counts.hashCalls,phase==='baseline'?8:4);
  if(kind==='three-reads')assert.equal(counts.hashCalls,phase==='baseline'?36:12);
  if(kind==='six-reads')assert.equal(counts.hashCalls,phase==='baseline'?72:24);
  if(kind==='bad-pins')assert.equal(counts.hashCalls,phase==='baseline'?32:0);
  rows.push({label,kind,...counts,outputUnits:text.length,outputSha256:hash(text)});
  return text;
}
test('Fixed checkpoint pins / construction validates the complete GET and POST original before any read',()=>{
  for(const post of [false,true]){
    const f=fixture(post);
    const result=observe(post?'construct-POST':'construct-GET','construction',()=>{
      f.start();return stringify(f.client.selection());});
    assert.equal(result,stringify(f.client.selection()));assert.equal(f.readCount,0);f.client.close();
  }
});
for(const post of [false,true]){
  const name=post?'POST':'GET';
  test('Fixed checkpoint pins / '+name+' returns original header after three full fresh reads',()=>{
    const f=fixture(post).start();
    const text=observe('three-reads-'+name,'three-reads',()=>{f.admit();assert.deepEqual(f.create(),f.payload);return f.select();});
    assert.equal(text,f.header);assert.equal(f.readCount,3);assert.equal(new Set(f.readPins).size,3);
    assert.equal(f.client.snapshot().creationAttempts,1);assert.equal(f.client.snapshot().uncertain,false);f.client.close();
  });
  test('Fixed checkpoint pins / '+name+' repeated admission preserves all six full reads and one creator',()=>{
    const f=fixture(post).start();
    const text=observe('six-reads-'+name,'six-reads',()=>{for(let i=0;i<4;i++)f.admit();f.create();return f.select();});
    assert.equal(text,f.header);assert.equal(f.readCount,6);assert.equal(f.client.snapshot().creationAttempts,1);f.client.close();
  });
  test('Fixed checkpoint pins / '+name+' every mismatching independent field is rejected before reader admission',()=>{
    const f=fixture(post).start(),errors=[];
    observe('bad-pins-'+name,'bad-pins',()=>{
      for(const [group,fields]of [['binding',bindingFields],['digests',digestFields]])for(const field of fields){
        const pins=copy(f.pins);
        pins[group][field]=group==='digests'||field==='paymentHash'?'d'.repeat(64):field==='origin'?'https://foreign.invalid':'foreign.value';
        try{f.admit(pins);assert.fail('PINS_MUST_REFUSE');}catch(error){assert.ok(code('pins_rejected')(error));errors.push(error.code);}
      }
      return stringify(errors);
    });
    assert.equal(f.readCount,0);assert.equal(f.client.snapshot().creationAttempts,0);
    f.admit();f.create();assert.equal(f.select(),f.header);f.client.close();
  });
}
test('Fixed checkpoint pins / structural extras symbols wrong types and missing nested fields remain rejected',()=>{
  for(const post of [false,true])for(const mutate of [
    p=>{p.extra=true;},p=>{p.binding.extra='x';},p=>{p.digests.extra='x';},
    p=>{delete p.binding.contextId;},p=>{delete p.digests.context;},
    p=>{p.binding.contextId={};},p=>{p.binding.requestId=1;},p=>{p.digests.context=false;},
    p=>{p.binding=[p.binding];},p=>{p.digests=[];},p=>{p[Symbol('extra')]=true;},
  ]){
    const f=fixture(post).start(),pins=copy(f.pins);mutate(pins);
    assert.throws(()=>f.admit(pins),TypeError);assert.equal(f.readCount,0);assert.equal(f.client.snapshot().uncertain,false);
    f.client.close();
  }
});
test('Fixed checkpoint pins / detached construction pins and fresh frozen reader arguments cannot be mutated',()=>{
  for(const post of [false,true]){
    const f=fixture(post).start();f.options.expectedPins.binding.contextId='foreign';
    f.options.serializedCheckpoint='{}';
    assert.throws(()=>f.admit(f.options.expectedPins),code('pins_rejected'));
    f.admit();assert.throws(()=>{f.readPins[0].binding.contextId='foreign';},TypeError);
    f.create();assert.equal(f.select(),f.header);assert.equal(f.readCount,3);f.client.close();
  }
});
function enterStage(f,stage){
  if(stage>=2)f.admit();
  if(stage>=3)f.create();
}
function operationStage(f,stage){return stage===1?()=>f.admit():stage===2?f.create:()=>f.select();}
for(const post of [false,true]){
  const name=post?'POST':'GET';
  test('Fixed checkpoint pins / '+name+' changed complete reader records latch at every stage',()=>{
    for(const stage of [1,2,3]){
      const f=fixture(post).start();enterStage(f,stage);
      f.impl=()=>{const changed=copy(f.checkpoint);changed.binding.contextId='foreign';return changed;};
      assert.throws(operationStage(f,stage),code('read_rejected'));
      assert.equal(f.readCount,stage);assert.equal(f.client.snapshot().phase,'HELD');
      assert.equal(f.client.snapshot().creationAttempts,stage===1?0:1);
      f.impl=null;assert.throws(()=>f.admit(),code('unavailable'));assert.equal(f.readCount,stage);
      assert.equal(f.client.close().uncertain,true);assert.equal(f.closedStores,0);
    }
  });
  test('Fixed checkpoint pins / '+name+' reentrant close during any reader never releases a header',()=>{
    for(const stage of [1,2,3]){
      const f=fixture(post).start();enterStage(f,stage);
      f.impl=()=>{assert.equal(f.client.snapshot().activeRead,true);f.client.close();return f.checkpoint;};
      assert.throws(operationStage(f,stage),code('read_rejected'));
      const s=f.client.snapshot();assert.equal(s.phase,'CLOSED');assert.equal(s.uncertain,true);assert.equal(s.activeRead,false);
      assert.equal(f.readCount,stage);assert.throws(()=>f.select(),code('unavailable'));assert.equal(f.readCount,stage);
    }
  });
}
test('Fixed checkpoint pins / a changed SDK transaction still cannot replace signed original bytes',()=>{
  for(const post of [false,true]){
    const f=fixture(post).start();f.admit();f.create();
    const payload=copy(f.payload);payload.payload.transaction.nonce='1111111111111111';
    assert.throws(()=>f.client.selectOriginalPaymentHeader(encodeB64Json(payload),copy(f.pins)),code('header_rejected'));
    assert.equal(f.readCount,2);assert.equal(f.select(),f.header);assert.equal(f.readCount,3);f.client.close();
  }
});
test('Fixed checkpoint pins / closed methods keep arity errors and never reread retained data',()=>{
  for(const post of [false,true]){
    const f=fixture(post).start();const c=f.client.close();
    assert.equal(c.storeClosed,false);assert.equal(c.authority,'NONE');
    assert.throws(()=>f.client.selection(),code('unavailable'));
    assert.throws(()=>f.client.captureChallenge(),code('input_rejected'));
    assert.throws(()=>f.client.localClient.createPaymentPayload(),code('input_rejected'));
    assert.throws(()=>f.client.selectOriginalPaymentHeader(),code('input_rejected'));
    assert.throws(()=>f.admit(),code('unavailable'));assert.throws(f.create,code('unavailable'));
    assert.throws(()=>f.select(),code('unavailable'));
    assert.equal(f.readCount,0);assert.equal(f.client.snapshot().signerCalls,0);assert.equal(f.client.snapshot().transportCalls,0);
  }
});
test('Fixed checkpoint pins / own prototype names cannot disappear during comparison',()=>{
  for(const post of [false,true])for(const group of [null,'binding','digests'])for(const name of ['__proto__','constructor']){
    const f=fixture(post).start(),p=copy(f.pins),part=group===null?p:p[group];
    Object.defineProperty(part,name,{value:{ignored:'extra'},enumerable:true});
    assert.throws(()=>f.admit(p),TypeError);assert.equal(f.readCount,0);f.client.close();
  }
});
test('Fixed checkpoint pins / oversized accessor and proxy pin records remain bounded before reads',()=>{
  for(const post of [false,true]){
    const f=fixture(post).start();let entered=0;
    const proxy=new Proxy(f.pins,{ownKeys(){entered++;throw Error('NO_PROXY');}});
    const getter={binding:f.pins.binding,get digests(){entered++;throw Error('NO_GETTER');}};
    for(const p of [proxy,getter,{binding:{...f.pins.binding,requestId:'x'.repeat(131073)},digests:f.pins.digests}])
      assert.throws(()=>f.admit(p),TypeError);
    assert.equal(entered,0);assert.equal(f.readCount,0);f.client.close();
  }
});
test('Fixed checkpoint pins / caller key order remains independent of canonical checkpoint bytes',()=>{
  for(const post of [false,true]){
    const f=fixture(post).start(),p={digests:Object.fromEntries(Object.entries(f.pins.digests).reverse()),
      binding:Object.fromEntries(Object.entries(f.pins.binding).reverse())};
    f.admit(p);f.create();assert.equal(f.select(p),f.header);assert.equal(f.readCount,3);f.client.close();
  }
});
after(()=>{
  assert.equal(rows.length,8);
  process.stdout.write('# CHECKPOINT_FIXED_PINS_OBSERVATIONS '+stringify({phase,rows})+'\n');
});
