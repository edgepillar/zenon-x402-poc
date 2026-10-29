import { types } from 'node:util';
import { canonicalJson } from './canonical.js';
import { captureOriginalFundingSpendingFileProfile } from './original-funding-spending-file-profile.js';
import { captureApiCreditStoredGrantQueryExpected } from './api-credit-stored-grant-query-profile.js';
import { projectApiCreditFundingGrantRecoveryRecord } from './api-credit-funding-grant-recovery-record.js';
import { decodeApiCreditOriginalGrantQueryProfile,consumeApiCreditOriginalGrantQueryProfile,releaseApiCreditOriginalGrantQueryProfile } from './api-credit-original-grant-query-profile.js';

const F=Object.freeze,D=Object.getOwnPropertyDescriptor,O=Object.hasOwn,A=Reflect.apply,NP=Promise,PP=NP.prototype;
const THEN=D(PP,'then'),CTOR=D(PP,'constructor'),SPECIES=D(NP,Symbol.species),ACTIVE=new Set(),HELD=new Set(),SEEN=new WeakSet();
function fail(){throw new TypeError('API_CREDIT_STORED_GRANT_QUERY_UNAVAILABLE');}
function fields(v,names,frozen=false){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==names.length||frozen&&!Object.isFrozen(v))fail();
  const out={};for(const name of names)Object.defineProperty(out,name,{value:data(v,name),enumerable:true});return out;}
function data(v,key){if(v===null||typeof v!=='object'||types.isProxy(v))fail();const d=D(v,key);if(!d?.enumerable||!O(d,'value'))fail();return d.value;}
function method(v,key){if(v===null||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||!Object.isFrozen(v))fail();const fn=data(v,key);if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();return fn;}
function same(a,b){return !!a&&!!b&&Reflect.ownKeys(a).length===Reflect.ownKeys(b).length&&Reflect.ownKeys(b).every(k=>O(a,k)&&a[k]===b[k]);}
function invariant(){return D(Object.prototype,'then')===undefined&&same(D(PP,'then'),THEN)&&same(D(PP,'constructor'),CTOR)&&same(D(NP,Symbol.species),SPECIES);}
function discardPromise(v){try{if(invariant()&&types.isPromise(v)&&!types.isProxy(v)&&Object.getPrototypeOf(v)===PP){const c=D(v,'constructor');
  if(c===undefined||O(c,'value')&&c.value===NP){const p=A(THEN.value,v,[()=>{},()=>{}]);A(THEN.value,p,[()=>{},()=>{}]);}}}catch{}}

/** Read one original query record, validate independently pinned full profile,
 * revoke and physically close the SAME known file owner before returning the
 * private ready profile. The caller alone may then enter the existing one-query
 * transport. DATA ports do not qualify SQL, ownership fencing or native drain. */
export function resolveApiCreditStoredGrantQueryOwner(configuration){
  if(arguments.length!==1||!invariant()||ACTIVE.size+HELD.size>=16)fail();
  const c=fields(configuration,['profile','ports','requireOpening']),p=fields(c.profile,['storedGrantQueryVersion','fileConfiguration','expectedOriginal'],true),ports=fields(c.ports,['openFile'],true);
  if(p.storedGrantQueryVersion!==2)fail();const file=captureOriginalFundingSpendingFileProfile(p.fileConfiguration),expected=captureApiCreditStoredGrantQueryExpected(p.expectedOriginal);
  if(file.storageProfile.mode!=='OPEN_EXISTING'||file.storageProfile.policy.recipients.length!==1)fail();
  const fileConfiguration=F({storageProfile:file.storageProfile,allowedRoot:file.allowedRoot,filePolicy:file.filePolicy});
  for(const fn of [ports.openFile,c.requireOpening])if(typeof fn!=='function'||types.isProxy(fn)||!Object.isFrozen(fn))fail();
  const frame={owner:null,openEntered:false,known:false,borrowerActive:false,borrowerUnknown:false,opaque:[],view:null,current:null,revoke:null,close:null,
    read:null,custody:null,revokeEntered:false,closeEntered:false,revoked:false,closed:false,captured:null,raw:null};
  ACTIVE.add(frame);let bad=false;
  function opening(){const value=A(c.requireOpening,undefined,[]);if(value!==undefined){discardPromise(value);fail();}if(!invariant())fail();}
  function unknown(value){frame.borrowerUnknown=true;frame.opaque.push(value);discardPromise(value);}
  function call(fn,receiver,args,kind){
    if(frame.borrowerActive||frame.borrowerUnknown)fail();frame.borrowerActive=true;
    try{const value=A(fn,receiver,args);const valid=kind==='void'?value===undefined:kind==='read'?value===null||typeof value==='string'
      :value!==null&&typeof value==='object'&&!types.isProxy(value)&&!types.isPromise(value)&&Object.getPrototypeOf(value)===Object.prototype&&Object.isFrozen(value);
      if(!valid){unknown(value);fail();}return value;
    }catch{frame.borrowerUnknown=true;fail();}finally{frame.borrowerActive=false;}
  }
  function state(phase,databaseOpen){
    const v=call(frame.view,frame.owner,[],'view');
    try{const valid=data(v,'spendingFileOwnerVersion')===1&&data(v,'lifecycle')===phase&&data(v,'held')===false&&data(v,'busy')===false
      &&data(v,'backendClosed')===(phase!=='OPEN')&&data(v,'databaseOpen')===databaseOpen
      &&data(v,'physicalCloseEntered')===(phase==='CLOSED')&&data(v,'physicalCloseReturned')===(phase==='CLOSED');
      if(!valid){frame.borrowerUnknown=true;fail();}return v;
    }catch{frame.borrowerUnknown=true;fail();}
  }
  function current(){state('OPEN',true);call(frame.current,frame.owner,[],'void');state('OPEN',true);}
  try{
    opening();
    frame.openEntered=true;try{frame.owner=A(ports.openFile,undefined,[fileConfiguration]);}
    catch{frame.borrowerUnknown=true;fail();}
    if(frame.owner===null||typeof frame.owner!=='object'||types.isProxy(frame.owner)||types.isPromise(frame.owner)||!Object.isFrozen(frame.owner)
        ||Object.getPrototypeOf(frame.owner)!==Object.prototype||SEEN.has(frame.owner)){unknown(frame.owner);fail();}
    frame.view=method(frame.owner,'inspect');frame.current=method(frame.owner,'assertCurrent');frame.revoke=method(frame.owner,'revoke');frame.close=method(frame.owner,'close');
    frame.custody=data(frame.owner,'grantQueryCustody');frame.read=method(frame.custody,'read');SEEN.add(frame.owner);frame.known=true;
    opening();current();opening();frame.raw=call(frame.read,frame.custody,[expected.paymentId],'read');
    opening();current();opening();
    if(frame.raw===null)fail();
    const projected=projectApiCreditFundingGrantRecoveryRecord(frame.raw,F({paymentId:expected.paymentId,originalDigest:expected.originalDigest,checkpointDigest:expected.checkpointDigest,queryDigest:expected.queryDigest}));
    // Check the externally retained FULL profile digest before consuming any
    // row-supplied CA/route/budget/proof as transport configuration.
    if(projected.profileDigest!==expected.profileDigest)fail();
    let ready;
    try{ready=decodeApiCreditOriginalGrantQueryProfile(projected.profileJson);if(ready.originalGrantQueryVersion!==1)fail();frame.captured=consumeApiCreditOriginalGrantQueryProfile(ready);}
    finally{if(ready!==undefined)releaseApiCreditOriginalGrantQueryProfile(ready);}
    const a=frame.captured,q=a.query.originalFunding,policy=file.storageProfile.policy;
    if(a.route.fundingResourceUrl!==expected.fundingResourceUrl||q.transactionId!=='zenontx:'+expected.paymentHash||a.query.requestId!==expected.requestId
        ||a.checkpointDigest!==expected.checkpointDigest||a.queryDigest!==expected.queryDigest
        ||q.holderId!==policy.accountId||q.network!==policy.network||q.asset!==policy.asset||q.payee!==policy.recipients[0])fail();
    opening();current();opening();
  }catch{bad=true;}
  finally{
    // An opaque read/open/view/current call may still borrow the connection.
    // The closer cannot join it: retain HELD and never compete with it.
    if(frame.known&&!frame.borrowerUnknown){
      try{current();frame.revokeEntered=true;call(frame.revoke,frame.owner,[],'void');state('REVOKED',true);frame.revoked=true;
        frame.closeEntered=true;call(frame.close,frame.owner,[],'void');state('CLOSED',false);frame.closed=true;
      }catch{bad=true;}
    }
    ACTIVE.delete(frame);if(frame.openEntered&&(!frame.closed||frame.borrowerUnknown))HELD.add(frame);
  }
  if(bad||frame.captured===null||!frame.closed)fail();
  try{opening();state('CLOSED',false);opening();}catch{HELD.add(frame);fail();}
  return frame.captured;
}
