import test from 'node:test';
import { equal as q, deepEqual as same, ok, notEqual as ne, throws } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';

/* SOURCE DRAFT / NOT_RUN. One new private DB/ephemeral holder key.
 * Actual session/owner/store; original promises; zero declared deadline.
 * No payment/network, deletion/retry/forced close. Unknown drain stays HOLD.
 * Caps/microtasks are not cancellation, sandbox or durability proof.
 */
const selector = process.argv[2];
if (process.argv.length !== 3 || (selector !== '1' && selector !== '2'))
throw redacted('ACTIVE_CLOSE_SELECTOR_REFUSED');
const SPECS = [["src/service-credit-durable-http-session.js",13978,"a0d6d1436cdb697f125fee2f4dc723a5ddcfd2ee7063b55d56fa006bb8ba69bf"],["src/service-credit-durable-session-close.js",2470,"5aae36a7da39ce5b7b9a8da8e9fbda88465cb1e4853dc791520a1df0ab87ede7"],["src/service-credit-durable-execution-owner.js",40833,"a63a795dda77489f7da0682d83a0683cf07240f83b803f449668cb687a956863"],["src/service-credit-http.js",32432,"c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d"],["src/service-credit-sqlite-store.js",82141,"bda45bd553c8580a7bd66573bb2fb7c3bf12d79bab49a91fe3ac6dc1ebad8422"],["src/service-credit-model.js",55461,"7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a"],["src/service-credit-execution-contract.js",30258,"298f8e74885e1c507953c0fcf7874832f815296746e6bacbdac97a425f1a6c73"],["src/service-credit-capability.js",8284,"cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3"],["package.json",1413,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"]];
const freeze=Object.freeze;
const UID = BigInt(process.getuid()), NOW = 2_000_000_000_000;
const RESULT = 'service.active.close', JSON_TYPE = 'application/json';
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const SUCCESS = Buffer.from('{"ok":true,"resultCode":"service.active.close"}');
const UNAVAILABLE = Buffer.from('{"error":"service_unavailable"}');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const stamp = s => [s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs];
function redacted(label) {
const e = new Error(label);
Object.defineProperty(e,'stack',{value:'Error: '+label,writable:false,configurable:false});
return freeze(e);
}
function dirs(path) {
q(typeof path,'string');
ok(path.length > 0 && path.length < 3800 && isAbsolute(path));
q(resolve(path),path); q(path.includes('\0'),false);
for (let current=path, depth=0; ; depth++) {
ok(depth < 128);
const s=lstatSync(current,{bigint:true});
ok(s.isDirectory()); q(s.isSymbolicLink(),false);
q(realpathSync(current),current);
const parent=dirname(current); if (parent===current) break; current=parent;
}
}
function priv(path,device) {
dirs(path); const s=lstatSync(path,{bigint:true});
q(s.uid,UID); q(s.mode & 0o7777n,0o700n);
if (device!==undefined) q(s.dev,device);
return s;
}
function pinned(path,length,digest) {
q(realpathSync(path),path);const before=lstatSync(path,{bigint:true});
ok(before.isFile());q(before.isSymbolicLink(),false);q(before.uid,UID);q(before.nlink,1n);
q(before.mode & 0o7777n,0o644n);q(before.size,BigInt(length));ok(length<=131072);
const raw=readFileSync(path);
same(stamp(lstatSync(path,{bigint:true})),stamp(before));
q(realpathSync(path),path);q(raw.length,length);q(sha(raw),digest);return raw;
}
async function graph(S) {
S.stage='ROOT_AND_SOURCE_PINS'; S.root=process.env.SPV_SQLITE_FIXTURE_ROOT;
S.rootPin=priv(S.root); same(readdirSync(S.root),[]);
const repo=dirname(dirname(fileURLToPath(import.meta.url))); dirs(repo);
const checked=new Map();
for(const [path,length,digest] of SPECS)
checked.set(path,{url:new URL('../'+path,import.meta.url).href,
raw:pinned(join(repo,path),length,digest)});
q(checked.size,9);
q(JSON.parse(checked.get('package.json').raw.toString('utf8')).type,'module');
S.pins='MATCHED'; S.stage='EXACT_GRAPH_IMPORT';
const load=path=>import(checked.get(path).url);
const session=await load('src/service-credit-durable-http-session.js');
const capability=await load('src/service-credit-capability.js');
const http=await load('src/service-credit-http.js');
const model=await load('src/service-credit-model.js');
const store=await load('src/service-credit-sqlite-store.js');
return {session,capability,http,model,store};
}
function createUnit(S) {
const root=priv(S.root); same(stamp(root),stamp(S.rootPin));
same(readdirSync(S.root),[]);
S.dir=join(S.root,selector==='1'?'case-one-active-close':'case-two-active-close');
throws(()=>lstatSync(S.dir),e=>e.code==='ENOENT');
mkdirSync(S.dir,{mode:0o700}); const s=priv(S.dir,root.dev);
S.unitId=[s.dev,s.ino]; S.path=join(S.dir,'ledger.sqlite');
throws(()=>lstatSync(S.path),e=>e.code==='ENOENT');
}
function files(S) {
const unit=priv(S.dir,S.rootPin.dev);
same([unit.dev,unit.ino],S.unitId); const names=readdirSync(S.dir);
ok(names.length>=1 && names.length<=2 && names.includes('ledger.sqlite'));
for(const name of names) {
ok(name==='ledger.sqlite'||name==='ledger.sqlite-journal');
const path=join(S.dir,name),s=lstatSync(path,{bigint:true});
ok(s.isFile()); q(s.isSymbolicLink(),false); q(s.uid,UID);
q(s.dev,S.rootPin.dev); q(s.nlink,1n);
q(s.mode & 0o7777n,0o600n); ok(s.size<=2097152n);
q(realpathSync(path),path);
if(name==='ledger.sqlite') {
if(S.databaseId===null) S.databaseId=[s.dev,s.ino];
else same([s.dev,s.ino],S.databaseId);
}
}
}
function capability() {
let resolve; const p=new Promise(yes=>{resolve=yes;}); let opened=false;
return {p,release(value){q(opened,false);opened=true;resolve(value);}};
}
function observe(S,p,event,fulfilled=()=>{}) {
ok(types.isPromise(p)); q(Object.getPrototypeOf(p),Promise.prototype);
const seen={p,settled:false,ok:false,value:undefined,error:null}; S.seen.push(seen);
seen.sink=p.then(value=>{
seen.settled=true;seen.ok=true;seen.value=value;S.events.push(event);
try{fulfilled(value);}catch(error){S.errors.push(error);}
},error=>{seen.settled=true;seen.error=error;S.events.push(event+'_REJECTED');});
return seen;
}
async function until(predicate) {
for(let turns=0;turns<256;turns++){if(predicate())return;await Promise.resolve();}
throw redacted('ORIGINAL_PROMISE_PENDING_HOLD');
}
function canonical(value) {
if(value===null||typeof value!=='object')return JSON.stringify(value);
if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
const digest=fill=>'sha256:'+fill.repeat(64);
function seed(S,G) {
S.stage='NEW_SYNTHETIC_STORE';
const pair=generateKeyPairSync('ed25519'),spki=pair.publicKey.export({format:'der',type:'spki'});
q(spki.subarray(0,-32).toString('hex'),'302a300506032b6570032100');
S.keys={privateKey:pair.privateKey,publicKey:spki.subarray(-32).toString('base64url')};
S.holderKeyPairs=1; S.constructing=true;
S.store=G.store.ServiceCreditSqliteStore.create({databasePath:S.path,
allowedRoot:S.dir,deriveCost:()=>2,now:()=>NOW}); files(S);
S.store.registerOffer({modelVersion:G.model.SERVICE_CREDIT_MODEL_VERSION,
providerId:'provider.fixture',serviceId:'service.fixture',resourceId:'resource.fixture',
resourceBinding:digest('e'),offerId:'offer.fixture',offerVersion:1,costPolicyId:'cost.fixture',
fundingPolicyId:'funding.fixture',fundingPolicyVersion:1});
const active=S.store.activateGrantFromTrustedRecord({
activationVersion:G.model.SERVICE_CREDIT_ACTIVATION_VERSION,
authorityProfileId:'authority.mock.fixture',authorityProfileVersion:1,verifierVersion:1,
authorityRecordDigest:digest('d'),fundingPolicyId:'funding.fixture',fundingPolicyVersion:1,
sourceSettlementId:'settlement.fixture',transactionId:'mocktx:'+sha('transaction.fixture'),
providerId:'provider.fixture',serviceId:'service.fixture',resourceId:'resource.fixture',
resourceBinding:digest('e'),offerId:'offer.fixture',offerVersion:1,holderId:'holder.fixture',
capabilityCommitment:G.capability.deriveServiceCreditCapabilityCommitment({publicKey:S.keys.publicKey}),
totalUnits:7,expiresAt:NOW+60000,scheme:'exact',paymentFlow:'upfront',network:'zenon:mock',
chainProfile:{version:1,chainIdentifier:Number.MAX_SAFE_INTEGER.toString(),
genesisMomentumHash:'0'.repeat(64)},asset:'zts1mockasset',amount:'1',
payee:'payee.mock.fixture',payer:'holder.fixture',paymentResourceDigest:digest('4'),
paymentRequirementDigest:digest('2'),paymentIntentDigest:digest('1'),
grantFundingCommitment:digest('3'),evidenceState:'MOMENTUM_INCLUDED',
confirmationPolicy:{policyId:'mock.momentum-included',policyVersion:1,minimumConfirmations:1}});
S.grantId=active.grantId;
S.store.initializeDurableExecution({expectedRevision:S.store.getMetadata().revision,
ledgerId:'ledger.fixture',policy:{policyId:'execution.fixture',policyVersion:1,maxDurationMs:1000},
capacity:8});
const request=id=>freeze({modelVersion:G.model.SERVICE_CREDIT_MODEL_VERSION,
grantId:S.grantId,requestId:id,method:'POST',routeId:G.http.SERVICE_CREDIT_HTTP_ROUTE_ID,
canonicalBodyDigest:EMPTY,selectedContentType:JSON_TYPE,maxCostUnits:2});
S.firstRequest=request('request.original');S.secondRequest=request('request.distinct');
const auth=r=>{
const proof={proofVersion:1,grantId:r.grantId,requestId:r.requestId,publicKey:S.keys.publicKey,
maxCostUnits:r.maxCostUnits,signature:sign(null,
G.capability.createServiceCreditCapabilitySigningBytes(r),S.keys.privateKey).toString('base64url')};
return 'ServiceCredit '+Buffer.from(canonical(proof)).toString('base64url');
};
const envl=r=>freeze({url:G.http.SERVICE_CREDIT_HTTP_PATH,method:'POST',
rawHeaders:freeze(['Authorization',auth(r),'Content-Length','0'])});
S.firstEnvelope=envl(S.firstRequest);S.secondEnvelope=envl(S.secondRequest);
S.admission=G.http.createServiceCreditHttpAdmission({store:S.store,admittedGrantId:S.grantId});
for(const [envelopeValue,description] of [[S.firstEnvelope,S.firstRequest],
[S.secondEnvelope,S.secondRequest]]) {
const decision=S.admission.admit(envelopeValue);
q(decision.status,'AUTHORIZED');same(decision.request,description);
}
}
function deadlineRuntime(S) {
const handles=new Set();S.handles=handles;
return {monotonicNowNs:()=>0n,
schedule(wake,ms){q(typeof wake,'function');q(ms,1000);
const handle=freeze({});handles.add(handle);S.schedules++;return handle;},
cancel(handle){ok(handles.has(handle));handles.delete(handle);S.cancels++;return undefined;}};
}
function exchange(S,envl,label) {
const reply={destroyed:false,writableEnded:false,statusCode:0,headers:Object.create(null),
body:null,ends:0,setHeader(name,value){this.headers[String(name).toLowerCase()]=String(value);},
end(value){this.ends++;this.writableEnded=true;this.body=Buffer.from(value);
S.events.push(label+'_RESPONSE_END');},destroy(){this.destroyed=true;}};
const original=S.session.handle(envl,reply);
return {reply,seen:observe(S,original,label+'_HANDLE_FULFILLED')};
}
function responseEquals(x,status,bytes) {
const r=x.reply;q(x.seen.ok,true);q(r.destroyed,false);
q(r.statusCode,status);q(r.ends,1);same(r.body,bytes);
same({...r.headers},{'cache-control':'private, no-store, max-age=0',
'content-type':JSON_TYPE,vary:'Authorization','x-content-type-options':'nosniff',
'content-length':String(bytes.length)});
}
function credit(S,av,held,used) {
const ledger=S.store.load(),durable=S.store.getDurableExecutionSnapshot();
q(ledger.state.grants.length,1);q(durable.revision,ledger.revision);
const g=ledger.state.grants[0];q(g.grantId,S.grantId);
same([g.totalUnits,g.availableUnits,g.heldUnits,g.consumedUnits],[7,av,held,used]);
return {ledger,durable};
}
function externalClose(S) {
S.closeCalls++;const original=S.session.close();
if(S.external!==null){q(original,S.external.p);return S.external;}
S.external=observe(S,original,'EXTERNAL_CLOSE_FULFILLED',value=>{
q(value,undefined);S.closeObservedCallback=S.execSeen.settled&&S.execSeen.ok;
S.closeResponseEnded=S.first.reply.writableEnded;S.closeView=credit(S,5,0,2);
});return S.external;
}
function releaseOriginal(S) {
if(S.resultReleased)return;S.resultReleased=true;S.releases++;
S.finish.release(freeze({resultCode:RESULT}));
}
function continueCallback(S) {
if(S.turnReleased)return;S.turnReleased=true;S.turn.release(undefined);
}
async function exercise(S,inside) {
const G=await graph(S);createUnit(S);seed(S,G);S.stage='ACTUAL_ACTIVE_EXECUTION';
S.finish=capability();S.turn=capability();const initial=credit(S,7,0,0);
q(initial.ledger.state.requests.length,0);
q(initial.durable.executionState.executions.length,0);
function execute() {
S.calls++;
S.execPromise=(async()=>{
S.entered=true;S.events.push('EXECUTE_ENTERED');
if(inside) {
await S.turn.p;S.innerCalls++;
const inside=S.session.close();ne(inside,S.external.p);
S.inner=observe(S,inside,'CALLBACK_CLOSE_SETTLED');
await until(()=>S.inner.settled);q(S.inner.ok,false);
const error=S.inner.error;ok(error instanceof TypeError);
ok(Object.isFrozen(error));
q(error.message,'SERVICE_CREDIT_DURABLE_HTTP_SESSION_CLOSE_FAILED');
q(error.stack,'TypeError: SERVICE_CREDIT_DURABLE_HTTP_SESSION_CLOSE_FAILED');
S.innerRejected=true;
}
return await S.finish.p;
})();
S.execSeen=observe(S,S.execPromise,'ORIGINAL_EXECUTE_FULFILLED');
return S.execPromise;
}
S.session=G.session.createDurableServiceCreditHttpSession({store:S.store,execute,
deadlineRuntime:deadlineRuntime(S),selectedDurationMs:1000,admittedGrantId:S.grantId});
S.first=exchange(S,S.firstEnvelope,'FIRST');await until(()=>S.entered);
q(S.calls,1);q(S.execSeen.p,S.execPromise);
q(S.execSeen.settled,false);const pending=credit(S,5,2,0);
q(pending.ledger.state.requests.length,1);
q(pending.ledger.state.requests[0].state,'EXECUTING');
q(pending.durable.executionState.executions.length,1);
const execution=pending.durable.executionState.executions[0];
q(execution.fencePhase,'MAY_HAVE_STARTED');q(execution.terminalClassification,'NONE');
q(S.admission.admit(S.secondEnvelope).status,'AUTHORIZED');
const firstClose=externalClose(S).p;
q(externalClose(S).p,firstClose);await Promise.resolve();
q(S.external.settled,false);q(S.execSeen.settled,false);
q(S.first.seen.settled,false);q(S.cancels,0);
S.stage='CLOSING_REFUSAL';const refused=exchange(S,S.secondEnvelope,'CLOSING');
await until(()=>refused.seen.settled);responseEquals(refused,503,UNAVAILABLE);S.closingRefusals++;
same(S.store.load(),pending.ledger);
same(S.store.getDurableExecutionSnapshot(),pending.durable);
q(S.store.getRequest({grantId:S.grantId,requestId:S.secondRequest.requestId}),null);
q(S.calls,1);
if(inside) {
S.stage='ORIGINAL_CALLBACK_CONTEXT_CLOSE';continueCallback(S);
await until(()=>S.innerRejected||S.execSeen.settled);
q(S.innerRejected,true);q(S.inner.ok,false);
q(externalClose(S).p,firstClose);await Promise.resolve();
q(S.external.settled,false);q(S.execSeen.settled,false);
same(S.store.load(),pending.ledger);
}
S.stage='ORIGINAL_RESULT_RELEASE';q(S.resultReleased,false);releaseOriginal(S);
await until(()=>S.first.seen.settled&&S.external.settled&&S.execSeen.settled);
responseEquals(S.first,200,SUCCESS);q(S.execSeen.ok,true);
q(S.external.ok,true);q(S.external.value,undefined);
q(S.closeObservedCallback,true);ok(S.closeView);
const completed=credit(S,5,0,2);
q(completed.ledger.revision,initial.ledger.revision+3);
q(completed.ledger.state.requests.length,1);
const request=S.store.getRequest({grantId:S.grantId,requestId:S.firstRequest.requestId});
q(request.state,'SUCCEEDED');q(request.costUnits,2);
same(request.cachedResult,{statusCode:200,contentType:JSON_TYPE,resultCode:RESULT});
q(completed.durable.executionState.executions.length,1);
q(completed.durable.executionState.executions[0].terminalClassification,'SUCCEEDED');
q(externalClose(S).p,firstClose);
for(const envl of [S.firstEnvelope,S.secondEnvelope]) {
const later=exchange(S,envl,'CLOSED');await until(()=>later.seen.settled);
responseEquals(later,503,UNAVAILABLE);S.closedRefusals++;
same(S.store.load(),completed.ledger);
same(S.store.getDurableExecutionSnapshot(),completed.durable);
}
q(S.calls,1);q(S.releases,1);
q(S.closeCalls,inside?4:3);
q(S.innerCalls,inside?1:0);
q(S.schedules,1);q(S.cancels,1);q(S.handles.size,0);
S.borrowedOpen=Number.isSafeInteger(S.store.getMetadata().revision);
q(S.borrowedOpen,true);files(S);
S.sendOrder=S.events.indexOf('FIRST_RESPONSE_END')<S.events.indexOf('EXTERNAL_CLOSE_FULFILLED')
?'RESPONSE_BEFORE_CLOSE':'CLOSE_BEFORE_RESPONSE';
// Only owner completion is promised; reply-send ordering is observed, not asserted.
S.stage='ASSERTIONS_COMPLETE';
}
async function drainAndClose(S) {
if(S.session!==null) {
if(S.external===null)externalClose(S);
if(S.turn!==null)continueCallback(S);if(S.finish!==null)releaseOriginal(S);
try{await until(()=>S.seen.every(p=>p.settled));}
catch(error){S.hold='ORIGINAL_PROMISE_PENDING';throw error;}
if(S.external.ok!==true){S.hold='EXTERNAL_CLOSE_REJECTED';throw redacted('ORIGINAL_CLOSE_REJECTED_HOLD');}
for(const p of S.seen)if(!p.ok&&p!==S.inner)S.errors.push(p.error);
}
if(S.store!==null) {
S.storeCloses++;
try{q(S.store.close(),undefined);S.storeClosed=true;}
catch(error){S.hold='STORE_CLOSE_UNKNOWN';throw error;}
files(S);
} else if(S.constructing) {
S.hold='STORE_CONSTRUCTION_UNKNOWN';throw redacted('STORE_CONSTRUCTION_UNKNOWN_HOLD');
}
}
const cases=[
['S1 real durable session external close drains one active original',S=>exercise(S,false)],
['S2 original callback close rejects after external close without poisoning it',S=>exercise(S,true)],
];
q(cases.length,2);
test(cases[Number(selector)-1][0],async t=>{
const S={stage:'NOT_STARTED',pins:'NOT_CHECKED',seen:[],events:[],errors:[],
root:null,dir:null,databaseId:null,store:null,session:null,external:null,inner:null,
execSeen:null,first:null,finish:null,turn:null,resultReleased:false,turnReleased:false,
constructing:false,hold:'NONE',holderKeyPairs:0,calls:0,releases:0,
closeCalls:0,innerCalls:0,innerRejected:false,closingRefusals:0,closedRefusals:0,
schedules:0,cancels:0,borrowedOpen:false,storeCloses:0,storeClosed:false,
sendOrder:'NOT_OBSERVED'};
try{await cases[Number(selector)-1][1](S);}catch(error){S.errors.push(error);}
try{await drainAndClose(S);}catch(error){S.errors.push(error);}
const passed=S.errors.length===0&&S.hold==='NONE';
// Retain raw errors in RAM; emit no keys/proofs/identities/private paths or raw diagnostics.
t.diagnostic(JSON.stringify({case:selector,status:passed?'PASS':'FAIL',stage:S.stage,
sources:S.pins,retainedErrors:S.errors.length,hold:S.hold,holderKeyPairs:S.holderKeyPairs,
calls:S.calls,originalReleases:S.releases,closeCalls:S.closeCalls,
innerCalls:S.innerCalls,innerRejected:S.innerRejected,
closing503:S.closingRefusals,closed503:S.closedRefusals,schedules:S.schedules,cancels:S.cancels,
borrowedStoreReadable:S.borrowedOpen,fixtureStoreCloseCalls:S.storeCloses,
fixtureStoreCloseReturned:S.storeClosed,sendOrder:S.sendOrder,
closeBoundary:'OWNER_COMPLETION_ONLY',replayBoundary:'CLOSED_HANDLE_503_CACHE_RETAINED',
qualification:'LOCAL_SYNTHETIC_ONLY',authority:'NONE'}));
if(!passed)throw redacted('SELECTED_REAL_SESSION_ACTIVE_CLOSE_NOT_QUALIFIED');
});
