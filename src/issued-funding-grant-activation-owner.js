import { Buffer } from 'node:buffer';
import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureIssuedFundingPostServiceSelection } from './x402-issued-funding-post-application-binding.js';
import { createIssuedFundingPostSdkResourceBinding } from './x402-issued-funding-post-sdk-resource.js';
import { captureOfficialFundingPostHttpsRoute } from './x402-official-funding-post-https-request-binding.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,K=Reflect.ownKeys,A=Reflect.apply,O=Object.hasOwn,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),HELD=new Set();
function fail(){throw new TypeError('ISSUED_ORIGINAL_FUNDING_ACTIVATION');}
function fields(v,names){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||K(v).length!==names.length)fail();
 const out={};for(const k of names){const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();Object.defineProperty(out,k,{value:d.value,enumerable:true});}return out;}
function own(v,k){if(v===null||typeof v!=='object'||types.isProxy(v)||!Object.isFrozen(v)||K(v).length>128)fail();const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();return d.value;}
function snapshot(v,depth=0,budget={nodes:8192,bytes:131072}){
 if(--budget.nodes<0||depth>24)fail();if(v===null||typeof v==='boolean')return v;
 if(typeof v==='string'){budget.bytes-=Buffer.byteLength(v);if(budget.bytes<0||Buffer.from(v).toString('utf8')!==v)fail();return v;}
 if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))fail();return v;}
 if(typeof v!=='object'||types.isProxy(v))fail();const array=Array.isArray(v),keys=K(v),proto=Object.getPrototypeOf(v);
 if(array){const n=D(v,'length')?.value;if(proto!==Array.prototype||!Number.isSafeInteger(n)||n>4096||keys.length!==n+1)fail();const out=[];
  for(let i=0;i<n;i++){const d=D(v,String(i));if(!d?.enumerable||!O(d,'value'))fail();out.push(snapshot(d.value,depth+1,budget));}return F(out);}
 if((proto!==Object.prototype&&proto!==null)||keys.length>128)fail();const out={};
 for(const k of keys){if(typeof k!=='string'||['then','toJSON','__proto__','constructor','prototype'].includes(k))fail();const d=D(v,k);if(!d?.enumerable||!O(d,'value'))fail();
  budget.bytes-=Buffer.byteLength(k);if(budget.bytes<0)fail();Object.defineProperty(out,k,{value:snapshot(d.value,depth+1,budget),enumerable:true});}return F(out);
}
function same(a,b){return !!a&&!!b&&K(a).length===K(b).length&&K(b).every(k=>O(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function safe(v){if(!invariant()||!types.isPromise(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==PP||D(v,'then')!==undefined)return false;
 const d=D(v,'constructor');return d===undefined||O(d,'value')&&d.value===NP&&!d.enumerable&&!d.writable&&!d.configurable;}
function discard(v){try{if(safe(v)){const q=A(THEN.value,v,[()=>{},()=>{}]);A(THEN.value,q,[()=>{},()=>{}]);}}catch{}}
function capability(){let resolve,reject;const promise=new NP((yes,no)=>{resolve=yes;reject=no;});Object.defineProperty(promise,'constructor',{value:NP});A(THEN.value,promise,[()=>{},()=>{}]);return {promise,resolve,reject};}
function rejected(){const c=capability();c.reject(new TypeError('ISSUED_ORIGINAL_FUNDING_ACTIVATION'));return c.promise;}

/** Explicit operator-owned activation: the native preparer must use the real
 * authenticated observer composition. HTTP and SETTLED alone cannot call it.
 * Actual store/session admission stays in the existing provider controller. */
export function createIssuedFundingGrantActivationOwner(options){
 if(arguments.length!==1||!invariant()||HELD.size>=32)fail();
 const c=fields(options,['selection','resourceUrl','port']),selection=captureIssuedFundingPostServiceSelection(c.selection),url=captureOfficialFundingPostHttpsRoute(c.resourceUrl).resourceUrl;
 const p=fields(c.port,['providerSnapshot','providerClose','loadBound','prepareActivation','admitCommittedServiceGrant']);
 for(const fn of Object.values(p))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();if(new Set(Object.values(p)).size!==5)fail();
 let closed=false,held=false,active=false,attempts=0,activationEntered=false,admittedGrantId=null,row=null,observer=null,prepared=null,work=null,closing=null,providerClose=null;
 let preparations=0,activationCalls=0,admissionCalls=0,closeCalls=0;const opaque=[];
 const retained=F(()=>[p,row,observer,prepared,work,closing,providerClose,opaque]);
 function hold(v){held=true;HELD.add(retained);if(v!==undefined){opaque.push(v);discard(v);}}
 function live(){if(closed||held||!invariant())fail();}
 function inspect(){let v;try{v=A(p.providerSnapshot,undefined,[]);}catch{hold();fail();}if(types.isPromise(v)){hold(v);fail();}return v;}
 function eligible(v){return own(v,'phase')==='OPEN'&&own(v,'uncertain')===false&&own(v,'admissionRevoked')===false&&own(v,'activeOperations')===0
  &&own(v,'fundingBusy')===false&&own(v,'serviceOpening')===false&&own(v,'serviceAdmissionOpen')===false
  &&own(own(v,'binding'),'boundRetained')===true&&own(own(v,'binding'),'officialPhase')==='SETTLED'
  &&own(own(v,'funding'),'intakeBound')===true&&own(own(v,'funding'),'active')===false&&own(own(v,'funding'),'held')===false;}
 function current(hash=null){live();const v=inspect();live();if(!eligible(v))fail();const selected=own(own(v,'binding'),'transactionHash');
  if(typeof selected!=='string'||!/^[0-9a-f]{64}$/.test(selected)||hash!==null&&selected!==hash)fail();return selected;}
 function bound(hash){live();let value;try{value=A(p.loadBound,undefined,[]);}catch{hold();fail();}if(types.isPromise(value)){hold(value);fail();}live();
  const rows=snapshot(value);if(!Array.isArray(rows)||rows.length!==1)fail();const r=fields(rows[0],['issue','binding','status']);
  if(r.status!=='BOUND'||r.binding.transactionHash!==hash||r.issue.resourceUrl!==url||canonicalJson(r.issue.selection)!==canonicalJson(selection))fail();
  const selected=createIssuedFundingPostSdkResourceBinding(r.issue.frame,url).selection();
  if(canonicalJson(r.issue.challenge.paymentRequired)!==canonicalJson(selected.paymentRequired))fail();
  return F({row:rows[0],raw:canonicalJson(rows[0])});
 }
 function observe(value,capture){if(!safe(value)||value===work?.promise||value===closing?.promise||value===providerClose?.promise){hold(value);fail();}
  const ticket=capability();A(THEN.value,value,[v=>{try{ticket.resolve(F({value:capture(v)}));}catch{ticket.reject(new TypeError('ACTIVATION_RECEIPT_UNKNOWN'));}},()=>ticket.reject(new TypeError('ACTIVATION_RECEIPT_UNKNOWN'))]);return ticket.promise;}
 function requestClose(){if(providerClose!==null)return providerClose.promise;providerClose=capability();closeCalls++;
  try{const receipt=A(p.providerClose,undefined,[]),observed=observe(receipt,v=>{if(v!==undefined)fail();const s=inspect();if(own(s,'phase')!=='CLOSED'||own(s,'uncertain')||own(s,'activeOperations')!==0||own(s,'fundingBusy')||own(s,'serviceOpening'))fail();return undefined;});
   A(THEN.value,observed,[()=>providerClose.resolve(undefined),()=>{hold();providerClose.reject(new TypeError('ACTIVATION_PROVIDER_CLOSE_UNKNOWN'));}]);
  }catch{hold();providerClose.reject(new TypeError('ACTIVATION_PROVIDER_CLOSE_UNKNOWN'));}return providerClose.promise;}
 function failed(ticket){hold();requestClose();ticket.reject(new TypeError('ORIGINAL_ACTIVATION_UNKNOWN'));}
 async function settle(value,ticket,hash,pinnedRow){
  try{const result=(await observe(value,v=>snapshot(v))).value;live();current(hash);if(bound(hash).raw!==pinnedRow)fail();
   const r=fields(result,['activation','grant']),grant=r.grant,id=own(grant,'grantId');
   if(typeof id!=='string'||!/^grant_[0-9a-f]{64}$/.test(id)||own(grant,'transactionId')!=='zenontx:'+hash)fail();
   admissionCalls++;let admitted;try{admitted=A(p.admitCommittedServiceGrant,undefined,[id]);}catch{fail();}if(types.isPromise(admitted)){hold(admitted);fail();}
   live();const admission=fields(admitted,['status','grantId','authority']);if(admission.status!=='ADMITTED'||admission.grantId!==id||admission.authority!=='NONE')fail();
   const s=inspect();live();if(own(s,'phase')!=='OPEN'||own(s,'uncertain')||own(s,'admissionRevoked')||own(s,'serviceAdmissionOpen')!==true||own(s,'admittedGrantId')!==id)fail();
   if(bound(hash).raw!==pinnedRow)fail();admittedGrantId=id;
   ticket.resolve(F({status:'ADMITTED',grantId:id,transactionHash:hash,activation:'EXPLICIT_LOCAL_OPERATOR',authority:'NONE'}));
  }catch{failed(ticket);}finally{active=false;}
 }
 const activateOriginalCommittedFunding=F(function activateOriginalCommittedFunding(observerStore){
  if(arguments.length!==1||closed||held||active||activationEntered||attempts>=16||!invariant())return rejected();
  const ticket=capability();work=ticket;active=true;attempts++;observer=observerStore;
  try{const view=inspect();live();if(!eligible(view)){active=false;ticket.resolve(F({status:'NOT_READY',activationEntered:false,authority:'NONE'}));return ticket.promise;}
   const hash=current(),selected=bound(hash);row=selected.row;preparations++;
   prepared=A(p.prepareActivation,undefined,[observerStore,row]);if(types.isPromise(prepared)){hold(prepared);fail();}live();
   if(!Object.isFrozen(prepared))fail();const status=own(prepared,'status');
   if(status==='NOT_READY'){fields(prepared,['status']);current(hash);if(bound(hash).raw!==selected.raw)fail();active=false;ticket.resolve(F({status:'NOT_READY',activationEntered:false,authority:'NONE'}));return ticket.promise;}
   const ready=fields(prepared,['status','activate']);if(status!=='READY'||typeof ready.activate!=='function'||types.isProxy(ready.activate)||!Object.isFrozen(ready.activate)||Object.values(p).includes(ready.activate))fail();
   current(hash);if(bound(hash).raw!==selected.raw)fail();live();activationEntered=true;activationCalls++;
   let returned;try{returned=A(ready.activate,undefined,[]);}catch{fail();}const running=settle(returned,ticket,hash,selected.raw);A(THEN.value,running,[()=>{},()=>{}]);
  }catch{active=false;failed(ticket);}return ticket.promise;
 });
 const admitCommittedServiceGrant=F(function admitCommittedServiceGrant(id){if(arguments.length!==1||active)fail();live();return A(p.admitCommittedServiceGrant,undefined,[id]);});
 const close=F(function close(){if(arguments.length!==0)return rejected();if(closing!==null)return closing.promise;
  closing=capability();closed=true;if(active)hold();const receipt=requestClose();A(THEN.value,receipt,[()=>{if(held||active)closing.reject(new TypeError('ACTIVATION_CLOSE_HELD'));else closing.resolve(undefined);},()=>closing.reject(new TypeError('ACTIVATION_CLOSE_HELD'))]);return closing.promise;});
 const view=F(function snapshotView(){if(arguments.length!==0)fail();return F({version:1,closed,held,active,attempts,maximumAttempts:16,activationEntered,preparations,activationCalls,admissionCalls,admittedGrantId,providerCloseCalls:closeCalls,
  observerStore:'BORROWED_NOT_CLOSED',serviceStore:'BORROWED_NOT_CLOSED',fundingStore:'BORROWED_NOT_CLOSED',newFunding:0,SDKSettlementCalls:0,signatures:0,authority:'EXPLICIT_LOCAL_OPERATOR_REQUIRED',nativeAcceptance:'NOT_ESTABLISHED'});});
 return F({activateOriginalCommittedFunding,admitCommittedServiceGrant,close,snapshot:view});
}
