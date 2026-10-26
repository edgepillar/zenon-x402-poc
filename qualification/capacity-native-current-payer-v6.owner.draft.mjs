// CURRENT ROLE V6 SOURCE ONLY. Historical V3 files and results remain unchanged.
// VERSIONED V3 SOURCE: stable directory identity; old files/evidence remain unchanged.
/* SOURCE DRAFT, default OFF. Actual P1 payer binding, not a fake/native alias.
 * One new empty V6, one actual DP/funding/service client, one process lifetime.
 * A complete P4 namespace/worker/parent launcher and separate finite native
 * approval are NOT implemented by this module. Never import it in DATA tests.
 */
import { captureNativePrivateDirectoryStatIdentity as DIRECTORY_ID } from '../src/native-private-directory-identity.js';
import { constants as C, lstatSync, fstatSync, openSync, closeSync, readSync, writeSync, fsyncSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { createNativeCapacityPayerLaneProtocol, captureNativeCapacityServiceOriginals } from './capacity-native-payer-lane.protocol.js';

const F = Object.freeze, D = Object.getOwnPropertyDescriptor, P = Object.getPrototypeOf, K = Reflect.ownKeys;
const APPLY = Reflect.apply, OWN = Object.hasOwn, PROXY = utilTypes.isProxy;
const NP = Promise, THEN = NP.prototype.then, CTOR = D(NP.prototype, 'constructor'), SPECIES = D(NP, Symbol.species);
const ARRAY_BUFFER = D(P(Uint8Array.prototype), 'buffer').get;
const NS = 'getPinnedNativeCapacityCurrentPayerNamespaceSnapshotV6';
const KIND = 'NATIVE_CAPACITY_CURRENT_PAYER_NODE24_V6';
let processLaneClaimed = false;

/** SOURCE-OWNED configuration only; wallet functions are the genuine client's
 * wallet interface, not injected SDK/store/native/fetch factories. The future
 * worker must own its memory-only synthetic keys. No serialized parent wallet.
 * Namespace admission is a cooperative source check, not human authority or an
 * OS sandbox. Absence rejects BEFORE effectful SDK/SQLite module imports.
 */
export async function openNativeCapacityCurrentPayerV6(options) {
  if (arguments.length !== 1 || processLaneClaimed || !intrinsics()) fail();
  const input = exact(options, ['context','plan','laneRoot','configuration','localReadOptions']);
  const protocol = createNativeCapacityPayerLaneProtocol(input.context, input.plan);
  const lanePlan = F({ warmupCallsPerLane: protocol.plan.warmupCallsPerLane,
    measurementCallsPerLane: protocol.plan.measurementCallsPerLane });
  const root = input.laneRoot;
  rootCheck(root); const rootId = identity(root, true);
  const configuration = captureTree(input.configuration, 'configuration');
  const localReadOptions = captureTree(input.localReadOptions, 'localReadOptions');
  const config = exact(configuration, ['storeOptions','fundingOptions','serviceOptions']);
  const storeOptions = exact(config.storeOptions, ['databasePath','allowedRoot','resourceUrl','custodyPolicy']);
  const databasePath = join(root, 'capacity-payer-v6.sqlite');
  const calls = protocol.plan.totalCalls;
  if (storeOptions.allowedRoot !== root || storeOptions.databasePath !== databasePath
      || storeOptions.custodyPolicy.maxRequests !== calls
      || config.serviceOptions.transportOptions.maxRequestStarts !== calls
      || config.serviceOptions.transportOptions.maxConcurrentRequests !== 1) fail();
  for (const name of ['capacity-funding-original.pins.json','capacity-service-originals.pins.json']) absent(join(root, name));
  for (const suffix of ['', '-journal','-wal','-shm']) absent(databasePath + suffix);
  const nsGetter = namespace(protocol.context.sourceRowsSha256);
  processLaneClaimed = true; // Never reset, even after clean close or failed construction.
  const opening = protocol.claim('OPEN');
  let initial = null, initialIdentity = null, client = null, storeId = null;
  try {
    // Hardwired full actual constructors: no surrogate graph or source copies.
    const native = await import('../src/zenon/dynamic-plasma-native-funding-service-client.js');
    const storage = await import('../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js');
    const checkpoints = await import('../src/service-credit-pilot-original-payment-checkpoint.js');
    currentNamespace(); checkRoot();
    for (const suffix of ['', '-journal','-wal','-shm']) absent(databasePath + suffix);
    initial = storage.createZenonFundingPayerRecoveryOriginalPaymentSqliteStoreV6(config.storeOptions);
    initialIdentity = identity(databasePath, false);
    if (initial.load() !== null || identity(databasePath, false) !== initialIdentity) fail();
    if (initial.close() !== undefined) fail();
    initial = null; storeId = identity(databasePath, false);
    if (storeId !== initialIdentity) fail();
    client = await native.openZenonDynamicPlasmaNativeFundingServiceClientForLocalQualification(configuration, localReadOptions);
    checkNativeOpen(); protocol.complete(opening, 'SUCCESS');
    return makeOwner(checkpoints.restoreOriginalPaymentCheckpoint);
  } catch {
    protocol.markUnknown();
    // Only the unpublished creator-owned handle may be closed here. Once the
    // actual client is entered it alone owns all native/store close semantics.
    if (initial !== null && initialIdentity !== null) {
      try { if (identity(databasePath, false) === initialIdentity) initial.close(); } catch {}
    }
    // Never unlink artifacts, close a consumed client store directly, retry an
    // acquisition, clear another module's slot or claim hidden resources drained.
    fail();
  }

  function currentNamespace() { if (namespace(protocol.context.sourceRowsSha256) !== nsGetter) fail(); }
  function checkRoot() { rootCheck(root); if (identity(root, true) !== rootId) fail(); }
  function checkFile() { checkRoot(); if (storeId === null || identity(databasePath, false) !== storeId) fail(); }
  function checkNativeOpen() {
    currentNamespace(); checkFile();
    const view = client.inspect();
    if (data(view, 'held') !== false || data(view, 'lifecycle') !== 'OPEN') fail();
  }
  function makeOwner(restoreCheckpoint) {
    let funding = null, serviceOriginals = null, active = null, closing = null;
    function verifyPins() {
      if (funding !== null) funding.verify();
      if (serviceOriginals !== null) serviceOriginals.verify();
    }
    function guard() { if (closing !== null || !intrinsics()) fail(); checkNativeOpen(); verifyPins(); }
    function launch(kind, selection, work) {
      if (active !== null || closing !== null) return rejected();
      try { guard(); } catch { protocol.markUnknown(); return rejected(); }
      let ticket; try { ticket = kind === 'EXECUTE' ? protocol.claim(kind, selection) : protocol.claim(kind); }
      catch { return rejected(); }
      const cap = capability(); active = cap.promise; // Before calling any native method.
      function finish(value, ok) {
        if (active === cap.promise) active = null;
        try { protocol.complete(ticket, ok ? 'SUCCESS' : 'UNKNOWN'); }
        catch { protocol.markUnknown(); ok = false; }
        if (ok) cap.resolve(value); else cap.reject(error());
      }
      try { observe(work(), value => finish(value, true), () => finish(undefined, false)); }
      catch { finish(undefined, false); }
      return cap.promise;
    }
    const prepare = F(function prepare(input) {
      if (arguments.length !== 1) return rejected();
      return launch('PREPARE', null, async () => {
        const result = await genuine(client.prepareOriginalFunding(input)); guard();
        if (data(result, 'phase') !== 'AWAITING_INDEPENDENT_PINS') fail();
        const packet = data(result, 'packet');
        const retained = captureTree({ transactionHash: data(packet, 'transactionHash'),
          paymentRequiredHeader: data(data(data(packet, 'pair'), 'challenge'), 'paymentRequiredHeader'),
          paymentSignatureHeader: data(data(packet, 'pair'), 'paymentSignatureHeader'),
          serializedCheckpoint: data(packet, 'serializedCheckpoint'), expectedPins: data(packet, 'expectedPins') }, 'pins');
        const restored = restoreCheckpoint(retained.serializedCheckpoint, retained.expectedPins);
        if (restored.binding.paymentHash !== retained.transactionHash
            || restored.originalBytes.paymentRequirements !== retained.paymentRequiredHeader
            || restored.originalBytes.paymentPayload !== retained.paymentSignatureHeader) fail();
        funding = retain('capacity-funding-original.pins.json', retained, 65536); funding.verify();
        // Private worker-only witness. Never print this packet/header/pin DATA.
        return F({ phase: 'AWAITING_INDEPENDENT_PINS', packet, retainedOriginal: retained });
      });
    });
    const commit = F(function commit() {
      if (arguments.length !== 0) return rejected();
      return launch('COMMIT', null, async () => {
        if (funding === null) fail();
        const result = await genuine(client.commitOriginalFunding({ expectedPins: funding.value.expectedPins }));
        guard(); if (data(result, 'phase') !== 'LOCAL_STORE_READBACK_MATCHED') fail(); return result;
      });
    });
    const submit = F(function submit() {
      if (arguments.length !== 0) return rejected();
      return launch('SUBMIT', null, async () => {
        if (funding === null) fail();
        const result = await genuine(client.submitOriginalFunding({ expectedPins: funding.value.expectedPins }));
        guard(); if (data(result, 'phase') !== 'FUNDING_INTAKE_BOUND' || data(result, 'fundingIntakeStatus') !== 'BOUND') fail();
        return result; // BOUND is NOT a grant, finality or service authority.
      });
    });
    const bind = F(function bind(originals) {
      if (arguments.length !== 1) return rejected();
      let selected;
      try { selected = captureNativeCapacityServiceOriginals(originals, lanePlan);
        if (selected.serviceResourceUrl !== storeOptions.custodyPolicy.serviceResourceUrl) fail(); }
      catch { return rejected(); }
      return launch('BIND', null, async () => {
        if (funding === null || serviceOriginals !== null) fail();
        // Includes every immutable proof. No original/proof is learned from SQL.
        serviceOriginals = retain('capacity-service-originals.pins.json', selected, 524288);
        verifyPins();
        const value = funding.value;
        const result = await genuine(client.handoffToService({ originalPayment: {
          resourceUrl: storeOptions.resourceUrl, serializedCheckpoint: value.serializedCheckpoint, expectedPins: value.expectedPins },
          selectedGrantId: selected.selectedGrantId, paymentRequiredHeader: value.paymentRequiredHeader }));
        guard(); if (data(result, 'phase') !== 'SERVICE_CLIENT_OPEN_ORIGINAL_RESTORED'
            || data(result, 'selectedGrantId') !== selected.selectedGrantId) fail(); return result;
      });
    });
    const execute = F(function execute(selection) {
      if (arguments.length !== 1) return rejected();
      // Capture DATA before claim; never reread a caller-owned ordinal after await.
      let row;
      try { const key = exact(selection, ['cohort','ordinal']);
        if (serviceOriginals === null) fail();
        const offset = key.cohort === 'WARMUP' ? 0 : key.cohort === 'MEASUREMENT' ? protocol.plan.warmupCallsPerLane : NaN;
        if (!Number.isSafeInteger(key.ordinal) || Object.is(key.ordinal, -0) || key.ordinal < 0) fail();
        row = serviceOriginals.value.originals[offset + key.ordinal];
        if (!row || row.cohort !== key.cohort || row.ordinal !== key.ordinal) fail(); }
      catch { return rejected(); }
      return launch('EXECUTE', F({ cohort: row.cohort, ordinal: row.ordinal }), async () => {
        const result = await genuine(client.submitOriginal(row.original));
        guard(); if (result !== undefined) fail(); return undefined;
      });
    });
    const close = F(function close() {
      if (arguments.length !== 0) return rejected();
      if (closing !== null) return closing;
      const ticket = protocol.requestClose(), cap = capability(); closing = cap.promise;
      // Always ask the real owner to stop, even after local pins/namespace fail.
      // Do not drop active accounting or interpret returned close as recovery.
      try { observe(client.close(), result => {
        try { currentNamespace(); checkFile(); verifyPins();
          const view = client.inspect();
          if (result !== undefined || data(view, 'lifecycle') !== 'CLOSED' || data(view, 'held') !== false) fail();
          protocol.completeClose(ticket, 'RETURNED'); cap.resolve(undefined);
        } catch { protocol.completeClose(ticket, 'UNKNOWN'); cap.reject(error()); }
      }, () => { protocol.completeClose(ticket, 'UNKNOWN'); cap.reject(error()); }); }
      catch { protocol.completeClose(ticket, 'UNKNOWN'); cap.reject(error()); }
      return closing;
    });
    const inspect = F(function inspect() {
      if (arguments.length !== 0) fail();
      // No material/headers/keys/paths, and no pretend SQL latency measurement.
      try { currentNamespace(); checkFile(); verifyPins(); const view = client.inspect();
        if (data(view, 'held') !== false) protocol.markUnknown(); }
      catch { protocol.markUnknown(); }
      return F({ nativeCapacityLaneVersion: 2, protocol: protocol.snapshot(),
        originalFundingRetained: funding !== null, serviceOriginalsRetained: serviceOriginals !== null,
        operationPromisePending: active !== null, nativeQualification: 'NOT_ESTABLISHED', authority: 'NONE' });
    });
    return F({ prepare, commit, submit, bind, execute, close, inspect });
  }

  function retain(name, value, maximum) {
    checkRoot();
    if (!intrinsics()) fail();
    const bytes = Buffer.from(JSON.stringify(value) + '\n', 'utf8'); if (bytes.length > maximum) fail();
    const path = join(root, name); absent(path);
    const fd = openSync(path, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW, 0o600);
    try { let written = 0; while (written < bytes.length) {
      const n = writeSync(fd, bytes, written, bytes.length - written, null); if (n <= 0) fail(); written += n;
    } fsyncSync(fd); } finally { closeSync(fd); }
    const directory = openSync(root, C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW);
    try { fsyncSync(directory); } finally { closeSync(directory); }
    const id = fullIdentity(lstatSync(path, { bigint: true })), digest = sha(bytes);
    const verify = F(function verify() {
      checkRoot(); const current = readExact(path, maximum, id);
      if (current.length !== bytes.length || sha(current) !== digest || !current.equals(bytes)) fail();
    });
    verify(); return F({ value, verify });
  }
}

function namespace(sourceRowsSha256) {
  if (process.version !== 'v24.19.0' || process.platform !== 'darwin' || process.arch !== 'arm64'
      || process.env.X402_NATIVE_CAPACITY_LANE_SELECTION !== 'native-capacity-current-payer-source-draft-v6') fail();
  const d = D(globalThis, NS);
  if (!d || !OWN(d, 'value') || d.writable || d.configurable || d.enumerable || typeof d.value !== 'function'
      || PROXY(d.value) || !Object.isFrozen(d.value)) fail();
  const s = exact(APPLY(d.value, undefined, []), ['profileKind','sourceRowsSha256','currentBaseApplication123Preserved',
    'baselinePackages404Preserved','applicationFiles','packageFiles','sourceTransforms','nativeBuiltinAliases',
    'ordinaryInstalledNamespaceQualified']);
  if (s.profileKind !== KIND || s.sourceRowsSha256 !== sourceRowsSha256
      || s.currentBaseApplication123Preserved !== true || s.baselinePackages404Preserved !== true
      || s.applicationFiles !== 163
      || s.packageFiles !== 404 || s.sourceTransforms !== 0 || s.nativeBuiltinAliases !== 0
      || s.ordinaryInstalledNamespaceQualified !== false) fail();
  return d.value;
}
function rootCheck(path) {
  if (typeof path !== 'string' || path.length > 4096 || !path.startsWith('/') || resolve(path) !== path
      || process.env.SPV_TASK_SCRATCH !== path) fail();
  for (let at = path;; at = dirname(at)) { if (lstatSync(at).isSymbolicLink()) fail(); if (dirname(at) === at) break; }
  identity(path, true);
}
function identity(path, directory) {
  const s = lstatSync(path, { bigint: true });
  if ((directory ? !s.isDirectory() || (s.mode & 0o777n) !== 0o700n
      : !s.isFile() || s.nlink !== 1n || (s.mode & 0o777n) !== 0o600n)
      || s.isSymbolicLink() || s.uid !== BigInt(process.getuid())) fail();
  return directory ? DIRECTORY_ID({dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode},BigInt(process.getuid())).join(':')
    : [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink].map(String).join(':');
}
function fullIdentity(s) { return [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':'); }
function absent(path) { try { lstatSync(path); } catch (e) { if (e?.code === 'ENOENT') return; fail(); } fail(); }
function readExact(path, maximum, expected) {
  identity(path, false); const s = lstatSync(path, { bigint: true });
  if (s.size < 0n || s.size > BigInt(maximum) || fullIdentity(s) !== expected) fail();
  const fd = openSync(path, C.O_RDONLY | C.O_NOFOLLOW);
  try {
    if (fullIdentity(fstatSync(fd, { bigint: true })) !== expected) fail();
    const bytes = Buffer.alloc(Number(s.size) + 1); let used = 0;
    while (used < bytes.length) { const n = readSync(fd, bytes, used, bytes.length - used, null); if (n === 0) break; used += n; }
    if (used !== Number(s.size) || fullIdentity(fstatSync(fd, { bigint: true })) !== expected
        || fullIdentity(lstatSync(path, { bigint: true })) !== expected) fail();
    return bytes.subarray(0, used);
  } finally { closeSync(fd); }
}
function captureTree(value, path, state = { nodes: 0 }, depth = 0) {
  if (++state.nodes > 4096 || depth > 12) fail();
  if (typeof value === 'string') { if (Buffer.byteLength(value) > 32768) fail(); return value; }
  if (value === null || typeof value === 'boolean' || typeof value === 'undefined') return value;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail(); return value; }
  if (typeof value === 'function') {
    if (!['configuration.fundingOptions.wallet.getAddress','configuration.fundingOptions.wallet.sign',
      'configuration.serviceOptions.official.validateChallenge'].includes(path) || PROXY(value)
        || P(value) !== Function.prototype || !Object.isFrozen(value)) fail(); return value;
  }
  if (typeof value !== 'object' || PROXY(value)) fail();
  if (Buffer.isBuffer(value)) {
    if (!path.endsWith('.ca') || P(value) !== Buffer.prototype || value.length < 1 || value.length > 65536
        || K(value).length !== value.length || utilTypes.isSharedArrayBuffer(APPLY(ARRAY_BUFFER, value, []))) fail();
    const out = Buffer.alloc(value.length);
    for (let i = 0; i < out.length; i++) { const d = D(value, String(i)); if (!d || !OWN(d,'value')) fail(); out[i] = d.value; }
    return out;
  }
  const array = Array.isArray(value);
  if (P(value) !== (array ? Array.prototype : Object.prototype)) fail();
  const keys = K(value); if (keys.length > 512) fail(); const out = array ? [] : {};
  for (const key of keys) {
    if (array && key === 'length') continue;
    if (typeof key !== 'string' || !/^(?:[A-Za-z][A-Za-z0-9]*|[0-9]+)$/.test(key)) fail();
    const d = D(value, key); if (!d || !OWN(d,'value') || !d.enumerable) fail();
    Object.defineProperty(out, key, { value: captureTree(d.value, path + '.' + key, state, depth + 1), enumerable: true });
  }
  if (array && out.length !== value.length) fail(); return F(out);
}
function exact(value, names) {
  if (value === null || typeof value !== 'object' || PROXY(value) || P(value) !== Object.prototype || K(value).length !== names.length) fail();
  const out = {};
  for (const name of names) { const d = D(value, name); if (!d || !OWN(d,'value') || !d.enumerable) fail();
    Object.defineProperty(out, name, { value: d.value, enumerable: true }); }
  return out;
}
function data(value, name) {
  if (value === null || typeof value !== 'object' || PROXY(value) || !Object.isFrozen(value)) fail();
  const d = D(value, name); if (!d || !OWN(d,'value') || !d.enumerable) fail(); return d.value;
}
function intrinsics() {
  return D(Object.prototype,'then') === undefined && D(Object.prototype,'toJSON') === undefined
    && D(NP.prototype,'then')?.value === THEN && D(NP.prototype,'constructor')?.value === CTOR.value
    && D(NP,Symbol.species)?.get === SPECIES.get;
}
function genuine(p) {
  if (!intrinsics() || !utilTypes.isPromise(p) || PROXY(p) || P(p) !== NP.prototype || D(p,'then') !== undefined) fail();
  const d = D(p,'constructor'); if (d && (!OWN(d,'value') || d.value !== NP || d.writable || d.configurable || d.enumerable)) fail();
  return p;
}
function observe(p, yes, no) {
  const bridge = APPLY(THEN, genuine(p), [yes,no]); APPLY(THEN, genuine(bridge), [discard,discard]);
}
function capability() {
  let resolve, reject; const promise = new NP((a,b) => { resolve = a; reject = b; });
  Object.defineProperty(promise, 'constructor', { value: NP }); APPLY(THEN,promise,[discard,discard]);
  return { promise, resolve, reject };
}
function rejected() { const c = capability(); c.reject(error()); return c.promise; }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function error() { const e = new TypeError('NATIVE_CAPACITY_PAYER_LANE_UNAVAILABLE');
  Object.defineProperty(e,'stack',{value:'TypeError: NATIVE_CAPACITY_PAYER_LANE_UNAVAILABLE'}); return F(e); }
function fail() { throw error(); }
function discard() {}
