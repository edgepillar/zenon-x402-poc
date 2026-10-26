import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NATIVE_CAPACITY_ROLE_NAMESPACE_FIELDS_V7 as FIELDS,
  captureNativeCapacityRoleNamespaceDataV7 as CAPTURE,
} from '../src/native-capacity-role-namespace-contract-v7.js';
const HASH='a'.repeat(64), CODE='INVALID_NATIVE_CAPACITY_ROLE_NAMESPACE_DATA_V7';
const freeze=Object.freeze, define=Object.defineProperty, descriptor=Object.getOwnPropertyDescriptor;
function data(role='PAYER',changes={}) { return freeze({
  profileKind:'NATIVE_CAPACITY_CURRENT_'+role+'_NODE24_V7',sourceRowsSha256:HASH,
  currentBaseApplication123WithBoundRpcRevision:true,priorV6GraphMetadataValidatedWithRpcRevision:true,
  baselinePackages404Preserved:true,applicationFiles:173,packageFiles:404,sourceTransforms:0,
  nativeBuiltinAliases:0,ordinaryInstalledNamespaceQualified:false,...changes,
}); }
const refused=fn=>assert.throws(fn,error=>{
  assert.equal(error.code,CODE);assert.equal(Object.isFrozen(error),true);
  assert.equal(error.stack,'TypeError: '+CODE);assert.deepEqual(Object.keys(error),['code']);return true;
});
test('V7 payer namespace DATA retains the whole exact shape without reconstructing a frozen snapshot',()=>{
  const input=data(),output=CAPTURE(input,'PAYER',HASH);
  assert.equal(output,input);assert.deepEqual(output,input);assert.equal(Object.isFrozen(output),true);
  assert.deepEqual(Object.keys(output),FIELDS);
});
test('V7 service namespace DATA uses its own genuine role kind',()=>{
  const output=CAPTURE(data('SERVICE'),'SERVICE',HASH);
  assert.equal(output.profileKind,'NATIVE_CAPACITY_CURRENT_SERVICE_NODE24_V7');
  refused(()=>CAPTURE(data('PAYER'),'SERVICE',HASH));
});
test('V7 source binding preserves every digest byte',()=>{
  const hash='0123456789abcdef'.repeat(4);
  assert.equal(CAPTURE(data('PAYER',{sourceRowsSha256:hash}),'PAYER',hash).sourceRowsSha256,hash);
});
test('V7 arity is closed before snapshot property inspection',()=>{
  let hooks=0;const p=new Proxy({}, {get(){hooks++;},ownKeys(){hooks++;}});
  for(const args of[[],[p],[p,'PAYER'],[p,'PAYER',HASH,null]])refused(()=>Reflect.apply(CAPTURE,undefined,args));
  assert.equal(hooks,0);
});
test('V7 unknown roles are rejected without coercion',()=>{
  let hooks=0;const role={toString(){hooks++;throw 0;}};
  for(const value of['SUPERVISOR','payer',null,role])refused(()=>CAPTURE(data(),value,HASH));
  assert.equal(hooks,0);
});
test('V7 expected source digest must be an exact lowercase hash',()=>{
  for(const hash of[null,undefined,'a'.repeat(63),'A'.repeat(64),'g'.repeat(64),{}])
    refused(()=>CAPTURE(data(),'PAYER',hash));
});
test('V7 proxy snapshot is rejected without invoking any trap',()=>{
  let hooks=0;const p=new Proxy(data(),{get(){hooks++;throw 0;},ownKeys(){hooks++;throw 0;},
    getOwnPropertyDescriptor(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;},isExtensible(){hooks++;throw 0;}});
  refused(()=>CAPTURE(p,'PAYER',HASH));assert.equal(hooks,0);
});
test('V7 accessor snapshot fields are rejected without reading their getter',()=>{
  let hooks=0;const value={...data()};
  define(value,'sourceRowsSha256',{get(){hooks++;throw 0;},enumerable:true});freeze(value);
  refused(()=>CAPTURE(value,'PAYER',HASH));assert.equal(hooks,0);
});
test('V7 nonenumerable required fields cannot masquerade as the public shape',()=>{
  const value={...data()};define(value,'sourceRowsSha256',{value:HASH,enumerable:false});freeze(value);
  refused(()=>CAPTURE(value,'PAYER',HASH));
});
test('V7 null and foreign prototypes are rejected',()=>{
  for(const value of[null,freeze(Object.assign(Object.create(null),data())),
    freeze(Object.assign(Object.create({}),data())),freeze([])])
    refused(()=>CAPTURE(value,'PAYER',HASH));
});
test('V7 mutable snapshots cannot enter the owner contract',()=>{
  refused(()=>CAPTURE({...data()},'PAYER',HASH));
  const sealed=Object.seal({...data()});refused(()=>CAPTURE(sealed,'PAYER',HASH));
});
test('V7 missing extra and symbol fields remain disallowed',()=>{
  const missing={...data()};delete missing.baselinePackages404Preserved;
  for(const value of[freeze(missing),data('PAYER',{extra:true}),data('PAYER',{[Symbol('extra')]:true})])
    refused(()=>CAPTURE(value,'PAYER',HASH));
});
test('V7 refuses historical namespace flags and V6 kinds',()=>{
  refused(()=>CAPTURE(data('PAYER',{profileKind:'NATIVE_CAPACITY_CURRENT_PAYER_NODE24_V6'}),'PAYER',HASH));
  refused(()=>CAPTURE(data('PAYER',{currentBaseApplication123Preserved:true}),'PAYER',HASH));
  refused(()=>CAPTURE(data('PAYER',{currentV5Application154Preserved:true}),'PAYER',HASH));
});
test('V7 different source hashes never compare equal',()=>{
  refused(()=>CAPTURE(data('PAYER',{sourceRowsSha256:'b'.repeat(64)}),'PAYER',HASH));
});
test('V7 both current RPC and prior metadata premises must be explicitly true',()=>{
  for(const field of['currentBaseApplication123WithBoundRpcRevision','priorV6GraphMetadataValidatedWithRpcRevision'])
    for(const value of[false,1,'true',null])refused(()=>CAPTURE(data('PAYER',{[field]:value}),'PAYER',HASH));
});
test('V7 does not infer package provenance transforms aliases or installed authority',()=>{
  for(const [field,value]of[['baselinePackages404Preserved',false],['sourceTransforms',1],
    ['nativeBuiltinAliases',1],['sourceTransforms',-0],['nativeBuiltinAliases',-0],['ordinaryInstalledNamespaceQualified',true]])
    refused(()=>CAPTURE(data('PAYER',{[field]:value}),'PAYER',HASH));
});
test('V7 exact role and package dimensions cannot be reduced or expanded',()=>{
  for(const [field,value]of[['applicationFiles',163],['applicationFiles',174],['applicationFiles',172],
    ['packageFiles',403],['packageFiles',405],['applicationFiles','173'],['packageFiles',true]])
    refused(()=>CAPTURE(data('PAYER',{[field]:value}),'PAYER',HASH));
});
test('V7 inherited getter hooks are never consulted by synchronous DATA capture',()=>{
  const old=descriptor(Object.prototype,'unusedNamespaceHook');let hooks=0;let output;
  try {
    define(Object.prototype,'unusedNamespaceHook',{configurable:true,get(){hooks++;throw 0;}});
    output=CAPTURE(data(),'PAYER',HASH);
  } finally {if(old===undefined)delete Object.prototype.unusedNamespaceHook;else define(Object.prototype,'unusedNamespaceHook',old);}
  assert.equal(output.sourceRowsSha256,HASH);assert.equal(hooks,0);
});
test('V7 dangerous extra own names never enter the namespace DTO',()=>{
  for(const key of['__proto__','constructor','prototype']) {
    const value={...data()};define(value,key,{value:'opaque',enumerable:true});freeze(value);
    refused(()=>CAPTURE(value,'PAYER',HASH));
  }
});
test('V7 captured descriptor and validation intrinsics survive later replacement',()=>{
  const input=data(), changes=[[Reflect,'ownKeys'],[Object,'getOwnPropertyDescriptor'],[Object,'getPrototypeOf'],
    [Object,'isFrozen'],[Object,'freeze'],[Object,'is'],[RegExp.prototype,'test']];
  const originals=changes.map(([target,key])=>descriptor(target,key));let hooks=0,output;
  try {
    for(const [target,key]of changes)define(target,key,{configurable:true,writable:true,value(){hooks++;throw 0;}});
    output=CAPTURE(input,'PAYER',HASH);
  } finally {for(let i=0;i<changes.length;i++)define(changes[i][0],changes[i][1],originals[i]);}
  assert.deepEqual(output,input);assert.equal(hooks,0);
});

test('V7 intermediate validation never invokes inherited array index setters',()=>{
  const input=data(),old=descriptor(Array.prototype,'0');let hooks=0,output;
  try {
    define(Array.prototype,'0',{configurable:true,get(){hooks++;throw 0;},set(){hooks++;throw 0;}});
    output=CAPTURE(input,'PAYER',HASH);
  } finally {if(old===undefined)delete Array.prototype[0];else define(Array.prototype,'0',old);}
  assert.equal(output,input);assert.equal(hooks,0);
});
