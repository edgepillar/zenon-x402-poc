// One selected direct-V6 batch case on TWO new private synthetic SQLite files.
// The existing V6 owned runner, shared sequence core and actual local HTTP session
// are composed without sockets. The same declared grant/funding pair is retained
// across two same-process owners: a completed batch, then commit/response loss.
// In-memory synthetic capability key/proofs only; NO provider/payment signature,
// SDK, nonce search, network, actual app restart, forced crash or live funding.
// A local observed response is DATA, not authenticated delivery or pilot acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { constants, lstatSync, openSync, closeSync, fstatSync, readSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = "qualification/service-credit-custodied-sqlite-v6-direct-batch.behavior.draft.mjs";
const SELF = fileURLToPath(import.meta.url), REPO = resolve(dirname(SELF), '..');
const SPECS = [
  ["package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"],
  ["src/service-credit-capability.js",8284,256,"cb2b96d9a2e56c132dd1b4aca8f1c065b244ecd0e7e92f41ea3f4a8c969d17c3"],
  ["src/service-credit-custodied-http-client.js",12646,324,"35997f41c9a5162fe29ed56776181a1691c0a0a69c7dbdfe8b61785af3998145"],
  ["src/service-credit-custodied-recovery-collection-core.js",13794,306,"51d06da70ecccd0cf8b38d650367d1ae903ea86010a5ebeadb682af98e4b890b"],
  ["src/service-credit-custodied-recovery-observation-collection-core.js",8579,213,"36b7cece2d436cbfcac5f4299dd6bd30e5eede6ebb2ebe769ae7bf3a6f1a72b4"],
  ["src/service-credit-custodied-request-owner.js",55155,1358,"2ba222760d4a922bf0466d95fd2671076b9d19b8c5fa4ea2cb3c66b1338562eb"],
  ["src/service-credit-custodied-sequential-runner-core.js",15983,492,"044477cb1300453f10bacf070037db175d08deec1d488549b34a5cb92e6328bd"],
  ["src/service-credit-custodied-sqlite-http-client.js",22706,578,"a66cfeccbf4e4490d939d006525a400f7dd7eac56911080c54c38ccc8e3374cd"],
  ["src/service-credit-custodied-sqlite-sequential-runner.js",24572,560,"3448e5ee1c8408d47aa6ecdce9c7e133ee6515ba9ca929476ab5f433fb8f847d"],
  ["src/service-credit-durable-execution-owner.js",40833,1301,"a63a795dda77489f7da0682d83a0683cf07240f83b803f449668cb687a956863"],
  ["src/service-credit-durable-http-session.js",13978,425,"a0d6d1436cdb697f125fee2f4dc723a5ddcfd2ee7063b55d56fa006bb8ba69bf"],
  ["src/service-credit-durable-session-close.js",2470,84,"5aae36a7da39ce5b7b9a8da8e9fbda88465cb1e4853dc791520a1df0ab87ede7"],
  ["src/service-credit-execution-contract.js",30258,956,"298f8e74885e1c507953c0fcf7874832f815296746e6bacbdac97a425f1a6c73"],
  ["src/service-credit-http-execute-dispatch.js",28104,790,"929881081b22b90b07d3d1c4dc8f873d4d81ee5ae84542d24b7534674f4eb9c0"],
  ["src/service-credit-http.js",32432,958,"c76a7f1864bdfcd0c26916bf28fba615c8aecf899d53e69467e3ebe7d3353d0d"],
  ["src/service-credit-model.js",55461,1580,"7ff7e3d88ab8c3b38a0073541533fbdb7a0d9f2be42f337ac35f6a3b05615c3a"],
  ["src/service-credit-original-request-custody-contract.js",14051,356,"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"],
  ["src/service-credit-pilot-client-plan.js",7483,181,"73ee3d739de85150039e733234cd0761c228d68de040d1e126902e808a259ac6"],
  ["src/service-credit-pilot-original-payment-checkpoint.js",4003,89,"930905f31824a6cadc16dfb84572cd4dc38a81e2fce4569b73b6bef29dec97d1"],
  ["src/service-credit-pilot-status-view.js",3202,60,"cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed"],
  ["src/service-credit-sqlite-store.js",83516,2366,"eea4032830dc1f641c4832e0dab33066633ba487eaf19581e3295cf8810460f3"],
  ["src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",83681,2042,"bea9e00aa6208f776561c975d54640dfb676168dd4d0b44d125c9dc684912c4a"],
  ["src/x402-wire.js",39886,934,"5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"]
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.P2_DIRECT_V6_OPT_IN, 'two-private-synthetic-sqlite-files-only');
const PINS = JSON.parse(process.env.P2_DIRECT_V6_SOURCE_PINS);
const scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const fixture = join(scratch, 'fixture');
for (const path of [scratch, fixture]) {
  const s = lstatSync(path, { bigint: true });
  assert.ok(s.isDirectory() && !s.isSymbolicLink());
  assert.equal(s.uid, BigInt(process.getuid())); assert.equal(s.mode & 0o777n, 0o700n);
}
assert.deepEqual(readdirSync(fixture), []);
const FILES = ['backend-direct-v6.sqlite', 'payer-direct-v6.sqlite'];
const ids = s => ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
const sha = b => createHash('sha256').update(b).digest('hex');
function sources() {
  assert.equal(PINS.length, SPECS.length + 1);
  assert.deepEqual(PINS.map(p => p.path), [...SPECS.map(p => p[0]), ENTRY]);
  let total = 0;
  return PINS.map((p, i) => {
    const path = join(REPO, p.path), stat = lstatSync(path, { bigint: true });
    assert.ok(stat.isFile() && !stat.isSymbolicLink());
    assert.equal(stat.uid, BigInt(process.getuid())); assert.equal(stat.nlink, 1n);
    assert.ok(stat.size > 0n && stat.size <= 131072n); assert.deepEqual(ids(stat), p.identity);
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const bytes = Buffer.alloc(Number(stat.size) + 1); let used = 0;
    try {
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
      while (used < bytes.length) {
        const n = readSync(fd, bytes, used, bytes.length - used, null);
        if (!n) break; used += n;
      }
      assert.deepEqual(ids(fstatSync(fd, { bigint: true })), p.identity);
    } finally { closeSync(fd); }
    assert.deepEqual(ids(lstatSync(path, { bigint: true })), p.identity);
    const raw = bytes.subarray(0, used);
    assert.equal(used, p.bytes); assert.equal(sha(raw), p.sha256);
    assert.equal(raw.filter(c => c === 10).length, p.LF);
    assert.equal(raw.includes(0), false); assert.equal(raw.some(c => c > 127), false);
    total += used; assert.ok(total <= 700000);
    if (i < SPECS.length) assert.deepEqual([p.path,p.bytes,p.LF,p.sha256], SPECS[i]);
    return { path: p.path, bytes: p.bytes, sha256: p.sha256, identity: p.identity };
  });
}
const sourceBefore = sources();
const { openServiceCreditCustodiedSqliteSequentialRunnerV6: OPEN }
  = await import('../src/service-credit-custodied-sqlite-sequential-runner.js');
const { ServiceCreditSqliteStore: Backend } = await import('../src/service-credit-sqlite-store.js');
const { createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6: CREATE_PAYER }
  = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
const { createDurableServiceCreditHttpSession: SESSION }
  = await import('../src/service-credit-durable-http-session.js');
const { deriveServiceCreditCapabilityCommitment: COMMIT, createServiceCreditCapabilitySigningBytes: SIGNING_BYTES }
  = await import('../src/service-credit-capability.js');
const { captureOriginalPaymentCheckpoint: CAPTURE, encodeOriginalPaymentCheckpoint: ENCODE }
  = await import('../src/service-credit-pilot-original-payment-checkpoint.js');
const { DatabaseSync } = await import('node:sqlite');
const FUNDING = 'https://direct-v6.invalid/funding';
const SERVICE = 'https://direct-v6.invalid/service-credit/v1/execute';
const POLICY = Object.freeze({ policyVersion: 1, maxRequests: 8, serviceResourceUrl: SERVICE });
const HASH = 'a'.repeat(64), EMPTY = 'sha256:' + sha(Buffer.alloc(0));
const RP = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const keyOf = r => ({ grantId: r.grantId, requestId: r.requestId });
function freeze(v) {
  if (v && typeof v === 'object') { for (const x of Object.values(v)) freeze(x); Object.freeze(v); }
  return v;
}
function frozen(v) {
  if (v && typeof v === 'object') { assert.ok(Object.isFrozen(v)); for (const x of Object.values(v)) frozen(x); }
}
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
function originalPair() {
  const requirement = { scheme:'exact', network:'zenon:testnet', asset:'synthetic-asset',
    amount:'1', payTo:'synthetic-payee', maxTimeoutSeconds:30,
    extra:{ poc:true, settlement:'account-block', paymentFlow:'upfront', minimumMomentumConfirmations:2,
      zenonChain:{version:1,chainIdentifier:'42',genesisMomentumHash:'1'.repeat(64)} } };
  const required = { x402Version:2, resource:{url:FUNDING}, accepts:[requirement] };
  const payload = { x402Version:2, resource:{url:FUNDING}, accepted:requirement,
    payload:{transaction:{hash:HASH},intentDigest:'2'.repeat(64)} };
  return freeze({ challenge:{status:'PAYMENT_REQUIRED',resourceUrl:FUNDING,
    paymentRequiredHeader:Buffer.from(JSON.stringify(required)).toString('base64'),paymentRequired:required},
    paymentSignatureHeader:Buffer.from(JSON.stringify(payload)).toString('base64') });
}
function emitter(isRequest, f) {
  const listeners = new Map(); let closed = false, ended = false, endAction = null;
  function emit(name, ...args) { for (const fn of listeners.get(name) ?? []) fn(...args); }
  const raw = {
    on(name, fn) {
      assert.equal(typeof name,'string'); assert.equal(typeof fn,'function');
      if (!listeners.has(name)) listeners.set(name,[]);
      listeners.get(name).push(fn); return raw;
    },
    destroy() { if (!closed) { closed=true; emit('close'); } },
    ...(isRequest ? { end(...args) {
      assert.equal(args.length,0); assert.equal(ended,false); ended=true; f.ends++;
      assert.equal(typeof endAction,'function'); endAction();
    } } : {}),
  };
  return {raw,emit,setEnd(fn){endAction=fn;},close(){raw.destroy();}};
}

test('V6 owned direct originals complete or stop without retry', { timeout:5000, concurrency:false }, async t => {
  const f = { backend:null, session:null, key:null, runner:null, runners:[], handlers:[],
    proofs:0, calls:0, ends:0, replies:0, losses:0, units:0, mode:'SUCCESS',
    batchCalls:0, order:[], timers:new Set(), scheduled:0, cancelled:0 };
  const pair = originalPair();
  const captured = CAPTURE({binding:{requestId:'direct-v6-original-funding',paymentHash:HASH,
    origin:new URL(FUNDING).origin,contextId:'direct-v6-original-context'},
    originalBytes:{requestBody:'',paymentPayload:pair.paymentSignatureHeader,
      paymentRequirements:pair.challenge.paymentRequiredHeader,
      context:Buffer.from(' { "directV6": true, "spacing": "retained" }\n').toString('base64')}});
  const serialized = ENCODE(captured.checkpoint);
  let requests, inputs, headers, grant, baseline, completedStamp, finalStamp;
  let caseError = null;
  function payerStamp() {
    assert.equal(f.runner,null);
    const path = join(fixture,FILES[1]), s=lstatSync(path,{bigint:true});
    assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.nlink,1n);
    assert.equal(s.uid,BigInt(process.getuid())); assert.equal(s.mode & 0o777n,0o600n);
    const db=new DatabaseSync(path,{readOnly:true,allowExtension:false,
      enableDoubleQuotedStringLiterals:false,enableForeignKeyConstraints:true,timeout:0});
    try {
      const table = name => db.prepare('SELECT * FROM ' + name + ' ORDER BY 1,2').all();
      return {meta:table('payer_recovery_meta'),state:table('payer_recovery_state'),
        checkpoint:table('original_payment_checkpoint'),policy:table('original_request_custody_policy'),
        originals:table('original_service_requests'),intents:table('original_dispatch_intents'),
        observations:table('original_response_observations'),quarantines:table('original_custody_quarantines'),
        schema:db.prepare('SELECT type,name,sql FROM sqlite_master ORDER BY name').all(),
        version:db.prepare('PRAGMA user_version').get().user_version,
        applicationId:db.prepare('PRAGMA application_id').get().application_id};
    } finally { db.close(); }
  }
  function immutableFunding(stamp, epochDelta) {
    assert.equal(stamp.meta[0].owner_epoch,baseline.meta[0].owner_epoch+epochDelta);
    assert.deepEqual(stamp.meta.map(({owner_epoch,...rest})=>rest),
      baseline.meta.map(({owner_epoch,...rest})=>rest));
    for (const k of ['state','checkpoint','policy','schema','version','applicationId'])
      assert.deepEqual(stamp[k],baseline[k]);
    assert.equal(stamp.version,6); assert.equal(stamp.applicationId,0x5a505252);
    assert.equal(stamp.checkpoint.length,1); assert.equal(stamp.checkpoint[0].envelope,serialized);
    const state=JSON.parse(stamp.state[0].envelope);
    assert.equal(state.paymentHeader,pair.paymentSignatureHeader);
    assert.equal(state.challengeHeader,pair.challenge.paymentRequiredHeader);
  }
  function retained(stamp, attempted, observed, quarantined) {
    assert.deepEqual(stamp.originals.map(r=>r.request_id),requests.slice(0,attempted).map(r=>r.requestId));
    assert.deepEqual(stamp.intents.map(r=>r.request_id),stamp.originals.map(r=>r.request_id));
    assert.deepEqual(stamp.observations.map(r=>r.request_id),requests.slice(0,observed).map(r=>r.requestId));
    assert.equal(stamp.quarantines.length,quarantined ? 1 : 0);
    for (const r of requests.slice(0,attempted)) {
      const original=JSON.parse(stamp.originals.find(v=>v.request_id===r.requestId).envelope);
      const intent=JSON.parse(stamp.intents.find(v=>v.request_id===r.requestId).envelope);
      assert.equal(original.originalRequestJson,JSON.stringify(r)); assert.equal(original.originalBodyBase64,'');
      assert.equal(original.paymentHash,HASH); assert.equal(intent.paymentHash,HASH); assert.equal(intent.fundingRevision,3);
    }
    for (const row of stamp.observations) {
      const response=JSON.parse(row.envelope);
      assert.equal(response.responseJson,'{"ok":true,"resultCode":"synthetic-direct-v6-result"}');
      assert.equal(response.authority,'NONE'); assert.equal(response.deliveryConfirmed,false);
    }
    if (quarantined) {
      const q=JSON.parse(stamp.quarantines[0].envelope);
      assert.equal(q.grantId,grant.grantId); assert.equal(q.paymentHash,HASH);
      assert.equal(q.status,'CUSTODY_OUTCOME_UNKNOWN'); assert.equal(q.authority,'NONE');
      assert.deepEqual(q.custodyPolicy,POLICY);
    }
    for (const r of requests.slice(attempted)) {
      assert.equal(stamp.originals.some(v=>v.request_id===r.requestId),false);
      assert.equal(stamp.intents.some(v=>v.request_id===r.requestId),false);
      assert.equal(f.backend.getRequest(keyOf(r)),null);
    }
    const payer=JSON.stringify(stamp), ledger=JSON.stringify(f.backend.load());
    for (const h of headers) { assert.equal(payer.includes(h),false); assert.equal(ledger.includes(h),false); }
    assert.equal(ledger.includes(f.key.publicKey.export({format:'jwk'}).x),false);
  }
  function noLeak(view) {
    const text=JSON.stringify(view);
    for (const x of [serialized,pair.paymentSignatureHeader,pair.challenge.paymentRequiredHeader,
      captured.checkpoint.originalBytes.context,...headers]) assert.equal(text.includes(x),false);
  }
  function requestImpl(url,options,onResponse) {
    f.calls++; f.batchCalls++;
    assert.equal(url,SERVICE); assert.equal(options.method,'POST'); assert.equal(options.agent,false);
    assert.equal(options.rejectUnauthorized,true); assert.equal(options.maxHeaderSize,16384);
    assert.equal(options.insecureHTTPParser,false); assert.deepEqual(Object.keys(options.headers),['Authorization']);
    const index=headers.indexOf(options.headers.Authorization); assert.ok(index>=0); f.order.push(index);
    const counts=f.runner.snapshot().runner.client.owner.counts;
    for (const k of ['retainCalls','readbackConfirmations','intentWrites','intentReadbackConfirmations','dispatchCalls'])
      assert.equal(counts[k],f.batchCalls);
    assert.equal(counts.responseWrites,f.batchCalls-1);
    assert.equal(counts.responseReadbackConfirmations,f.batchCalls-1);
    const req=emitter(true,f), mode=(f.mode==='DROP_SECOND' && f.batchCalls===2) ? 'DROP' : 'SUCCESS';
    const responseHeaders=new Map();
    const response={destroyed:false,writableEnded:false,statusCode:0,
      setHeader(name,value){responseHeaders.set(name,String(value));},
      end(bytes){
        assert.equal(response.writableEnded,false); response.writableEnded=true;
        assert.equal(response.statusCode,200); assert.ok(Buffer.isBuffer(bytes) && bytes.length<=512);
        if(mode==='DROP'){f.losses++;req.emit('error',Error('synthetic response loss after commit'));return;}
        const res=emitter(false,f);res.raw.statusCode=200;
        res.raw.rawHeaders=[...responseHeaders.entries()].flatMap(([k,v])=>[k,v]);
        res.raw.complete=false;onResponse(res.raw);res.emit('data',bytes);
        res.raw.complete=true;res.emit('end');f.replies++;res.close();req.close();
      },
      destroy(){response.destroyed=true;req.emit('error',Error('synthetic handler failure'));},
    };
    req.setEnd(()=>{
      const handled=f.session.handle({url:'/service-credit/v1/execute',method:'POST',
        rawHeaders:['Authorization',options.headers.Authorization]},response);
      f.handlers.push(handled.then(()=>assert.equal(response.writableEnded,true),error=>{
        req.emit('error',Error('synthetic handler rejected'));throw error;
      }));
    });
    return req.raw;
  }
  async function openRunner() {
    assert.equal(f.runner,null); f.batchCalls=0;
    f.runner=await OPEN({databasePath:join(fixture,FILES[1]),allowedRoot:fixture,fundingResourceUrl:FUNDING,
      custodyPolicy:POLICY,selectedGrantId:grant.grantId,requestImpl,deadlineMs:2000});
    f.runners.push(f.runner); frozen(f.runner);
    const checkpoint=f.runner.readOriginalPaymentCheckpoint(captured.pins);
    frozen(checkpoint);assert.deepEqual(checkpoint,captured.checkpoint);
    assert.equal(ENCODE(checkpoint),serialized);assert.equal(checkpoint.authorization,'NONE');
    const view=f.runner.snapshot();noLeak(view);
    assert.equal(view.runner.storeOwnership,'OWNED_EXISTING_V6_ORIGINAL_PAYMENT');
    assert.equal(view.resource.storeCloseAttempts,0);assert.equal(view.resource.slotHeld,true);
    return f.runner;
  }
  async function closedRunner(runner, unknown) {
    const close=runner.close();assert.equal(close,runner.close());
    if(unknown)await assert.rejects(close,{code:XP+'CHILD_OUTCOME_UNKNOWN'});
    else assert.equal(await close,undefined);
    const view=runner.snapshot();frozen(view);noLeak(view);
    assert.equal(view.resource.storeCloseAttempts,1);assert.equal(view.resource.storeCloseOutcome,'RETURNED');
    assert.equal(view.resource.phase,'RELEASED');assert.equal(view.resource.slotHeld,false);
    assert.equal(view.close.outcome,unknown?'CHILD_UNKNOWN':'DRAINED');
    assert.equal(view.runner.closeCalls,1);assert.equal(view.runner.queuedReferences,0);
    assert.equal(view.unknown,unknown);assert.equal(view.unknownUndrained,false);
    assert.equal(view.serviceDelivery,'NOT_ESTABLISHED');assert.equal(view.currentAuthority,'NOT_ESTABLISHED');
    assert.throws(()=>runner.readOriginalPaymentCheckpoint(captured.pins),{code:XP+'CLOSED'});
    assert.equal(close,runner.close());f.runner=null;return view;
  }
  try {
    f.key=generateKeyPairSync('ed25519');
    const digest=n=>'sha256:'+String(n).repeat(64);
    f.backend=Backend.create({databasePath:join(fixture,FILES[0]),allowedRoot:fixture,
      deriveCost(){return 1;},now(){return 1000;},busyTimeoutMs:50,maxStateBytes:65536,
      maxOffers:2,maxGrants:2,maxRequests:8});
    const offer={modelVersion:1,providerId:'synthetic-provider',serviceId:'synthetic-service',
      resourceId:'synthetic-resource',resourceBinding:digest(1),offerId:'direct-v6-offer',offerVersion:1,
      costPolicyId:'synthetic-unit',fundingPolicyId:'synthetic-funding',fundingPolicyVersion:1};
    f.backend.registerOffer(offer);
    // Privileged controlled DATA seeding, NOT authenticated funding/activation.
    grant=f.backend.activateGrantFromTrustedRecord({activationVersion:2,evidenceVersion:1,
      inclusionAuthorizationDigest:digest(7),authorityProfileId:'synthetic-authority',authorityProfileVersion:1,
      verifierVersion:1,authorityRecordDigest:digest(2),fundingPolicyId:offer.fundingPolicyId,fundingPolicyVersion:1,
      sourceSettlementId:'synthetic-direct-settlement',transactionId:'zenontx:'+HASH,
      providerId:offer.providerId,serviceId:offer.serviceId,resourceId:offer.resourceId,
      resourceBinding:offer.resourceBinding,offerId:offer.offerId,offerVersion:1,holderId:'synthetic-holder',
      capabilityCommitment:COMMIT({publicKey:f.key.publicKey.export({format:'jwk'}).x}),totalUnits:10,expiresAt:100000,
      scheme:'exact',paymentFlow:'upfront',network:'zenon:testnet',
      chainProfile:{version:1,chainIdentifier:'42',genesisMomentumHash:'1'.repeat(64)},
      asset:'synthetic-asset',amount:'1',payee:'synthetic-payee',payer:'synthetic-holder',
      paymentResourceDigest:digest(3),paymentRequirementDigest:digest(4),paymentIntentDigest:digest(5),
      grantFundingCommitment:digest(6),evidenceState:'MOMENTUM_INCLUDED',
      confirmationPolicy:{policyId:'zenon.authenticated-momentum-inclusion',policyVersion:1,minimumConfirmations:2}});
    f.backend.initializeDurableExecution({expectedRevision:f.backend.load().revision,
      ledgerId:'synthetic-direct-ledger',policy:{policyId:'synthetic-deadline',policyVersion:1,maxDurationMs:1000},capacity:8});
    requests=['direct-1-complete','direct-2-complete','direct-3-next','direct-4-lost','direct-5-tail'].map(requestId=>({
      modelVersion:1,grantId:grant.grantId,requestId,method:'POST',routeId:'service-credit.execute.v1',
      canonicalBodyDigest:EMPTY,selectedContentType:'application/json',maxCostUnits:1}));
    headers=requests.map(r=>{
      f.proofs++;
      const raw={proofVersion:1,grantId:r.grantId,requestId:r.requestId,
        publicKey:f.key.publicKey.export({format:'jwk'}).x,maxCostUnits:1,
        signature:sign(null,SIGNING_BYTES(r),f.key.privateKey).toString('base64url')};
      return 'ServiceCredit '+Buffer.from(canonical(raw)).toString('base64url');
    });
    inputs=requests.map((r,i)=>freeze({...keyOf(r),originalRequestJson:JSON.stringify(r),
      originalBodyBase64:'',serviceResourceUrl:SERVICE,authorizationHeader:headers[i]}));
    const payer=CREATE_PAYER({databasePath:join(fixture,FILES[1]),allowedRoot:fixture,
      resourceUrl:FUNDING,custodyPolicy:POLICY});
    try {
      payer.prepareWithOriginalPaymentCheckpoint({pair,serializedCheckpoint:serialized,expectedPins:captured.pins});
      payer.fenceAttempt('PREPARED');assert.equal(payer.finishAttempt('BOUND').revision,3);
    } finally {payer.close();}
    baseline=payerStamp();retained(baseline,0,0,false);
    f.session=SESSION({store:f.backend,admittedGrantId:grant.grantId,selectedDurationMs:1000,
      execute(){f.units++;return{resultCode:'synthetic-direct-v6-result'};},
      deadlineRuntime:{monotonicNowNs(){return 0n;},schedule(fn,delay){
        assert.equal(typeof fn,'function');assert.ok(Number.isSafeInteger(delay)&&delay>0);
        const token={};f.timers.add(token);f.scheduled++;return token;},
        cancel(token){assert.equal(f.timers.delete(token),true);f.cancelled++;}}});

    const first=await openRunner(), completeBatch=inputs.slice(0,2);
    const completed=first.runOriginals(completeBatch);assert.equal(first.runOriginals(completeBatch),completed);
    assert.equal(await completed,undefined);await Promise.all(f.handlers);
    const completeView=await closedRunner(first,false);
    assert.equal(first.runOriginals(completeBatch),completed);
    await assert.rejects(first.runOriginals(inputs.slice(0,2)),{code:RP+'ALREADY_RUN'});
    assert.equal(completeView.runner.outcome,'CALLBACKS_COMPLETED');
    assert.deepEqual([completeView.runner.planned,completeView.runner.attempted,completeView.runner.completed],[2,2,2]);
    completedStamp=payerStamp();immutableFunding(completedStamp,1);retained(completedStamp,2,2,false);

    // Same original grant/funding pair, new original request IDs: no second funding,
    // resetting, retrying a dispatched request, replacement proof or payer creation.
    f.mode='DROP_SECOND';
    const second=await openRunner(), uncertainBatch=inputs.slice(2);
    const failed=second.runOriginals(uncertainBatch);assert.equal(second.runOriginals(uncertainBatch),failed);
    await assert.rejects(failed,{code:RP+'RUN_FAILED'});await Promise.all(f.handlers);
    const unknownView=await closedRunner(second,true);
    assert.equal(second.runOriginals(uncertainBatch),failed);
    await assert.rejects(second.runOriginals(inputs.slice(2)),{code:RP+'ALREADY_RUN'});
    assert.deepEqual([unknownView.runner.planned,unknownView.runner.attempted,unknownView.runner.completed],[3,2,1]);
    assert.equal(unknownView.runner.notAttempted,1);
    finalStamp=payerStamp();immutableFunding(finalStamp,2);retained(finalStamp,4,3,true);
    for (const field of ['originals','intents','observations'])
      for (const row of completedStamp[field]) assert.deepEqual(finalStamp[field].find(r=>r.request_id===row.request_id),row);
    assert.deepEqual(f.order,[0,1,2,3]);assert.equal(f.calls,4);assert.equal(f.ends,4);
    assert.equal(f.replies,3);assert.equal(f.losses,1);assert.equal(f.units,4);assert.equal(f.proofs,5);
    const balance=f.backend.getGrant(grant.grantId);
    assert.deepEqual([balance.consumedUnits,balance.availableUnits,balance.heldUnits],[4,6,0]);
    assert.equal(f.backend.getDurableExecutionSnapshot().executionState.executions.length,4);
    assert.equal(f.backend.getRequest(keyOf(requests[4])),null);
    assert.equal(f.timers.size,0);assert.equal(f.scheduled,4);assert.equal(f.cancelled,4);
    t.diagnostic(JSON.stringify({kind:'P2_DIRECT_V6_BATCH',version:1,completedBatch:[2,2,2],
      uncertainBatch:[3,2,1],sameGrantAndOriginalFunding:true,checkpointReads:2,
      ownedOpens:2,returnedStoreCloses:2,closeCalls:[1,1],unknownPreserved:true,
      noRetryOrTail:true,requestOrder:f.order,strictReplies:3,responseLosses:1,
      syntheticBackendCallbacks:4,consumedUnits:4,availableUnits:6,heldUnits:0,
      originals:4,intents:4,responseObservations:3,grantQuarantines:1,payerOwnerEpochDelta:2,
      syntheticCapabilityKeyPairs:1,syntheticCapabilityProofs:5,syntheticProviderSignatures:0,
      nativeSqliteFiles:2,networkCalls:0,realPaymentSigner:'DISABLED',authority:'NONE',
      serviceDelivery:'NOT_ESTABLISHED',applicationRestart:'NOT_RUN'}));
  } catch(error) {caseError=error;}
  finally {
    try {
      await Promise.all(f.handlers);
      if(f.runner!==null) {
        try{await f.runner.close();}catch(error){
          if(error?.code!==XP+'CHILD_OUTCOME_UNKNOWN')throw error;
        }
        assert.equal(f.runner.snapshot().resource.storeCloseAttempts,1);f.runner=null;
      }
      if(f.session!==null){const p=f.session.close();assert.equal(p,f.session.close());assert.equal(await p,undefined);}
      assert.equal(f.timers.size,0);
    } catch(error) {caseError??=error;}
    finally {
      try{if(f.backend!==null)f.backend.close();}catch(error){caseError??=error;}
      f.backend=null;f.session=null;f.key=null;headers=null;inputs=null;
    }
    assert.deepEqual(sources(),sourceBefore);
  }
  if(caseError!==null)throw caseError;
  assert.deepEqual(readdirSync(fixture).sort(),FILES);
});
