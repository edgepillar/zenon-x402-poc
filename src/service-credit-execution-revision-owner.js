import { types } from 'node:util';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,A=Reflect.apply,K=Reflect.ownKeys;
const WRITERS=new Set(['prepareDurableExecution','persistDurableExecutionFence','completeDurableExecution','markDurableExecutionUnknown']);
const NP=Promise,PP=NP.prototype,TD=D(PP,'then'),CD=D(PP,'constructor'),SD=D(NP,Symbol.species),THEN=TD.value;
function same(a,b){return !!a&&!!b&&K(a).length===K(b).length&&K(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined
 &&same(D(PP,'then'),TD)&&same(D(PP,'constructor'),CD)&&same(D(NP,Symbol.species),SD);}
function fail(){throw new TypeError('SERVICE_CREDIT_EXECUTION_REVISION_OWNER');}
function object(v,frozen=false){
 if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||(frozen&&!Object.isFrozen(v)))fail();
}
function fields(v,names,frozen=true){
 object(v,frozen);if(K(v).length!==names.length)fail();const out={};
 for(const key of names){const d=D(v,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();Object.defineProperty(out,key,{value:d.value,enumerable:true});}
 return F(out);
}
function own(v,key){object(v,true);const d=D(v,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();return d.value;}
function revision(v){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<0)fail();return v;}
/** Pure claim selection used by the actual SQL transaction. It retains the
 * exact existing ledger/execution objects and selects no economic transition. */
export function selectServiceCreditExecutionOwnershipClaim(value,expectedRevision){
 if(arguments.length!==2)fail();const r=fields(value,['revision','ledgerState','executionState']);
 revision(r.revision);revision(expectedRevision);object(r.ledgerState);
 if(r.executionState!==null)object(r.executionState);
 if(r.revision!==expectedRevision)return F({disposition:'STALE',revision:r.revision,nextRevision:null,ledgerState:null,executionState:null,authority:'NONE'});
 if(r.executionState===null)return F({disposition:'DISABLED',revision:r.revision,nextRevision:null,ledgerState:null,executionState:null,authority:'NONE'});
 if(r.revision===Number.MAX_SAFE_INTEGER)fail();
 return F({disposition:'APPLIED',revision:r.revision,nextRevision:r.revision+1,ledgerState:r.ledgerState,executionState:r.executionState,authority:'NONE'});
}
function discard(value){try{
 if(!invariant()||!types.isPromise(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==PP||D(value,'then')!==undefined)return;
 const d=D(value,'constructor');if(d&&(!Object.hasOwn(d,'value')||d.value!==NP))return;
 const q=A(THEN,value,[()=>{},()=>{}]);A(THEN,q,[()=>{},()=>{}]);
}catch{}}
function argumentsFor(name,args){
 if(!Array.isArray(args)||types.isProxy(args)||Object.getPrototypeOf(args)!==Array.prototype)fail();
 const count=D(args,'length')?.value,writes=WRITERS.has(name),expected=name==='getDurableExecutionSnapshot'?0:1;
 if(count!==expected||K(args).length!==count+1)fail();if(count===0)return F([]);
 const d=D(args,'0');if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();object(d.value);
 const keys=K(d.value);if(keys.length>16)fail();const value={};
 for(const key of keys){if(typeof key!=='string'||['then','toJSON','__proto__','constructor','prototype'].includes(key))fail();
  const field=D(d.value,key);if(!field?.enumerable||!Object.hasOwn(field,'value'))fail();Object.defineProperty(value,key,{value:field.value,enumerable:true});}
 if(writes)revision(own(F(value),'expectedRevision'));return F([F(value)]);
}

/** Revision control over fixed synchronous store ports. Construction is inert.
 * The first initialized snapshot takes one strict revision CAS. Foreign writes
 * retire this owner; observing their revision never acquires a replacement.
 * Store authentication, SQL durability, funding ownership and physical lifetime
 * remain the native host's. This controller grants no invocation authority. */
export function createServiceCreditExecutionRevisionOwner(port){
 if(arguments.length!==1||!invariant())fail();const p=fields(port,['readSnapshot','claim','invoke','knownRefusal']);
 for(const fn of Object.values(p))if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();
 if(new Set(Object.values(p)).size!==4)fail();
 let claimed=false,held=false,busy=false,at=null,reads=0,claims=0,calls=0,writes=0,refusals=0;
 const retained=[];
 function hold(value){held=true;if(value!==undefined){retained.push(value);discard(value);}fail();}
 function live(){if(held)fail();if(busy||!invariant())hold();}
 function read(){
  let raw;reads++;try{raw=A(p.readSnapshot,undefined,[]);}catch(error){hold(error);}
  let r;try{r=fields(raw,['revision','executionState']);revision(r.revision);
   if(r.executionState!==null){object(r.executionState,true);}
  }catch{hold(raw);}if(held)fail();if(!invariant())hold();return raw;
 }
 function current(){const raw=read();if(own(raw,'revision')!==at||own(raw,'executionState')===null)hold(raw);return raw;}
 function initial(){
  const before=read();if(own(before,'executionState')===null)return before;
  const expected=own(before,'revision');if(expected===Number.MAX_SAFE_INTEGER)hold();
  let raw;claims++;try{raw=A(p.claim,undefined,[F({expectedRevision:expected})]);}catch(error){hold(error);}
  let r;try{r=fields(raw,['disposition','revision','executionState']);
   if(r.disposition!=='APPLIED'||revision(r.revision)!==expected+1||r.executionState===null)fail();object(r.executionState,true);
  }catch{hold(raw);}if(held)fail();if(!invariant())hold();at=r.revision;
  const after=current();claimed=true;return after;
 }
 const call=F(function call(name,args){
  if(arguments.length!==2||typeof name!=='string'||(!WRITERS.has(name)&&name!=='getDurableExecutionSnapshot'&&name!=='getRequest'))fail();
  const selected=argumentsFor(name,args);live();busy=true;
  try{
   if(name==='getDurableExecutionSnapshot')return claimed?current():initial();
   if(!claimed)hold();const writer=WRITERS.has(name);
   if(writer){if(own(selected[0],'expectedRevision')!==at)hold();}
   else current();
   // Writers already compare this exact revision inside their SQL transaction.
   // Never read a newer revision to repair STALE, and avoid two extra full-store
   // reads around every acknowledged CAS. Invocation has its own current check.
   calls++;
   let value;try{value=A(p.invoke,undefined,[name,selected]);}
   catch(error){
    if(held)fail();let known;try{known=A(p.knownRefusal,undefined,[error]);}catch(other){hold(other);}
    if(known!==true)hold(known===false?error:known);
    current();refusals++;throw error;
   }
   if(held)fail();if(!invariant())hold();
   if(writer){
    let disposition,next;try{disposition=own(value,'disposition');next=revision(own(value,'revision'));
     if(disposition==='APPLIED'){if(at===Number.MAX_SAFE_INTEGER||next!==at+1)fail();}
     else if(disposition!=='UNCHANGED'||next!==at)fail();
    }catch{hold(value);}if(disposition==='APPLIED'){at=next;writes++;}
   }else if(value!==null){try{object(value,true);}catch{hold(value);}}
   if(!writer)current();return value;
  }finally{busy=false;}
 });
 const assertCurrent=F(function assertCurrent(){if(arguments.length!==0)fail();live();if(!claimed)fail();busy=true;
  try{current();return undefined;}finally{busy=false;}});
 const snapshot=F(function snapshot(){if(arguments.length!==0)fail();return F({executionRevisionOwnerVersion:1,claimed,held,busy,
  revision:at,reads,claims,calls,writes,knownUnchangedRefusals:refusals,opaqueRetained:retained.length,
  automaticReclaim:false,authority:'NONE',nativeDurability:'NOT_ESTABLISHED',externalOwnerFencing:'NOT_ESTABLISHED'});});
 return F({call,assertCurrent,snapshot});
}
