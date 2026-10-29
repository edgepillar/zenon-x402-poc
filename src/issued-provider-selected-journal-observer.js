import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { snapshotActiveUpfrontRequirement } from './x402-wire.js';
import { captureOriginalSelectedFundingJournalBinding,projectOriginalSelectedFundingJournalSnapshot } from './official-funding-post-original-journal-observation.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),HELD=new Set();
function fail(){throw new TypeError('ISSUED_PROVIDER_SELECTED_JOURNAL_OBSERVER');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function same(a,b){return !!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function safe(v){if(!invariant()||v===null||typeof v!=='object'||types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==PP||D(v,'then')!==undefined)return false;
 const c=D(v,'constructor');return c===undefined||Object.hasOwn(c,'value')&&c.value===NP&&!c.enumerable&&!c.writable&&!c.configurable;}
function capability(){let resolve,reject;const promise=new NP((yes,no)=>{resolve=yes;reject=no;});Object.defineProperty(promise,'constructor',{value:NP});A(THEN.value,promise,[()=>{},()=>{}]);return {promise,resolve,reject};}
function rejected(){const t=capability();t.reject(new TypeError('ISSUED_PROVIDER_SELECTED_JOURNAL_OBSERVER'));return t.promise;}

/** Actual selected-context callback. Only the supplied original journal reader
 * may run. It never calls facilitator.settle, maintenance, SDK, an RPC observer,
 * signer, store writer or grant method. Native callers bind the actual journal
 * prototype reader; DATA callers declare a memory reader. This is not a sandbox.
 * One tuple, zero automatic retries and 0..16 total read entries per instance.
 * Uncertain reads consume their entry and remain HELD, including after close.
 */
export function createIssuedProviderSelectedJournalObserver(options){
 if(arguments.length!==1||!invariant()||HELD.size>=32)fail();
 const c=fields(options,['requirement','readJournal','maximumObservations']);
 if(typeof c.readJournal!=='function'||types.isProxy(c.readJournal)||!Object.isFrozen(c.readJournal)
  ||!Number.isSafeInteger(c.maximumObservations)||Object.is(c.maximumObservations,-0)||c.maximumObservations<0||c.maximumObservations>16)fail();
 const requirement=canonicalJson(snapshotActiveUpfrontRequirement(c.requirement));
 let original=null,originalJson=null,busy=false,closed=false,held=false,reads=0,pending=null;
 const retained=F(()=>[c,original,pending]);
 function hold(v){held=true;HELD.add(retained);if(v!==undefined&&safe(v))try{A(THEN.value,v,[()=>{},()=>{}]);}catch{}}
 const observe=F(function observe(payload,requirements,challenge){
  let selected;
  try{if(arguments.length!==3||closed||held||busy||reads>=c.maximumObservations||!invariant())fail();
   selected=captureOriginalSelectedFundingJournalBinding(payload,requirements,challenge);
   if(canonicalJson(selected.requirement)!==requirement||originalJson!==null&&canonicalJson(selected.normalizer)!==originalJson)fail();
  }catch{return rejected();}
  if(original===null){original=selected;originalJson=canonicalJson(selected.normalizer);}busy=true;reads++;const ticket=capability();pending=ticket;
  function unknown(){hold();busy=false;ticket.reject(new TypeError('ISSUED_PROVIDER_JOURNAL_READ_HELD'));}
  function finish(value){try{if(closed||held||!invariant())fail();const projection=projectOriginalSelectedFundingJournalSnapshot(value,original);
    busy=false;pending=null;ticket.resolve(projection.response);
   }catch{unknown();}}
  try{const value=A(c.readJournal,undefined,[original.original]);
   if(!safe(value)||value===ticket.promise){hold(value);unknown();}
   else A(THEN.value,value,[finish,unknown]);
  }catch{unknown();}return ticket.promise;
 });
 const close=F(function close(){if(arguments.length!==0)fail();closed=true;if(busy)hold();if(held)fail();});
 const snapshot=F(function snapshot(){if(arguments.length!==0)fail();return F({version:1,closed,held,busy,readEntries:reads,maximumObservations:c.maximumObservations,
  originalBound:original!==null,scope:'EXISTING_ORIGINAL_JOURNAL_ONLY',currentCanonicality:'NOT_ESTABLISHED',newChainObservation:false,
  publicationCalls:0,grantCalls:0,physicalRelease:'NOT_ESTABLISHED'});});
 return F({observe,close,snapshot});
}
