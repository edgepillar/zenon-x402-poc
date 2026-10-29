// SOURCE/PARSER ONLY. No actual SDK, journal, network or native run is claimed.
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { validatePaymentRequired,snapshotActiveUpfrontRequirement } from './x402-wire.js';
import { SettlementJournal } from './settlement-journal.js';
import { ExactZenonFacilitator } from './zenon-payment.js';
import { captureIssuedProviderChainSelection } from './issued-provider-chain-selection.js';
import { createIssuedProviderSelectedJournalObserver } from './issued-provider-selected-journal-observer.js';
import { captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME } from './zenon/operator-trusted-testnet-profile.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply;
const JOURNAL=SettlementJournal.prototype,READ=D(JOURNAL,'getEntrySnapshot').value;
function fail(){throw new TypeError('ISSUED_PROVIDER_NATIVE_FUNDING_ROLES');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function brand(journal){if(journal===null||typeof journal!=='object'||types.isProxy(journal)||Object.getPrototypeOf(journal)!==JOURNAL
 ||Object.hasOwn(journal,'getEntrySnapshot')||D(JOURNAL,'getEntrySnapshot')?.value!==READ)fail();
 const mode=D(journal,'existingOnly');if(!mode||!Object.hasOwn(mode,'value')||mode.value!==true||mode.configurable||mode.writable||mode.enumerable)fail();}

/** Fixed facilitator and separate ORIGINAL journal-only pending observer for
 * the existing owned provider's funding.official configuration. The operator
 * supplies one existingOnly actual SettlementJournal with its fixed constructor
 * descriptor; this adapter never
 * creates, opens, adopts or closes a journal. No fake facilitator or arbitrary
 * verifier/settlement callback can be supplied through this entry.
 *
 * The original first settlement retains the real facilitator's separate live
 * authority. A pending callback can only read that same journal: no settle or
 * runReconciliationMaintenance fallback, no fresh RPC observation or writer.
 * Journal-only pending may exhaust if no independent authenticated observer
 * advances the journal; this adapter does not manufacture that missing evidence.
 */
export function createIssuedProviderNativeFundingRoles(options){
 if(arguments.length!==1)fail();const c=fields(options,['chain','requirement','serviceSelection','journal','maximumPendingReconciliations']);brand(c.journal);
 const serviceSelection=captureIssuedFundingPostServiceSelection(c.serviceSelection);
 const requirement=snapshotActiveUpfrontRequirement(c.requirement),selected=captureIssuedProviderChainSelection(c.chain,requirement);
 const reader=F(original=>{brand(c.journal);return A(READ,c.journal,[original.authorizationKey,original.transactionHash]);});
 const observer=createIssuedProviderSelectedJournalObserver({requirement,readJournal:reader,maximumObservations:c.maximumPendingReconciliations});
 // Constructor is inert with respect to SDK/RPC/journal work. Only the real
 // bridge's explicit first verify/settle entry may acquire those capabilities.
 const localFacilitator=new ExactZenonFacilitator({environment:selected.environment,operatorTrustedChainPolicy:selected.operatorTrustedChainPolicy,
  journal:c.journal,rpcUrl:selected.rpcUrl,rpcTimeoutMs:selected.rpcTimeoutMs,
  ...(selected.operatorTrustedChainPolicy.profileName===PUBLIC_TESTNET_DYNAMIC_PLASMA_RESET_EPOCH_PROFILE_NAME?{expectedPayer:serviceSelection.holderId}:{})});
 const validateChallenge=F(function validateChallenge(challenge){if(arguments.length!==1)fail();validatePaymentRequired(challenge);
  if(challenge.accepts.length!==1||canonicalJson(snapshotActiveUpfrontRequirement(challenge.accepts[0]))!==canonicalJson(requirement))fail();});
 return F({official:F({localFacilitator,validateChallenge,reconcilePendingSettlement:observer.observe,maxPendingReconciliations:c.maximumPendingReconciliations}),
  close:observer.close,snapshot:observer.snapshot,chainProfile:selected.chainProfile,trustMode:selected.trustMode,remoteChainAuthenticated:false});
}
