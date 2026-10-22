// Six selected V5 strict HTTP/owner/SQLite cases on TWO new private synthetic files.
// Socketless declared handles and authorization metadata only; no proof verification or signatures.
// No network, SDK, installation, wallet, real payment, forced kill or process/OS restart.
// Independent SQL reads occur only after production clients and stores close.
import test,{after} from 'node:test';
import a from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ENTRY="qualification/service-credit-custodied-http-response-observation-v5.behavior.draft.mjs",SELF=fileURLToPath(import.meta.url),REPO=resolve(dirname(SELF),'..');
const SPECS=[
  [
    "src/service-credit-custodied-http-client.js",
    12646,
    324,
    "35997f41c9a5162fe29ed56776181a1691c0a0a69c7dbdfe8b61785af3998145"
  ],
  [
    "src/service-credit-custodied-sqlite-http-client.js",
    20887,
    550,
    "e7a8f3f7acdf9346d2b74a3d2918874b66e036b3dad0a363862dcc7119b68702"
  ],
  [
    "src/service-credit-custodied-request-owner.js",
    55155,
    1358,
    "2ba222760d4a922bf0466d95fd2671076b9d19b8c5fa4ea2cb3c66b1338562eb"
  ],
  [
    "src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",
    76152,
    1904,
    "3b77ec2e17293f9cc0de75147c84c50aa34563e6bcfb1917da06a4ecb3f3b2c9"
  ],
  [
    "src/service-credit-http-execute-dispatch.js",
    28104,
    790,
    "929881081b22b90b07d3d1c4dc8f873d4d81ee5ae84542d24b7534674f4eb9c0"
  ],
  [
    "src/service-credit-original-request-custody-contract.js",
    14051,
    356,
    "fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"
  ],
  [
    "src/x402-wire.js",
    39886,
    934,
    "5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"
  ],
  [
    "package.json",
    1413,
    40,
    "8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"
  ]
];
a.equal(process.argv.length,2);a.equal(process.argv[1],SELF);
a.equal(process.versions.node,'24.19.0');a.equal(process.platform,'darwin');a.equal(process.arch,'arm64');
a.equal(process.env.P2_HTTP_RESPONSE_OBSERVATION_V5_OPT_IN,'synthetic-native-http-response-observation-v5-only');
const PINS=JSON.parse(process.env.P2_HTTP_RESPONSE_OBSERVATION_V5_PINS),scratch=process.env.SPV_TASK_SCRATCH;
a.equal(typeof scratch,'string');a.equal(resolve(scratch),scratch);
const scratchStat=lstatSync(scratch,{bigint:true});a.ok(scratchStat.isDirectory()&&!scratchStat.isSymbolicLink());
a.equal(scratchStat.uid,BigInt(process.getuid()));a.equal(scratchStat.mode&0o777n,0o700n);
const NAMES=['http-observed-v5.sqlite','http-control-v4.sqlite'];
for(const name of NAMES)a.throws(()=>lstatSync(join(scratch,name)),{code:'ENOENT'});
const ids=s=>['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k=>String(s[k]));
const sha=b=>createHash('sha256').update(b).digest('hex');
function sources() {
  a.equal(PINS.length,9); a.deepEqual(PINS.map(p=>p.path),[...SPECS.map(s=>s[0]),ENTRY]);
  let total=0;
  return PINS.map((p,index)=>{
    const path=join(REPO,p.path), st=lstatSync(path,{bigint:true});
    a.ok(st.isFile()&&!st.isSymbolicLink()); a.equal(st.uid,BigInt(process.getuid())); a.equal(st.nlink,1n);
    a.ok(st.size>0n&&st.size<=131072n); a.deepEqual(ids(st),p.identity);
    const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW), raw=Buffer.alloc(Number(st.size)+1);
    let used=0;
    try {
      a.deepEqual(ids(fstatSync(fd,{bigint:true})),p.identity);
      while(used<raw.length) { const n=readSync(fd,raw,used,raw.length-used,null); if(!n) break; used+=n; }
      a.deepEqual(ids(fstatSync(fd,{bigint:true})),p.identity);
    } finally { closeSync(fd); }
    a.deepEqual(ids(lstatSync(path,{bigint:true})),p.identity); a.equal(used,Number(st.size));
    const bytes=raw.subarray(0,used);
    a.equal(bytes.includes(0),false); a.equal(bytes.some(n=>n>127),false);
    total+=used; a.ok(total<=327680); a.equal(used,p.bytes); a.equal(sha(bytes),p.sha256);
    a.equal(bytes.filter(n=>n===10).length,p.LF);
    if(index<SPECS.length) a.deepEqual([p.path,p.bytes,p.LF,p.sha256],SPECS[index]);
    return {path:p.path,bytes:p.bytes,sha256:p.sha256,identity:p.identity};
  });
}
const sourceBefore=sources();


const stores = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const http = await import('../src/service-credit-custodied-http-client.js');
const owned = await import('../src/service-credit-custodied-sqlite-http-client.js');
const custody = await import('../src/service-credit-original-request-custody-contract.js');
const { DatabaseSync } = await import('node:sqlite');
const CREATE4 = stores.createZenonFundingPayerRecoveryCustodyQuarantineSqliteStoreV4;
const CREATE5 = stores.createZenonFundingPayerRecoveryResponseObservationSqliteStoreV5;
const OPEN4 = owned.openServiceCreditCustodiedSqliteHttpClientV4;
const OPEN5 = owned.openServiceCreditCustodiedSqliteHttpClientV5;
const BORROW5 = http.createServiceCreditCustodiedHttpClientV5;
const dispatchers = await import('../src/service-credit-http-execute-dispatch.js');
const ORIGINAL = custody.serializeOriginalServiceRequestCustody;
const INTENT = custody.serializeOriginalServiceDispatchIntent;
const FUNDING = 'https://http-observation.invalid/funding';
const SERVICE = 'https://http-observation.invalid/service-credit/v1/execute';
const HASH = 'a'.repeat(64);
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE });
const CP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const RP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const REPLY = Buffer.from('{"ok":true,"resultCode":"accepted"}');
const OPTIONS = { concurrency: false, timeout: 5000 };
const f = {
  store: null, root: null, borrowed: null, roots: [], exchanges: [], sinks: [], identities: new Map(),
  createdStoreCloses: 0, requests: 0, replies: 0, uncertain: 0, blocked: 0, profileRefusals: 0,
  stage: 0, fundingText: null, originals: new Map(), intents: new Map(), stampA: null, stampB: null,
  borrowedCloses: 0, borrowedConfirmed: 0, malformedReplyRefusals: 0, standaloneV1Void: 0, standaloneV2Json: 0,
};
const key = (grantId, requestId) => ({ grantId, requestId });
function input(grantId, requestId) {
  const originalRequestJson = JSON.stringify({
    modelVersion: 1, grantId, requestId, method: 'POST', routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: 'sha256:' + sha(Buffer.alloc(0)),
    selectedContentType: 'application/json', maxCostUnits: 1,
  });
  const proof = JSON.stringify({
    grantId, maxCostUnits: 1, proofVersion: 1, publicKey: 'declared-public-key',
    requestId, signature: 'declared-signature-' + requestId,
  });
  return { grantId, requestId, originalRequestJson, originalBodyBase64: '', serviceResourceUrl: SERVICE,
    authorizationHeader: 'ServiceCredit ' + Buffer.from(proof).toString('base64url') };
}
function pair() {
  const requirement = { scheme: 'exact', network: 'zenon:testnet', asset: 'synthetic-asset', amount: '1',
    payTo: 'synthetic-payee', maxTimeoutSeconds: 30, extra: { poc: true, settlement: 'account-block',
      paymentFlow: 'upfront', minimumMomentumConfirmations: 2, zenonChain: {
        version: 1, chainIdentifier: '42', genesisMomentumHash: '1'.repeat(64),
      } } };
  const required = { x402Version: 2, resource: { url: FUNDING }, accepts: [requirement] };
  const payload = { x402Version: 2, resource: { url: FUNDING }, accepted: requirement,
    payload: { transaction: { hash: HASH }, intentDigest: '2'.repeat(64) } };
  return { challenge: { status: 'PAYMENT_REQUIRED', resourceUrl: FUNDING, paymentRequired: required,
    paymentRequiredHeader: Buffer.from(JSON.stringify(required)).toString('base64') },
    paymentSignatureHeader: Buffer.from(JSON.stringify(payload)).toString('base64') };
}
function config(name) {
  return { databasePath: join(scratch, name), allowedRoot: scratch, resourceUrl: FUNDING, custodyPolicy: POLICY };
}
function rootConfig(name, grantId) {
  return { databasePath: join(scratch, name), allowedRoot: scratch, fundingResourceUrl: FUNDING,
    custodyPolicy: POLICY, selectedGrantId: grantId, requestImpl, deadlineMs: 2000 };
}
function nativeFile(name) {
  const st = lstatSync(join(scratch, name), { bigint: true });
  a.ok(st.isFile() && !st.isSymbolicLink()); a.equal(st.uid, BigInt(process.getuid()));
  a.equal(st.dev, scratchStat.dev); a.equal(st.nlink, 1n); a.equal(st.mode & 0o777n, 0o600n);
  const id = ids(st).slice(0, 6);
  if (f.identities.has(name)) a.deepEqual(id, f.identities.get(name)); else f.identities.set(name, id);
}
function wholeFile(name) {
  nativeFile(name);
  const p = join(scratch, name), st = lstatSync(p, { bigint: true }), before = ids(st);
  a.ok(st.size <= 131072n);
  const fd = openSync(p, constants.O_RDONLY | constants.O_NOFOLLOW), b = Buffer.alloc(Number(st.size) + 1);
  let used = 0;
  try {
    a.deepEqual(ids(fstatSync(fd, { bigint: true })), before);
    while (used < b.length) { const n = readSync(fd, b, used, b.length - used, null); if (!n) break; used += n; }
    a.deepEqual(ids(fstatSync(fd, { bigint: true })), before);
  } finally { closeSync(fd); }
  a.equal(used, Number(st.size)); a.deepEqual(ids(lstatSync(p, { bigint: true })), before);
  return { identity: before, sha256: sha(b.subarray(0, used)) };
}
function closeProducer() { f.store.close(); f.store = null; f.createdStoreCloses++; }
function make(name, grantId, factory = OPEN5) {
  a.equal(f.root, null); const root = factory(rootConfig(name, grantId)); f.roots.push(root); f.root = root; return root;
}
function observe(promise) {
  const state = { promise, settled: false };
  state.result = promise.then(value => { state.settled = true; return { value }; },
    error => { state.settled = true; return { error }; });
  f.sinks.push(state.result); return state;
}
async function pending(observed) {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  a.equal(observed.settled, false);
}
function failure(result, prefix, code) {
  a.ok(Object.hasOwn(result, 'error')); a.equal(result.error.code, prefix + code);
  a.equal(result.error.message, result.error.code); a.equal(Object.isFrozen(result.error), true);
}
function success(result) { a.equal(Object.hasOwn(result, 'error'), false); a.equal(result.value, undefined); }
async function closeRoot(root, unknown) {
  const closing = observe(root.close()); a.equal(root.close(), closing.promise);
  const result = await closing.result;
  if (unknown) failure(result, RP, 'CHILD_OUTCOME_UNKNOWN'); else success(result);
  a.equal(root.close(), closing.promise);
  const s = root.snapshot();
  a.equal(s.resource.admissionClosed, true); a.equal(s.resource.phase, 'RELEASED');
  a.equal(s.resource.slotHeld, false); a.equal(s.resource.storeCloseAttempts, 1);
  a.equal(s.resource.storeCloseOutcome, 'RETURNED');
  a.equal(s.close.outcome, unknown ? 'CHILD_UNKNOWN' : 'DRAINED');
  a.equal(s.close.childOutcome, unknown ? 'REJECTED' : 'FULFILLED');
  a.equal(s.client.owner.closed, true); a.equal(s.client.owner.active, false);
  if (f.root === root) f.root = null;
}
function frozen(v) {
  if (v !== null && typeof v === 'object') {
    a.equal(Object.isFrozen(v), true); for (const x of Object.values(v)) frozen(x);
  }
}
function redacted(root, version = 5) {
  const s = root.snapshot(); frozen(s);
  a.equal(s.resource.ownership, version === 5 ? 'OWNED_EXISTING_V5_RESPONSE_OBSERVATION' : 'OWNED_EXISTING_V4_CUSTODY_QUARANTINE');
  a.equal(s.client.storeOwnership, 'BORROWED');
  const text = JSON.stringify(s);
  for (const secret of [FUNDING, SERVICE, HASH, 'ServiceCredit ', 'declared-public-key', 'declared-signature']) {
    a.equal(text.includes(secret), false);
  }
  a.equal(s.qualification, 'UNQUALIFIED');
  for (const field of ['actualPersistence','restart','currentAuthority','realReady','serviceDelivery','osCleanup']) {
    a.equal(s[field], 'NOT_ESTABLISHED');
  }
}
function stamp(name) {
  a.equal(f.root, null); a.equal(f.store, null);
  a.ok(f.roots.every(r => r.snapshot().resource.storeCloseOutcome === 'RETURNED')); nativeFile(name);
  const db = new DatabaseSync(join(scratch, name), { readOnly: true, allowExtension: false,
    enableDoubleQuotedStringLiterals: false, enableForeignKeyConstraints: true, timeout: 0 });
  try {
    const userVersion = db.prepare('PRAGMA user_version').get().user_version;
    return {
      epoch: db.prepare('SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1').get().owner_epoch,
      meta: db.prepare('SELECT singleton,resource_url FROM payer_recovery_meta ORDER BY singleton').all(),
      state: db.prepare('SELECT * FROM payer_recovery_state ORDER BY singleton').all(),
      originals: db.prepare('SELECT * FROM original_service_requests ORDER BY grant_id,request_id').all(),
      intents: db.prepare('SELECT * FROM original_dispatch_intents ORDER BY grant_id,request_id').all(),
      quarantines: userVersion >= 4 ? db.prepare('SELECT * FROM original_custody_quarantines ORDER BY grant_id').all() : [],
      observations: userVersion === 5 ? db.prepare('SELECT * FROM original_response_observations ORDER BY grant_id,request_id').all() : [],
      policy: db.prepare('SELECT * FROM original_request_custody_policy').all(),
      schema: db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
      userVersion, applicationId: db.prepare('PRAGMA application_id').get().application_id,
    };
  } finally { db.close(); }
}
class Handle {
  #listeners = new Map(); #closed = false;
  constructor() { this.destroys = []; }
  on(name, listener) {
    const list = this.#listeners.get(name) ?? []; list.push(listener); this.#listeners.set(name, list); return this;
  }
  emit(name, ...args) { for (const listener of (this.#listeners.get(name) ?? []).slice()) listener(...args); }
  forceClose() { if (!this.#closed) { this.#closed = true; this.emit('close'); } }
  destroy(...args) { this.destroys.push(args); return this; }
}
class Request extends Handle {
  constructor() { super(); this.ends = []; this.writes = 0; }
  end(...args) { this.ends.push(args); return this; }
  write() { this.writes++; throw Error('BODY_WRITE_FORBIDDEN'); }
}
class Response extends Handle {
  constructor() {
    super(); this.complete = false; this.statusCode = 200;
    this.rawHeaders = ['Cache-Control','private, no-store, max-age=0','Content-Type','application/json',
      'Vary','Authorization','X-Content-Type-Options','nosniff','Content-Length',String(REPLY.length)];
  }
}
function requestImpl(url, options, callback) {
  f.requests++;
  const x = { url, options, callback, request: new Request(), response: new Response(),
    atRequest: f.root !== null ? f.root.snapshot() : f.borrowed !== null ? {client:f.borrowed.snapshot()} : null, receiver: this, argc: arguments.length };
  f.exchanges.push(x);
  return x.request;
}

function bound() {
 f.store.prepare(pair()); f.store.fenceAttempt('PREPARED'); f.store.finishAttempt('BOUND');
 a.equal(f.store.load().status,'BOUND'); a.equal(f.store.load().revision,3);
 const text=JSON.stringify(f.store.load());if(f.fundingText===null)f.fundingText=text;else a.equal(text,f.fundingText);
}
function retainInput(grantId,id) { const value=input(grantId,id);delete value.authorizationHeader;return value; }
function observeRecovery(client,grantId,id,observed) {
 const r=client.readOriginalRecoveryState(key(grantId,id));frozen(r);
 a.equal(r.authority,'NONE');a.equal(r.serviceOutcome,'NOT_ESTABLISHED');
 a.equal(r.dispatchStatus,'POSSIBLY_ATTEMPTED');
 a.equal(r.responseStatus,observed?'LOCAL_DECLARED_SUCCESS_RESPONSE_OBSERVED':'NOT_OBSERVED');
 if(observed){a.equal(r.responseObservation.responseJson,REPLY.toString('utf8'));
 a.equal(r.responseObservation.status,'DECLARED_SUCCESS_RESPONSE_OBSERVED');
 a.equal(r.responseObservation.authority,'NONE');a.equal(r.responseObservation.deliveryConfirmed,false);
 for(const name of ['mayStartPayment','maySignPayment','mayDispatchService'])a.equal(r.responseObservation[name],false);
 a.equal(r.responseObservation.serviceDelivery,'NOT_ESTABLISHED');}
 else a.equal(r.responseObservation,null);
 f.originals.set(grantId+':'+id,ORIGINAL(r.original));f.intents.set(grantId+':'+id,INTENT(r.dispatchIntent));
 a.equal(JSON.stringify(r).includes('declared-signature'),false);a.equal(JSON.stringify(r).includes('ServiceCredit '),false);
 return r;
}
function transportRequest(x,payload) {
 a.equal(x.receiver,undefined);a.equal(x.argc,3);a.equal(x.url,SERVICE);
 a.deepEqual(x.options,{method:'POST',headers:{Authorization:payload.authorizationHeader},agent:false,
 rejectUnauthorized:true,maxHeaderSize:16384,insecureHTTPParser:false});
 a.equal(Object.isFrozen(x.options.headers),true);a.deepEqual(x.request.ends,[[]]);a.equal(x.request.writes,0);
}
async function replyEvents(op,x,body=REPLY,status=200) {
 x.response.statusCode=status;
 x.response.rawHeaders[x.response.rawHeaders.length-1]=String(body.length);
 x.callback(x.response);
 x.response.complete=true;
 x.response.emit('data',Buffer.from(body.subarray(0,2)));x.response.emit('data',Buffer.from(body.subarray(2)));
 x.response.emit('end');
 if(status===200&&body.equals(REPLY))f.replies++;else f.uncertain++;
 await pending(op);x.request.forceClose();await pending(op);x.response.forceClose();
 return op.result;
}
async function submit(root,grantId,id,status=200) {
 const payload=input(grantId,id),op=observe(root.submitOriginal(payload)),x=f.exchanges.at(-1);
 transportRequest(x,payload);
 a.ok(x.atRequest.client.owner.counts.intentReadbackConfirmations>=1);
 a.equal(x.atRequest.client.owner.counts.responseWrites,0);
 const result=await replyEvents(op,x,REPLY,status);
 if(status===200)success(result);else failure(result,OP,'SUBMISSION_OUTCOME_UNKNOWN');
 const s=root.snapshot();a.equal(s.client.lastTransport.timerArmed,false);
 a.equal(s.client.lastTransport.credentialReferenceReleased,true);
 a.equal(s.client.lastTransport.phase,status===200?'INTERFACE_COMPLETED':'UNKNOWN');
 return observeRecovery(root,grantId,id,status===200);
}
async function blocked(root,grantId,id,prefix,code) {
 const before=f.requests;failure(await observe(root.submitOriginal(input(grantId,id))).result,prefix,code);
 a.equal(f.requests,before);f.blocked++;
}
function allRowsUnchanged(before,after) {
 for(const field of ['meta','state','originals','intents','observations','quarantines','policy','schema','userVersion','applicationId'])a.deepEqual(after[field],before[field]);
}
function invariantFunding(before,after) {
 for(const field of ['meta','state','policy','schema','userVersion','applicationId'])a.deepEqual(after[field],before[field]);
}
function diagnostic(t,scenario) {
 t.diagnostic(JSON.stringify({kind:'P2_HTTP_RESPONSE_OBSERVATION_V5',version:1,scenario,
 nativeSqliteFiles:f.identities.size,producerStoreCloses:f.createdStoreCloses,borrowedClientCloses:f.borrowedCloses,
 ownedStoreReturnedCloses:f.roots.filter(r=>r.snapshot().resource.storeCloseOutcome==='RETURNED').length,
 expectedUnknownRootCloses:f.roots.filter(r=>r.snapshot().close.outcome==='CHILD_UNKNOWN').length,
 declaredHttpRequests:f.requests,validatedFakeReplies:f.replies,uncertainFakeResponses:f.uncertain,
 blockedSubmits:f.blocked,profileRefusals:f.profileRefusals,standaloneV1Void:f.standaloneV1Void,
 standaloneV2Json:f.standaloneV2Json,malformedReplyRefusals:f.malformedReplyRefusals,
 borrowedConfirmedResponseReadbacks:f.borrowedConfirmed,ownedConfirmedResponseReadbacks:f.roots.reduce((n,r)=>n+(r.snapshot().client.owner.counts.responseReadbackConfirmations??0),0),
 networkCalls:0,syntheticSignatureOperations:0,realPaymentSigner:'DISABLED',serviceDelivery:'NOT_ESTABLISHED'}));
}
after(async()=>{
 try{if(f.borrowed!==null){await f.borrowed.close();f.borrowed=null;}
 if(f.root!==null){const s=f.root.snapshot();await closeRoot(f.root,s.client.owner.uncertainty.custody||s.client.owner.uncertainty.submission||s.client.owner.uncertainty.undrained);}}
 finally{if(f.store!==null)closeProducer();}
 await Promise.all(f.sinks);a.deepEqual(sources(),sourceBefore);a.equal(f.stage,6);
 a.equal(f.requests,7);a.equal(f.createdStoreCloses,2);a.equal(f.borrowedCloses,1);
 a.equal(f.roots.length,5);a.ok(f.exchanges.every(x=>x.request.destroys.every(args=>args.length===0)&&x.response.destroys.every(args=>args.length===0)));
});

test('Strict dispatch V2 returns canonical reply only after interface completion while V1 remains void',OPTIONS,async t=>{
 a.equal(f.stage,0);
 const value=input('grant-dispatch','standalone');
 const retained=custody.captureOriginalServiceRequestCustody({originalRequestJson:value.originalRequestJson,
 originalBodyBase64:'',serviceResourceUrl:SERVICE},{fundingResourceUrl:FUNDING,paymentHash:HASH,network:'zenon:testnet'});
 for(const [factory,mode]of [[dispatchers.createServiceCreditHttpExecuteDispatch,'v1'],
 [dispatchers.createServiceCreditHttpExecuteDispatchV2,'v2'],
 [dispatchers.createServiceCreditHttpExecuteDispatchV2,'invalid']]){
 const d=factory({resourceUrl:SERVICE,originalRequestJson:value.originalRequestJson,
 authorizationHeader:value.authorizationHeader,deadlineMs:2000,requestImpl});
 const op=observe(d.dispatch(retained)),x=f.exchanges.at(-1);transportRequest(x,value);
 const body=mode==='invalid'?Buffer.from('{"ok":true,"resultCode":"accepted","extra":true}'):REPLY;
 const result=await replyEvents(op,x,body);
 if(mode==='v1'){success(result);f.standaloneV1Void++;}
 else if(mode==='v2'){a.equal(result.value,REPLY.toString('utf8'));a.equal(Object.hasOwn(result,'error'),false);f.standaloneV2Json++;}
 else{failure(result,'SERVICE_CREDIT_HTTP_EXECUTE_DISPATCH_','OUTCOME_UNKNOWN');f.malformedReplyRefusals++;}
 const s=d.snapshot();a.equal(s.timerArmed,false);a.equal(s.credentialReferenceReleased,true);
 a.equal(s.replyValidated,mode!=='invalid');a.equal(s.phase,mode==='invalid'?'UNKNOWN':'INTERFACE_COMPLETED');
 a.equal(JSON.stringify(s).includes('declared-signature'),false);
 }
 f.stage=1;diagnostic(t,'STRICT_REPLY_V2_AND_LEGACY_V1_LIFECYCLE');
});

test('Borrowed HTTP V5 persists parsed response without persisting Authorization or replaying an original',OPTIONS,async t=>{
 a.equal(f.stage,1);f.store=CREATE5(config(NAMES[0]));nativeFile(NAMES[0]);bound();
 f.borrowed=BORROW5({store:f.store,fundingResourceUrl:FUNDING,custodyPolicy:POLICY,selectedGrantId:'grant-a',requestImpl,deadlineMs:2000});
 await blocked(f.borrowed,'grant-b','foreign',CP,'FOREIGN_GRANT');
 const payload=input('grant-a','a1'),op=observe(f.borrowed.submitOriginal(payload)),x=f.exchanges.at(-1);
 transportRequest(x,payload);a.equal(x.atRequest.client.owner.counts.intentReadbackConfirmations,1);
 a.equal(f.store.getOriginalResponseObservation(key('grant-a','a1')),null);
 success(await replyEvents(op,x));observeRecovery(f.borrowed,'grant-a','a1',true);
 a.equal(f.borrowed.snapshot().owner.counts.responseWrites,1);a.equal(f.borrowed.snapshot().owner.counts.responseReadbackConfirmations,1);f.borrowedConfirmed++;
 await blocked(f.borrowed,'grant-a','a1',OP,'RECOVERY_REQUIRED');
 const closing=f.borrowed.close();a.equal(closing,f.borrowed.close());a.equal(await closing,undefined);f.borrowedCloses++;f.borrowed=null;
 a.equal(JSON.stringify(f.store.load()),f.fundingText); // Borrowed store is still open.
 f.store.retainOriginalRequest(retainInput('grant-b','b1'));f.store.fenceOriginalDispatchIntent(key('grant-b','b1'));
 closeProducer();const s=stamp(NAMES[0]);a.equal(s.epoch,1);a.equal(s.observations.length,1);a.equal(s.quarantines.length,0);
 a.equal(JSON.stringify(s).includes('declared-signature'),false);a.equal(JSON.stringify(s).includes('ServiceCredit '),false);
 f.stampA=s;f.stage=2;diagnostic(t,'BORROWED_V5_NATIVE_OBSERVATION_NO_CREDENTIAL_CUSTODY');
});

test('Owned HTTP V5 drains then reopens with original intent and response rows preserved',OPTIONS,async t=>{
 a.equal(f.stage,2);const root=make(NAMES[0],'grant-a');redacted(root);
 observeRecovery(root,'grant-a','a1',true);a.equal(root.snapshot().client.owner.uncertainty.custody,false);
 const payload=input('grant-a','a2'),op=observe(root.submitOriginal(payload)),x=f.exchanges.at(-1);transportRequest(x,payload);
 const close=observe(root.close());a.equal(close.promise,root.close());await pending(close);
 await blocked(root,'grant-a','closed',RP,'CLOSED');
 success(await replyEvents(op,x));success(await close.result);await closeRoot(root,false);redacted(root);
 a.equal(root.snapshot().client.owner.counts.responseReadbackConfirmations,1);
 const s=stamp(NAMES[0]);a.equal(s.epoch,2);invariantFunding(f.stampA,s);
 for(const field of ['originals','intents','observations'])for(const row of f.stampA[field])
 a.deepEqual(s[field].find(r=>r.grant_id===row.grant_id&&r.request_id===row.request_id),row);
 a.equal(s.originals.length,3);a.equal(s.intents.length,3);a.equal(s.observations.length,2);a.equal(s.quarantines.length,0);
 f.stampA=s;f.stage=3;diagnostic(t,'OWNED_V5_DRAIN_AND_NORMAL_REOPEN_NO_INTENT_RESET');
});

test('Strict HTTP uncertainty persists quarantine and survives owned close and reopen without resending',OPTIONS,async t=>{
 a.equal(f.stage,3);const root=make(NAMES[0],'grant-c');redacted(root);
 const state=await submit(root,'grant-c','c1',503);a.equal(state.uncertainty.submission,true);
 a.equal(root.snapshot().client.owner.custodyQuarantine.status,'PERSISTED_UNKNOWN');
 await blocked(root,'grant-c','later',CP,'SUBMISSION_OUTCOME_UNKNOWN');await closeRoot(root,true);
 const first=stamp(NAMES[0]);a.equal(first.epoch,3);a.equal(first.observations.length,2);a.equal(first.quarantines.length,1);
 const reopened=make(NAMES[0],'grant-c');redacted(reopened);
 a.equal(reopened.snapshot().client.lastTransport,null);a.equal(reopened.snapshot().client.owner.custodyQuarantine.status,'PERSISTED_UNKNOWN');
 observeRecovery(reopened,'grant-c','c1',false);
 await blocked(reopened,'grant-c','fresh',CP,'CUSTODY_OUTCOME_UNKNOWN');await closeRoot(reopened,true);
 const after=stamp(NAMES[0]);a.equal(after.epoch,4);allRowsUnchanged(first,after);
 f.stampA=after;f.stage=4;diagnostic(t,'STRICT_UNKNOWN_PERSISTED_ACROSS_OWNED_REOPEN_NO_RESEND');
});

test('Owned V5 startup fences an older unobserved intent before request or retention',OPTIONS,async t=>{
 a.equal(f.stage,4);const root=make(NAMES[0],'grant-b');redacted(root);
 const before=f.requests,view=root.snapshot().client.owner;
 a.equal(view.counts.dispatchCalls,0);a.equal(view.counts.retainCalls,0);
 a.equal(view.counts.quarantineWrites,1);a.equal(view.counts.quarantineReadbackConfirmations,1);
 observeRecovery(root,'grant-b','b1',false);
 await blocked(root,'grant-b','fresh',CP,'CUSTODY_OUTCOME_UNKNOWN');
 await blocked(root,'grant-b','b1',CP,'CUSTODY_OUTCOME_UNKNOWN');
 a.equal(f.requests,before);await closeRoot(root,true);
 const after=stamp(NAMES[0]);a.equal(after.epoch,5);invariantFunding(f.stampA,after);
 for(const field of ['originals','intents','observations'])a.deepEqual(after[field],f.stampA[field]);
 a.deepEqual(after.quarantines.map(r=>r.grant_id),['grant-b','grant-c']);
 a.equal(after.originals.length,4);a.equal(after.intents.length,4);a.equal(after.observations.length,2);
 f.stampA=after;f.stage=5;diagnostic(t,'OWNED_V5_UNOBSERVED_INTENT_ADMISSION_FENCE');
});

test('V4 remains a distinct void-response profile and cross-profile acquisition preserves exact files',OPTIONS,async t=>{
 a.equal(f.stage,5);f.store=CREATE4(config(NAMES[1]));nativeFile(NAMES[1]);bound();
 a.throws(()=>BORROW5({store:f.store,fundingResourceUrl:FUNDING,custodyPolicy:POLICY,selectedGrantId:'grant-v4',requestImpl,deadlineMs:2000}),
 {code:CP+'INVALID_CONFIGURATION'});f.profileRefusals++;
 a.equal(f.store.getOriginalRequestCustodyQuarantine({grantId:'grant-v4'}),null);closeProducer();
 const v5=wholeFile(NAMES[0]),v4=wholeFile(NAMES[1]);
 a.throws(()=>OPEN5(rootConfig(NAMES[1],'grant-v4')),{code:RP+'ACQUISITION_FAILED'});f.profileRefusals++;
 a.deepEqual(wholeFile(NAMES[1]),v4);
 a.throws(()=>OPEN4(rootConfig(NAMES[0],'grant-a')),{code:RP+'ACQUISITION_FAILED'});f.profileRefusals++;
 a.deepEqual(wholeFile(NAMES[0]),v5);
 const root=make(NAMES[1],'grant-v4',OPEN4);redacted(root,4);
 const payload=input('grant-v4','v4'),op=observe(root.submitOriginal(payload)),x=f.exchanges.at(-1);transportRequest(x,payload);
 success(await replyEvents(op,x));const state=root.readOriginalRecoveryState(key('grant-v4','v4'));
 a.equal(Object.hasOwn(state,'responseObservation'),false);
 a.equal(Object.hasOwn(root.snapshot().client.owner.counts,'responseWrites'),false);
 await closeRoot(root,false);redacted(root,4);
 const control=stamp(NAMES[1]);a.equal(control.epoch,2);a.equal(control.userVersion,4);
 a.equal(control.originals.length,1);a.equal(control.intents.length,1);a.equal(control.observations.length,0);a.equal(control.quarantines.length,0);
 a.deepEqual(wholeFile(NAMES[0]),v5);allRowsUnchanged(f.stampA,stamp(NAMES[0]));
 f.stage=6;diagnostic(t,'V4_COMPATIBILITY_AND_CROSS_PROFILE_NO_ADOPTION');
});
