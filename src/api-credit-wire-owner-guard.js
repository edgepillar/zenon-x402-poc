import { types } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,OWN=Object.hasOwn,STATES=new WeakMap();
const PP=Promise.prototype,THEN=PP.then,CTOR=D(PP,'constructor'),SPECIES=D(Promise,Symbol.species);
function fail(){const e=new TypeError('API_CREDIT_WIRE_OWNER_REFUSED');Object.defineProperty(e,'stack',{value:e.message});throw F(e);}
function data(value,name){
 if(value===null||typeof value!=='object'||types.isProxy(value)||!Object.isFrozen(value)||Object.getPrototypeOf(value)!==Object.prototype)fail();
 const d=D(value,name);if(!d?.enumerable||!OWN(d,'value'))fail();return d.value;
}
function method(value,name){const fn=data(value,name);if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();return fn;}
function same(a,b){return !!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(b).every(k=>OWN(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&PP.then===THEN&&same(D(PP,'constructor'),CTOR)&&same(D(Promise,Symbol.species),SPECIES);}
function discardPromise(value){
 if(types.isPromise(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===PP&&PP.then===THEN&&D(Object.prototype,'then')===undefined
  &&same(D(PP,'constructor'),CTOR)&&same(D(Promise,Symbol.species),SPECIES)){
  const d=D(value,'constructor');if(!d||OWN(d,'value')&&d.value===Promise){try{Reflect.apply(THEN,value,[()=>{},()=>{}]);}catch{}}
 }
}
function state(guard){if(guard===null||typeof guard!=='object'||types.isProxy(guard))fail();const s=STATES.get(guard);if(!s)fail();return s;}
/** Borrow only the selected actual file owner and fixed monotonic clock.
 * No method entry at construction; no file open/discovery/ownership transfer. */
export function createApiCreditWireOwnerGuard(configuration){
 if(arguments.length!==1||!invariant()||configuration===null||typeof configuration!=='object'||types.isProxy(configuration)||Object.getPrototypeOf(configuration)!==Object.prototype
  ||Reflect.ownKeys(configuration).length!==2)fail();
 const values={};for(const k of ['fileOwner','clock']){const d=D(configuration,k);if(!d?.enumerable||!OWN(d,'value'))fail();values[k]=d.value;}
 if(typeof values.clock!=='function'||types.isProxy(values.clock)||!Object.isFrozen(values.clock))fail();
 const s={owner:values.fileOwner,view:method(values.fileOwner,'inspect'),current:method(values.fileOwner,'assertCurrent'),clock:values.clock,
  checking:false,held:false,checks:0,admitted:0,last:null,lastBudgetMs:null,lastRemainingMs:null};
 const guard=F({apiCreditWireOwnerVersion:1});STATES.set(guard,s);return guard;
}
export function validateApiCreditWireOwnerGuard(guard){if(arguments.length!==1)fail();state(guard);}
function open(s){
 const v=Reflect.apply(s.view,s.owner,[]);
 if(data(v,'spendingFileOwnerVersion')!==1||data(v,'lifecycle')!=='OPEN'||data(v,'held')!==false||data(v,'busy')!==false
  ||data(v,'backendClosed')!==false||data(v,'databaseOpen')!==true||data(v,'physicalCloseEntered')!==false||data(v,'physicalCloseReturned')!==false)fail();
}
function clock(s){const n=Reflect.apply(s.clock,undefined,[]);discardPromise(n);if(typeof n!=='bigint'||n<0n||s.last!==null&&n<s.last)fail();s.last=n;return n;}
/** Point-in-time admission before native request construction. The transport
 * uses the returned remaining timer budget; it must recheck its own close and
 * request-count state after this callback. This is not atomic wire fencing. */
export function requireCurrentApiCreditWireOwner(guard,requestDeadlineMs){
 if(arguments.length!==2||!Number.isSafeInteger(requestDeadlineMs)||requestDeadlineMs<1||requestDeadlineMs>60000)fail();
 const s=state(guard);if(s.held||s.checking||s.activeAcquisition){s.held=true;fail();}s.checking=true;s.checks++;s.lastBudgetMs=requestDeadlineMs;s.lastRemainingMs=null;
 try{
  if(!invariant())fail();const deadline=clock(s)+BigInt(requestDeadlineMs)*1000000n;open(s);
  const receipt=Reflect.apply(s.current,s.owner,[]);discardPromise(receipt);if(receipt!==undefined||s.held||!invariant())fail();open(s);
  const now=clock(s);if(s.held||!invariant()||now>=deadline)fail();
  // Native timers use whole milliseconds; rounding is less than one quantum,
  // not an OS lifetime bound. Never reset to a new full budget after the guard.
  const remaining=Number((deadline-now+999999n)/1000000n);s.lastRemainingMs=remaining;s.admitted++;return remaining;
 }catch{s.held=true;fail();}finally{s.checking=false;}
}
export function inspectApiCreditWireOwnerGuard(guard){
 if(arguments.length!==1)fail();const s=state(guard);return F({apiCreditWireOwnerVersion:1,checking:s.checking,held:s.held,checks:s.checks,admitted:s.admitted,
  lastBudgetMs:s.lastBudgetMs,lastRemainingMs:s.lastRemainingMs,historicalObservation:true,authority:'NONE',atomicExternalDispatchFencing:'NOT_ESTABLISHED'});
}

// A separate, single-use admission borrows this SAME owner and clock. Its
// ordered observations span one existing-store acquisition and the caller's
// async return. No native resource, timer, reopening or authority is created.
const STORE_ADMISSIONS=new WeakMap();
const STORE_STAGES=F(['DATABASE_ENTRY','EPOCH_ENTRY','COMMIT_ENTRY','STORE_RETURN','CLIENT_RETURN']);
function acquisition(value){
 if(value===null||typeof value!=='object'||types.isProxy(value))fail();
 const a=STORE_ADMISSIONS.get(value);if(!a)fail();return a;
}
export function createApiCreditStoreOwnerAdmission(guard,maxDurationMs){
 if(arguments.length!==2||!Number.isSafeInteger(maxDurationMs)||maxDurationMs<1||maxDurationMs>60000)fail();
 const s=state(guard);
 if(s.held||s.checking||s.activeAcquisition){s.held=true;fail();}
 const token=F({apiCreditStoreOwnerAdmissionVersion:1});
 STORE_ADMISSIONS.set(token,{owner:s,budgetMs:maxDurationMs,deadline:null,index:0,held:false,checking:false});
 s.activeAcquisition=token;return token;
}
export function validateApiCreditStoreOwnerAdmission(token){if(arguments.length!==1)fail();acquisition(token);}
/** Before each irreversible stage, require a current selected owner within the
 * SAME absolute window. Stages name source call sites, not native evidence. */
export function requireApiCreditStoreOwnerStage(token,stage){
 if(arguments.length!==2)fail();const a=acquisition(token),s=a.owner;
 if(a.held||a.checking||s.held||s.checking||s.activeAcquisition!==token
  ||a.index>=STORE_STAGES.length||stage!==STORE_STAGES[a.index]){a.held=true;s.held=true;fail();}
 a.checking=true;s.checking=true;s.checks++;
 try{
  if(!invariant())fail();const before=clock(s);
  if(a.deadline===null)a.deadline=before+BigInt(a.budgetMs)*1000000n;
  if(before>=a.deadline)fail();open(s);
  const receipt=Reflect.apply(s.current,s.owner,[]);discardPromise(receipt);
  if(receipt!==undefined||s.held||a.held||!invariant())fail();open(s);
  const after=clock(s);if(after>=a.deadline||s.held||a.held||!invariant())fail();
  a.index++;s.admitted++;if(a.index===STORE_STAGES.length)s.activeAcquisition=null;
 }catch{a.held=true;s.held=true;fail();}finally{a.checking=false;s.checking=false;}
}
export function inspectApiCreditStoreOwnerAdmission(token){
 if(arguments.length!==1)fail();const a=acquisition(token);
 return F({apiCreditStoreOwnerAdmissionVersion:1,checksPassed:a.index,
  nextStage:a.index===STORE_STAGES.length?'NONE':STORE_STAGES[a.index],
  complete:a.index===STORE_STAGES.length,held:a.held||a.owner.held,checking:a.checking,
  budgetMs:a.budgetMs,historicalObservation:true,nativeExecutionEvidence:false,
  authority:'NONE',atomicExternalDispatchFencing:'NOT_ESTABLISHED'});
}
