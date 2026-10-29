// SOURCE/PARSER ONLY: existing-file history without opening a provider or SDK.
import { types } from 'node:util';
import { ZenonFundingIntakeSqliteStore } from './service-credit-zenon-funding-intake-sqlite-store.js';
import { NativeFundingTransitionWitness } from './native-funding-transition-witness.js';
import { captureIssuedFundingGrantRecoveryExpectation } from './x402-issued-funding-grant-recovery.js';
import { inspectWitnessedOfficialFundingStoreHistory } from './official-funding-post-transition-witness.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply,S=ZenonFundingIntakeSqliteStore.prototype,W=NativeFundingTransitionWitness.prototype;
const LOAD=D(S,'loadBound').value,CUSTODY=D(S,'officialOutcomeCustody').value,ANCHOR=D(W,'anchor').value,ALL=D(W,'readAll').value;
function fail(){throw new TypeError('ISSUED_FUNDING_WITNESS_HISTORY');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function brand(v,proto,name,fn){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==proto||Object.hasOwn(v,name)||D(proto,name)?.value!==fn)fail();}
/** Independent anchor and separate witness file are caller-selected. Borrow the
 * real prototype readers only. This never transfers a writer epoch, closes a
 * borrowed owner, restores a provider, activates a grant or repairs HELD. */
export function inspectIssuedFundingGrantNativeWitnessHistory(options){
 if(arguments.length!==1)fail();const c=fields(options,['expectation','serviceSelection','resourceUrl','maximumPendingReconciliations','store','transitionWitness']);
 const anchor=captureIssuedFundingGrantRecoveryExpectation(c.expectation);
 brand(c.store,S,'loadBound',LOAD);brand(c.store,S,'officialOutcomeCustody',CUSTODY);brand(c.transitionWitness,W,'anchor',ANCHOR);brand(c.transitionWitness,W,'readAll',ALL);
 const selected=captureIssuedFundingGrantRecoveryExpectation(A(ANCHOR,c.transitionWitness,[]));
 if(selected.boundRowDigest!==anchor.boundRowDigest||selected.outcomeRecordDigest!==anchor.outcomeRecordDigest)fail();
 const custody=fields(A(CUSTODY,c.store,[c.serviceSelection]),['read','compareAndSwap']);
 if(typeof custody.read!=='function'||types.isProxy(custody.read)||!Object.isFrozen(custody.read))fail();
 const store=c.store,witness=c.transitionWitness;
 return inspectWitnessedOfficialFundingStoreHistory(F({expectation:anchor,serviceSelection:c.serviceSelection,resourceUrl:c.resourceUrl,maximumPendingReconciliations:c.maximumPendingReconciliations,
  port:F({loadBound:F(()=>A(LOAD,store,[])),readOfficialOutcome:custody.read,readWitnesses:F(()=>A(ALL,witness,[]))})}));
}
