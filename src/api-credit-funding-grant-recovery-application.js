import { captureApiCreditPurchasedGrantQuery, requireApiCreditPurchasedGrantHandoff } from './api-credit-purchased-grant-handoff.js';
import { captureApiCreditOriginalGrantQueryOutput } from './api-credit-original-grant-query-owner.js';
import { captureOriginalFundingServiceHandoffRequest } from './zenon/dynamic-plasma-original-funding-service-handoff-request.js';
import { restoreOriginalPaymentCheckpoint } from './service-credit-pilot-original-payment-checkpoint.js';
import { types } from 'node:util';
import { captureFundingPostCheckpointRoute } from './x402-funding-post-checkpoint-route.js';
import { captureOriginalFundingSignerPreparation } from './original-funding-signer-context-custody.js';
import { captureApiCreditFundingGrantRecoveryProfile, projectApiCreditFundingGrantRecoveryRecord } from './api-credit-funding-grant-recovery-record.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,K=Reflect.ownKeys,O=Object.hasOwn,A=Reflect.apply;
const NP=Promise,PP=NP.prototype,THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),HELD=new Set();
const OPS=['prepareOriginalFunding','commitOriginalFunding','submitOriginalFunding','handoffToService','submitOriginal'];
function error(){return new TypeError('API_CREDIT_FUNDING_GRANT_RECOVERY_UNAVAILABLE');}
function fail(){throw error();}
function fields(v,keys,frozen=false){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||K(v).length!==keys.length||frozen&&!Object.isFrozen(v))fail();
  const out={};for(const key of keys)Object.defineProperty(out,key,{value:data(v,key),enumerable:true});return out;}
function data(v,key){if(v===null||typeof v!=='object'||types.isProxy(v))fail();const d=D(v,key);if(!d?.enumerable||!O(d,'value'))fail();return d.value;}
function fn(v){if(typeof v!=='function'||types.isProxy(v)||!Object.isFrozen(v))fail();return v;}
function same(a,b){return !!a&&!!b&&K(a).length===K(b).length&&K(b).every(k=>O(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&D(Object.prototype,'toJSON')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function safe(p){if(!invariant()||!types.isPromise(p)||types.isProxy(p)||Object.getPrototypeOf(p)!==PP||Object.getOwnPropertyNames(p).some(k=>k!=='constructor'))return false;
  const c=D(p,'constructor');return c===undefined||O(c,'value')&&c.value===NP;}
function observe(p,yes,no){if(!safe(p))fail();const branch=A(THEN.value,p,[yes,no]);if(!safe(branch))fail();A(THEN.value,branch,[()=>{},()=>{}]);}
function capability(){let resolve,reject;const promise=new NP((a,b)=>{resolve=a;reject=b;});Object.defineProperty(promise,'constructor',{value:NP});A(THEN.value,promise,[()=>{},()=>{}]);return {promise,resolve,reject};}
function rejected(){const c=capability();c.reject(error());return c.promise;}

/** Put the already-created original grant-query proof under the selected
 * spending owner's custody BEFORE checkpoint commit and first funding send.
 * Native binding supplies the same SQL file owner; DATA tests declare ports.
 * No proof generation, query dispatch, replacement payment or retry exists. */
export function createApiCreditFundingGrantRecoveryApplication(configuration){
  if(arguments.length!==1)fail();return createApplication(configuration,false);
}
/** Fixed-product connection: one existing ready-proof lookup precedes handoff.
 * The generic custody component above retains its previous contract. */
export function createApiCreditPurchasedGrantRecoveryApplication(configuration){
  if(arguments.length!==1)fail();return createApplication(configuration,true);
}
function createApplication(configuration,purchased){
  if(!invariant()||HELD.size>=64)fail();
  const c=fields(configuration,['application','custody','paymentId','fundingResourceUrl',...(purchased?['purchase','inspectGrant','lookupPolicy']:[])]);
  if(purchased){fn(c.inspectGrant);if(c.purchase===null||typeof c.purchase!=='object'||types.isProxy(c.purchase)||!Object.isFrozen(c.purchase))fail();}
  const child=fields(c.application,[...OPS,'inspect','close'],true),ports=fields(c.custody,['retain','read','assertCurrent'],true);
  for(const value of [...Object.values(child),...Object.values(ports)])fn(value);
  if(typeof c.paymentId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(c.paymentId))fail();
  captureFundingPostCheckpointRoute(c.fundingResourceUrl);
  let held=false,closed=false,active=false,closing=null,childClose=null,prepared=null,originalDigest=null,retained=null,selected=null;
  let prepareClaimed=false,commitClaimed=false,commitReturned=false,submissionClaimed=false,retains=0,reads=0,currentChecks=0;
  let custodyActive=false,custodyUnknown=false,childCloseRequested=false;
  let fundingReturned=false,handoffClaimed=false,querySelection=null,queryReceipt=null,queryActive=false,queryUnknown=false,queryClosed=false,purchaseMatched=false;
  const opaque=new Set(),retainedFrame=F(()=>[c,childClose,prepared,retained,selected,querySelection,queryReceipt,opaque]);
  function hold(){held=true;HELD.add(retainedFrame);}
  function keep(value){opaque.add(value);try{if(safe(value))observe(value,()=>{},()=>{});}catch{}}
  function childView(){try{const v=A(child.inspect,c.application,[]);if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||!Object.isFrozen(v))fail();
    if(data(v,'held')!==false)hold();return v;}catch{hold();fail();}}
  function available(){if(!invariant()){hold();fail();}if(closed||held||closing!==null)fail();const v=childView();if(held||data(v,'lifecycle')!=='OPEN'||data(v,'publicOperationActive')!==false)fail();}
  function custodyCall(name,args,kind){
    if(custodyActive||custodyUnknown)fail();custodyActive=true;
    try{const value=A(ports[name],c.custody,args);
      if(kind==='void'?value!==undefined:typeof value!=='string'){keep(value);custodyUnknown=true;hold();fail();}
      return value;
    }catch{custodyUnknown=true;hold();fail();}
    finally{custodyActive=false;if(closing!==null){if(custodyUnknown)closing.reject(error());else startChildClose();}}
  }
  function current(){currentChecks++;custodyCall('assertCurrent',[],'void');if(closed||held||!invariant())fail();}
  function checkRecord(raw){
    const projected=projectApiCreditFundingGrantRecoveryRecord(raw,F({paymentId:c.paymentId,originalDigest,
      checkpointDigest:selected.checkpointDigest,queryDigest:selected.queryDigest}));
    if(projected.profileJson!==selected.profileJson||closed||held)fail();return raw;
  }
  function read(){current();reads++;const value=custodyCall('read',[c.paymentId],'text');
    current();if(checkRecord(value)!==retained)fail();}
  function start(work,count,input){
    if(count!==1||active)return rejected();
    try{available();}catch{return rejected();}
    const out=capability();active=true;
    function bad(){hold();active=false;out.reject(error());}
    try{const pending=work(input);observe(pending,value=>{
      active=false;if(closed||held||!invariant()){hold();out.reject(error());return;}
      try{childView();if(held)fail();out.resolve(value);}catch{bad();}
    },bad);}catch{active=false;out.reject(error());}
    return out.promise;
  }
  function delegate(name,input,after=value=>value){
    const out=capability();let pending;
    try{pending=A(child[name],c.application,[input]);observe(pending,value=>{
      try{if(closed||held||!invariant())fail();
        if(value!==undefined&&(value===null||typeof value!=='object'||types.isProxy(value)||!Object.isFrozen(value)
            ||![Object.prototype,null].includes(Object.getPrototypeOf(value))||D(value,'then')!==undefined))fail();
        out.resolve(after(value));}catch{hold();out.reject(error());}
    },()=>{hold();out.reject(error());});}
    catch{keep(pending);hold();out.reject(error());}return out.promise;
  }
  function prepare(input){
    if(prepareClaimed)fail();const original=captureOriginalFundingSignerPreparation(input,c.fundingResourceUrl);
    prepareClaimed=true;originalDigest=original.originalDigest;
    return delegate('prepareOriginalFunding',input,value=>{
      if(data(value,'phase')!=='AWAITING_INDEPENDENT_PINS')fail();const packet=data(value,'packet'),serialized=data(packet,'serializedCheckpoint');
      if(typeof serialized!=='string'||serialized.length>32768)fail();prepared=serialized;return value;
    });
  }
  function commit(input){
    if(prepared===null||commitClaimed)fail();const args=fields(input,['expectedPins','originalGrantQueryProfile']);
    const candidate=captureApiCreditFundingGrantRecoveryProfile(args.originalGrantQueryProfile,F({resourceUrl:c.fundingResourceUrl,serializedCheckpoint:prepared,expectedPins:args.expectedPins}));
    const purchaseQuery=purchased?captureApiCreditPurchasedGrantQuery(c.purchase,candidate.profileJson,F({resourceUrl:c.fundingResourceUrl,serializedCheckpoint:prepared,expectedPins:candidate.expectedPins}),c.lookupPolicy):null;
    commitClaimed=true;selected=candidate;querySelection=purchaseQuery;
    try{
      current();retains++;const raw=custodyCall('retain',[c.paymentId,candidate.profileJson],'text');
      current();retained=checkRecord(raw);read();
      return delegate('commitOriginalFunding',F({expectedPins:candidate.expectedPins}),value=>{
        if(data(value,'phase')!=='LOCAL_STORE_READBACK_MATCHED')fail();commitReturned=true;return value;
      });
    }catch{hold();fail();}
  }
  function submit(input){
    if(!commitReturned||submissionClaimed||retained===null)fail();const args=fields(input,['expectedPins']);
    const pins=captureApiCreditFundingGrantRecoveryProfile(selected.profileJson,F({resourceUrl:c.fundingResourceUrl,serializedCheckpoint:prepared,expectedPins:args.expectedPins})).expectedPins;
    submissionClaimed=true;
    try{read();return delegate('submitOriginalFunding',F({expectedPins:pins}),value=>{
      if(data(value,'phase')!=='FUNDING_INTAKE_BOUND'||data(value,'fundingIntakeStatus')!=='BOUND')hold();else fundingReturned=true;return value;
    });}catch{hold();fail();}
  }
  function handoff(input){
    if(!purchased)return delegate('handoffToService',input);
    if(!fundingReturned||retained===null||querySelection===null||handoffClaimed)fail();
    const checkpoint=restoreOriginalPaymentCheckpoint(prepared,selected.expectedPins);
    const checked=captureOriginalFundingServiceHandoffRequest(input,F({resourceUrl:c.fundingResourceUrl,
      serializedCheckpoint:prepared,paymentRequiredHeader:checkpoint.originalBytes.paymentRequirements}));
    if(!/^grant_[0-9a-f]{64}$/.test(checked.selectedGrantId))fail();
    const request=F({originalPayment:checked.originalPayment,selectedGrantId:checked.selectedGrantId,paymentRequiredHeader:checked.paymentRequiredHeader});
    // All external originals, pins and grant shape are admitted before the
    // one query claim. The ready profile was purchase-bound before funding.
    read();handoffClaimed=true;queryActive=true;const out=capability();
    const guard=F(function requireCurrentPurchasedGrantLookup(){
      if(arguments.length!==0||!queryActive||closed||held||closing!==null||!invariant())fail();
      current();const view=childView();if(closed||held||closing!==null||data(view,'lifecycle')!=='OPEN'||data(view,'publicOperationActive')!==false)fail();
    });
    function bad(){queryActive=false;if(!queryClosed)queryUnknown=true;hold();out.reject(error());startChildClose();}
    try{
      queryReceipt=A(c.inspectGrant,undefined,[selected.profileJson,guard]);
      observe(queryReceipt,value=>{
        queryActive=false;
        try{
          const observation=captureApiCreditOriginalGrantQueryOutput(value);queryClosed=true;
          requireApiCreditPurchasedGrantHandoff(querySelection,request.selectedGrantId,observation);purchaseMatched=true;
          if(closed||held||closing!==null||!invariant())fail();read();
          observe(delegate('handoffToService',request,value=>{
            if(data(value,'phase')!=='SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED'||data(value,'selectedGrantId')!==request.selectedGrantId)fail();return value;
          }),out.resolve,bad);
        }catch{bad();}
      },bad);
    }catch{keep(queryReceipt);bad();}
    return out.promise;
  }
  const out={};const work={prepareOriginalFunding:prepare,commitOriginalFunding:commit,submitOriginalFunding:submit,
    handoffToService:handoff,submitOriginal:input=>delegate('submitOriginal',input)};
  for(const name of OPS)out[name]=F(function(input){return start(work[name],arguments.length,input);});
  out.inspect=F(function inspect(){
    if(arguments.length!==0)fail();const view=childView(),copy={};
    for(const name of K(view)){if(typeof name!=='string'||name==='grantQueryRecovery')fail();Object.defineProperty(copy,name,{value:data(view,name),enumerable:true,configurable:true});}
    if(held){Object.defineProperty(copy,'held',{value:true,enumerable:true});Object.defineProperty(copy,'lifecycle',{value:'HELD',enumerable:true});}
    else if(closed&&data(view,'lifecycle')!=='CLOSED')Object.defineProperty(copy,'lifecycle',{value:'CLOSING',enumerable:true});
    Object.defineProperty(copy,'grantQueryRecovery',{value:F({version:1,phase:held?'HELD':retained===null?'NOT_CAPTURED':'CAPTURED',
      prepareClaimed,commitClaimed,commitReturned,submissionClaimed,active,retains,reads,currentChecks,custodyActive,custodyUnknown,childCloseRequested,
      checkpointDigest:selected?.checkpointDigest??null,queryDigest:selected?.queryDigest??null,
      proofGeneration:false,...(purchased?{queryDispatchRequested:handoffClaimed}:{queryDispatch:false}),
      ...(purchased?{purchasedGrantHandoff:F({version:1,fundingReturned,handoffClaimed,queryActive,queryUnknown,queryCloseObserved:queryClosed,purchaseMatched,maximumQueries:1,grantAuthority:'NOT_REVALIDATED',deliveryLiability:'UNCHANGED'})}:{}),store:'BORROWED_SELECTED_SPENDING_OWNER',nativePersistence:'NOT_QUALIFIED',authority:'NONE'}),enumerable:true});return F(copy);
  });
  function startChildClose(){
    if(closing===null||childCloseRequested||custodyActive||custodyUnknown||purchased&&(queryActive||queryUnknown))return;
    childCloseRequested=true;
    try{childClose=A(child.close,c.application,[]);observe(childClose,value=>{
      try{const v=childView();if(value!==undefined||held||active||data(v,'lifecycle')!=='CLOSED'||data(v,'publicOperationActive')!==false)fail();closing.resolve(undefined);}
      catch{hold();closing.reject(error());}
    },()=>{hold();closing.reject(error());});}catch{hold();closing.reject(error());}
  }
  out.close=F(function close(){
    if(arguments.length!==0)return rejected();if(closing!==null)return closing.promise;
    closing=capability();closed=true;if(active)hold();
    // The parent cannot join an opaque custody borrower. Preserve the same
    // application/file under HELD instead of starting a competing parent close.
    if(custodyUnknown||purchased&&queryUnknown){hold();closing.reject(error());return closing.promise;}
    // A pending lookup can retain the same file guard. Do not start a
    // competing child/file close until that known lookup has returned closed.
    if(purchased&&queryActive){hold();closing.reject(error());return closing.promise;}
    // Reentrant close is revoked now and delegated only after the synchronous
    // custody capability has returned a known receipt.
    startChildClose();return closing.promise;
  });
  return F(out);
}
