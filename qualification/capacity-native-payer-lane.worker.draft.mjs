/* SOURCE DRAFT, NOT EXECUTED. Actual P1 payer worker, private Node IPC only.
 * The full pinned namespace must run first. A complete managed parent launcher,
 * real application/RPC/grant orchestration and a new finite native allowance
 * are still required. No fake native client/SDK/store, copied source or retry.
 */
import { Buffer } from 'node:buffer';
import { constants as C, lstatSync, fstatSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes, generateKeyPairSync, sign, createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';
import { captureNativeCapacityLanePlan } from './capacity-native-payer-lane.protocol.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, P = Object.getPrototypeOf, K = Reflect.ownKeys;
const OWN = Object.hasOwn, APPLY = Reflect.apply, PROXY = utilTypes.isProxy;
const NP = Promise, THEN = NP.prototype.then, NS = 'getPinnedNativeCapacityPayerLaneNamespaceSnapshot';
const E = process.env, ROOT = process.argv[2], ASSET = 'zts1znnxxxxxxxxxxxxx9z4ulx';
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const desc = D(globalThis,NS);
if (process.version !== 'v24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
    || process.argv.length !== 3 || ROOT !== E.SPV_TASK_SCRATCH || typeof process.send !== 'function'
    || !process.connected || process.channel === undefined
    || E.X402_NATIVE_CAPACITY_LANE_SELECTION !== 'native-capacity-lane-source-draft-v1'
    || E.X402_NATIVE_CAPACITY_RUN_SCOPE !== 'one-reviewed-native-capacity-lane-v1'
    || !/^[0-9a-f]{64}$/.test(E.X402_NATIVE_CAPACITY_RUN_ID || '')
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(E.X402_NATIVE_CAPACITY_LANE_ID || '')
    || !desc || !OWN(desc,'value') || desc.writable || desc.configurable || desc.enumerable
    || typeof desc.value !== 'function' || !Object.isFrozen(desc.value) || PROXY(desc.value)
    || E.NODE_OPTIONS !== undefined || E.NODE_PATH !== undefined || E.NODE_TEST_CONTEXT !== undefined) fail();
const NAMESPACE = desc.value, admitted = NAMESPACE();
if (admitted.profileKind !== 'NATIVE_CAPACITY_PAYER_LANE_NODE24_V1'
    || admitted.baselineApplication117Preserved !== true || admitted.baselinePackages404Preserved !== true
    || admitted.applicationFiles !== 122 || admitted.packageFiles !== 404 || admitted.sourceTransforms !== 0
    || admitted.nativeBuiltinAliases !== 0 || admitted.ordinaryInstalledNamespaceQualified !== false
    || !/^[0-9a-f]{64}$/.test(admitted.sourceRowsSha256 || '')) fail();
const CONTEXT = F({ runId:E.X402_NATIVE_CAPACITY_RUN_ID,laneId:E.X402_NATIVE_CAPACITY_LANE_ID,
  sourceRowsSha256:admitted.sourceRowsSha256 });
const ROOT_ID = rootIdentity(), SEND = process.send;
let stage = 'NEW', held = false, lastSequence = 0, active = null, closing = null, closeRequested = false;
let owner = null, ownerOpening = false, ownerAcquisitionEntered = false, closeOutcome = 'NOT_REQUESTED', plan = null, keysReleased = false;
let walletSeed = null, capabilityPrivate = null, publicWallet = null, capabilityPublic = null, commitment = null, payer = null;
let libs = null, ca = null, appOrigin = null, payee = null, sourceBindEntered = false;
let walletAddressCalls = 0, walletSignatures = 0, capabilitySignatures = 0, outboundMessages = 0, pendingSends = 0;

// No timers, SDK, SQL, key generation or sockets have been entered above.
process.on('message', onMessage);
process.on('disconnect', () => { if (closeOutcome !== 'RETURNED' || active !== null || pendingSends !== 0) hold(); stopOnce(); });
process.on('error', () => { hold(); stopOnce(); });

function current() {
  if (D(globalThis,NS)?.value !== NAMESPACE || NAMESPACE().sourceRowsSha256 !== CONTEXT.sourceRowsSha256
      || rootIdentity() !== ROOT_ID || D(Object.prototype,'then') !== undefined || D(Object.prototype,'toJSON') !== undefined) fail();
}
function live() { current(); if (held || closeRequested) fail(); }
function hold() { held = true; process.exitCode = 1; }
function clock() { const n = process.hrtime.bigint(); if (typeof n !== 'bigint' || n < 0n || n >= (1n << 128n)) fail(); return n; }
function send(sequence, kind, status, value, startNs, endNs) {
  // Private IPC may carry the retained ORIGINAL witness. Nothing is printed.
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 0 || ++outboundMessages > 265) { hold(); return; }
  const packet = { protocolVersion:1,context:CONTEXT,sequence,kind,status,value,
    timing:{ source:'CHILD_LOCAL_MONOTONIC_OPERATION_NOT_SQL_LATENCY',startNs:startNs.toString(),endNs:endNs.toString() } };
  let encoded;
  try { encoded = JSON.stringify(packet); if (Buffer.byteLength(encoded) > 131072 || !process.connected) fail(); }
  catch { hold(); stopOnce(); return; }
  pendingSends++;
  try { APPLY(SEND,process,[packet,undefined,{ keepOpen:false },error => {
    pendingSends--; if (error) { hold(); stopOnce(); }
  }]); } catch { pendingSends--; hold(); stopOnce(); }
}
function onMessage(message, handle) {
  let c;
  try {
    if (handle !== undefined && handle !== null) fail();
    c = exact(captureData(message),['protocolVersion','context','sequence','kind','payload']);
    const ctx = exact(c.context,['runId','laneId','sourceRowsSha256']);
    if (c.protocolVersion !== 1 || Object.keys(CONTEXT).some(k => CONTEXT[k] !== ctx[k])
        || !Number.isSafeInteger(c.sequence) || Object.is(c.sequence,-0) || c.sequence !== lastSequence + 1 || c.sequence > 263
        || typeof c.kind !== 'string') fail();
    lastSequence = c.sequence; // No queue, duplicate command or replacement after refusal.
    if (c.kind === 'CLOSE') {
      exact(c.payload,[]); if (closeRequested) fail();
      const begin = clock(); const p = stopOnce();
      observe(p, facts => send(c.sequence,'CLOSE',facts.closeOutcome === 'RETURNED' ? 'OBSERVED_RETURNED_CLOSE' : 'UNKNOWN',facts,begin,clock()),
        () => send(c.sequence,'CLOSE','UNKNOWN',facts(),begin,clock())); return;
    }
    live(); if (active !== null) fail();
    const before = { INIT:'NEW',OPEN:'KEYS_READY',PREPARE:'FUNDING_READY',COMMIT:'PREPARED',SUBMIT:'COMMITTED',BIND:'BOUND',EXECUTE:'SERVICE_READY' };
    if (!OWN(before,c.kind) || stage !== before[c.kind]) fail();
  } catch { hold(); stopOnce(); return; }
  const begin = clock(), done = deferred(), entry = { sequence:c.sequence,kind:c.kind,settled:done.promise };
  active = entry; // Before imports, key generation, native construction or caller callbacks.
  const work = perform(c.kind,c.payload);
  observe(work, value => {
    let end;
    try { end = clock(); if (end < begin || held || closeRequested) fail();
      send(c.sequence,c.kind,'OBSERVED',value,begin,end);
    } catch { hold(); send(c.sequence,c.kind,'UNKNOWN',null,begin,end ?? begin); }
    if (active === entry) active = null; done.resolve(undefined);
  }, () => {
    hold(); let end; try { end = clock(); } catch { end = begin; }
    send(c.sequence,c.kind,'UNKNOWN',null,begin,end);
    if (active === entry) active = null; done.resolve(undefined); stopOnce();
  });
}
async function perform(kind, payload) {
  if (kind === 'INIT') {
    const p = exact(payload,['warmupCallsPerLane','measurementCallsPerLane']); plan = captureNativeCapacityLanePlan(p);
    // Full real packages, not a small compatible signer or cloned application.
    const [ed,hashes,sdk,canonical,capability,wire] = await NP.all([
      import('@noble/ed25519'),import('@noble/hashes/sha2'),import('znn-typescript-sdk'),
      import('../src/canonical.js'),import('../src/service-credit-capability.js'),import('../src/x402-wire.js'),
    ]);
    live(); libs = { ed,hashes,sdk,canonical,capability,wire };
    ed.etc.sha512Sync = (...messages) => hashes.sha512(ed.etc.concatBytes(...messages));
    walletSeed = randomBytes(32); const pub = Buffer.from(ed.getPublicKey(walletSeed)); publicWallet = pub.toString('base64');
    // Use the actual pinned SDK address derivation, never a second bech32 implementation.
    payer = sdk.Address.fromPublicKey(pub).toString(); address(payer);
    const pair = generateKeyPairSync('ed25519'); capabilityPrivate = pair.privateKey;
    const spki = pair.publicKey.export({ format:'der',type:'spki' });
    if (spki.length !== 44 || spki.subarray(0,12).toString('hex') !== '302a300506032b6570032100') fail();
    capabilityPublic = spki.subarray(12).toString('base64url');
    commitment = capability.deriveServiceCreditCapabilityCommitment({ publicKey:capabilityPublic });
    stage = 'KEYS_READY'; return F({ payerAddress:payer,walletPublicKey:publicWallet,
      capabilityPublicKey:capabilityPublic,capabilityCommitment:commitment });
  }
  if (kind === 'OPEN') {
    const p = exact(payload,['appPort','rpcPort','payeeAddress','startNonce']);
    port(p.appPort); port(p.rpcPort); address(p.payeeAddress);
    if (p.appPort === p.rpcPort || p.payeeAddress === payer || typeof p.startNonce !== 'string' || !/^[0-9a-f]{16}$/.test(p.startNonce)) fail();
    ca = readPrivateCertificate(); appOrigin = 'https://127.0.0.1:' + p.appPort; payee = p.payeeAddress;
    const { openNativeCapacityPayerLane } = await import('./capacity-native-payer-lane.owner.draft.mjs'); live();
    const endpoint = path => F({ route:F({ hostname:'localhost',path,ipv4Address:'127.0.0.1' }),timeoutMs:2000,closeGraceMs:500 });
    const wallet = F({ getAddress:F(function getAddress() {
      live(); if (++walletAddressCalls !== 1) fail(); return NP.resolve(payer);
    }), sign:F(function signOriginal(block) {
      live(); if (++walletSignatures !== 1 || !Object.isFrozen(block) || block.publicKey !== publicWallet
          || typeof block.hash !== 'string' || !/^[0-9a-f]{64}$/.test(block.hash)) fail();
      const signature = Buffer.from(libs.ed.sign(Buffer.from(block.hash,'hex'),walletSeed)).toString('base64');
      return NP.resolve({ ...block,signature });
    }) });
    const validateChallenge = F(function validateChallenge(value) {
      live(); libs.wire.validatePaymentRequired(value); if (value.accepts.length !== 1) fail();
      libs.wire.validateActiveUpfrontRequirement(value.accepts[0]);
      if (value.accepts[0].asset !== ASSET || value.accepts[0].payTo !== payee || value.accepts[0].network !== 'zenon:testnet') fail();
    });
    ownerOpening = true; ownerAcquisitionEntered = true;
    try { owner = await openNativeCapacityPayerLane({ context:CONTEXT,
      plan:{ warmupCallsPerLane:plan.warmupCallsPerLane,measurementCallsPerLane:plan.measurementCallsPerLane },laneRoot:ROOT,
      configuration:{
        storeOptions:{ databasePath:join(ROOT,'capacity-payer-v6.sqlite'),allowedRoot:ROOT,resourceUrl:appOrigin+'/funding',
          custodyPolicy:{ policyVersion:1,maxRequests:plan.totalCalls,serviceResourceUrl:appOrigin+'/service-credit/v1/execute' } },
        fundingOptions:{ readSessionOptions:F({ endpoints:F([endpoint('/rpc/first'),endpoint('/rpc/second')]),accountEndpoint:endpoint('/rpc/account') }),
          materialOptions:{ publicKey:publicWallet,startNonce:p.startNonce,limits:{ maxAttempts:4096,maxDifficulty:38115000 } },
          materialWaitMs:5000,wallet,deadlineMs:5000,fundingTransportOptions:{ resourceUrl:appOrigin+'/funding',ca,
            maxRequestStarts:1,requestDeadlineMs:5000,handshakeDeadlineMs:1000,closeGraceMs:500 } },
        serviceOptions:{ official:{ validateChallenge,assetInfo:{ asset:ASSET,decimals:8,symbol:'ZNN' },contextLimit:1 },
          transportOptions:{ origin:appOrigin,ca,maxRequestStarts:plan.totalCalls,maxConcurrentRequests:1,
            requestDeadlineMs:5000,handshakeDeadlineMs:1000,closeGraceMs:500 },deadlineMs:5000 },
      },localReadOptions:{ port:p.rpcPort,ca } });
    } finally { ownerOpening = false; }
    live(); stage = 'FUNDING_READY'; return F({ phase:stage });
  }
  if (kind === 'PREPARE') {
    const p = exact(payload,['plannerContext','challenge','originalRequest']);
    const result = await owner.prepare(p); live(); stage = 'PREPARED';
    // Private IPC only. Parent can bind genuine SDK verifier/settler tuples to
    // these exact retained headers/checkpoint, without getting either private key.
    return F({ phase:stage,retainedOriginal:result.retainedOriginal });
  }
  if (kind === 'COMMIT') { exact(payload,[]); await owner.commit(); live(); stage = 'COMMITTED'; return F({ phase:stage }); }
  if (kind === 'SUBMIT') { exact(payload,[]); await owner.submit(); live(); stage = 'BOUND'; return F({ phase:stage,grantActivation:'NOT_ESTABLISHED' }); }
  if (kind === 'BIND') {
    const grant = exact(payload,['grantId','capabilityCommitment']); identifier(grant.grantId);
    if (grant.capabilityCommitment !== commitment || sourceBindEntered) fail(); sourceBindEntered = true;
    const rows = [];
    for (const [cohort,count] of [['WARMUP',plan.warmupCallsPerLane],['MEASUREMENT',plan.measurementCallsPerLane]]) {
      for (let ordinal = 0; ordinal < count; ordinal++) {
        live(); const requestId = createHash('sha256').update('native-capacity-original-v1\0')
          .update(CONTEXT.runId).update('\0').update(CONTEXT.laneId).update('\0').update(cohort).update('\0').update(String(ordinal)).digest('hex');
        const request = { modelVersion:1,grantId:grant.grantId,requestId,method:'POST',routeId:'service-credit.execute.v1',
          canonicalBodyDigest:EMPTY,selectedContentType:'application/json',maxCostUnits:2 };
        if (++capabilitySignatures > plan.totalCalls) fail(); // Reserve before actual signing; no new proofs on recovery.
        const proof = { proofVersion:1,grantId:grant.grantId,requestId,publicKey:capabilityPublic,maxCostUnits:2,
          signature:sign(null,libs.capability.createServiceCreditCapabilitySigningBytes(request),capabilityPrivate).toString('base64url') };
        if (libs.capability.verifyServiceCreditCapability({ grant,request,proof }).verified !== true) fail();
        rows.push({ cohort,ordinal,original:{ grantId:grant.grantId,requestId,originalRequestJson:JSON.stringify(request),originalBodyBase64:'',
          serviceResourceUrl:appOrigin+'/service-credit/v1/execute',
          authorizationHeader:'ServiceCredit '+Buffer.from(libs.canonical.canonicalJson(proof)).toString('base64url') } });
      }
    }
    await owner.bind({ selectedGrantId:grant.grantId,serviceResourceUrl:appOrigin+'/service-credit/v1/execute',originals:rows });
    live(); stage = 'SERVICE_READY'; return F({ phase:stage,originalsRetained:rows.length });
  }
  if (kind === 'EXECUTE') {
    const p = exact(payload,['cohort','ordinal']); await owner.execute(p); live();
    return F({ cohort:p.cohort,ordinal:p.ordinal,outcome:'ORIGINAL_CLIENT_OPERATION_FULFILLED',serviceDelivery:'NOT_ESTABLISHED' });
  }
  fail();
}
function stopOnce() {
  if (closing !== null) return closing;
  closeRequested = true; closeOutcome = 'PENDING'; const cap = deferred(); closing = cap.promise;
  const entered = active;
  (async () => {
    try {
      // If an actual owner exists, stop it immediately rather than waiting for
      // the active operation first. If opening, wait for its one acquisition;
      // a hidden/failed acquisition stays UNKNOWN, never a false empty close.
      let stop = null;
      if (owner !== null) stop = owner.close();
      if (entered !== null) await entered.settled;
      if (stop === null && owner !== null) stop = owner.close();
      if (stop !== null) { if (await stop !== undefined) fail(); }
      if (ownerOpening || active !== null || ownerAcquisitionEntered && owner === null) fail(); current();
      if (owner !== null) {
        const view = owner.inspect(); if (view.protocol.closeOutcome !== 'RETURNED') fail();
        if (view.protocol.held) hold();
      }
      closeOutcome = 'RETURNED';
      if (!held) { if (walletSeed !== null) walletSeed.fill(0); walletSeed = null; capabilityPrivate = null;
        if (ca !== null) ca.fill(0); ca = null; keysReleased = true; stage = 'CLOSED'; }
      cap.resolve(facts());
    } catch { hold(); closeOutcome = 'UNKNOWN'; cap.resolve(facts()); }
  })(); return closing;
}
function facts() { return F({ closeOutcome,held,activeOperation:active !== null,ownerAcquisitionPending:ownerOpening,
  ownerAcquisitionEntered,ownerReturned:owner !== null,
  walletSignatures,capabilitySignatures,keysReleased,defaultEnabled:false,nativeQualification:'NOT_ESTABLISHED',authority:'NONE' }); }
function deferred() {
  let resolve; const promise = new NP(yes => { resolve = yes; });
  Object.defineProperty(promise,'constructor',{ value:NP }); APPLY(THEN,promise,[discard,discard]); return { promise,resolve };
}
function observe(p, yes, no) {
  if (!utilTypes.isPromise(p) || PROXY(p) || P(p) !== NP.prototype || D(p,'then') !== undefined) fail();
  const bridge = APPLY(THEN,p,[yes,no]); APPLY(THEN,bridge,[discard,discard]);
}
function captureData(value, state = { nodes:0,bytes:0 }, depth = 0) {
  if (++state.nodes > 4096 || depth > 16) fail();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { state.bytes += Buffer.byteLength(value); if (state.bytes > 65536) fail(); return value; }
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || Object.is(value,-0)) fail(); return value; }
  if (typeof value !== 'object' || PROXY(value)) fail(); const array = Array.isArray(value);
  if (P(value) !== (array ? Array.prototype : Object.prototype)) fail();
  const keys = K(value); if (keys.length > 512) fail(); const out = array ? [] : {};
  for (const key of keys) {
    if (array && key === 'length') continue;
    if (typeof key !== 'string' || key.length > 128) fail();
    const d = D(value,key); if (!d || !OWN(d,'value') || !d.enumerable) fail();
    Object.defineProperty(out,key,{ value:captureData(d.value,state,depth+1),enumerable:true });
  }
  if (array && out.length !== value.length) fail(); return F(out);
}
function exact(value,names) {
  if (value === null || typeof value !== 'object' || PROXY(value) || P(value) !== Object.prototype || K(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = D(value,name); if (!d || !OWN(d,'value') || !d.enumerable) fail();
    Object.defineProperty(out,name,{ value:d.value,enumerable:true }); } return F(out);
}
function rootIdentity() {
  if (typeof ROOT !== 'string' || ROOT.length > 4096 || !ROOT.startsWith('/') || resolve(ROOT) !== ROOT) fail();
  for (let at = ROOT;; at = dirname(at)) { if (lstatSync(at).isSymbolicLink()) fail(); if (dirname(at) === at) break; }
  const s = lstatSync(ROOT,{ bigint:true });
  if (!s.isDirectory() || s.uid !== BigInt(process.getuid()) || (s.mode & 0o7777n) !== 0o700n) fail();
  return [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink].map(String).join(':');
}
function readPrivateCertificate() {
  current(); const path = join(ROOT,'tls-cert.pem'), s = lstatSync(path,{ bigint:true });
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1n || s.uid !== BigInt(process.getuid())
      || (s.mode & 0o7777n) !== 0o600n || s.size < 1n || s.size > 16384n) fail();
  const id = st => [st.dev,st.ino,st.uid,st.gid,st.mode,st.nlink,st.size,st.mtimeNs,st.ctimeNs].map(String).join(':');
  const before = id(s), fd = openSync(path,C.O_RDONLY | C.O_NOFOLLOW);
  try {
    if (id(fstatSync(fd,{ bigint:true })) !== before) fail(); const out = Buffer.alloc(Number(s.size)+1); let used = 0;
    while (used < out.length) { const n = readSync(fd,out,used,out.length-used,null); if (n === 0) break; used += n; }
    if (used !== Number(s.size) || id(fstatSync(fd,{ bigint:true })) !== before || id(lstatSync(path,{ bigint:true })) !== before) fail();
    return Buffer.from(out.subarray(0,used));
  } finally { closeSync(fd); }
}
function port(n) { if (!Number.isSafeInteger(n) || n < 1024 || n > 65535) fail(); }
function identifier(v) { if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v)) fail(); }
function address(v) { if (typeof v !== 'string' || !/^z1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/.test(v)) fail(); }
function fail() { const e = new TypeError('NATIVE_CAPACITY_WORKER_UNAVAILABLE');
  Object.defineProperty(e,'stack',{ value:'TypeError: NATIVE_CAPACITY_WORKER_UNAVAILABLE' }); throw F(e); }
function discard() {}
