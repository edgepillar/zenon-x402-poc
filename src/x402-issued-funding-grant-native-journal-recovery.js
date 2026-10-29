// SOURCE/PARSER ONLY. Actual existing-store/journal methods; no native run.
import { types } from 'node:util';
import { restoreIssuedFundingGrantNativeApplication } from './x402-issued-funding-grant-native-recovery-application.js';
import { createOriginalFundingJournalObservation } from './official-funding-post-original-journal-observation.js';
import { captureIssuedFundingGrantRecoveryExpectation } from './x402-issued-funding-grant-recovery.js';
import { captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { captureOfficialFundingPostHttpsRoute } from './x402-official-funding-post-https-request-binding.js';
import { ZenonFundingIntakeSqliteStore } from './service-credit-zenon-funding-intake-sqlite-store.js';
import { SettlementJournal } from './settlement-journal.js';
import { createWitnessedOriginalFundingJournalObservation } from './official-funding-post-transition-witness.js';
import { NativeFundingTransitionWitness } from './native-funding-transition-witness.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply;
const STORE=ZenonFundingIntakeSqliteStore.prototype,JOURNAL=SettlementJournal.prototype;
const LOAD=D(STORE,'loadBound').value,CUSTODY=D(STORE,'officialOutcomeCustody').value,READ=D(JOURNAL,'getEntrySnapshot').value;
const WITNESS=NativeFundingTransitionWitness.prototype;
const ANCHOR=D(WITNESS,'anchor').value,RETAIN=D(WITNESS,'retain').value,WREAD=D(WITNESS,'read').value,ALL=D(WITNESS,'readAll').value;
function fail(){throw new TypeError('ISSUED_FUNDING_GRANT_NATIVE_JOURNAL_RECOVERY');}
function exact(v,keys){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)fail();
 const out={};for(const k of keys){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function brand(v,proto,name,fn){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==proto||Object.hasOwn(v,name)||D(proto,name)?.value!==fn)fail();}
function bindRows(store){return F(()=>A(LOAD,store,[]));}
function bindJournal(journal){return F(original=>A(READ,journal,[original.authorizationKey,original.transactionHash]));}

/** The wrapper constructs its own actual recorded provider. The only new local
 * method quiesces that SAME root before durable original-only observation.
 * It never accepts a caller-supplied CLOSED flag or another application's close
 * receipt. Both stores/journal remain borrowed; no provider is auto-reopened. */
export async function restoreIssuedFundingGrantNativeJournalRecovery(options){
 if(arguments.length!==1)fail();return open(options,false);
}
/** Explicit independent witness profile; the existing entry keeps its contract. */
export async function restoreIssuedFundingGrantNativeWitnessedJournalRecovery(options){
 if(arguments.length!==1)fail();return open(options,true);
}
async function open(options,witnessed){
 const c=exact(options,['funding','service','transport','recovery','observation']),o=exact(c.observation,witnessed?['journal','transitionWitness']:['journal']);
 brand(o.journal,JOURNAL,'getEntrySnapshot',READ);
 const funding=exact(c.funding,['intake','official','maxIntakeAttempts','closeBudgetMs']);
 const i=exact(funding.intake,['store','serviceCreditStore','authorityRecord','deriveFundingTerms','now','observerRoot','observerCatchUp','selection','resourceUrl']);
 const official=exact(funding.official,['localFacilitator','validateChallenge','reconcilePendingSettlement','maxPendingReconciliations']);
 brand(i.store,STORE,'loadBound',LOAD);brand(i.store,STORE,'officialOutcomeCustody',CUSTODY);
 const custody=exact(A(CUSTODY,i.store,[i.selection]),['read','compareAndSwap']);
 for(const fn of Object.values(custody))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();
 const selected=F({expectation:captureIssuedFundingGrantRecoveryExpectation(c.recovery),
   serviceSelection:captureIssuedFundingPostServiceSelection(i.selection),resourceUrl:captureOfficialFundingPostHttpsRoute(i.resourceUrl).resourceUrl,
   maximumPendingReconciliations:official.maxPendingReconciliations});
 const loadBound=bindRows(i.store),readJournal=bindJournal(o.journal);
 let witness=null;
 if(witnessed){for(const [name,fn]of [['anchor',ANCHOR],['retain',RETAIN],['read',WREAD],['readAll',ALL]])brand(o.transitionWitness,WITNESS,name,fn);
  const anchor=captureIssuedFundingGrantRecoveryExpectation(A(ANCHOR,o.transitionWitness,[]));
  if(anchor.boundRowDigest!==selected.expectation.boundRowDigest||anchor.outcomeRecordDigest!==selected.expectation.outcomeRecordDigest)fail();
  const owner=o.transitionWitness;witness=F({retain:F(raw=>A(RETAIN,owner,[raw])),read:F(raw=>A(WREAD,owner,[raw])),readAll:F(()=>A(ALL,owner,[]))});}
 const root=await restoreIssuedFundingGrantNativeApplication(F({funding:c.funding,service:c.service,transport:c.transport,recovery:c.recovery}));
 let observation;
 try{observation=(witnessed?createWitnessedOriginalFundingJournalObservation:createOriginalFundingJournalObservation)(F({...selected,
   ...(witnessed?{witness}:{}),port:F({closeProvider:root.close,inspectProvider:root.snapshot,
     loadBound,readOfficialOutcome:custody.read,compareAndSwap:custody.compareAndSwap,readJournal})}));}
 catch{try{await root.close();}catch{fail();}fail();}
 return F({...root,close:observation.close,reconcileOriginalFunding:observation.observe,
   ...(witnessed?{inspectOriginalFundingHistory:observation.inspectRecordedHistory}:{}),
   snapshot:F(function snapshot(){if(arguments.length!==0)fail();return F({...root.snapshot(),journalRecovery:observation.snapshot()});})});
}
