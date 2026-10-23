import { Buffer } from 'node:buffer';
import { types as utilTypes } from 'node:util';
import { constants, openSync, closeSync, lstatSync, fstatSync, readSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout, clearTimeout } from 'node:timers';
import {
  snapshotOriginalServiceRequestCustodyPolicy,
  snapshotOriginalServiceRequestCustodyKey,
} from './service-credit-original-request-custody-contract.js';

const FREEZE = Object.freeze, KEYS = Reflect.ownKeys, DESC = Object.getOwnPropertyDescriptor;
const OWN = Object.hasOwn, PROTO = Object.getPrototypeOf, APPLY = Reflect.apply;
const IS_PROXY = utilTypes.isProxy, SAFE = Number.isSafeInteger, IS = Object.is;
const PARSE = JSON.parse, STRINGIFY = JSON.stringify, NativeError = TypeError;
const NativePromise = Promise, SET_INPUT_TIMEOUT = setTimeout, CLEAR_INPUT_TIMEOUT = clearTimeout;
const OPEN = openSync, CLOSE = closeSync, LSTAT = lstatSync, FSTAT = fstatSync;
const READ = readSync, WRITE = writeSync, FROM = Buffer.from;
const POLICY = snapshotOriginalServiceRequestCustodyPolicy, KEY = snapshotOriginalServiceRequestCustodyKey;
const MANIFEST_BYTES = 16384, PROOF_BYTES = 1024, RESULT_BYTES = 2048;
const PROOF_INPUT_MS = 5000;
const FAILURE = 'SERVICE_CREDIT_RECOVERY_INSPECTION_FAILED\n';
const FIELDS = FREEZE(['inspectionVersion', 'payerDatabasePath', 'backendDatabasePath',
  'fundingResourceUrl', 'custodyPolicy', 'selectedGrantId', 'deadlineMs', 'requestKey',
  'expectedCheckpointPins', 'backendLimits']);
const LIMITS = FREEZE(['busyTimeoutMs', 'maxStateBytes', 'maxOffers', 'maxGrants', 'maxRequests']);

/**
 * Operator entry over the EXISTING V6 payer/backend recovery connection.
 * No new store, migration, grant, request, proof, retry, reconciliation action,
 * signer, payment, transport or pricing policy is created. Only the current
 * backend openExisting method and V6 no-dispatch client are used.
 *
 * Usage: node src/service-credit-recovery-inspect-cli.js
 *   --manifest <absolute-private-file> --allowed-root <absolute-private-root>
 * Supply the ORIGINAL service Authorization value on stdin, not argv/env or the
 * manifest. It is never persisted or echoed. Strings cannot be reliably erased.
 * The private manifest supplies INDEPENDENT original checkpoint pins; they are
 * never learned from the database to manufacture a new trust root.
 *
 * Opening is NOT SQLite readOnly: native transactions and V6 owner_epoch
 * acquisition remain real local writes. Both stores must already exist.
 * No-dispatch is API attenuation, not an OS/network/same-UID sandbox. A fixed
 * throwing deriveCost forbids a cost decision; it does not invent economics.
 *
 * Own one backend handle and one V6 payer connection, query once, close the
 * payer once and then the backend once on success/failure. A close failure
 * refuses output and is never retried or represented as release. Only native
 * stdin acquisition has a 5000 ms application timer. It is not a store-operation
 * timeout, forced cancellation, file cleanup or hard OS/native lifetime promise.
 *
 * Returned JSON is redacted DATA: backend CACHED_SUCCESS is a recorded claim,
 * never confirmed delivery, current authority, safe retry, funding, finality,
 * crash/restart durability, live readiness or permission to replace/pay.
 * Existing default CLIs, stores and original payment bytes/hash remain unchanged.
 * Preserve the VALIDATED same-signed-block rule versus UNKNOWN/ACKNOWLEDGED.
 */
export async function inspectServiceCreditOriginal(configuration) {
  let config = null, backend = null, payer = null, result = null, failed = false;
  let stage = 'INPUT', failedStage = null;
  try {
    if (arguments.length !== 1) fail();
    const top = exact(configuration, ['manifestPath', 'allowedRoot', 'authorizationHeader']);
    stage = 'MANIFEST'; config = loadManifest(top.manifestPath, top.allowedRoot);
    const proof = top.authorizationHeader;
    if (typeof proof !== 'string' || !proof.startsWith('ServiceCredit ')
        || proof.length > PROOF_BYTES || Buffer.byteLength(proof, 'utf8') > PROOF_BYTES
        || /[\r\n\0]/.test(proof)) fail();
    // No arbitrary module name or caller factory. These are the existing owners.
    stage = 'MODULES';
    const { ServiceCreditSqliteStore } = await import('./service-credit-sqlite-store.js');
    const { openServiceCreditCustodiedSqliteBackendRecoveryClientV6 }
      = await import('./service-credit-custodied-backend-recovery-client.js');
    const openBackend = ServiceCreditSqliteStore.openExisting;
    stage = 'BACKEND_OPEN';
    backend = APPLY(openBackend, ServiceCreditSqliteStore, [{
      databasePath: config.backendDatabasePath, allowedRoot: config.allowedRoot,
      deriveCost: function inspectionCannotDeriveCost() { fail(); }, ...config.backendLimits,
    }]);
    stage = 'PAYER_OPEN';
    payer = await openServiceCreditCustodiedSqliteBackendRecoveryClientV6({
      databasePath: config.payerDatabasePath, allowedRoot: config.allowedRoot,
      backendStore: backend, fundingResourceUrl: config.fundingResourceUrl,
      custodyPolicy: config.custodyPolicy, selectedGrantId: config.selectedGrantId,
      deadlineMs: config.deadlineMs,
    });
    stage = 'ORIGINAL_READ';
    const observed = payer.readOriginalBackendRecoveryState(
      config.requestKey, proof, config.expectedCheckpointPins,
    );
    stage = 'REDACTED_RESULT';
    if (observed === null || typeof observed !== 'object' || IS_PROXY(observed)
        || observed.authority !== 'NONE' || observed.deliveryConfirmed !== false
        || typeof observed.status !== 'string' || !/^[A-Z_]{1,64}$/.test(observed.status)) fail();
    const backendStatus = observed.backend === null ? null : observed.backend.status;
    if (backendStatus !== null && (typeof backendStatus !== 'string'
        || !/^[A-Z_]{1,64}$/.test(backendStatus))) fail();
    result = FREEZE({ inspectionVersion: 1, status: observed.status, backendStatus,
      originalCheckpointPinsMatched: true,
      localReconciliationRequired: observed.status === 'CLIENT_RECONCILIATION_REQUIRED',
      authority: 'NONE', mayDispatchService: false, mayStartPayment: false,
      maySignPayment: false, deliveryConfirmed: false, serviceDelivery: 'NOT_ESTABLISHED',
      currentAuthority: 'NOT_ESTABLISHED', sameProcessObservationOnly: true });
  } catch { failed = true; failedStage = stage; }
  finally {
    // The V6 connection fences its borrowed backend reader before native payer
    // close. Backend ownership stays here and is released after that one call.
    if (payer !== null) {
      try { await payer.close(); } catch { if (!failed) failedStage = 'PAYER_CLOSE'; failed = true; }
      payer = null;
    }
    if (backend !== null) {
      try { backend.close(); } catch { if (!failed) failedStage = 'BACKEND_CLOSE'; failed = true; }
      backend = null;
    }
    config = null; configuration = null;
  }
  if (failed || result === null) fail(failedStage ?? 'REDACTED_RESULT');
  return result;
}

/** Same bounded argument/manifest/owner path as the launcher; no output hook. */
export async function runServiceCreditRecoveryInspectCli(argv, authorizationHeader) {
  try {
    if (arguments.length !== 2) fail();
    const args = captureArgs(argv);
    const result = await inspectServiceCreditOriginal({
      manifestPath: args[1], allowedRoot: args[3], authorizationHeader,
    });
    const stdout = STRINGIFY(result) + '\n';
    if (Buffer.byteLength(stdout, 'utf8') > RESULT_BYTES) fail();
    return FREEZE({ exitCode: 0, stdout, stderr: '' });
  } catch { return FREEZE({ exitCode: 1, stdout: '', stderr: FAILURE }); }
  finally { argv = null; authorizationHeader = null; }
}

function captureArgs(argv) {
  if (IS_PROXY(argv) || !Array.isArray(argv) || PROTO(argv) !== Array.prototype
      || KEYS(argv).length !== 5) fail();
  const length = DESC(argv, 'length');
  if (!length || !OWN(length, 'value') || length.value !== 4) fail();
  const args = [];
  for (let i = 0; i < 4; i++) {
    const d = DESC(argv, String(i));
    if (!d || !OWN(d, 'value') || d.enumerable !== true || typeof d.value !== 'string') fail();
    args[i] = d.value;
  }
  if (args[0] !== '--manifest' || args[2] !== '--allowed-root') fail();
  return args;
}

function exact(value, fields) {
  if (value === null || typeof value !== 'object' || IS_PROXY(value)
      || PROTO(value) !== Object.prototype || KEYS(value).length !== fields.length) fail();
  const captured = Object.create(null);
  for (const key of fields) {
    const d = DESC(value, key);
    if (!d || !OWN(d, 'value') || d.enumerable !== true) fail();
    captured[key] = d.value;
  }
  return captured;
}
function absolute(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096
      || value.includes('\0') || !isAbsolute(value) || resolve(value) !== value) fail();
  return value;
}
function within(root, path) {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel);
}
function identity(s) {
  return ['dev','ino','uid','gid','mode','nlink','size','mtimeNs','ctimeNs'].map(k => String(s[k]));
}
function sameIdentity(a, b) {
  const x = identity(a), y = identity(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
function readManifest(path, root) {
  if (typeof process.getuid !== 'function') fail();
  const uid = BigInt(process.getuid()), rootStat = LSTAT(root, { bigint: true });
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.uid !== uid
      || (rootStat.mode & 0o077n) !== 0n) fail();
  for (let p = path;; p = dirname(p)) {
    if (LSTAT(p, { bigint: true }).isSymbolicLink()) fail();
    if (dirname(p) === p) break;
  }
  const before = LSTAT(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.uid !== uid || before.nlink !== 1n
      || (before.mode & 0o077n) !== 0n || before.size < 1n || before.size > BigInt(MANIFEST_BYTES)) fail();
  const fd = OPEN(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const raw = Buffer.alloc(Number(before.size) + 1);
  let used = 0;
  try {
    if (!sameIdentity(before, FSTAT(fd, { bigint: true }))) fail();
    while (used < raw.length) {
      const n = READ(fd, raw, used, raw.length - used, null);
      if (n === 0) break;
      used += n;
    }
    if (!sameIdentity(before, FSTAT(fd, { bigint: true }))) fail();
  } finally { CLOSE(fd); }
  try {
    if (!sameIdentity(before, LSTAT(path, { bigint: true }))
        || !sameIdentity(rootStat, LSTAT(root, { bigint: true })) || used !== Number(before.size)) fail();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw.subarray(0, used));
    return PARSE(text);
  } finally { raw.fill(0); }
}
function loadManifest(manifestPath, allowedRoot) {
  const root = absolute(allowedRoot), path = absolute(manifestPath);
  if (!within(root, path)) fail();
  const c = exact(readManifest(path, root), FIELDS);
  if (c.inspectionVersion !== 1) fail();
  for (const field of ['payerDatabasePath', 'backendDatabasePath'])
    if (!within(root, absolute(c[field]))) fail();
  if (c.payerDatabasePath === c.backendDatabasePath || c.payerDatabasePath === path
      || c.backendDatabasePath === path) fail();
  const policy = POLICY(c.custodyPolicy, c.fundingResourceUrl), key = KEY(c.requestKey);
  if (key.grantId !== c.selectedGrantId || !SAFE(c.deadlineMs) || c.deadlineMs < 1
      || c.deadlineMs > 60000 || IS(c.deadlineMs, -0)
      || typeof c.fundingResourceUrl !== 'string' || c.fundingResourceUrl.length > 8192) fail();
  const limits = exact(c.backendLimits, LIMITS);
  for (const field of LIMITS)
    if (!SAFE(limits[field]) || limits[field] < 1 || IS(limits[field], -0)) fail();
  if (limits.busyTimeoutMs > 5000 || limits.maxStateBytes < 512 || limits.maxStateBytes > 1048576
      || limits.maxOffers > 1024 || limits.maxGrants > 1024 || limits.maxRequests > 1024) fail();
  // Parsed bounded JSON is DATA; the real V6 checkpoint reader validates exact
  // binding/digest semantics against these independently supplied pins.
  exact(c.expectedCheckpointPins, ['binding', 'digests']);
  return FREEZE({ ...c, allowedRoot: root, custodyPolicy: policy, requestKey: key,
    backendLimits: FREEZE({ ...limits }) });
}
function fail(stage = 'INPUT') {
  const error = new NativeError('SERVICE_CREDIT_RECOVERY_INSPECTION_FAILED');
  Object.defineProperty(error, 'code', { value: 'SERVICE_CREDIT_RECOVERY_INSPECTION_FAILED', enumerable: true });
  Object.defineProperty(error, 'stack', { value: 'TypeError: SERVICE_CREDIT_RECOVERY_INSPECTION_FAILED' });
  Object.defineProperty(error, 'stage', { value: stage, enumerable: true });
  throw FREEZE(error);
}
function writeLine(fd, line) {
  if (!line) return;
  const bytes = APPLY(FROM, Buffer, [line, 'utf8']);
  if (WRITE(fd, bytes, 0, bytes.length) !== bytes.length) fail();
}
function stdinProof() {
  // The native launcher owns this stdin stream. Do not use an uncancellable
  // blocking fd read or accept a credential before EOF. No store is open yet.
  const input = process.stdin;
  return new NativePromise((resolveInput, rejectInput) => {
    const raw = Buffer.alloc(PROOF_BYTES + 2);
    let used = 0, settled = false, timer = null;
    function finish(complete) {
      if (settled) return;
      settled = true;
      if (timer !== null) { CLEAR_INPUT_TIMEOUT(timer); timer = null; }
      try {
        input.pause();
        input.removeListener('data', onData);
        input.removeListener('end', onEnd);
        // Keep the fixed error guard until native close; late input events
        // cannot change the outcome or authorize opening either store.
        if (!input.destroyed) input.destroy();
        if (!complete) fail();
        let text = new TextDecoder('utf-8', { fatal: true }).decode(raw.subarray(0, used));
        if (text.endsWith('\n')) text = text.slice(0, -1);
        if (text.length > PROOF_BYTES || Buffer.byteLength(text, 'utf8') > PROOF_BYTES
            || /[\r\n\0]/.test(text)) fail();
        resolveInput(text);
      } catch (error) { rejectInput(error); }
      finally { raw.fill(0); }
    }
    function onData(chunk) {
      if (settled) return;
      try {
        if (!Buffer.isBuffer(chunk) || chunk.length > PROOF_BYTES + 1 - used) {
          finish(false); return;
        }
        chunk.copy(raw, used); used += chunk.length;
      } catch { finish(false); }
    }
    function onEnd() { finish(true); }
    function onError() { finish(false); }
    function onClose() {
      if (!settled) finish(false);
      input.removeListener('error', onError);
    }
    try {
      input.on('error', onError); input.once('close', onClose);
      input.on('data', onData); input.once('end', onEnd);
      // One TOTAL budget, never reset by partial bytes or renewed input.
      timer = SET_INPUT_TIMEOUT(() => finish(false), PROOF_INPUT_MS);
      input.resume();
    } catch { finish(false); }
  });
}
if (typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void (async () => {
    let result;
    try {
      const args = captureArgs(process.argv.slice(2)); // Refuse bad flags before waiting on stdin.
      result = await runServiceCreditRecoveryInspectCli(args, await stdinProof());
    }
    catch { result = { exitCode: 1, stdout: '', stderr: FAILURE }; }
    process.exitCode = result.exitCode;
    writeLine(result.exitCode === 0 ? 1 : 2, result.exitCode === 0 ? result.stdout : result.stderr);
  })().catch(() => { process.exitCode = 1; try { writeLine(2, FAILURE); } catch {} });
}
