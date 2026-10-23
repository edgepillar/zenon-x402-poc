// NEW P2 application command path over two new private synthetic SQLite files.
// Existing owners seed one exact original; the CLI then opens BOTH existing
// stores and reads it without submit, signing, payment, network or a new proof.
// Old qualification entries are not imported or replayed. Synthetic capability
// key/proof exists only in memory; the registered manifest never contains it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { constants, lstatSync, openSync, closeSync, fstatSync, readSync, writeSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY = "qualification/service-credit-recovery-inspect-cli.behavior.draft.mjs";
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
  ["src/x402-wire.js",39886,934,"5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56"],
  ["src/service-credit-custodied-backend-recovery-client.js",33016,668,"6c5e5d07a4ac96a72a2494a8e6efdec0a057e967ce887816f68eb53048b3c885"],
  ["src/service-credit-custodied-sqlite-recovery-reader.js",7754,180,"e3ac726602edd3d06137212a566772b5f66fde5d4b4b71c14b2b28d76b1f28fe"],
  ["src/service-credit-backend-original-outcome-reader.js",7738,182,"dadd9cbfbdcc2ff4bb24252fed85a135d2ce17397e713b1917a109eb6b28938d"],
  ["src/service-credit-recovery-inspect-cli.js",13846,268,"166464154fa78c8485def1327134314cec7a32b4e64c31ee4771dba2d5500444"]
];
assert.equal(process.argv.length, 2); assert.equal(process.argv[1], SELF);
assert.equal(process.versions.node, '24.19.0');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
assert.equal(process.env.P2_RECOVERY_INSPECT_OPT_IN, 'existing-v6-cli-two-private-synthetic-files');
const PINS = JSON.parse(process.env.P2_RECOVERY_INSPECT_SOURCE_PINS);
const scratch = process.env.SPV_TASK_SCRATCH;
assert.equal(typeof scratch, 'string'); assert.equal(resolve(scratch), scratch);
const fixture = join(scratch, 'fixture');
for (const path of [scratch, fixture]) {
  const s = lstatSync(path, { bigint: true });
  assert.ok(s.isDirectory() && !s.isSymbolicLink());
  assert.equal(s.uid, BigInt(process.getuid())); assert.equal(s.mode & 0o777n, 0o700n);
}
const MANIFESTS = ['inspect-original.json', 'inspect-changed-pins.json', 'inspect-missing-payer.json'];
assert.deepEqual(readdirSync(fixture).sort(), [...MANIFESTS].sort());
const FILES = ['backend-inspect-v6.sqlite', 'payer-inspect-v6.sqlite'];
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
    total += used; assert.ok(total <= 720000);
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


const { runServiceCreditRecoveryInspectCli: CLI, inspectServiceCreditOriginal: INSPECT }
  = await import('../src/service-credit-recovery-inspect-cli.js');
const FAILURE = 'SERVICE_CREDIT_RECOVERY_INSPECTION_FAILED\n';
test('existing V6 CLI inspects one original and refuses changed pins or a missing payer without dispatch', {
  timeout: 5000, concurrency: false,
}, async t => {
  const f = { backend:null, session:null, key:null, runner:null, runners:[], handlers:[],
    proofs:0, calls:0, ends:0, replies:0, losses:0, units:0, mode:'SUCCESS',
    batchCalls:0, order:[], timers:new Set(), scheduled:0, cancelled:0 };
  const pair = originalPair();
  const captured = CAPTURE({binding:{requestId:'inspect-v6-original-funding',paymentHash:HASH,
    origin:new URL(FUNDING).origin,contextId:'inspect-v6-original-context'},
    originalBytes:{requestBody:'',paymentPayload:pair.paymentSignatureHeader,
      paymentRequirements:pair.challenge.paymentRequiredHeader,
      context:Buffer.from(' { "inspectV6": true, "spacing": "retained" }\n').toString('base64')}});
  const serialized = ENCODE(captured.checkpoint);
  let requests, inputs, headers, grant, baseline, caseError = null;
  const manifestPath = join(fixture, MANIFESTS[0]);
  function noLeak(view) {
    const text = JSON.stringify(view);
    for (const x of [serialized, pair.paymentSignatureHeader, pair.challenge.paymentRequiredHeader,
      captured.checkpoint.originalBytes.context, ...headers, f.key.publicKey.export({format:'jwk'}).x,
      fixture, manifestPath]) assert.equal(text.includes(x), false);
  }
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

  function writeManifest(value, selectedPath = manifestPath) {
    const b = Buffer.from(JSON.stringify(value) + '\n');
    assert.ok(b.length > 0 && b.length <= 16384);
    const before = lstatSync(selectedPath, { bigint: true });
    const fd = openSync(selectedPath, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW);
    try {
      const opened = fstatSync(fd, { bigint: true });
      assert.equal(opened.ino, before.ino); assert.equal(opened.dev, before.dev);
      assert.equal(opened.nlink, 1n); assert.equal(opened.uid, BigInt(process.getuid()));
      assert.equal(opened.mode & 0o777n, 0o600n);
      assert.equal(writeSync(fd, b, 0, b.length), b.length);
    } finally { closeSync(fd); }
    assert.equal(lstatSync(selectedPath, { bigint: true }).ino, before.ino);
  }
  function backendStamp() {
    const db = new DatabaseSync(join(fixture, FILES[0]), { readOnly: true,
      allowExtension: false, enableDoubleQuotedStringLiterals: false, timeout: 0 });
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      return tables.map(({name}) => {
        assert.match(name, /^[a-z_]+$/);
        return [name, db.prepare('SELECT * FROM ' + name + ' ORDER BY 1').all()];
      });
    } finally { db.close(); }
  }
  function unchanged(stamp, initial, epochs) {
    assert.equal(stamp.meta[0].owner_epoch, initial.meta[0].owner_epoch + epochs);
    assert.deepEqual(stamp.meta.map(({owner_epoch,...rest})=>rest),
      initial.meta.map(({owner_epoch,...rest})=>rest));
    for (const key of Object.keys(initial).filter(k=>k!=='meta')) assert.deepEqual(stamp[key], initial[key]);
    assert.equal(stamp.checkpoint[0].envelope, serialized);
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
    requests=['inspect-original-complete'].map(requestId=>({
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
    baseline=payerStamp();
    f.session=SESSION({store:f.backend,admittedGrantId:grant.grantId,selectedDurationMs:1000,
      execute(){f.units++;return{resultCode:'synthetic-direct-v6-result'};},
      deadlineRuntime:{monotonicNowNs(){return 0n;},schedule(fn,delay){
        assert.equal(typeof fn,'function');assert.ok(Number.isSafeInteger(delay)&&delay>0);
        const token={};f.timers.add(token);f.scheduled++;return token;},
        cancel(token){assert.equal(f.timers.delete(token),true);f.cancelled++;}}});


    const runner=await openRunner(), originals=[inputs[0]];
    await runner.runOriginals(originals); await Promise.all(f.handlers);
    await closedRunner(runner, false);
    assert.deepEqual([f.calls,f.ends,f.replies,f.losses,f.units,f.proofs], [1,1,1,0,1,1]);
    assert.equal(f.timers.size,0); assert.equal(f.scheduled,f.cancelled);
    await f.session.close(); f.session=null;
    f.backend.close(); f.backend=null;
    const initial = payerStamp(), ledger = backendStamp(), filesBefore = FILES.map(name=>lstatSync(join(fixture,name),{bigint:true}));
    const manifest = { inspectionVersion:1, payerDatabasePath:join(fixture,FILES[1]),
      backendDatabasePath:join(fixture,FILES[0]), fundingResourceUrl:FUNDING,
      custodyPolicy:POLICY, selectedGrantId:grant.grantId, deadlineMs:2000,
      requestKey:keyOf(requests[0]), expectedCheckpointPins:captured.pins,
      backendLimits:{busyTimeoutMs:50,maxStateBytes:65536,maxOffers:2,maxGrants:2,maxRequests:8} };
    writeManifest(manifest);
    const args = ['--manifest',manifestPath,'--allowed-root',fixture];
    let hooks=0; const hostile = new Proxy(args,{ownKeys(){hooks++;throw Error('PRIVATE_HOOK');}});
    assert.deepEqual(await CLI(hostile,headers[0]),{exitCode:1,stdout:'',stderr:FAILURE});
    assert.equal(hooks,0); unchanged(payerStamp(),initial,0);
    const actual = await CLI(args, headers[0]); noLeak(actual);
    if (actual.exitCode !== 0) {
      try { await INSPECT({manifestPath,allowedRoot:fixture,authorizationHeader:headers[0]}); }
      catch (error) { t.diagnostic(JSON.stringify({kind:'P2_CLI_FAILURE_STAGE',stage:error.stage})); }
    }
    assert.equal(actual.exitCode,0); assert.equal(actual.stderr,''); assert.ok(Buffer.byteLength(actual.stdout)<=2048);
    assert.deepEqual(JSON.parse(actual.stdout), {inspectionVersion:1,status:'CLIENT_RECONCILIATION_REQUIRED',
      backendStatus:'CACHED_SUCCESS',originalCheckpointPinsMatched:true,localReconciliationRequired:true,
      authority:'NONE',mayDispatchService:false,mayStartPayment:false,maySignPayment:false,deliveryConfirmed:false,
      serviceDelivery:'NOT_ESTABLISHED',currentAuthority:'NOT_ESTABLISHED',sameProcessObservationOnly:true});
    unchanged(payerStamp(),initial,1); assert.deepEqual(backendStamp(),ledger);
    const badPins=JSON.parse(JSON.stringify(manifest));
    const dk=Object.keys(badPins.expectedCheckpointPins.digests)[0], originalDigest=badPins.expectedCheckpointPins.digests[dk];
    assert.equal(typeof originalDigest,'string');
    badPins.expectedCheckpointPins.digests[dk]=originalDigest.slice(0,-1)+(originalDigest.endsWith('0')?'1':'0');
    writeManifest(badPins, join(fixture, MANIFESTS[1]));
    const refused=await CLI(['--manifest',join(fixture,MANIFESTS[1]),'--allowed-root',fixture],headers[0]); noLeak(refused);
    assert.deepEqual(refused,{exitCode:1,stdout:'',stderr:FAILURE});
    unchanged(payerStamp(),initial,2); assert.deepEqual(backendStamp(),ledger);
    writeManifest({...manifest,payerDatabasePath:join(fixture,'missing-existing-payer.sqlite')}, join(fixture, MANIFESTS[2]));
    const missing=await CLI(['--manifest',join(fixture,MANIFESTS[2]),'--allowed-root',fixture],headers[0]); noLeak(missing);
    assert.deepEqual(missing,{exitCode:1,stdout:'',stderr:FAILURE});
    assert.throws(()=>lstatSync(join(fixture,'missing-existing-payer.sqlite')),{code:'ENOENT'});
    unchanged(payerStamp(),initial,2); assert.deepEqual(backendStamp(),ledger);
    // No CLI inspection created another proof, request, execution or debit.
    assert.deepEqual([f.calls,f.ends,f.replies,f.losses,f.units,f.proofs],[1,1,1,0,1,1]);
    for (const name of MANIFESTS) {
      const manifestRaw = Buffer.alloc(16385), mf=openSync(join(fixture,name),constants.O_RDONLY|constants.O_NOFOLLOW);
      let manifestLength; try {manifestLength=readSync(mf,manifestRaw,0,manifestRaw.length,null);}finally{closeSync(mf);}
      assert.ok(manifestLength<=16384); assert.equal(manifestRaw.subarray(0,manifestLength).includes(Buffer.from(headers[0])),false);
      assert.equal(manifestRaw.subarray(0,manifestLength).includes(Buffer.from(f.key.publicKey.export({format:'jwk'}).x)),false);
    }
    assert.deepEqual(readdirSync(fixture).sort(),[...FILES,...MANIFESTS].sort());
    for(let i=0;i<FILES.length;i++){
      const now=lstatSync(join(fixture,FILES[i]),{bigint:true});
      assert.equal(now.ino,filesBefore[i].ino);assert.equal(now.dev,filesBefore[i].dev);
      assert.equal(now.nlink,1n);assert.equal(now.mode&0o777n,0o600n);assert.ok(now.size<=65536n);
    }
    assert.deepEqual(sources(),sourceBefore);
    t.diagnostic(JSON.stringify({kind:'P2_EXISTING_V6_RECOVERY_INSPECT_CLI',version:1,
      cliCalls:3,successfulInspections:1,changedCheckpointRefusals:1,missingPayerRefusals:1,hostileArgumentsRefusedWithoutHooks:true,
      originalBackendStatus:'CACHED_SUCCESS',localReconciliationRequired:true,payerOwnerEpochDelta:2,
      originalFundingCheckpointAndRequestRowsRetained:true,backendLedgerUnchangedByCli:true,
      nativeSqliteFiles:2,declaredSeedRequests:1,declaredSeedExecutions:1,declaredSeedDebits:1,
      additionalCliDispatches:0,additionalProofs:0,inMemorySyntheticCapabilityKeys:1,syntheticCapabilitySignatures:1,
      network:0,sdk:0,nonceSearch:0,realPrepare:0,payments:0,providerSignatures:0,realPaymentSignatures:0,
      actualProcessRestart:false,nativeStdinStdoutLauncherQualified:false,serviceDelivery:'NOT_ESTABLISHED'}));
  } catch(error) { caseError=error; }
  finally {
    try { if(f.runner!==null) await f.runner.close(); } catch(error) {caseError??=error;}
    try { if(f.session!==null) await f.session.close(); } catch(error) {caseError??=error;}
    try { if(f.backend!==null) f.backend.close(); } catch(error) {caseError??=error;}
    f.runner=null;f.session=null;f.backend=null;f.key=null;headers=null;inputs=null;
  }
  if(caseError!==null)throw caseError;
});
