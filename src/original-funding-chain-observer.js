import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson,sha256Hex } from './canonical.js';
import { validateZenonChainProfile } from './x402-wire.js';
import { captureJournalMomentumConfirmationAdvance as advance } from './journal-momentum-confirmation-advance.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),HELD=new Set();
const ORIGINAL=F(['authorizationKey','transactionHash','chainProfile','intentDigest','resourceIdentity','resourceDigest','payer','signedAccountBlock']);
const ENTRY=F([...ORIGINAL,'evidenceState','momentumEvidence','deliveryState','cachedResponse','createdAt','updatedAt']);
function fail(){throw new TypeError('ORIGINAL_FUNDING_CHAIN_OBSERVATION');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length)fail();const out={};
 for(const k of names){const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function snapshot(v,depth=0,b={nodes:8192,bytes:131072}){
 if(--b.nodes<0||depth>24)fail();if(v===null||typeof v==='boolean')return v;
 if(typeof v==='string'){b.bytes-=Buffer.byteLength(v);if(b.bytes<0||Buffer.from(v).toString('utf8')!==v)fail();return v;}
 if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))fail();return v;}
 if(typeof v!=='object'||types.isProxy(v))fail();const keys=Reflect.ownKeys(v),array=Array.isArray(v),proto=Object.getPrototypeOf(v);
 if(array){if(proto!==Array.prototype)fail();const length=D(v,'length')?.value;if(!Number.isSafeInteger(length)||length<0||length>4096||keys.length!==length+1)fail();const out=[];
  for(let i=0;i<length;i++){const d=D(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();out.push(snapshot(d.value,depth+1,b));}return F(out);}
 if(proto!==Object.prototype||keys.length>128)fail();const out={};
 for(const k of keys){if(typeof k!=='string'||['then','toJSON','__proto__','constructor','prototype'].includes(k))fail();const d=D(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();b.bytes-=Buffer.byteLength(k);if(b.bytes<0)fail();Object.defineProperty(out,k,{value:snapshot(d.value,depth+1,b),enumerable:true});}return F(out);
}
function same(a,b){return !!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function safe(v){if(!invariant()||v===null||typeof v!=='object'||types.isProxy(v)||!types.isPromise(v)||Object.getPrototypeOf(v)!==PP||D(v,'then')!==undefined)return false;const d=D(v,'constructor');return d===undefined||Object.hasOwn(d,'value')&&d.value===NP&&!d.enumerable&&!d.configurable&&!d.writable;}
function cap(){let resolve,reject;const promise=new NP((yes,no)=>{resolve=yes;reject=no;});Object.defineProperty(promise,'constructor',{value:NP});A(THEN.value,promise,[()=>{},()=>{}]);return {promise,resolve,reject};}
function rejected(){const c=cap();c.reject(new TypeError('ORIGINAL_FUNDING_CHAIN_OBSERVATION'));return c.promise;}
function timestamp(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))fail();const n=Date.parse(v);if(!Number.isFinite(n)||new Date(n).toISOString()!==v)fail();return n;}
function original(value,chain,payer){const o=fields(snapshot(value),ORIGINAL);for(const k of ['authorizationKey','transactionHash','intentDigest','resourceDigest'])if(typeof o[k]!=='string'||!/^[0-9a-f]{64}$/.test(o[k]))fail();
 validateZenonChainProfile(o.chainProfile);if(canonicalJson(o.chainProfile)!==chain||o.payer!==payer||o.signedAccountBlock.address!==payer||o.signedAccountBlock.hash!==o.transactionHash
  ||!Number.isSafeInteger(o.signedAccountBlock.chainIdentifier)||String(o.signedAccountBlock.chainIdentifier)!==o.chainProfile.chainIdentifier||o.signedAccountBlock.data!==Buffer.from(o.intentDigest,'hex').toString('base64'))fail();
 if(sha256Hex(o.resourceIdentity)!==o.resourceDigest||sha256Hex({domain:'zenon-x402-authorization-v1',chainProfile:o.chainProfile,intentDigest:o.intentDigest,resourceDigest:o.resourceDigest,transactionHash:o.transactionHash})!==o.authorizationKey)fail();return F(o);
}
function record(value,o){const r=fields(snapshot(value),ENTRY);for(const k of ORIGINAL)if(canonicalJson(r[k])!==canonicalJson(o[k]))fail();const created=timestamp(r.createdAt),updated=timestamp(r.updatedAt);
 if(updated<created||r.deliveryState!=='NONE'||r.cachedResponse!==null)fail();
 if(r.evidenceState==='MOMENTUM_INCLUDED'){const m=fields(r.momentumEvidence,['observedAt','confirmationDetail']);if(timestamp(m.observedAt)<created||timestamp(m.observedAt)>updated)fail();advance(m.confirmationDetail,m.confirmationDetail);}
 else if(r.evidenceState!=='SUBMISSION_ACKNOWLEDGED'||r.momentumEvidence!==null)fail();return F(r);
}
function packet(value,o){const p=fields(snapshot(value),['revision','kind','entry']);if(!Number.isSafeInteger(p.revision)||p.revision<1||p.kind!=='record')fail();return F({...p,entry:record(p.entry,o)});}

/** One original tuple and 0..16 entered observations. Ports are fixed in the
 * real adapter; DATA callers declare memory serialization/read/observation/CAS.
 * No record creation, tombstone, publication, signature or service authority.
 * The real intake reserves its durable observation BEFORE this callback.
 */
export function createOriginalFundingChainObserver(options){
 if(arguments.length!==1||!invariant()||HELD.size>=32)fail();const c=fields(options,['chainProfile','expectedPayer','maximumObservations','port']);
 const chain=snapshot(c.chainProfile);validateZenonChainProfile(chain);const chainJson=canonicalJson(chain);
 if(typeof c.expectedPayer!=='string'||c.expectedPayer.length<1||c.expectedPayer.length>128||!Number.isSafeInteger(c.maximumObservations)||Object.is(c.maximumObservations,-0)||c.maximumObservations<0||c.maximumObservations>16)fail();
 const p=fields(c.port,['check','serialize','readJournal','observeOriginalBlock','compareAndUpdate']);for(const fn of Object.values(p))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();
 let closed=false,held=false,busy=false,entries=0,journalReads=0,chainReads=0,casCalls=0,selected=null,selectedJson=null;const pending=new Set(),opaque=[];
 const retained=F(()=>[c,p,selected,pending,opaque]);function hold(v){held=true;HELD.add(retained);if(v!==undefined)opaque.push(v);}
 const assertOpen=F(function assertOpen(){if(arguments.length!==0||closed||held||!invariant())fail();});
 function guard(){assertOpen();if(A(p.check,undefined,[])!==undefined)fail();assertOpen();}
 function leg(fn,args){const t=cap();try{guard();const value=A(fn,undefined,args);if(!safe(value)||pending.has(value)){hold(value);fail();}pending.add(value);
   A(THEN.value,value,[v=>{pending.delete(value);try{guard();t.resolve(snapshot(v));}catch{hold();t.reject(new TypeError('ORIGINAL_CHAIN_RECEIPT_HELD'));}},()=>{pending.delete(value);hold();t.reject(new TypeError('ORIGINAL_CHAIN_RECEIPT_HELD'));}]);
  }catch{hold();t.reject(new TypeError('ORIGINAL_CHAIN_RECEIPT_HELD'));}return t.promise;
 }
 const observe=F(function observe(value){
  let o;try{if(arguments.length!==1||busy||entries>=c.maximumObservations)fail();guard();o=original(value,chainJson,c.expectedPayer);if(selectedJson!==null&&canonicalJson(o)!==selectedJson)fail();}catch{return rejected();}
  if(selected===null){selected=o;selectedJson=canonicalJson(o);}busy=true;entries++;const t=cap();let workEntered=false,workComplete=false,workResult=null;
  async function read(){guard();journalReads++;return packet(await leg(p.readJournal,[selected]),selected);}
  async function work(){
   const before=await read();guard();chainReads++;const observed=fields(await leg(p.observeOriginalBlock,[selected,before.entry]),['found','confirmationDetail']);guard();
   if(typeof observed.found!=='boolean'||!observed.found&&observed.confirmationDetail!==null)fail();
   const detail=observed.confirmationDetail;if(detail!==null)advance(detail,detail);
   const included=before.entry.evidenceState==='MOMENTUM_INCLUDED';let change=false;
   if(included){if(!observed.found||detail===null)fail();change=advance(before.entry.momentumEvidence.confirmationDetail,detail).changed;}
   else change=detail!==null;
   let receipt=null;
   if(change){if(!Number.isSafeInteger(before.revision+1))fail();guard();casCalls++;
    receipt=fields(await leg(p.compareAndUpdate,[F({expectedRevision:before.revision,expectedRecord:before.entry,evidenceState:'MOMENTUM_INCLUDED',confirmationDetail:detail})]),['changed','record']);guard();
    const r=record(receipt.record,selected);if(receipt.changed!==true||r.evidenceState!=='MOMENTUM_INCLUDED'||canonicalJson(r.momentumEvidence.confirmationDetail)!==canonicalJson(detail)||r.createdAt!==before.entry.createdAt||timestamp(r.updatedAt)<timestamp(before.entry.updatedAt))fail();
    if(included&&r.momentumEvidence.observedAt!==before.entry.momentumEvidence.observedAt)fail();receipt=F({changed:true,record:r});
   }
   const after=await read();guard();
   if(change){if(after.revision!==before.revision+1||canonicalJson(after.entry)!==canonicalJson(receipt.record))fail();}
   else if(after.revision!==before.revision||canonicalJson(after.entry)!==canonicalJson(before.entry))fail();
   workComplete=true;workResult=after;return after;
  }
  const once=F(()=>{try{guard();if(workEntered){hold();fail();}workEntered=true;return work();}catch{hold();throw new TypeError('ORIGINAL_CHAIN_SERIALIZATION_HELD');}});
  try{guard();const serialized=A(p.serialize,undefined,[once]);if(!safe(serialized)||pending.has(serialized)){hold(serialized);fail();}pending.add(serialized);
   A(THEN.value,serialized,[v=>{pending.delete(serialized);try{guard();if(!workEntered||!workComplete||v!==workResult)fail();busy=false;t.resolve(v);}catch{hold();busy=false;t.reject(new TypeError('ORIGINAL_CHAIN_RESULT_HELD'));}},()=>{pending.delete(serialized);hold();busy=false;t.reject(new TypeError('ORIGINAL_CHAIN_RESULT_HELD'));}]);
  }catch{hold();busy=false;t.reject(new TypeError('ORIGINAL_CHAIN_RESULT_HELD'));}return t.promise;
 });
 const close=F(function close(){if(arguments.length!==0)fail();closed=true;if(busy||pending.size!==0||opaque.length!==0)hold();if(held)fail();});
 const snapshotView=F(function snapshotView(){if(arguments.length!==0)fail();return F({version:1,closed,held,busy:busy||pending.size!==0||opaque.length!==0,entries,maximumObservations:c.maximumObservations,journalReads,chainReads,casCalls,pendingReceipts:pending.size,originalBound:selected!==null,
  scope:'ONE_ORIGINAL_CHAIN_READ_AND_EXISTING_JOURNAL_CAS',newChainObservation:true,publications:0,signatures:0,grants:0,tombstones:0,deliveryCalls:0,authority:'NONE',currentCanonicality:'NOT_ESTABLISHED',physicalRelease:'NOT_ESTABLISHED'});});
 return F({observe,assertOpen,close,snapshot:snapshotView});
}
