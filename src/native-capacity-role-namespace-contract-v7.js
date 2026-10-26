import { types as utilTypes } from 'node:util';

// Closed DATA shape shared by the genuine V7 loader, workers and owners.
// This function does not admit files, authenticate a namespace, import an SDK,
// grant execution authority, or establish the truth of caller-declared flags.
const OWN_KEYS=Reflect.ownKeys, DESCRIPTOR=Object.getOwnPropertyDescriptor;
const PROTOTYPE=Object.getPrototypeOf, FROZEN=Object.isFrozen, FREEZE=Object.freeze;
const DEFINE=Object.defineProperty, OWN=Object.hasOwn, IS_PROXY=utilTypes.isProxy, SAME=Object.is;
const OBJECT_PROTOTYPE=Object.prototype, TEST=Function.call.bind(RegExp.prototype.test);
const NativeTypeError=TypeError, HASH=/^[0-9a-f]{64}$/;
const CODE='INVALID_NATIVE_CAPACITY_ROLE_NAMESPACE_DATA_V7';
const EXPECTED_TAIL=FREEZE([true,true,true,173,404,0,0,false]);
export const NATIVE_CAPACITY_ROLE_NAMESPACE_FIELDS_V7=FREEZE([
  'profileKind','sourceRowsSha256','currentBaseApplication123WithBoundRpcRevision',
  'priorV6GraphMetadataValidatedWithRpcRevision','baselinePackages404Preserved',
  'applicationFiles','packageFiles','sourceTransforms','nativeBuiltinAliases',
  'ordinaryInstalledNamespaceQualified',
]);
export function captureNativeCapacityRoleNamespaceDataV7(snapshot,role,expectedSourceRowsSha256) {
  if(arguments.length!==3||(role!=='PAYER'&&role!=='SERVICE')
      ||typeof expectedSourceRowsSha256!=='string'||!TEST(HASH,expectedSourceRowsSha256))reject();
  if(snapshot===null||typeof snapshot!=='object'||IS_PROXY(snapshot)
      ||PROTOTYPE(snapshot)!==OBJECT_PROTOTYPE||!FROZEN(snapshot))reject();
  const keys=OWN_KEYS(snapshot), fields=NATIVE_CAPACITY_ROLE_NAMESPACE_FIELDS_V7;
  const kind=role==='PAYER'?'NATIVE_CAPACITY_CURRENT_PAYER_NODE24_V7':'NATIVE_CAPACITY_CURRENT_SERVICE_NODE24_V7';
  if(keys.length!==fields.length)reject();
  for(let index=0;index<fields.length;index++) {
    const descriptor=DESCRIPTOR(snapshot,fields[index]);
    const expected=index===0?kind:index===1?expectedSourceRowsSha256:EXPECTED_TAIL[index-2];
    if(!descriptor||!OWN(descriptor,'value')||descriptor.enumerable!==true
        ||descriptor.writable!==false||descriptor.configurable!==false||!SAME(descriptor.value,expected))reject();
  }
  // All admitted own values are immutable primitives. Reuse the frozen
  // snapshot and immutable expectations without an intermediate value array
  // or a reconstructed per-check DATA object.
  return snapshot;
}
function reject() {
  const error=new NativeTypeError(CODE);
  DEFINE(error,'code',{value:CODE,enumerable:true});
  DEFINE(error,'stack',{value:'TypeError: '+CODE,enumerable:false});
  throw FREEZE(error);
}
