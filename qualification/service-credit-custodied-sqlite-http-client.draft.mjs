/*
 * SOURCE DRAFT / NOT_RUN.
 *
 * Execution requires separate human SQL approval and a fresh full dependency,
 * storage, resource and launch review. This file is outside test discovery.
 * It is not a manager, launcher, operational helper or production example.
 *
 * Require one numeric scenario and a new externally registered private
 * SPV_TASK_SCRATCH. These checks do not authenticate its manager lease, mount,
 * reservation, free space or policy. No home/temp/cwd/cache fallback exists.
 *
 * Future reservation proposal: 128 MiB plus bounded stdout/stderr capture,
 * preserving the production free-space floor and all manager limits. Sampling
 * and post-checks are not OS quotas. Roles, evidence, limits and retention must
 * be approved and registered externally before allocation/launch.
 *
 * At most 4 new roots/process, 1 DB/root, 4 original rows/DB, 2 MiB/file
 * post-check and 2 tracked native DB handles at once. The normal scenarios
 * intentionally use one native handle at a time. Retain every generated file.
 * No unlink, recursive cleanup, archive, link, native fault injection or hook.
 * Unknown files, acquisition outcomes and failed closes remain HOLD.
 *
 * Store.prepare/fenceAttempt/finishAttempt seed NEW LOCAL declared metadata
 * only. They are not chain PREPARE, signatures, inclusion, settlement or
 * authority. Service proof fields are also declared strings, not signatures.
 *
 * Same-process reopen is not process restart, power-loss or fsync proof.
 * Native close-failure and unexpected composition/Promise-observation branches
 * remain coverage gates; no public seam or monkeypatch is used to force them.
 *
 * Actual store exclusive locking means this draft does not assume a concurrent
 * readonly pre-dispatch probe is available. It observes actual owner fence
 * counters at the fake transport boundary and inspects rows after DB close.
 *
 * Timeouts/watchdogs diagnose bounded scenarios, not hard cancellation or OS
 * resource lifetimes. Future raw native output must remain private evidence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  setTimeout as nativeSetTimeout,
  clearTimeout as nativeClearTimeout,
} from 'node:timers';

if (process.argv.length !== 3 || !/^[1-8]$/.test(process.argv[2])) {
  throw new Error('EXACT_NUMERIC_SCENARIO_REQUIRED');
}
assert.equal(process.versions.node, '24.19.0');
const selector = process.argv[2];

function privateDirectory(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 3800
      || path.includes('\0') || !isAbsolute(path) || resolve(path) !== path
      || typeof process.getuid !== 'function') {
    throw new Error('PRIVATE_REGISTERED_SCRATCH_REQUIRED');
  }
  const stat = lstatSync(path, { bigint: true });
  assert.ok(stat.isDirectory());
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal(stat.uid, BigInt(process.getuid()));
  assert.equal(stat.mode & 0o777n, 0o700n);
  assert.equal(stat.mode & 0o7000n, 0n);
  assert.equal(realpathSync(path), path);
  return stat;
}

// Validate supplied physical scratch before any SQLite/repository import.
// A same-user directory check is not proof of an approved external lease.
const scratch = process.env.SPV_TASK_SCRATCH;
const scratchIdentity = privateDirectory(scratch);
assert.deepEqual(readdirSync(scratch), [],
  'a new empty externally registered scratch is required');

const specs = [
  [
    'owned',
    '../src/service-credit-custodied-sqlite-http-client.js',
    17045,
    '1bf7e3d738b4f3f9e880e1ff5f99ee7eaf3df02c2e98f5993dd075eb0bbf4c7b',
  ],
  [
    'store',
    '../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js',
    47979,
    '18382896ec5745d8ab4358cbe26ea1a166eccda2d7c4e86840d4df926704da9d',
  ],
  [
    'client',
    '../src/service-credit-custodied-http-client.js',
    9815,
    '757c7d472410676b61baf2a3cda73e493a26ca6343d4e4c0a2c3af1a9e6abb9c',
  ],
  [
    'owner',
    '../src/service-credit-custodied-request-owner.js',
    22239,
    'fa8d8dbb34363140a4f087c2200cdcfd850d9be09ffcf939e576c08228e19e96',
  ],
  [
    'dispatch',
    '../src/service-credit-http-execute-dispatch.js',
    25281,
    '044a7bd97a1344c1f95854a71dfb85eeb197c39fef2cd1b3c2b83b766a768008',
  ],
  [
    'contract',
    '../src/service-credit-original-request-custody-contract.js',
    9810,
    '8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083',
  ],
  [
    'wire',
    '../src/x402-wire.js',
    39886,
    '5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56',
  ],
  [
    'package',
    '../package.json',
    1413,
    '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5',
  ],
];
const guarded = Object.create(null);
for (const [name, relative, bytes, sha256] of specs) {
  const url = new URL(relative, import.meta.url);
  const path = fileURLToPath(url);
  const before = lstatSync(path, { bigint: true });
  assert.ok(before.isFile());
  assert.equal(before.isSymbolicLink(), false);
  assert.equal(before.nlink, 1n);
  assert.equal(before.size, BigInt(bytes));
  assert.equal(realpathSync(path), path);
  const raw = readFileSync(path);
  assert.equal(raw.length, bytes);
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha256);
  const text = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(text), false);
  assert.ok(text.endsWith('\n'));
  const after = lstatSync(path, { bigint: true });
  assert.equal(after.dev, before.dev);
  assert.equal(after.ino, before.ino);
  assert.equal(after.size, before.size);
  guarded[name] = Object.freeze({ url: url.href, text });
}
const packageData = JSON.parse(guarded.package.text);
assert.equal(packageData.type, 'module');
assert.equal(packageData.engines.node, '>=24');

// All guarded source checks and private scratch checks precede these imports.
// Importing the graph does not itself execute the scenario assertions.
const ownedModule = await import(guarded.owned.url);
const storeModule = await import(guarded.store.url);
const custody = await import(guarded.contract.url);
const wire = await import(guarded.wire.url);
const { DatabaseSync } = await import('node:sqlite');
const OPEN = ownedModule.openServiceCreditCustodiedSqliteHttpClient;
const {
  createZenonFundingPayerRecoverySqliteStore: CREATE_V1,
  createZenonFundingPayerRecoveryCustodySqliteStoreV2: CREATE_V2,
  openZenonFundingPayerRecoveryCustodySqliteStoreV2: OPEN_V2,
  ZenonFundingPayerRecoverySqliteStore: StoreClass,
  ZenonFundingPayerRecoverySqliteStoreError: StoreError,
} = storeModule;
const {
  captureOriginalServiceRequestCustody: CAPTURE,
  serializeOriginalServiceRequestCustody: SERIALIZE,
  parseOriginalServiceRequestCustody: PARSE,
} = custody;
const APPLY = Reflect.apply;
const STORE_CLOSE = Object.getOwnPropertyDescriptor(
  StoreClass.prototype, 'close',
).value;
const DATABASE_CLOSE = Object.getOwnPropertyDescriptor(
  DatabaseSync.prototype, 'close',
).value;

const RP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const CP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const SP = 'ZENON_FUNDING_PAYER_RECOVERY_STORE_';
const FUNDING = 'https://owned-custody.example.test/funding';
const SERVICE = 'https://owned-custody.example.test/service-credit/v1/execute';
const GRANT = 'grant.selected';
const PAYMENT_HASH = 'a'.repeat(64);
const NETWORK = 'zenon:testnet';
const SECRET = 'declared-private-transport-exception';
const EMPTY_DIGEST =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const REPLY = Buffer.from('{"ok":true,"resultCode":"accepted"}', 'utf8');
const MAX_ROOTS = 4;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const fixtures = [];
const rootEntries = [];
const activeRoots = new Set();
const activeProducers = new Set();
const activeRaw = new Set();
const holdFailures = [];
const sinks = [];
const watchdogs = new Set();

function observe(promise) {
  const outcome = promise.then(
    value => ({ ok: true, value }),
    error => ({ ok: false, error }),
  );
  sinks.push(outcome);
  return outcome;
}

function activeCount() {
  return activeRoots.size + activeProducers.size + activeRaw.size;
}

function roomForOne() {
  assert.ok(activeCount() < 2, 'native DB handle cap is two');
}

function throwProblems(problems, code) {
  if (problems.length === 1) throw problems[0];
  if (problems.length > 1) throw new AggregateError(problems, code);
}

function storeCode(suffix) {
  return error => error instanceof StoreError
    && error.code === SP + suffix
    && error.message === SP + suffix;
}

function policy(maxRequests = 2) {
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

function key(value = original()) {
  return { grantId: value.grantId, requestId: value.requestId };
}

function metadata(value) {
  return {
    grantId: value.grantId,
    requestId: value.requestId,
    originalRequestJson: value.originalRequestJson,
    originalBodyBase64: value.originalBodyBase64,
    serviceResourceUrl: value.serviceResourceUrl,
  };
}

function contractInput(value) {
  return {
    originalRequestJson: value.originalRequestJson,
    originalBodyBase64: value.originalBodyBase64,
    serviceResourceUrl: value.serviceResourceUrl,
  };
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
    assert.equal(args.length, 0);
    this.destroyCalls++;
    this.#resolveDestroy(undefined);
    // Deliberately do not close automatically. Tests must close captured
    // owned handles, so Promise settlement alone cannot fake resource drain.
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
    assert.equal(args.length, 0, 'bodyless end has zero arguments');
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

function fixture(maxRequests = 2) {
  if (fixtures.length >= MAX_ROOTS) throw new Error('FIXTURE_LIMIT_EXCEEDED');
  const currentScratch = privateDirectory(scratch);
  assert.equal(currentScratch.dev, scratchIdentity.dev);
  assert.equal(currentScratch.ino, scratchIdentity.ino);
  const root = mkdtempSync(join(scratch, 'owned-sqlite-' + selector + '-'));
  const f = {
    root,
    databasePath: join(root, 'custody.sqlite'),
    custodyPolicy: policy(maxRequests),
    identity: null,
    v2: false,
    seed: null,
    handles: [],
    exchanges: [],
    calls: [],
    onRequest: null,
    throwOnRequest: false,
    requestImpl: null,
  };
  fixtures.push(f);
  chmodSync(root, 0o700);
  const stat = privateDirectory(root);
  assert.equal(stat.dev, scratchIdentity.dev);
  f.requestImpl = function requestImpl(resourceUrl, options, onResponse) {
    assert.equal(this, undefined);
    assert.equal(arguments.length, 3);
    f.calls.push({ resourceUrl, options });
    if (f.throwOnRequest) throw new Error(SECRET);
    const request = new FakeRequest();
    const response = new FakeResponse();
    const exchange = { resourceUrl, options, onResponse, request, response };
    f.handles.push(request, response);
    f.exchanges.push(exchange);
    if (f.onRequest !== null) f.onRequest(exchange);
    return request;
  };
  return f;
}

function storeOptions(f, v1 = false) {
  const value = {
    databasePath: f.databasePath,
    allowedRoot: f.root,
    resourceUrl: FUNDING,
  };
  if (!v1) value.custodyPolicy = f.custodyPolicy;
  return value;
}

function ownedOptions(f, overrides = {}) {
  return {
    databasePath: f.databasePath,
    allowedRoot: f.root,
    fundingResourceUrl: FUNDING,
    custodyPolicy: f.custodyPolicy,
    selectedGrantId: GRANT,
    requestImpl: f.requestImpl,
    deadlineMs: 2000,
    ...overrides,
  };
}

function checkFile(path) {
  const stat = lstatSync(path, { bigint: true });
  assert.ok(stat.isFile());
  assert.equal(stat.isSymbolicLink(), false);
  assert.equal(stat.uid, BigInt(process.getuid()));
  assert.equal(stat.dev, scratchIdentity.dev);
  assert.equal(stat.nlink, 1n);
  assert.equal(stat.mode & 0o777n, 0o600n);
  assert.equal(stat.mode & 0o7000n, 0n);
  assert.ok(stat.size <= BigInt(MAX_FILE_BYTES), 'file post-check only');
  assert.equal(realpathSync(path), path);
  return stat;
}

function checkFiles(f) {
  const root = privateDirectory(f.root);
  assert.equal(root.dev, scratchIdentity.dev);
  const names = readdirSync(f.root);
  assert.ok(names.length <= 2);
  for (const name of names) {
    assert.ok(name === 'custody.sqlite' || name === 'custody.sqlite-journal');
    const stat = checkFile(join(f.root, name));
    if (name === 'custody.sqlite') {
      if (f.identity === null) f.identity = { dev: stat.dev, ino: stat.ino };
      else {
        assert.equal(stat.dev, f.identity.dev);
        assert.equal(stat.ino, f.identity.ino);
      }
    }
  }
}

function closeNativeEntry(entry, active, method) {
  if (entry.closeAttempted) {
    if (entry.closeReturned) return;
    throw entry.failure ?? new Error('NATIVE_CLOSE_OUTCOME_HELD');
  }
  entry.closeAttempted = true;
  try {
    const returned = APPLY(method, entry.handle, []);
    assert.equal(returned, undefined);
    entry.closeReturned = true;
    active.delete(entry);
  } catch (error) {
    entry.failure = error;
    // Keep the exact reference and ownership entry. Never retry a no-op close.
    throw error;
  }
}

function withStore(f, factory, body, { v1 = false } = {}) {
  assert.equal(activeCount(), 0);
  roomForOne();
  let handle;
  try {
    handle = factory(storeOptions(f, v1));
  } catch (error) {
    holdFailures.push(error);
    throw error;
  }
  const entry = {
    handle,
    closeAttempted: false,
    closeReturned: false,
    failure: null,
  };
  activeProducers.add(entry);
  const problems = [];
  let value;
  try {
    value = body(handle);
  } catch (error) {
    problems.push(error);
  } finally {
    try { closeNativeEntry(entry, activeProducers, STORE_CLOSE); }
    catch (error) { problems.push(error); }
    try { checkFiles(f); } catch (error) { problems.push(error); }
  }
  throwProblems(problems, 'PRODUCER_OPERATION_OR_CLOSE_FAILED');
  return value;
}

function withReadonlyDatabase(f, body) {
  // No probe is opened against the current exclusive store owner.
  assert.equal(activeCount(), 0);
  checkFile(f.databasePath);
  roomForOne();
  let handle;
  try {
    handle = new DatabaseSync(f.databasePath, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readOnly: true,
      timeout: 0,
    });
  } catch (error) {
    holdFailures.push(error);
    throw error;
  }
  const entry = {
    handle,
    closeAttempted: false,
    closeReturned: false,
    failure: null,
  };
  activeRaw.add(entry);
  const problems = [];
  let value;
  try {
    value = body(handle);
  } catch (error) {
    problems.push(error);
  } finally {
    try { closeNativeEntry(entry, activeRaw, DATABASE_CLOSE); }
    catch (error) { problems.push(error); }
    try { checkFiles(f); } catch (error) { problems.push(error); }
  }
  throwProblems(problems, 'READONLY_OPERATION_OR_CLOSE_FAILED');
  return value;
}

function readView(f) {
  return withReadonlyDatabase(f, database => {
    const version = database.prepare('PRAGMA user_version').get().user_version;
    const epoch = database.prepare(
      'SELECT owner_epoch FROM payer_recovery_meta WHERE singleton=1',
    ).get().owner_epoch;
    const fundingRow = database.prepare(
      'SELECT envelope FROM payer_recovery_state WHERE singleton=1',
    ).get();
    const policyRow = database.prepare(
      'SELECT policy_version,max_requests,service_resource_url FROM original_request_custody_policy WHERE singleton=1',
    ).get();
    const rows = database.prepare(
      'SELECT * FROM original_service_requests ORDER BY grant_id,request_id',
    ).all().map(row => ({ ...row }));
    assert.ok(rows.length <= 4);
    return {
      version,
      epoch,
      fundingEnvelope: fundingRow?.envelope ?? null,
      policy: { ...policyRow },
      rows,
    };
  });
}

function databaseBytes(f) {
  assert.equal(activeCount(), 0);
  const before = checkFile(f.databasePath);
  const bytes = readFileSync(f.databasePath);
  assert.equal(bytes.length, Number(before.size));
  const after = checkFile(f.databasePath);
  assert.equal(after.dev, before.dev);
  assert.equal(after.ino, before.ino);
  assert.equal(after.size, before.size);
  return bytes;
}

function seed(f, { bound = true, originals = [] } = {}) {
  assert.ok(originals.length <= 4);
  const pair = declaredPair();
  const saved = withStore(f, CREATE_V2, store => {
    // These are declared LOCAL SQLite transitions, not chain operations.
    store.prepare(pair);
    if (bound) {
      store.fenceAttempt('PREPARED');
      store.finishAttempt('BOUND');
    }
    const records = originals.map(value => store.retainOriginalRequest(metadata(value)));
    return { pair, funding: store.load(), records };
  });
  f.v2 = true;
  f.seed = { ...saved, view: readView(f) };
  assert.equal(f.seed.view.version, 2);
  assert.equal(f.seed.view.epoch, 1);
  assert.equal(f.seed.funding.status, bound ? 'BOUND' : 'PREPARED');
  assert.equal(f.seed.funding.paymentHeader, pair.paymentSignatureHeader);
  assert.equal(f.seed.funding.challengeHeader,
    pair.challenge.paymentRequiredHeader);
  assert.equal(f.seed.funding.paymentPayload.payload.transaction.hash,
    PAYMENT_HASH);
  assert.deepEqual(
    Object.keys(f.seed.funding.paymentPayload.payload.transaction),
    ['hash'],
  );
  return f.seed;
}

function acquireRoot(f, configuration, expectChildUnknown = false) {
  roomForOne();
  let client;
  try {
    client = OPEN(configuration);
  } catch (error) {
    if (error?.code === RP + 'ACQUISITION_HELD'
        || error?.code === RP + 'RESOURCE_HELD') holdFailures.push(error);
    throw error;
  }
  const entry = {
    f,
    client,
    expectChildUnknown,
    closePromise: null,
    closeOutcomePromise: null,
    result: null,
  };
  rootEntries.push(entry);
  activeRoots.add(entry);
  assert.ok(activeCount() <= 2);
  return entry;
}

function openRoot(f, overrides = {}, expectChildUnknown = false) {
  return acquireRoot(f, ownedOptions(f, overrides), expectChildUnknown);
}

function beginRootClose(entry) {
  if (entry.closePromise === null) {
    entry.closePromise = entry.client.close();
    entry.closeOutcomePromise = observe(entry.closePromise);
  }
  return entry.closePromise;
}

async function finishRootClose(entry) {
  beginRootClose(entry);
  const result = await entry.closeOutcomePromise;
  entry.result = result;
  const snapshot = entry.client.snapshot();
  if (snapshot.resource.storeCloseOutcome !== 'RETURNED'
      || snapshot.resource.storeCloseAttempts !== 1
      || snapshot.resource.phase !== 'RELEASED'
      || snapshot.resource.slotHeld !== false) {
    throw new Error('OWNED_DB_CLOSE_OUTCOME_HELD');
  }
  // Positive owned DB close is independent of an expected child rejection.
  // Retain the entry/result for assertions; only active DB ownership is removed.
  activeRoots.delete(entry);
  if (!result.ok && !(entry.expectChildUnknown
      && result.error?.code === RP + 'CHILD_OUTCOME_UNKNOWN')) {
    throw result.error;
  }
  return result;
}

function submit(entry, value) {
  const promise = entry.client.submitOriginal(value);
  observe(promise);
  return promise;
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

async function assertPending(promise) {
  let settled = false;
  promise.then(
    () => { settled = true; },
    () => { settled = true; },
  );
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false);
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
    const cancel = () => finish(false, new Error('OWNED_WAIT_CANCELLED'));
    timer = nativeSetTimeout(() => {
      finish(false, new Error('OWNED_WAIT_TIMEOUT'));
    }, 1000);
    watchdogs.add(cancel);
    promise.then(
      value => finish(true, value),
      error => finish(false, error),
    );
  });
  observe(waited);
  return waited;
}

function assertOriginal(record, value) {
  assert.equal(record.originalRequestJson, value.originalRequestJson);
  assert.equal(record.originalBodyBase64, '');
  assert.equal(record.serviceResourceUrl, SERVICE);
  assert.equal(record.fundingResourceUrl, FUNDING);
  assert.equal(record.paymentHash, PAYMENT_HASH);
  assert.equal(record.network, NETWORK);
  assert.equal(record.grantId, value.grantId);
  assert.equal(record.requestId, value.requestId);
  assert.deepEqual(PARSE(SERIALIZE(record)), record);
  assert.ok(Object.isFrozen(record));
}

function assertView(f, values) {
  const view = readView(f);
  assert.equal(view.version, 2);
  assert.equal(view.fundingEnvelope, f.seed.view.fundingEnvelope);
  assert.deepEqual(view.policy, f.seed.view.policy);
  assert.equal(view.rows.length, values.length);
  for (const value of values) {
    const row = view.rows.find(candidate => candidate.grant_id === value.grantId
      && candidate.request_id === value.requestId);
    assert.ok(row);
    assert.equal(row.funding_singleton, 1);
    assert.equal(row.payment_hash, PAYMENT_HASH);
    assert.equal(row.network, NETWORK);
    assert.equal(row.service_resource_url, SERVICE);
    assertOriginal(PARSE(row.envelope), value);
    assert.equal(row.envelope.includes('ServiceCredit '), false);
    assert.equal(row.envelope.includes('declared-signature'), false);
  }
  return view;
}

function assertRedacted(snapshot, f) {
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.resource));
  assert.ok(Object.isFrozen(snapshot.close));
  assert.ok(Object.isFrozen(snapshot.client));
  assert.ok(Object.isFrozen(snapshot.client.owner));
  assert.ok(Object.isFrozen(snapshot.client.owner.counts));
  assert.ok(Object.isFrozen(snapshot.client.owner.uncertainty));
  if (snapshot.client.lastTransport !== null) {
    assert.ok(Object.isFrozen(snapshot.client.lastTransport));
    assert.ok(Object.isFrozen(snapshot.client.lastTransport.counts));
  }
  const text = JSON.stringify(snapshot);
  assert.ok(text.length <= 6144);
  for (const value of [
    f.root, f.databasePath, FUNDING, SERVICE, PAYMENT_HASH, GRANT,
    'request.one', 'declared-public-key', 'declared-signature',
    'ServiceCredit ', SECRET,
  ]) {
    assert.equal(text.includes(value), false);
  }
  assert.equal(snapshot.qualification, 'UNQUALIFIED');
  for (const field of [
    'actualPersistence', 'restart', 'currentAuthority', 'realReady',
    'serviceDelivery', 'osCleanup',
  ]) {
    assert.equal(snapshot[field], 'NOT_ESTABLISHED');
  }
}

function assertSafeError(error, f) {
  assert.ok(error instanceof TypeError);
  assert.equal(typeof error.code, 'string');
  assert.ok(error.code.startsWith(RP) || error.code.startsWith(CP)
    || error.code.startsWith(OP));
  assert.equal(error.message, error.code);
  assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.ok(Object.isFrozen(error));
  const text = JSON.stringify(error) + error.message + error.stack;
  for (const value of [
    f.root, f.databasePath, FUNDING, SERVICE, PAYMENT_HASH,
    GRANT, 'request.one', 'ServiceCredit ', SECRET,
  ]) {
    assert.equal(text.includes(value), false);
  }
  return true;
}

function assertStoreBusy(f) {
  roomForOne();
  let unexpected;
  try {
    assert.throws(() => {
      unexpected = OPEN_V2(storeOptions(f));
      const entry = {
        handle: unexpected,
        closeAttempted: false,
        closeReturned: false,
        failure: null,
      };
      activeProducers.add(entry);
      unexpected = entry;
    }, storeCode('OWNER_BUSY'));
  } finally {
    if (unexpected !== undefined) {
      // An unexpected successful second owner is a failure, but still owned.
      closeNativeEntry(unexpected, activeProducers, STORE_CLOSE);
    }
  }
}

function poisonProxy(target, touch) {
  const trap = () => {
    touch();
    throw new Error(SECRET);
  };
  return new Proxy(target, {
    get: trap,
    set: trap,
    ownKeys: trap,
    getPrototypeOf: trap,
    getOwnPropertyDescriptor: trap,
    defineProperty: trap,
    has: trap,
    apply: trap,
    construct: trap,
  });
}

async function cleanup() {
  const problems = [];
  // Establish root closed gates before forcing any owned fake events.
  for (const entry of [...activeRoots]) {
    try { beginRootClose(entry); } catch (error) { problems.push(error); }
  }
  for (const f of fixtures) {
    for (const handle of f.handles) {
      try { force(handle); } catch (error) { problems.push(error); }
    }
  }
  for (const cancel of [...watchdogs]) {
    try { cancel(); } catch (error) { problems.push(error); }
  }
  const rootResults = await Promise.allSettled(
    [...activeRoots].map(entry => finishRootClose(entry)),
  );
  for (const result of rootResults) {
    if (result.status === 'rejected') problems.push(result.reason);
  }
  for (const entry of [...activeProducers]) {
    try { closeNativeEntry(entry, activeProducers, STORE_CLOSE); }
    catch (error) { problems.push(error); }
  }
  for (const entry of [...activeRaw]) {
    try { closeNativeEntry(entry, activeRaw, DATABASE_CLOSE); }
    catch (error) { problems.push(error); }
  }
  await Promise.all(sinks);
  for (const f of fixtures) {
    try {
      checkFiles(f);
      for (const handle of f.handles) assert.equal(handle.fixtureClosed, true);
      if (activeCount() === 0 && holdFailures.length === 0 && f.v2) {
        assert.ok(readView(f).rows.length <= 4);
      }
    } catch (error) {
      problems.push(error);
    }
  }
  for (const entry of rootEntries) {
    try {
      const transport = entry.client.snapshot().client.lastTransport;
      if (transport !== null) assert.equal(transport.timerArmed, false);
    } catch (error) {
      problems.push(error);
    }
  }
  problems.push(...holdFailures);
  try {
    assert.equal(activeRoots.size, 0, 'unknown owned DB remains HOLD');
    assert.equal(activeProducers.size, 0, 'unknown producer remains HOLD');
    assert.equal(activeRaw.size, 0, 'unknown raw DB remains HOLD');
    assert.equal(watchdogs.size, 0);
    assert.ok(fixtures.length <= MAX_ROOTS);
  } catch (error) {
    problems.push(error);
  }
  // No generated file is removed, adopted or labelled disposable here.
  throwProblems(problems, 'SCENARIO_RESOURCE_OR_CLOSE_OUTCOME_UNKNOWN');
}

const scenarios = [
  [
    'preflight and existing-v2 refusals preserve applicable original data',
    async () => {
      const empty = fixture();
      let touches = 0;
      const touch = () => { touches++; };
      const getter = () => {
        touch();
        throw new Error(SECRET);
      };
      assert.throws(() => OPEN(), { code: RP + 'INVALID_CONFIGURATION' });
      assert.throws(() => OPEN(ownedOptions(empty), null), {
        code: RP + 'INVALID_CONFIGURATION',
      });

      const accessor = ownedOptions(empty);
      Object.defineProperty(accessor, 'deadlineMs', {
        get: getter, enumerable: true,
      });
      const badPolicy = policy();
      Object.defineProperty(badPolicy, 'serviceResourceUrl', {
        get: getter, enumerable: true,
      });
      const primitive = {};
      Object.defineProperty(primitive, Symbol.toPrimitive, { get: getter });
      const hidden = ownedOptions(empty);
      Object.defineProperty(hidden, 'selectedGrantId', {
        value: GRANT, enumerable: false,
      });
      const symbol = ownedOptions(empty);
      symbol[Symbol('extra')] = true;

      const badConfigurations = [
        null,
        [],
        poisonProxy(ownedOptions(empty), touch),
        Object.create(poisonProxy({}, touch)),
        accessor,
        hidden,
        symbol,
        { ...ownedOptions(empty), extra: true },
        { ...ownedOptions(empty), testHooks: {} },
        { ...ownedOptions(empty), store: {} },
        ownedOptions(empty, { databasePath: primitive }),
        ownedOptions(empty, { allowedRoot: primitive }),
        ownedOptions(empty, { databasePath: 'relative.sqlite' }),
        ownedOptions(empty, {
          databasePath: join(empty.root, 'child', 'custody.sqlite'),
        }),
        ownedOptions(empty, { deadlineMs: primitive }),
        ownedOptions(empty, { deadlineMs: 0 }),
        ownedOptions(empty, { deadlineMs: 60001 }),
        ownedOptions(empty, { deadlineMs: 1.5 }),
        ownedOptions(empty, { selectedGrantId: 'bad://grant' }),
        ownedOptions(empty, { custodyPolicy: badPolicy }),
        ownedOptions(empty, { custodyPolicy: poisonProxy(policy(), touch) }),
        ownedOptions(empty, {
          fundingResourceUrl: 'http://owned-custody.example.test/funding',
        }),
        ownedOptions(empty, {
          requestImpl: poisonProxy(function () {}, touch),
        }),
      ];
      for (const configuration of badConfigurations) {
        assert.throws(() => acquireRoot(empty, configuration), {
          code: RP + 'INVALID_CONFIGURATION',
        });
        assert.deepEqual(readdirSync(empty.root), []);
      }
      assert.equal(touches, 0);
      assert.equal(empty.calls.length, 0);

      // Existing-only open must not create a missing DB.
      assert.throws(() => openRoot(empty), error => {
        assert.equal(error.code, RP + 'ACQUISITION_FAILED');
        return assertSafeError(error, empty);
      });
      assert.deepEqual(readdirSync(empty.root), []);

      const v1 = fixture();
      withStore(v1, CREATE_V1, () => {}, { v1: true });
      const v1Before = databaseBytes(v1);
      assert.throws(() => openRoot(v1), { code: RP + 'ACQUISITION_FAILED' });
      assert.deepEqual(databaseBytes(v1), v1Before);

      const v2 = fixture(2);
      seed(v2);
      const pureBefore = databaseBytes(v2);
      assert.throws(() => openRoot(v2, { selectedGrantId: 'bad://grant' }), {
        code: RP + 'INVALID_CONFIGURATION',
      });
      assert.deepEqual(databaseBytes(v2), pureBefore);

      const logicalBefore = readView(v2);
      assert.throws(() => openRoot(v2, { custodyPolicy: policy(3) }), {
        code: RP + 'ACQUISITION_FAILED',
      });
      // Policy validation occurs through the actual writable-open path.
      // Assert logical preservation, not whole-file identity for that path.
      assert.deepEqual(readView(v2), logicalBefore);
      assert.equal(v2.calls.length, 0);
    },
  ],
  [
    'real v2 custody fence precedes bodyless fake transport',
    async () => {
      const f = fixture();
      seed(f);
      const entry = openRoot(f);
      const value = submission();
      let fenceObserved = false;

      f.onRequest = exchange => {
        const snapshot = entry.client.snapshot();
        assert.equal(snapshot.client.owner.phase, 'DISPATCH_PENDING');
        assert.equal(snapshot.client.owner.counts.loadReads, 2);
        assert.equal(snapshot.client.owner.counts.recordReads, 2);
        assert.equal(snapshot.client.owner.counts.retainCalls, 1);
        assert.equal(snapshot.client.owner.counts.readbackConfirmations, 1);
        assert.equal(snapshot.client.owner.counts.dispatchCalls, 1);
        assert.equal(snapshot.resource.storeCloseAttempts, 0);
        assert.equal(exchange.resourceUrl, SERVICE);
        assert.deepEqual(exchange.options, {
          method: 'POST',
          headers: { Authorization: value.authorizationHeader },
          agent: false,
          rejectUnauthorized: true,
          maxHeaderSize: 16384,
          insecureHTTPParser: false,
        });
        assert.ok(Object.isFrozen(exchange.options));
        assert.ok(Object.isFrozen(exchange.options.headers));
        assert.deepEqual(Object.keys(exchange.options.headers), ['Authorization']);
        fenceObserved = true;
      };

      const operation = submit(entry, value);
      assert.equal(fenceObserved, true);
      assert.equal(f.calls.length, 1);
      const exchange = f.exchanges[0];
      assert.equal(exchange.request.endCalls, 1);
      assert.equal(exchange.request.writeCalls, 0);
      respond(exchange);
      goodEnd(exchange);
      await assertPending(operation);
      force(exchange.response);
      await assertPending(operation);
      force(exchange.request);
      assert.equal(await operation, undefined);
      assertOriginal(entry.client.readOriginal(key(value)), value);
      assert.equal(f.calls.length, 1);
      const closing = beginRootClose(entry);
      assert.equal(entry.client.close(), closing);
      assert.equal((await finishRootClose(entry)).ok, true);
      const snapshot = entry.client.snapshot();
      assert.equal(snapshot.close.childOutcome, 'FULFILLED');
      assert.equal(snapshot.close.outcome, 'DRAINED');
      assert.equal(snapshot.resource.storeCloseAttempts, 1);
      assertRedacted(snapshot, f);

      const view = assertView(f, [value]);
      assert.equal(view.epoch, f.seed.view.epoch + 1);
    },
  ],
  [
    'distinct requests preserve funding and enforce replay and capacity',
    async () => {
      const f = fixture(2);
      seed(f);
      const entry = openRoot(f);
      const values = [submission('request.one'), submission('request.two', 8)];
      for (let index = 0; index < values.length; index++) {
        const operation = submit(entry, values[index]);
        assert.equal(f.calls.length, index + 1);
        const exchange = f.exchanges[index];
        assert.equal(exchange.options.headers.Authorization,
          values[index].authorizationHeader);
        complete(exchange);
        assert.equal(await operation, undefined);
        const last = entry.client.snapshot().client.lastTransport;
        assert.equal(last.counts.requestCalls, 1);
        assert.equal(last.counts.settlements, 1);
        assert.equal(last.credentialReferenceReleased, true);
      }
      assert.notEqual(f.exchanges[0].request, f.exchanges[1].request);
      assert.notEqual(f.exchanges[0].onResponse, f.exchanges[1].onResponse);
      const last = entry.client.snapshot().client.lastTransport;

      await assert.rejects(submit(entry, values[0]), {
        code: OP + 'RECOVERY_REQUIRED',
      });
      await assert.rejects(submit(entry, submission('request.three', 9)), {
        code: OP + 'CAPACITY',
      });
      assert.equal(f.calls.length, 2);
      assert.deepEqual(entry.client.snapshot().client.lastTransport, last);
      assert.equal(entry.client.snapshot().client.owner.trackedRequests, 2);
      assert.equal(entry.client.snapshot().client.owner.counts.retainCalls, 2);
      assert.equal(entry.client.snapshot().client.owner.counts.dispatchCalls, 2);
      for (const value of values) {
        assertOriginal(entry.client.readOriginal(key(value)), value);
      }
      assert.equal((await finishRootClose(entry)).ok, true);
      assertView(f, values);
    },
  ],
  [
    'root close waits for captured handles before releasing owned store',
    async () => {
      const f = fixture();
      seed(f);
      const entry = openRoot(f);
      const value = submission();
      const operation = submit(entry, value);
      const exchange = f.exchanges[0];
      respond(exchange);
      const closing = beginRootClose(entry);
      assert.equal(Object.getPrototypeOf(closing), Promise.prototype);
      assert.equal(entry.client.close(), closing);
      assert.equal(entry.client.snapshot().resource.admissionClosed, true);
      assert.equal(entry.client.snapshot().resource.phase, 'CLOSING');
      assert.equal(entry.client.snapshot().resource.storeCloseAttempts, 0);
      assertStoreBusy(f);
      await assertPending(closing);
      await assert.rejects(submit(entry, submission('request.after-close')), {
        code: RP + 'CLOSED',
      });
      assert.throws(() => entry.client.readOriginal(key(value)), {
        code: RP + 'CLOSED',
      });

      goodEnd(exchange);
      force(exchange.request);
      await assertPending(operation);
      await assertPending(closing);
      assertStoreBusy(f);
      assert.equal(entry.client.snapshot().resource.storeCloseAttempts, 0);
      force(exchange.response);
      assert.equal(await operation, undefined);
      assert.equal((await finishRootClose(entry)).ok, true);
      assert.equal(entry.client.close(), closing);
      assert.equal(await closing, undefined);
      assert.equal(entry.client.snapshot().resource.storeCloseAttempts, 1);
      assertView(f, [value]);

      // Actual same-path store ownership can be acquired after known close.
      // This advances owner_epoch; no whole-file equality is asserted.
      withStore(f, OPEN_V2, store => {
        assert.deepEqual(store.load(), f.seed.funding);
        assertOriginal(store.getOriginalRequest(key(value)), value);
      });
      assert.equal(entry.client.close(), closing);
      assert.equal(entry.client.snapshot().resource.storeCloseAttempts, 1);
    },
  ],
  [
    'explicit same-process reopen recovers originals without replay authority',
    async () => {
      const f = fixture();
      seed(f);
      const first = openRoot(f);
      const value = submission();
      const operation = submit(first, value);
      complete(f.exchanges[0]);
      assert.equal(await operation, undefined);
      const before = SERIALIZE(first.client.readOriginal(key(value)));
      assert.equal((await finishRootClose(first)).ok, true);

      const second = openRoot(f);
      assert.equal(f.calls.length, 1);
      assert.equal(second.client.snapshot().client.lastTransport, null);
      const recovered = second.client.readOriginal(key(value));
      assert.equal(SERIALIZE(recovered), before);
      assertOriginal(recovered, value);
      await assert.rejects(submit(second, value), {
        code: OP + 'RECOVERY_REQUIRED',
      });
      await assert.rejects(submit(second, submission('request.one', 8)), {
        code: OP + 'CONFLICT',
      });
      assert.equal(f.calls.length, 1);
      assert.equal(second.client.snapshot().client.lastTransport, null);
      assert.equal((await finishRootClose(second)).ok, true);
      const view = assertView(f, [value]);
      assert.equal(view.epoch, f.seed.view.epoch + 2);

      const pendingFunding = fixture();
      const retained = submission();
      seed(pendingFunding, { bound: false, originals: [retained] });
      const readonlyRecovery = openRoot(pendingFunding);
      assertOriginal(readonlyRecovery.client.readOriginal(key(retained)), retained);
      await assert.rejects(submit(readonlyRecovery, retained), {
        code: OP + 'FUNDING_NOT_BOUND',
      });
      assert.equal(pendingFunding.calls.length, 0);
      assert.equal(readonlyRecovery.client.snapshot().client.lastTransport, null);
      assert.equal((await finishRootClose(readonlyRecovery)).ok, true);
      assertView(pendingFunding, [retained]);
    },
  ],
  [
    'service unknown remains rejected after independent owned db close',
    async () => {
      for (const mode of ['late-success', '503', 'deadline', 'immediate-throw']) {
        const f = fixture();
        seed(f);
        if (mode === 'immediate-throw') f.throwOnRequest = true;
        const entry = openRoot(f, {
          deadlineMs: mode === 'deadline' ? 10 : 2000,
        }, true);
        const value = submission();
        const operation = submit(entry, value);
        const closing = beginRootClose(entry);
        assert.equal(entry.client.close(), closing);

        if (mode !== 'immediate-throw') {
          const exchange = f.exchanges[0];
          if (mode === '503') exchange.response.statusCode = 503;
          respond(exchange);
          if (mode === 'late-success') {
            emit(exchange.request, 'error', new Error(SECRET));
          }
          if (mode === 'deadline') {
            await boundedWait(exchange.request.destroyObserved);
          }
          assert.equal(exchange.request.destroyCalls, 1);
          assert.equal(exchange.response.destroyCalls, 1);
          await assertPending(operation);
          await assertPending(closing);
          assert.equal(entry.client.snapshot().resource.storeCloseAttempts, 0);

          exchange.response.statusCode = 200;
          goodEnd(exchange);
          assert.equal(
            entry.client.snapshot().client.lastTransport.replyValidated,
            false,
          );
          force(exchange.request);
          await assertPending(closing);
          force(exchange.response);
        }

        await assert.rejects(operation, error => {
          assert.equal(error.code, OP + 'SUBMISSION_OUTCOME_UNKNOWN');
          return assertSafeError(error, f);
        });
        await assert.rejects(closing, error => {
          assert.equal(error.code, RP + 'CHILD_OUTCOME_UNKNOWN');
          return assertSafeError(error, f);
        });
        const result = await finishRootClose(entry);
        assert.equal(result.ok, false);
        const snapshot = entry.client.snapshot();
        assert.equal(snapshot.close.childOutcome, 'REJECTED');
        assert.equal(snapshot.close.childUncertainty, true);
        assert.equal(snapshot.close.outcome, 'CHILD_UNKNOWN');
        assert.equal(snapshot.close.unknownUndrained, mode === 'immediate-throw');
        assert.equal(snapshot.resource.storeCloseAttempts, 1);
        assert.equal(snapshot.resource.storeCloseOutcome, 'RETURNED');
        assert.equal(snapshot.resource.phase, 'RELEASED');
        assert.equal(snapshot.resource.slotHeld, false);
        assert.equal(snapshot.client.lastTransport.deadlineFired,
          mode === 'deadline');
        assert.equal(snapshot.client.lastTransport.counts.requestCalls, 1);
        assert.equal(snapshot.client.lastTransport.counts.settlements, 1);
        assert.equal(snapshot.client.lastTransport.timerArmed, false);
        assert.equal(entry.client.close(), closing);
        await assert.rejects(submit(entry, value), { code: RP + 'CLOSED' });
        assert.equal(f.calls.length, 1);
        assertRedacted(snapshot, f);
        assertView(f, [value]);
      }
    },
  ],
  [
    'module resource slot fences reentrant busy and closing acquisition',
    async () => {
      const firstFixture = fixture();
      const secondFixture = fixture();
      seed(firstFixture);
      seed(secondFixture);
      const secondBefore = databaseBytes(secondFixture);
      const first = openRoot(firstFixture);
      let busyBeforeClose;
      let busyDuringClose;
      let nested;
      let closing;
      let busyRead = false;

      assert.throws(() => openRoot(secondFixture), {
        code: RP + 'RESOURCE_BUSY',
      });
      firstFixture.onRequest = () => {
        try { openRoot(secondFixture); }
        catch (error) { busyBeforeClose = error; }
        nested = submit(first, submission('request.nested'));
        assert.throws(() => first.client.readOriginal(key()), {
          code: OP + 'BUSY',
        });
        busyRead = true;
        closing = beginRootClose(first);
        assert.equal(first.client.close(), closing);
        try { openRoot(secondFixture); }
        catch (error) { busyDuringClose = error; }
      };

      const value = submission();
      const operation = submit(first, value);
      assert.equal(busyRead, true);
      assert.equal(busyBeforeClose.code, RP + 'RESOURCE_BUSY');
      assert.equal(busyDuringClose.code, RP + 'RESOURCE_BUSY');
      await assert.rejects(nested, { code: CP + 'BUSY' });
      await assertPending(operation);
      await assertPending(closing);
      assert.equal(firstFixture.calls.length, 1);
      complete(firstFixture.exchanges[0]);
      assert.equal(await operation, undefined);
      assert.equal((await finishRootClose(first)).ok, true);
      assert.equal(first.client.close(), closing);

      // The busy acquisitions performed no second-DB I/O.
      assert.deepEqual(databaseBytes(secondFixture), secondBefore);
      const second = openRoot(secondFixture);
      assert.equal(second.client.readOriginal(key()), null);
      assert.equal(secondFixture.calls.length, 0);
      assert.equal(second.client.snapshot().currentAuthority, 'NOT_ESTABLISHED');
      assert.equal(first.client.snapshot().currentAuthority, 'NOT_ESTABLISHED');
      assert.equal((await finishRootClose(second)).ok, true);
      assert.equal(first.client.snapshot().resource.storeCloseAttempts, 1);
      assert.equal(second.client.snapshot().resource.storeCloseAttempts, 1);
      assertView(firstFixture, [value]);
      assertView(secondFixture, []);
    },
  ],
  [
    'frozen redacted api exposes no store or recovery authority',
    async () => {
      assert.deepEqual(Object.keys(ownedModule), [
        'openServiceCreditCustodiedSqliteHttpClient',
      ]);
      const f = fixture();
      seed(f);
      const configuration = ownedOptions(f);
      const entry = acquireRoot(f, configuration);
      const client = entry.client;
      assert.deepEqual(Object.keys(client), [
        'submitOriginal', 'readOriginal', 'snapshot', 'close',
      ]);
      assert.ok(Object.isFrozen(client));
      for (const name of Object.keys(client)) {
        const descriptor = Object.getOwnPropertyDescriptor(client, name);
        assert.equal(typeof descriptor.value, 'function');
        assert.ok(Object.isFrozen(descriptor.value));
        assert.equal(descriptor.writable, false);
        assert.equal(descriptor.configurable, false);
      }

      let touches = 0;
      const getter = () => {
        touches++;
        throw new Error(SECRET);
      };
      const touch = () => { touches++; };
      for (const name of Object.keys(configuration)) {
        Object.defineProperty(configuration, name, {
          get: getter, enumerable: true, configurable: true,
        });
      }
      const value = submission();
      const saved = { ...value };
      const hostile = { ...value };
      Object.defineProperty(hostile, 'authorizationHeader', {
        get: getter, enumerable: true,
      });
      await assert.rejects(submit(entry, hostile), error => {
        assert.equal(error.code, CP + 'INVALID_INPUT');
        return assertSafeError(error, f);
      });
      await assert.rejects(submit(entry, poisonProxy(value, touch)), {
        code: CP + 'INVALID_INPUT',
      });
      await assert.rejects(submit(entry, { ...value, dispatch: function () {} }), {
        code: CP + 'INVALID_INPUT',
      });
      assert.throws(() => client.snapshot(null), error => {
        assert.equal(error.code, RP + 'INVALID_INPUT');
        return assertSafeError(error, f);
      });
      const invalidClose = client.close(null);
      observe(invalidClose);
      await assert.rejects(invalidClose, { code: RP + 'INVALID_INPUT' });
      assert.equal(client.snapshot().resource.storeCloseAttempts, 0);
      assert.equal(client.snapshot().resource.admissionClosed, false);
      assert.equal(client.snapshot().client.owner.counts.loadReads, 0);
      assert.equal(f.calls.length, 0);
      assert.equal(touches, 0);
      assertRedacted(client.snapshot(), f);

      const submitUnbound = client.submitOriginal;
      const readUnbound = client.readOriginal;
      const operation = submitUnbound(value);
      observe(operation);
      assert.equal(f.calls.length, 1);
      for (const name of Object.keys(value)) {
        Object.defineProperty(value, name, {
          get: getter, enumerable: true, configurable: true,
        });
      }
      assert.equal(f.exchanges[0].options.headers.Authorization,
        saved.authorizationHeader);
      complete(f.exchanges[0]);
      assert.equal(await operation, undefined);
      const calls = f.calls.length;
      const recovered = readUnbound(key(saved));
      assertOriginal(recovered, saved);
      const expected = CAPTURE(contractInput(saved), {
        fundingResourceUrl: FUNDING,
        paymentHash: PAYMENT_HASH,
        network: NETWORK,
      });
      assert.equal(SERIALIZE(recovered), SERIALIZE(expected));
      assert.equal(f.calls.length, calls);
      assert.equal(touches, 0);
      assertRedacted(client.snapshot(), f);

      const closing = beginRootClose(entry);
      assert.equal(client.close(), closing);
      assert.equal((await finishRootClose(entry)).ok, true);
      assert.equal(client.close(), closing);
      assert.equal(client.snapshot().resource.storeCloseAttempts, 1);
      assert.equal(client.snapshot().close.unknownUndrained, false);
      assert.equal(touches, 0);
      assertRedacted(client.snapshot(), f);
      assertView(f, [saved]);
    },
  ],
];

assert.equal(scenarios.length, 8);
const [name, run] = scenarios[Number(selector) - 1];
// Exactly one registration. No default-all, skipped groups, discovery, old-unit
// imports, source evaluation, fault hooks or hidden operational launcher.
test(name, { timeout: 10000 }, async t => {
  t.after(cleanup);
  await run();
});
