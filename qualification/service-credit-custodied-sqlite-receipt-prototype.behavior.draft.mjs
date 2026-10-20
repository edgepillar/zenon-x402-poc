// SOURCE_DRAFT / NOT_RUN: one published-candidate owned SQLite V2 case.
// Subject commit: 5e4107cefcf2766883d512e85807837f58aedff9.
// Subject tree: 8a9f3c4086c27643403227d8f6621f675a322312.
// One fresh manager-owned private DB, one synthetic dispatch and one caller-array
// prototype change. The optional backend reopen is omitted from this case.
// Declared local funding metadata is not chain PREPARE, funding or authority.
// This is neither process-restart durability nor main/CI/provider acceptance.
// Authoring this file grants no launch, payment, signing or cleanup authority.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
 constants, chmodSync, closeSync, fstatSync, lstatSync, mkdtempSync,
 openSync, readSync, readdirSync, realpathSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { types as utilTypes } from 'node:util';
import {
 setTimeout as nativeSetTimeout, clearTimeout as nativeClearTimeout,
} from 'node:timers';

const { equal: eq, ok, deepEqual: deep, strictEqual: same, match, notEqual: different } = assert;
const ENV = 'X402_SQLITE_RECEIPT_PROTOTYPE_';
const SELF = fileURLToPath(import.meta.url);
if (process.env[ENV + 'OPT_IN'] !== 'reviewed-managed-synthetic-only') {
 throw new Error('SOURCE_DRAFT_NOT_RUN_EXPLICIT_ADMISSION_REQUIRED');
}
eq(process.versions.node, '24.19.0');
deep(process.execArgv, []);
ok(process.env.NODE_OPTIONS === undefined || process.env.NODE_OPTIONS === '');
eq(process.argv.length, 2);
eq(process.argv[1], SELF);

function privateDirectory(path) {
 if (typeof path !== 'string' || path.length === 0 || path.length > 3800
   || path.includes('\0') || !isAbsolute(path) || resolve(path) !== path
   || typeof process.getuid !== 'function') {
  throw new Error('PRIVATE_REGISTERED_DIRECTORY_REQUIRED');
 }
 const stat = lstatSync(path, { bigint: true });
 ok(stat.isDirectory());
 eq(stat.isSymbolicLink(), false);
 eq(stat.uid, BigInt(process.getuid()));
 eq(stat.mode & 0o777n, 0o700n);
 eq(stat.mode & 0o7000n, 0n);
 eq(realpathSync(path), path);
 return stat;
}

const SOURCE_PIN_FIELDS = Object.freeze([
 'dev', 'ino', 'uid', 'gid', 'mode', 'nlink', 'size', 'mtime_ns', 'ctime_ns',
]);
const SOURCE_CAP = 65_536;
function sourceStamp(stat) {
 return {
  dev: String(stat.dev), ino: String(stat.ino), uid: String(stat.uid), gid: String(stat.gid),
  mode: '0o' + (stat.mode & 0o7777n).toString(8), nlink: String(stat.nlink),
  size: String(stat.size), mtime_ns: String(stat.mtimeNs), ctime_ns: String(stat.ctimeNs),
 };
}
function exactCallerPin(value, mode, bytes = null) {
 ok(value !== null && typeof value === 'object' && !Array.isArray(value));
 deep(Object.keys(value).sort(), [...SOURCE_PIN_FIELDS].sort());
 for (const field of SOURCE_PIN_FIELDS) {
  eq(typeof value[field], 'string');
  match(value[field], field === 'mode' ? /^0o[0-7]+$/ : /^\d+$/);
 }
 eq(value.uid, String(process.getuid()));
 eq(value.mode, mode);
 if (bytes !== null) eq(value.size, String(bytes));
 return value;
}
function readBoundSource(path, spec, expectedPin) {
 ok(isAbsolute(path) && resolve(path) === path);
 const before = lstatSync(path, { bigint: true });
 ok(before.isFile() && !before.isSymbolicLink());
 eq(before.uid, BigInt(process.getuid()));
 eq(before.nlink, 1n);
 eq(before.mode & 0o7777n, 0o644n);
 eq(realpathSync(path), path);
 ok(Number.isSafeInteger(spec.bytes) && spec.bytes > 0 && spec.bytes <= SOURCE_CAP);
 eq(before.size, BigInt(spec.bytes));
 match(spec.sha256, /^[0-9a-f]{64}$/);
 deep(sourceStamp(before), exactCallerPin(expectedPin, '0o644', spec.bytes));
 eq(expectedPin.nlink, '1');
 const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
 const pieces = [];
 const buffer = Buffer.alloc(Math.min(SOURCE_CAP, spec.bytes));
 const digest = createHash('sha256');
 const git = spec.gitBlob === undefined ? null : createHash('sha1');
 if (git !== null) git.update('blob ' + spec.bytes + '\0');
 let count = 0, lines = 0, ascii = true, last = null;
 let readError = null, closeError = null;
 try {
  deep(sourceStamp(fstatSync(fd, { bigint: true })), expectedPin);
  while (count < spec.bytes) {
   const n = readSync(fd, buffer, 0, Math.min(buffer.length, spec.bytes - count), null);
   ok(n > 0, 'complete exact source read required');
   const piece = Buffer.from(buffer.subarray(0, n));
   pieces.push(piece); digest.update(piece); count += n;
   if (git !== null) git.update(piece);
   for (const byte of piece) {
    if (byte === 10) lines++;
    if (byte > 127) ascii = false;
   }
   last = piece[piece.length - 1];
  }
  eq(readSync(fd, buffer, 0, 1, null), 0);
  deep(sourceStamp(fstatSync(fd, { bigint: true })), expectedPin);
 } catch (error) {
  readError = error;
 } finally {
  try { closeSync(fd); } catch (error) { closeError = error; }
 }
 if (readError !== null || closeError !== null) {
  throw new AggregateError([readError, closeError].filter(value => value !== null),
   'SOURCE_FD_READ_OR_CLOSE_FAILED');
 }
 deep(sourceStamp(lstatSync(path, { bigint: true })), expectedPin);
 eq(realpathSync(path), path);
 eq(count, spec.bytes);
 eq(digest.digest('hex'), spec.sha256);
 if (git !== null) eq(git.digest('hex'), spec.gitBlob);
 eq(ascii, true);
 eq(last, 10);
 if (spec.LF !== undefined) eq(lines, spec.LF);
 return Object.freeze({ text: Buffer.concat(pieces, count).toString('ascii'), LF: lines });
}

function callerJson(suffix, cap) {
 const text = process.env[ENV + suffix];
 eq(typeof text, 'string');
 ok(text.length > 0 && Buffer.byteLength(text, 'utf8') <= cap);
 return JSON.parse(text);
}

// The reviewed caller must verify manager registration, mount identity, quota,
// free-space floor and the launch/environment before supplying these pins.
// These checks bind caller DATA; they do not authenticate a manager or a caller.
const scratch = process.env.SPV_TASK_SCRATCH;
const scratchIdentity = privateDirectory(scratch);
deep(sourceStamp(scratchIdentity),
 exactCallerPin(callerJson('SCRATCH_PIN', 1024), '0o700'));
const fixtureRoot = process.env.SPV_SQLITE_FIXTURE_ROOT;
eq(fixtureRoot, join(scratch, 'sqlite-receipt-fixture'));
const fixtureIdentity = privateDirectory(fixtureRoot);
deep(sourceStamp(fixtureIdentity),
 exactCallerPin(callerJson('FIXTURE_ROOT_PIN', 1024), '0o700'));
eq(fixtureIdentity.dev, scratchIdentity.dev);
deep(readdirSync(fixtureRoot), []);
const selfPin = exactCallerPin(callerJson('FIXTURE_PIN', 1024), '0o644');
const selfBytes = Number(selfPin.size);
ok(Number.isSafeInteger(selfBytes) && selfBytes > 0 && selfBytes <= 32768);
readBoundSource(SELF, {
 bytes: selfBytes, sha256: process.env[ENV + 'FIXTURE_SHA256'],
}, selfPin);

const specs = [
 ["runner","src/service-credit-custodied-sqlite-sequential-runner.js",21467,510,"9378a09dfd23c6ad5e093971d16c5aad62c19b5f3cce353bb199f037df64d7e0","105b22e1463ab8302b141510e2bb991b746169ad"],
 ["owned","src/service-credit-custodied-sqlite-http-client.js",18540,511,"ea16d6ac5ce72d6434c06e98c52c324daf918dd570f15997cdc21e501f677f4e","9572dfcca76b83b53bdd5bd132ffaf110720dc3a"],
 ["core","src/service-credit-custodied-sequential-runner-core.js",15384,482,"cb2e3fd23a4fdc318902ae95f6f03b3073507ff5ced279626e15151fca171ab2","83122ec62d7701dc1b210438b8be0a9792781433"],
 ["client","src/service-credit-custodied-http-client.js",10755,292,"ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15","90fd4c8a2cc8fb552f8eb0cb45607bfa44c61108"],
 ["owner","src/service-credit-custodied-request-owner.js",35073,938,"6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7","2dee22fd780db9de662fe1243075e74cef0bf296"],
 ["dispatch","src/service-credit-http-execute-dispatch.js",27034,770,"254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b","280dd20dc669e2856d263eba62ccd0fe9af72f21"],
 ["contract","src/service-credit-original-request-custody-contract.js",14051,356,"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915","f911d42d01b69e6577f9bcd66f4ed59aab8ab882"],
 ["store","src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js",57459,1536,"9c925f241effbfec0bf014ff284e834c4d5679c4ea7224f83a6354cde6cffdaf","260c2f43306b029ca694aa06b8c60d1be037c614"],
 ["wire","src/x402-wire.js",39886,934,"5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56","fb060d4e349b1c31a1219a0cc137af250a8a2291"],
 ["plan","src/service-credit-pilot-client-plan.js",7483,181,"73ee3d739de85150039e733234cd0761c228d68de040d1e126902e808a259ac6","14334c82b5b7c80fb8f7f6a392a1a0f3c3adcbf1"],
 ["view","src/service-credit-pilot-status-view.js",3202,60,"cf3822d8b9ec4eb4772452ed1888b96d398fd87c1ead44cd155a5acc1a6b66ed","0890db504e44b704d0434dc309e711743570e652"],
 ["collection","src/service-credit-custodied-recovery-collection-core.js",13794,306,"51d06da70ecccd0cf8b38d650367d1ae903ea86010a5ebeadb682af98e4b890b","5275832eebbf87e0cd37f3c2e3b82147ab625a72"],
 ["observation","src/service-credit-custodied-recovery-observation-collection-core.js",8579,213,"36b7cece2d436cbfcac5f4299dd6bd30e5eede6ebb2ebe769ae7bf3a6f1a72b4","4dc8765be0aa4b0e927fface960e366a3a6ccd1e"],
 ["package","package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5","ec7193f6fd76f34778515079dc777594175c4c34"]
].map(([name, path, bytes, LF, sha256, gitBlob]) =>
 Object.freeze({ name, path, bytes, LF, sha256, gitBlob }));
Object.freeze(specs);
eq(specs.length, 14);
eq(specs.reduce((sum, spec) => sum + spec.bytes, 0), 274120);
const graphPins = callerJson('GRAPH_PINS', 16384);
ok(Array.isArray(graphPins) && graphPins.length === specs.length);
const guarded = Object.create(null);
for (let index = 0; index < specs.length; index++) {
 const spec = specs[index], supplied = graphPins[index];
 ok(supplied !== null && typeof supplied === 'object' && !Array.isArray(supplied));
 deep(Object.keys(supplied).sort(), ['path', 'pin']);
 eq(supplied.path, spec.path);
 const url = new URL('../' + spec.path, import.meta.url);
 const checked = readBoundSource(fileURLToPath(url), spec, supplied.pin);
 guarded[spec.name] = Object.freeze({
  url: url.href, text: spec.name === 'package' ? checked.text : null,
 });
}
const packageData = JSON.parse(guarded.package.text);
eq(packageData.type, 'module');
eq(packageData.engines.node, '>=24');

const runnerModule = await import(guarded.runner.url);
const storeModule = await import(guarded.store.url);
const wire = await import(guarded.wire.url);
const OPEN = runnerModule.openServiceCreditCustodiedSqliteSequentialRunner;
const {
 createZenonFundingPayerRecoveryCustodySqliteStoreV2: CREATE_V2,
 ZenonFundingPayerRecoverySqliteStore: StoreClass,
} = storeModule;
const APPLY = Reflect.apply;
const THEN = Promise.prototype.then;
const IS_PROMISE = utilTypes.isPromise;
const STORE_CLOSE = Object.getOwnPropertyDescriptor(StoreClass.prototype, 'close').value;

const FUNDING = 'https://receipt.invalid/funding';
const SERVICE = 'https://receipt.invalid/service-credit/v1/execute';
const GRANT = 'grant.selected';
const PAYMENT_HASH = 'a'.repeat(64);
const NETWORK = 'zenon:testnet';
const EMPTY_DIGEST =
 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const REPLY = Buffer.from('{"ok":true,"resultCode":"accepted"}', 'utf8');
const MAX_ROOTS = 1;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const fixtures = [], acquisitions = [], rootEntries = [], nativeEntries = [];
const pendingAcquisitions = new Set(), activeRoots = new Set();
const activeProducers = new Set(), holdFailures = [], sinks = [], watchdogs = new Set();

function observe(promise) {
 const outcome = APPLY(THEN, promise, [
  value => ({ ok: true, value }),
  error => ({ ok: false, error }),
 ]);
 sinks.push(outcome);
 eq(IS_PROMISE(promise), true);
 eq(Object.getPrototypeOf(promise), Promise.prototype);
 return outcome;
}

function activeCount() {
 return pendingAcquisitions.size + activeRoots.size + activeProducers.size;
}
function roomForOne() {
 eq(activeCount(), 0, 'only one native DB handle/reservation at a time');
}
function knownClosed() {
 eq(activeCount(), 0, 'backend access requires all owners known closed');
 eq(holdFailures.length, 0, 'unknown acquisition/close remains HOLD');
}

function throwProblems(problems, code) {
 if (problems.length === 1) throw problems[0];
 if (problems.length > 1) throw new AggregateError(problems, code);
}

function policy(maxRequests = 1) {
 return {
  policyVersion: 1,
  maxRequests,
  serviceResourceUrl: SERVICE,
 };
}

function original(requestId = 'request.one', cost = 7, grantId = GRANT) {
 return {
  grantId,
  requestId,
  originalRequestJson: JSON.stringify({
   modelVersion: 1,
   grantId,
   requestId,
   method: 'POST',
   routeId: 'service-credit.execute.v1',
   canonicalBodyDigest: EMPTY_DIGEST,
   selectedContentType: 'application/json',
   maxCostUnits: cost,
  }),
  originalBodyBase64: '',
  serviceResourceUrl: SERVICE,
 };
}

function authFor(value) {
 const request = JSON.parse(value.originalRequestJson);
 const declared = {
  grantId: value.grantId,
  maxCostUnits: request.maxCostUnits,
  proofVersion: 1,
  publicKey: 'declared-public-key',
  requestId: value.requestId,
  signature: 'declared-signature-' + value.requestId,
 };
 return 'ServiceCredit '
  + Buffer.from(JSON.stringify(declared), 'utf8').toString('base64url');
}

function submission(requestId = 'request.one', cost = 7, grantId = GRANT) {
 const value = original(requestId, cost, grantId);
 return { ...value, authorizationHeader: authFor(value) };
}

function declaredPair() {
 const requirement = {
  scheme: 'exact',
  network: NETWORK,
  asset: 'declared-test-asset',
  amount: '1',
  payTo: 'declared-test-payee',
  maxTimeoutSeconds: 30,
  extra: {
   poc: true,
   settlement: 'account-block',
   paymentFlow: 'upfront',
   zenonChain: {
    version: 1,
    chainIdentifier: '42',
    genesisMomentumHash: '1'.repeat(64),
   },
  },
 };
 const paymentRequired = {
  x402Version: 2,
  resource: { url: FUNDING },
  accepts: [requirement],
 };
 const paymentPayload = {
  x402Version: 2,
  resource: { url: FUNDING },
  accepted: requirement,
  payload: {
   transaction: { hash: PAYMENT_HASH },
   intentDigest: '2'.repeat(64),
  },
 };
 return {
  challenge: {
   status: 'PAYMENT_REQUIRED',
   resourceUrl: FUNDING,
   paymentRequiredHeader: wire.encodeB64Json(paymentRequired, {
    maxEncodedBytes: 8192,
   }),
   paymentRequired,
  },
  paymentSignatureHeader: wire.encodeB64Json(paymentPayload, {
   maxEncodedBytes: 8192,
  }),
 };
}

class OwnedEmitter {
 #listeners = new Map();
 #closed = false;

 constructor() {
  this.fixtureClosed = false;
 }

 on(event, listener) {
  const listeners = this.#listeners.get(event) ?? [];
  listeners.push(listener);
  this.#listeners.set(event, listeners);
  return this;
 }

 emit(event, ...args) {
  for (const listener of (this.#listeners.get(event) ?? []).slice()) {
   listener(...args);
  }
 }

 forceClose() {
  if (this.#closed) return;
  this.#closed = true;
  this.fixtureClosed = true;
  APPLY(EMIT, this, ['close']);
 }
}
const EMIT = OwnedEmitter.prototype.emit;
const FORCE_CLOSE = OwnedEmitter.prototype.forceClose;

class OwnedHandle extends OwnedEmitter {
 #resolveDestroy;

 constructor() {
  super();
  this.destroyCalls = 0;
  this.destroyObserved = new Promise(resolve => {
   this.#resolveDestroy = resolve;
  });
 }

 destroy(...args) {
  eq(args.length, 0);
  this.destroyCalls++;
  this.#resolveDestroy(undefined);
  return this;
 }
}

class FakeRequest extends OwnedHandle {
 constructor() {
  super();
  this.endCalls = 0;
  this.writeCalls = 0;
 }

 end(...args) {
  eq(args.length, 0, 'bodyless end has zero arguments');
  this.endCalls++;
  return this;
 }

 write() {
  this.writeCalls++;
  throw new Error('BODY_WRITE_FORBIDDEN');
 }
}

class FakeResponse extends OwnedHandle {
 constructor() {
  super();
  this.statusCode = 200;
  this.complete = false;
  this.rawHeaders = [
   'Cache-Control', 'private, no-store, max-age=0',
   'Content-Type', 'application/json',
   'Vary', 'Authorization',
   'X-Content-Type-Options', 'nosniff',
   'Content-Length', String(REPLY.length),
  ];
 }
}

function fixture() {
 eq(fixtures.length, 0);
 eq(holdFailures.length, 0);
 const taskNow = privateDirectory(scratch), parentNow = privateDirectory(fixtureRoot);
 eq(taskNow.dev, scratchIdentity.dev);
 eq(taskNow.ino, scratchIdentity.ino);
 eq(parentNow.dev, fixtureIdentity.dev);
 eq(parentNow.ino, fixtureIdentity.ino);
 const root = mkdtempSync(join(fixtureRoot, 'receipt-'));
 const f = {
  root, databasePath: join(root, 'custody.sqlite'), custodyPolicy: policy(1),
  rootIdentity: null, identity: null, seed: null, handles: [], exchanges: [],
  calls: [], requestImpl: null, incoming: null, resolveIncoming: null,
  rejectIncoming: null,
 };
 fixtures.push(f);
 chmodSync(root, 0o700);
 const stat = privateDirectory(root);
 eq(stat.dev, fixtureIdentity.dev);
 f.rootIdentity = { dev: stat.dev, ino: stat.ino };
 const incoming = new Promise((resolvePromise, rejectPromise) => {
  f.resolveIncoming = resolvePromise;
  f.rejectIncoming = rejectPromise;
 });
 f.incoming = observe(incoming);
 f.requestImpl = function requestImpl(resourceUrl, options, onResponse) {
  eq(this, undefined);
  eq(arguments.length, 3);
  f.calls.push({ resourceUrl, options });
  eq(f.calls.length, 1, 'one owned synthetic exchange only');
  const request = new FakeRequest(), response = new FakeResponse();
  const exchange = { resourceUrl, options, onResponse, request, response };
  f.handles.push(request, response);
  f.exchanges.push(exchange);
  const ready = f.resolveIncoming;
  f.resolveIncoming = null;
  f.rejectIncoming = null;
  ready(exchange);
  return request;
 };
 return f;
}

function storeOptions(f) {
 return {
  databasePath: f.databasePath, allowedRoot: f.root,
  resourceUrl: FUNDING, custodyPolicy: f.custodyPolicy,
 };
}
function ownedOptions(f) {
 return {
  databasePath: f.databasePath, allowedRoot: f.root,
  fundingResourceUrl: FUNDING, custodyPolicy: f.custodyPolicy,
  selectedGrantId: GRANT, requestImpl: f.requestImpl, deadlineMs: 2000,
 };
}

function checkFile(path) {
 const stat = lstatSync(path, { bigint: true });
 ok(stat.isFile());
 eq(stat.isSymbolicLink(), false);
 eq(stat.uid, BigInt(process.getuid()));
 eq(stat.dev, fixtureIdentity.dev);
 eq(stat.nlink, 1n);
 eq(stat.mode & 0o777n, 0o600n);
 eq(stat.mode & 0o7000n, 0n);
 ok(stat.size <= BigInt(MAX_FILE_BYTES), 'file post-check only');
 eq(realpathSync(path), path);
 return stat;
}

function checkFiles(f) {
 const root = privateDirectory(f.root);
 eq(root.dev, f.rootIdentity.dev);
 eq(root.ino, f.rootIdentity.ino);
 const names = readdirSync(f.root);
 ok(names.length <= 2);
 for (const name of names) {
  ok(name === 'custody.sqlite' || name === 'custody.sqlite-journal');
  const stat = checkFile(join(f.root, name));
  if (name === 'custody.sqlite') {
   if (f.identity === null) f.identity = { dev: stat.dev, ino: stat.ino };
   else {
    eq(stat.dev, f.identity.dev);
    eq(stat.ino, f.identity.ino);
   }
  }
 }
}

function reserveNative(active) {
 knownClosed();
 roomForOne();
 const entry = {
  handle: null,
  closeAttempted: false,
  closeReturned: false,
  failure: null,
 };
 active.add(entry);
 nativeEntries.push(entry);
 return entry;
}

function closeNativeEntry(entry, active, method) {
 if (entry.closeAttempted) {
  if (entry.closeReturned) return;
  throw entry.failure ?? new Error('NATIVE_CLOSE_OUTCOME_HELD');
 }
 if (entry.handle === null) {
  throw entry.failure ?? new Error('NATIVE_ACQUISITION_OUTCOME_HELD');
 }
 entry.closeAttempted = true;
 try {
  const returned = APPLY(method, entry.handle, []);
  eq(returned, undefined);
  entry.closeReturned = true;
  active.delete(entry);
 } catch (error) {
  entry.failure = error;
  throw error;
 }
}

function withStore(f, factory, body) {
 const entry = reserveNative(activeProducers);
 try {
  entry.handle = factory(storeOptions(f));
 } catch (error) {
  entry.failure = error;
  holdFailures.push(error);
  throw error;
 }
 const problems = [];
 let value;
 try {
  value = body(entry.handle);
 } catch (error) {
  problems.push(error);
 } finally {
  try { closeNativeEntry(entry, activeProducers, STORE_CLOSE); }
  catch (error) { problems.push(error); }
  try { checkFiles(f); } catch (error) { problems.push(error); }
 }
 throwProblems(problems, 'STORE_OPERATION_OR_CLOSE_FAILED');
 return value;
}


function seed(f) {
 const pair = declaredPair();
 f.seed = withStore(f, CREATE_V2, store => {
  // Declared LOCAL SQLite transitions only, never a chain PREPARE.
  store.prepare(pair);
  store.fenceAttempt('PREPARED');
  store.finishAttempt('BOUND');
  return { pair, funding: store.load() };
 });
 different(f.identity, null);
 eq(f.seed.funding.status, 'BOUND');
 eq(f.seed.funding.paymentHeader, pair.paymentSignatureHeader);
 eq(f.seed.funding.challengeHeader, pair.challenge.paymentRequiredHeader);
 eq(f.seed.funding.paymentPayload.payload.transaction.hash, PAYMENT_HASH);
 eq(f.seed.funding.requirement.network, NETWORK);
 deep(Object.keys(f.seed.funding.paymentPayload.payload.transaction), ['hash']);
}

function beginAcquire(f) {
 knownClosed();
 roomForOne();
 eq(acquisitions.length, 0);
 const entry = {
  f, state: 'PENDING', promise: null, outcomePromise: null, runner: null,
  error: null, closeAttempted: false, closePromise: null,
  closeOutcomePromise: null, closeError: null, result: null,
 };
 acquisitions.push(entry);
 pendingAcquisitions.add(entry); // reserve before synchronous work in async OPEN
 try {
  entry.promise = OPEN(ownedOptions(f));
  entry.outcomePromise = APPLY(THEN, observe(entry.promise), [
   result => {
    if (result.ok) {
     entry.runner = result.value;
     entry.state = 'OPEN';
     rootEntries.push(entry);
     activeRoots.add(entry);
     pendingAcquisitions.delete(entry);
    } else {
     entry.state = 'UNKNOWN';
     entry.error = result.error;
     holdFailures.push(result.error);
    }
    return result;
   },
  ]);
  observe(entry.outcomePromise);
 } catch (error) {
  entry.state = 'UNKNOWN';
  entry.error = error;
  holdFailures.push(error);
  throw error;
 }
 return entry;
}

async function openRoot(f) {
 const entry = beginAcquire(f);
 const result = await boundedWait(entry.outcomePromise);
 if (!result.ok) throw result.error;
 eq(entry.state, 'OPEN');
 ok(Object.isFrozen(entry.runner));
 return entry;
}

function beginRootClose(entry) {
 if (entry.closeAttempted) {
  if (entry.closePromise !== null) return entry.closePromise;
  throw entry.closeError ?? new Error('OWNED_CLOSE_INVOCATION_HELD');
 }
 entry.closeAttempted = true;
 try {
  entry.closePromise = entry.runner.close();
  entry.closeOutcomePromise = observe(entry.closePromise);
  return entry.closePromise;
 } catch (error) {
  entry.closeError = error;
  holdFailures.push(error);
  throw error;
 }
}

async function finishRootClose(entry) {
 beginRootClose(entry);
 const result = await boundedWait(entry.closeOutcomePromise);
 entry.result = result;
 const view = entry.runner.snapshot();
 if (view.resource.storeCloseOutcome !== 'RETURNED'
   || view.resource.storeCloseAttempts !== 1 || view.resource.phase !== 'RELEASED'
   || view.resource.slotHeld !== false || view.resource.admissionClosed !== true) {
  entry.state = 'HELD';
  const error = new Error('OWNED_DB_CLOSE_OUTCOME_HELD');
  holdFailures.push(error);
  throw error;
 }
 entry.state = 'DB_CLOSE_OBSERVED';
 activeRoots.delete(entry); // only known DB ownership is removed
 if (!result.ok) { holdFailures.push(result.error); throw result.error; }
 eq(result.value, undefined);
 same(entry.runner.close(), entry.closePromise);
 eq(view.runner.closeCalls, 1);
 return view;
}

function emit(handle, event, ...args) {
 APPLY(EMIT, handle, [event, ...args]);
}

function force(handle) {
 APPLY(FORCE_CLOSE, handle, []);
}

function respond(exchange) {
 exchange.onResponse(exchange.response);
}

function goodEnd(exchange) {
 exchange.response.complete = true;
 emit(exchange.response, 'data', Buffer.from(REPLY));
 emit(exchange.response, 'end');
}

function complete(exchange) {
 respond(exchange);
 goodEnd(exchange);
 force(exchange.request);
 force(exchange.response);
}

function boundedWait(promise) {
 const waited = new Promise((resolvePromise, rejectPromise) => {
  let done = false;
  let timer;
  function finish(ok, value) {
   if (done) return;
   done = true;
   nativeClearTimeout(timer);
   watchdogs.delete(cancel);
   if (ok) resolvePromise(value);
   else rejectPromise(value);
  }
  const cancel = () => finish(false, new Error('DRAFT_WAIT_CANCELLED'));
  timer = nativeSetTimeout(() => {
   finish(false, new Error('DRAFT_WAIT_TIMEOUT_OUTCOME_NOT_CANCELLED'));
  }, 1000);
  watchdogs.add(cancel);
  APPLY(THEN, promise, [
   value => finish(true, value),
   error => finish(false, error),
  ]);
 });
 observe(waited);
 return waited;
}

function assertDefaultV2Facade(runner) {
 deep(Object.keys(runner), [
  'runOriginals',
  'readOriginal',
  'readOriginalRecoveryState',
  'createOriginalRecoveryPlan',
  'createOriginalRecoveryStatePlan',
  'close',
  'snapshot',
 ]);
}


function counters(view) {
 const sequence = view.runner, owner = sequence.client.owner;
 const transport = sequence.client.lastTransport;
 return [
  sequence.attempted, sequence.completed, sequence.notAttempted,
  sequence.queuedReferences, sequence.closeCalls, owner.counts.retainCalls,
  owner.counts.readbackConfirmations,
  owner.counts.dispatchCalls, owner.counts.callbackCompletions,
  transport.counts.requestCalls, transport.counts.settlements,
 ];
}

function assertDetached(view, f) {
 eq(view.resource.ownership, 'OWNED_EXISTING_V2');
 eq(view.runner.storeOwnership, 'OWNED_EXISTING_V2');
 eq(view.resource.storeAcquired, true);
 eq(view.resource.storeCloseAttempts, 1);
 eq(view.resource.storeCloseOutcome, 'RETURNED');
 eq(view.resource.phase, 'RELEASED');
 eq(view.resource.slotHeld, false);
 eq(view.resource.admissionClosed, true);
 eq(view.close.outcome, 'DRAINED');
 eq(view.close.childUncertainty, false);
 eq(view.close.unknownUndrained, false);
 eq(view.unknown, false);
 eq(view.unknownUndrained, false);
 eq(view.runner.runSettled, true);
 eq(view.runner.active, false);
 eq(view.runner.client.lastTransport.timerArmed, false);
 eq(view.runner.client.lastTransport.requestClosed, true);
 eq(view.runner.client.lastTransport.responseClosed, true);
 eq(view.runner.client.lastTransport.replyValidated, true);
 eq(view.qualification, 'UNQUALIFIED');
}

async function cleanup() {
 const problems = [];
 const collect = fn => { try { fn(); } catch (error) { problems.push(error); } };
 const wait = async fn => { try { await fn(); } catch (error) { problems.push(error); } };
 await wait(() => boundedWait(Promise.all(
  acquisitions.map(entry => entry.outcomePromise).filter(value => value),
 )));
 for (const entry of [...activeRoots]) collect(() => beginRootClose(entry));
 for (const f of fixtures) {
  for (const handle of f.handles) collect(() => force(handle));
  if (f.rejectIncoming !== null) {
   f.rejectIncoming(new Error('OWNED_EXCHANGE_WAIT_INTERRUPTED'));
   f.rejectIncoming = null; f.resolveIncoming = null;
  }
 }
 for (const cancel of [...watchdogs]) collect(cancel);
 await wait(async () => {
  const results = await boundedWait(Promise.allSettled(
   [...activeRoots].map(entry => finishRootClose(entry)),
  ));
  for (const result of results) if (result.status === 'rejected') problems.push(result.reason);
 });
 for (const entry of [...activeProducers]) {
  if (entry.closeAttempted || entry.handle === null) {
   problems.push(entry.failure ?? new Error('NATIVE_HANDLE_REMAINS_HOLD'));
  } else collect(() => closeNativeEntry(entry, activeProducers, STORE_CLOSE));
 }
 await wait(() => boundedWait(Promise.all(sinks.slice())));
 for (const cancel of [...watchdogs]) collect(cancel);
 for (const f of fixtures) collect(() => {
  checkFiles(f);
  for (const handle of f.handles) eq(handle.fixtureClosed, true);
 });
 for (const entry of rootEntries) collect(() => {
  const transport = entry.runner.snapshot().runner.client.lastTransport;
  if (transport !== null) eq(transport.timerArmed, false);
 });
 problems.push(...holdFailures);
 collect(() => {
  const taskNow = privateDirectory(scratch), parentNow = privateDirectory(fixtureRoot);
  eq(taskNow.dev, scratchIdentity.dev); eq(taskNow.ino, scratchIdentity.ino);
  eq(parentNow.dev, fixtureIdentity.dev); eq(parentNow.ino, fixtureIdentity.ino);
  deep(readdirSync(fixtureRoot).sort(),
   fixtures.map(f => f.root.slice(fixtureRoot.length + 1)).sort());
  eq(pendingAcquisitions.size, 0, 'pending/unknown OPEN remains HOLD');
  eq(activeRoots.size, 0, 'unknown owned DB remains HOLD');
  eq(activeProducers.size, 0, 'unknown backend remains HOLD');
  for (const entry of nativeEntries) {
   eq(entry.closeAttempted, true); eq(entry.closeReturned, true);
  }
  eq(watchdogs.size, 0); ok(sinks.length <= 64);
  ok(fixtures.length <= MAX_ROOTS);
 });
 throwProblems(problems, 'OWNED_RECEIPT_RESOURCE_OR_CLOSE_OUTCOME_UNKNOWN');
}


test('published owned SQLite runner preserves accepted receipt after array prototype mutation',
 { timeout: 10000 }, async t => {
  t.after(cleanup);
  const f = fixture();
  seed(f);
  const value = submission(), batch = [value];
  const ownBefore = Object.getOwnPropertyDescriptors(batch);
  const entry = await openRoot(f);
  assertDefaultV2Facade(entry.runner);

  const operation = entry.runner.runOriginals(batch);
  const outcome = observe(operation);
  let settled = false;
  sinks.push(APPLY(THEN, operation, [
   () => { settled = true; }, () => { settled = true; },
  ]));
  const incoming = await boundedWait(f.incoming);
  if (!incoming.ok) throw incoming.error;
  const exchange = incoming.value;
  eq(settled, false);
  eq(f.calls.length, 1);
  eq(f.calls[0].resourceUrl, SERVICE);
  eq(f.calls[0].options.method, 'POST');
  eq(f.calls[0].options.headers.Authorization, value.authorizationHeader);
  eq(exchange.request.endCalls, 1);
  eq(exchange.request.writeCalls, 0);
  const pending = entry.runner.snapshot();
  eq(pending.runner.active, true);
  eq(pending.resource.slotHeld, true);
  eq(pending.resource.storeCloseAttempts, 0);
  deep(counters(pending), [1, 0, 0, 0, 0, 1, 1, 1, 0, 1, 0]);

  // The only caller-array mutation: no entry, descriptor or global change.
  Object.setPrototypeOf(batch, null);
  same(Object.getPrototypeOf(batch), null);
  deep(Object.getOwnPropertyDescriptors(batch), ownBefore);
  const pendingReplay = entry.runner.runOriginals(batch);
  observe(pendingReplay);
  same(pendingReplay, operation);
  eq(settled, false);
  deep(counters(entry.runner.snapshot()), counters(pending));

  complete(exchange);
  const result = await boundedWait(outcome);
  if (!result.ok) throw result.error;
  eq(result.value, undefined);
  eq(settled, true);
  const firstClose = beginRootClose(entry);
  const repeatedClose = entry.runner.close();
  observe(repeatedClose);
  same(repeatedClose, firstClose);
  const closed = await finishRootClose(entry);
  assertDetached(closed, f);
  const terminalReplay = entry.runner.runOriginals(batch);
  observe(terminalReplay);
  same(terminalReplay, operation);
  eq(await boundedWait(terminalReplay), undefined);
  deep(counters(entry.runner.snapshot()), [1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1]);
  eq(f.calls.length, 1);
  eq(f.exchanges.length, 1);
  eq(f.handles.length, 2);
  eq(exchange.request.destroyCalls, 0);
  eq(exchange.response.destroyCalls, 0);
  eq(exchange.request.fixtureClosed, true);
  eq(exchange.response.fixtureClosed, true);
  knownClosed();

  eq(acquisitions.length, 1);
  eq(nativeEntries.length, 1); // the seed; root acquisition is tracked separately
  eq(activeCount(), 0);
 });
