/*
 * SOURCE DRAFT / NOT_RUN. Outside default test discovery.
 *
 * Separate explicit human SQL approval and a fresh complete source, storage,
 * fixture-lifecycle and launch review are prerequisites to any future run.
 * This file is not a manager, launcher, operational helper or approval.
 *
 * Require one numeric scenario, physical SPV_TASK_SCRATCH and its preexisting
 * direct child SPV_SQLITE_FIXTURE_ROOT named sqlite-runner-fixtures. Only that
 * child starts empty; source aliases may exist elsewhere in task scratch.
 * Both directories must be uid-owned 0700 non-symlink physical directories on
 * one filesystem. No HOME, temp, cwd, cache, creation or fallback root exists.
 *
 * Future reservation proposal: 128 MiB PLUS bounded stdout/stderr, preserving
 * the production 10 GiB free-space floor plus allocations/reservations.
 * Environment checks and post-checks authenticate no lease, mount, quota,
 * registration, retention decision or permission. The approved manager launch
 * must first review/register roles, fixture lifecycle, caps and retention.
 * Child-created files unknown to its ledger remain HOLD.
 *
 * At most 4 new fixture directories/process, one DB/directory, 8 original
 * rows/DB, native handle cap 2 and normally one-at-a-time; 2 MiB/file post-check.
 * No generated path is unlinked, recursively cleaned, adopted, rebound,
 * migrated or labelled disposable. Preserve failures, files and unknown handles.
 *
 * Actual CREATE_V2 prepare/fenceAttempt/finishAttempt seed NEW DECLARED LOCAL
 * SQLite metadata only: no chain PREPARE, SDK, signature, payment operation or
 * consumed-authority reset. BOUND itself establishes no proof/current authority.
 * Same-process close/reopen is not process restart, crash, power-loss, fsync
 * or durability proof. Production and pilot acceptance remain external.
 *
 * All ten graph/package byte/SHA guards finish before repository/node:sqlite
 * imports. The old SQL unit is DATA infrastructure only, never imported.
 * Production stores/factories are actual. Only request/response transport is
 * fake, with exact owned handles and no real sockets.
 *
 * Raw SQLite probes/writes require all actual owner handles known closed.
 * Exclusive locking rules out a concurrent read-only pre-dispatch probe.
 * Native close has one attempt per tracked handle; a throw retains reference
 * and HOLD, never a no-op retry. Root repeats observe one cached Promise.
 * No hooks, prototype mutation, fault injection, module reload or slot reset.
 * Native close-failure and unexpected construction/Promise faults remain
 * unexecuted coverage gates. Watchdogs/timeouts diagnose, never hard-cancel
 * native work or prove OS cleanup/resource lifetime.
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
import { types as utilTypes } from 'node:util';
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
    throw new Error('PRIVATE_REGISTERED_DIRECTORY_REQUIRED');
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

const scratch = process.env.SPV_TASK_SCRATCH;
const scratchIdentity = privateDirectory(scratch);
const fixtureRoot = process.env.SPV_SQLITE_FIXTURE_ROOT;
assert.equal(fixtureRoot, join(scratch, 'sqlite-runner-fixtures'));
const fixtureIdentity = privateDirectory(fixtureRoot);
assert.equal(fixtureIdentity.dev, scratchIdentity.dev);
assert.deepEqual(readdirSync(fixtureRoot), [],
  'only the dedicated preexisting fixture child must start empty');

const specs = [
  [
    'runner', '../src/service-credit-custodied-sqlite-sequential-runner.js',
    8354, 'efe0ec55dc506159d416e8d8b94659a9dda060e2cc3c7eacfe533b0cea42ed8a',
  ],
  [
    'core', '../src/service-credit-custodied-sequential-runner-core.js',
    15208, '07b73745c1a85e049ea374f1fd054b75dba9c0cd46d64adf4cfe4d266c4bc5f1',
  ],
  [
    'owned', '../src/service-credit-custodied-sqlite-http-client.js',
    17045, '1bf7e3d738b4f3f9e880e1ff5f99ee7eaf3df02c2e98f5993dd075eb0bbf4c7b',
  ],
  [
    'store',
    '../src/service-credit-zenon-funding-post-v1-payer-recovery-sqlite-store.js',
    47979, '18382896ec5745d8ab4358cbe26ea1a166eccda2d7c4e86840d4df926704da9d',
  ],
  [
    'client', '../src/service-credit-custodied-http-client.js',
    9815, '757c7d472410676b61baf2a3cda73e493a26ca6343d4e4c0a2c3af1a9e6abb9c',
  ],
  [
    'owner', '../src/service-credit-custodied-request-owner.js',
    22239, 'fa8d8dbb34363140a4f087c2200cdcfd850d9be09ffcf939e576c08228e19e96',
  ],
  [
    'dispatch', '../src/service-credit-http-execute-dispatch.js',
    25281, '044a7bd97a1344c1f95854a71dfb85eeb197c39fef2cd1b3c2b83b766a768008',
  ],
  [
    'contract', '../src/service-credit-original-request-custody-contract.js',
    9810, '8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083',
  ],
  [
    'wire', '../src/x402-wire.js',
    39886, '5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56',
  ],
  [
    'package', '../package.json',
    1413, '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5',
  ],
];
assert.equal(specs.length, 10);
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

// Every graph/package DATA guard above precedes these dynamic imports.
const runnerModule = await import(guarded.runner.url);
const storeModule = await import(guarded.store.url);
const custody = await import(guarded.contract.url);
const wire = await import(guarded.wire.url);
const { DatabaseSync } = await import('node:sqlite');
const OPEN = runnerModule.openServiceCreditCustodiedSqliteSequentialRunner;
const {
  createZenonFundingPayerRecoverySqliteStore: CREATE_V1,
  createZenonFundingPayerRecoveryCustodySqliteStoreV2: CREATE_V2,
  openZenonFundingPayerRecoveryCustodySqliteStoreV2: OPEN_V2,
  ZenonFundingPayerRecoverySqliteStore: StoreClass,
} = storeModule;
const {
  captureOriginalServiceRequestCustody: CAPTURE,
  serializeOriginalServiceRequestCustody: SERIALIZE,
  parseOriginalServiceRequestCustody: PARSE,
} = custody;
const APPLY = Reflect.apply;
const THEN = Promise.prototype.then;
const IS_PROMISE = utilTypes.isPromise;
const STORE_CLOSE = Object.getOwnPropertyDescriptor(
  StoreClass.prototype, 'close',
).value;
const DATABASE_CLOSE = Object.getOwnPropertyDescriptor(
  DatabaseSync.prototype, 'close',
).value;

const RP = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const XP = 'SERVICE_CREDIT_CUSTODIED_SQLITE_HTTP_CLIENT_';
const CP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
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
const acquisitions = [];
const pendingAcquisitions = new Set();
const rootEntries = [];
const activeRoots = new Set();
const activeProducers = new Set();
const activeRaw = new Set();
const holdFailures = [];
const sinks = [];
const watchdogs = new Set();

function observe(promise) {
  // Captured pristine Promise/actual component contracts remain premises.
  const outcome = APPLY(THEN, promise, [
    value => ({ ok: true, value }),
    error => ({ ok: false, error }),
  ]);
  sinks.push(outcome);
  assert.equal(IS_PROMISE(promise), true);
  assert.equal(Object.getPrototypeOf(promise), Promise.prototype);
  return outcome;
}

function activeCount() {
  return pendingAcquisitions.size + activeRoots.size
    + activeProducers.size + activeRaw.size;
}

function roomForOne() {
  assert.ok(activeCount() < 2, 'native DB handle/reservation cap is two');
}

function knownClosed() {
  assert.equal(activeCount(), 0, 'raw SQLite requires all owners known closed');
  assert.equal(holdFailures.length, 0, 'unknown acquisition/close remains HOLD');
}

function throwProblems(problems, code) {
  if (problems.length === 1) throw problems[0];
  if (problems.length > 1) throw new AggregateError(problems, code);
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
  assert.ok(Number.isSafeInteger(maxRequests) && maxRequests >= 1
    && maxRequests <= 8);
  assert.equal(holdFailures.length, 0);
  const taskNow = privateDirectory(scratch);
  const parentNow = privateDirectory(fixtureRoot);
  assert.equal(taskNow.dev, scratchIdentity.dev);
  assert.equal(taskNow.ino, scratchIdentity.ino);
  assert.equal(parentNow.dev, fixtureIdentity.dev);
  assert.equal(parentNow.ino, fixtureIdentity.ino);
  const root = mkdtempSync(join(fixtureRoot, 'runner-' + selector + '-'));
  const f = {
    root,
    databasePath: join(root, 'custody.sqlite'),
    custodyPolicy: policy(maxRequests),
    rootIdentity: null,
    identity: null,
    v2: false,
    seed: null,
    handles: [],
    exchanges: [],
    calls: [],
    waiters: new Map(),
    onRequest: null,
    requestImpl: null,
    maxActive: 0,
  };
  fixtures.push(f);
  chmodSync(root, 0o700);
  const stat = privateDirectory(root);
  assert.equal(stat.dev, fixtureIdentity.dev);
  f.rootIdentity = { dev: stat.dev, ino: stat.ino };
  f.requestImpl = function requestImpl(resourceUrl, options, onResponse) {
    assert.equal(this, undefined);
    assert.equal(arguments.length, 3);
    f.calls.push({ resourceUrl, options });
    const request = new FakeRequest();
    const response = new FakeResponse();
    const exchange = { resourceUrl, options, onResponse, request, response };
    f.handles.push(request, response);
    f.exchanges.push(exchange);
    const active = f.exchanges.filter(value =>
      !value.request.fixtureClosed || !value.response.fixtureClosed).length;
    f.maxActive = Math.max(f.maxActive, active);
    assert.equal(active, 1, 'only one captured exchange may be active');
    if (f.onRequest !== null) f.onRequest(exchange);
    f.waiters.get(f.exchanges.length - 1)?.resolve(exchange);
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
  assert.equal(stat.dev, fixtureIdentity.dev);
  assert.equal(stat.nlink, 1n);
  assert.equal(stat.mode & 0o777n, 0o600n);
  assert.equal(stat.mode & 0o7000n, 0n);
  assert.ok(stat.size <= BigInt(MAX_FILE_BYTES), 'file post-check only');
  assert.equal(realpathSync(path), path);
  return stat;
}

function checkFiles(f) {
  const root = privateDirectory(f.root);
  assert.equal(root.dev, f.rootIdentity.dev);
  assert.equal(root.ino, f.rootIdentity.ino);
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

const nativeEntries = [];
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
    assert.equal(returned, undefined);
    entry.closeReturned = true;
    active.delete(entry);
  } catch (error) {
    entry.failure = error;
    // Exact reference remains in both the entry and active ownership set.
    throw error;
  }
}

function withStore(f, factory, body, { v1 = false } = {}) {
  const entry = reserveNative(activeProducers);
  try {
    entry.handle = factory(storeOptions(f, v1));
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

function withDatabase(f, readOnly, body) {
  // Raw access is allowed only on this new fixture after all owners are known
  // closed; no raw pre-dispatch probe or concurrent native writer is attempted.
  knownClosed();
  checkFile(f.databasePath);
  const entry = reserveNative(activeRaw);
  try {
    entry.handle = new DatabaseSync(f.databasePath, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readOnly,
      timeout: 0,
    });
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
    try { closeNativeEntry(entry, activeRaw, DATABASE_CLOSE); }
    catch (error) { problems.push(error); }
    try { checkFiles(f); } catch (error) { problems.push(error); }
  }
  throwProblems(problems, 'RAW_OPERATION_OR_CLOSE_FAILED');
  return value;
}

function readView(f) {
  return withDatabase(f, true, database => {
    const version = database.prepare('PRAGMA user_version').get().user_version;
    const applicationId = database.prepare(
      'PRAGMA application_id',
    ).get().application_id;
    const definitions = database.prepare(
      "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all().map(row => ({ ...row }));
    const meta = database.prepare(
      'SELECT * FROM payer_recovery_meta ORDER BY singleton',
    ).all().map(row => ({ ...row }));
    const funding = database.prepare(
      'SELECT * FROM payer_recovery_state ORDER BY singleton',
    ).all().map(row => ({ ...row }));
    const policyRows = database.prepare(
      'SELECT * FROM original_request_custody_policy ORDER BY singleton',
    ).all().map(row => ({ ...row }));
    const rows = database.prepare(
      'SELECT * FROM original_service_requests ORDER BY grant_id,request_id LIMIT 9',
    ).all().map(row => ({ ...row }));
    assert.equal(meta.length, 1);
    assert.equal(policyRows.length, 1);
    assert.ok(funding.length <= 1);
    assert.ok(rows.length <= 8);
    return {
      version,
      applicationId,
      definitions,
      meta,
      funding,
      policy: policyRows,
      rows,
      epoch: meta[0].owner_epoch,
      fundingEnvelope: funding[0]?.envelope ?? null,
    };
  });
}

function databaseBytes(f) {
  knownClosed();
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
  assert.ok(originals.length <= 8);
  assert.ok(originals.length <= f.custodyPolicy.maxRequests);
  const pair = declaredPair();
  const saved = withStore(f, CREATE_V2, store => {
    // Declared LOCAL SQLite transitions only, never a chain PREPARE.
    store.prepare(pair);
    if (bound) {
      store.fenceAttempt('PREPARED');
      store.finishAttempt('BOUND');
    }
    const records = originals.map(value =>
      store.retainOriginalRequest(metadata(value)));
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
  assert.equal(f.seed.funding.requirement.network, NETWORK);
  assert.deepEqual(
    Object.keys(f.seed.funding.paymentPayload.payload.transaction), ['hash'],
  );
  return f.seed;
}

function knownRefusal(error) {
  return error instanceof TypeError && Object.isFrozen(error)
    && error.message === error.code && error.stack === 'TypeError: ' + error.code
    && [
      RP + 'INVALID_CONFIGURATION',
      XP + 'ACQUISITION_FAILED',
      XP + 'RESOURCE_BUSY',
    ].includes(error.code);
}

function beginAcquire(f, args, expectChildUnknown = false) {
  roomForOne();
  const entry = {
    f,
    state: 'PENDING',
    promise: null,
    outcomePromise: null,
    runner: null,
    error: null,
    expectChildUnknown,
    closePromise: null,
    closeOutcomePromise: null,
    result: null,
  };
  // Reserve before OPEN: its async body can acquire synchronously before its
  // native Promise is returned. A pending/unknown attempt consumes this slot.
  acquisitions.push(entry);
  pendingAcquisitions.add(entry);
  try {
    entry.promise = APPLY(OPEN, undefined, args);
    const observed = observe(entry.promise);
    entry.outcomePromise = APPLY(THEN, observed, [
      result => {
        if (result.ok) {
          // Track even unexpected success before any caller assertion can fail.
          entry.runner = result.value;
          entry.state = 'OPEN';
          rootEntries.push(entry);
          activeRoots.add(entry);
          pendingAcquisitions.delete(entry);
        } else {
          entry.error = result.error;
          if (knownRefusal(result.error)) {
            entry.state = 'REFUSED';
            pendingAcquisitions.delete(entry);
          } else {
            entry.state = 'UNKNOWN';
            holdFailures.push(result.error);
          }
        }
        return result;
      },
    ]);
    observe(entry.outcomePromise);
  } catch (error) {
    entry.state = 'UNKNOWN';
    entry.error = error;
    holdFailures.push(error);
    // No synthetic success or free-state inference; preserve reservation.
    throw error;
  }
  assert.ok(activeCount() <= 2);
  return entry;
}

async function finishAcquire(entry) {
  const result = await boundedWait(entry.outcomePromise);
  if (!result.ok) throw result.error;
  assert.equal(entry.state, 'OPEN');
  assertApi(entry.runner);
  return entry;
}

function openRoot(f, overrides = {}, expectChildUnknown = false) {
  return finishAcquire(beginAcquire(
    f, [ownedOptions(f, overrides)], expectChildUnknown,
  ));
}

async function assertRefusal(entry, code) {
  const result = await boundedWait(entry.outcomePromise);
  // Unexpected success stays tracked for after-cleanup, never discarded here.
  assert.equal(result.ok, false);
  assert.equal(entry.state, 'REFUSED');
  assert.equal(entry.runner, null);
  assert.equal(result.error.code, code);
  assertSafeError(result.error, entry.f);
  return result.error;
}

function expectRefusal(f, args, code) {
  return assertRefusal(beginAcquire(f, args), code);
}

function beginRootClose(entry) {
  if (entry.closePromise === null) {
    entry.closePromise = entry.runner.close();
    entry.closeOutcomePromise = observe(entry.closePromise);
  }
  return entry.closePromise;
}

async function finishRootClose(entry) {
  beginRootClose(entry);
  const result = await boundedWait(entry.closeOutcomePromise);
  entry.result = result;
  const snapshot = entry.runner.snapshot();
  if (snapshot.resource.storeCloseOutcome !== 'RETURNED'
      || snapshot.resource.storeCloseAttempts !== 1
      || snapshot.resource.phase !== 'RELEASED'
      || snapshot.resource.slotHeld !== false
      || snapshot.resource.admissionClosed !== true) {
    entry.state = 'HELD';
    throw new Error('OWNED_DB_CLOSE_OUTCOME_HELD');
  }
  // Remove only known DB ownership. Keep result/child uncertainty separately.
  entry.state = 'DB_CLOSE_OBSERVED';
  activeRoots.delete(entry);
  if (!result.ok && !(entry.expectChildUnknown
      && result.error?.code === XP + 'CHILD_OUTCOME_UNKNOWN')) {
    throw result.error;
  }
  if (result.ok) assert.equal(result.value, undefined);
  assert.equal(entry.runner.close(), entry.closePromise);
  assert.equal(snapshot.runner.closeCalls, 1);
  return result;
}

function run(entry, batch) {
  const promise = entry.runner.runOriginals(batch);
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
  APPLY(THEN, promise, [
    () => { settled = true; },
    () => { settled = true; },
  ]);
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

function exchangeAt(f, index) {
  if (f.exchanges[index] !== undefined) {
    return Promise.resolve(f.exchanges[index]);
  }
  let waiter = f.waiters.get(index);
  if (waiter === undefined) {
    let resolvePromise, rejectPromise;
    const promise = new Promise((resolveValue, rejectValue) => {
      resolvePromise = resolveValue;
      rejectPromise = rejectValue;
    });
    observe(promise);
    waiter = { promise, resolve: resolvePromise, reject: rejectPromise };
    f.waiters.set(index, waiter);
  }
  return boundedWait(waiter.promise);
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
  const expected = CAPTURE(contractInput(value), {
    fundingResourceUrl: FUNDING,
    paymentHash: PAYMENT_HASH,
    network: NETWORK,
  });
  assert.equal(SERIALIZE(record), SERIALIZE(expected));
  assert.ok(Object.isFrozen(record));
}

function assertView(f, values, epoch) {
  const view = readView(f);
  assert.equal(view.version, 2);
  assert.equal(view.applicationId, f.seed.view.applicationId);
  assert.deepEqual(view.definitions, f.seed.view.definitions);
  assert.deepEqual(view.funding, f.seed.view.funding);
  assert.equal(view.fundingEnvelope, f.seed.view.fundingEnvelope);
  assert.deepEqual(view.policy, f.seed.view.policy);
  assert.equal(view.meta[0].resource_url, FUNDING);
  assert.equal(view.epoch, epoch);
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

function assertApi(runner) {
  assert.deepEqual(Object.keys(runner), ['runOriginals', 'close', 'snapshot']);
  assert.ok(Object.isFrozen(runner));
  for (const name of Object.keys(runner)) {
    const descriptor = Object.getOwnPropertyDescriptor(runner, name);
    assert.equal(typeof descriptor.value, 'function');
    assert.ok(Object.isFrozen(descriptor.value));
    assert.equal(descriptor.writable, false);
    assert.equal(descriptor.configurable, false);
  }
}

function assertRedacted(snapshot, f) {
  for (const value of [
    snapshot, snapshot.resource, snapshot.close, snapshot.runner,
    snapshot.runner.limits, snapshot.runner.client,
    snapshot.runner.client.owner, snapshot.runner.client.owner.counts,
    snapshot.runner.client.owner.uncertainty,
  ]) assert.ok(Object.isFrozen(value));
  const client = snapshot.runner.client;
  if (client.lastTransport !== null) {
    assert.ok(Object.isFrozen(client.lastTransport));
    assert.ok(Object.isFrozen(client.lastTransport.counts));
  }
  const text = JSON.stringify(snapshot);
  assert.ok(text.length <= 8192);
  for (const value of [
    f.root, f.databasePath, FUNDING, SERVICE, PAYMENT_HASH, GRANT,
    'request.', 'declared-public-key', 'declared-signature',
    'ServiceCredit ', SECRET,
  ]) assert.equal(text.includes(value), false);
  assert.equal(snapshot.resource.ownership, 'OWNED_EXISTING_V2');
  assert.equal(snapshot.runner.storeOwnership, 'OWNED_EXISTING_V2');
  assert.equal(snapshot.qualification, 'UNQUALIFIED');
  for (const field of [
    'backend', 'actualPersistence', 'restart', 'currentAuthority', 'realReady',
    'serviceDelivery', 'osCleanup', 'pilot',
  ]) assert.equal(snapshot[field], 'NOT_ESTABLISHED');
}

function assertSafeError(error, f) {
  assert.ok(error instanceof TypeError);
  assert.equal(typeof error.code, 'string');
  assert.ok([RP, XP, CP, OP].some(prefix => error.code.startsWith(prefix)));
  assert.equal(error.message, error.code);
  assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.ok(Object.isFrozen(error));
  const text = JSON.stringify(error) + error.message + error.stack;
  for (const value of [
    f.root, f.databasePath, FUNDING, SERVICE, PAYMENT_HASH, GRANT,
    'request.', 'ServiceCredit ', SECRET,
  ]) assert.equal(text.includes(value), false);
  return true;
}

async function rejectRun(promise, f) {
  await assert.rejects(boundedWait(promise), error => {
    assert.equal(error.code, RP + 'RUN_FAILED');
    return assertSafeError(error, f);
  });
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
  // Observe pending OPEN outcomes before deciding what is actually owned.
  try {
    await boundedWait(Promise.all(
      acquisitions.map(entry => entry.outcomePromise).filter(value => value),
    ));
  } catch (error) { problems.push(error); }

  // Fence every returned root before forcing any exact owned transport handle.
  for (const entry of [...activeRoots]) {
    try { beginRootClose(entry); } catch (error) { problems.push(error); }
  }
  for (const f of fixtures) {
    for (const handle of f.handles) {
      try { force(handle); } catch (error) { problems.push(error); }
    }
    for (const waiter of f.waiters.values()) {
      waiter.reject(new Error('EXCHANGE_WAIT_INTERRUPTED'));
    }
  }
  for (const cancel of [...watchdogs]) {
    try { cancel(); } catch (error) { problems.push(error); }
  }
  try {
    const results = await boundedWait(Promise.allSettled(
      [...activeRoots].map(entry => finishRootClose(entry)),
    ));
    for (const result of results) {
      if (result.status === 'rejected') problems.push(result.reason);
    }
  } catch (error) { problems.push(error); }

  for (const [active, method] of [
    [activeProducers, STORE_CLOSE], [activeRaw, DATABASE_CLOSE],
  ]) {
    for (const entry of [...active]) {
      if (entry.closeAttempted || entry.handle === null) {
        problems.push(entry.failure ?? new Error('NATIVE_HANDLE_REMAINS_HOLD'));
        continue;
      }
      try { closeNativeEntry(entry, active, method); }
      catch (error) { problems.push(error); }
    }
  }

  try { await boundedWait(Promise.all(sinks.slice())); }
  catch (error) { problems.push(error); }
  for (const cancel of [...watchdogs]) {
    try { cancel(); } catch (error) { problems.push(error); }
  }
  for (const f of fixtures) {
    try {
      checkFiles(f);
      for (const handle of f.handles) assert.equal(handle.fixtureClosed, true);
      if (activeCount() === 0 && holdFailures.length === 0 && f.v2) {
        // Logical raw observation, including deliberately corrupt rows; no
        // repair/validation rewrite or production-store retry occurs here.
        assert.ok(readView(f).rows.length <= 8);
      }
    } catch (error) { problems.push(error); }
  }
  for (const entry of rootEntries) {
    try {
      const transport = entry.runner.snapshot().runner.client.lastTransport;
      if (transport !== null) assert.equal(transport.timerArmed, false);
    } catch (error) { problems.push(error); }
  }
  problems.push(...holdFailures);
  try {
    const taskNow = privateDirectory(scratch);
    const parentNow = privateDirectory(fixtureRoot);
    assert.equal(taskNow.dev, scratchIdentity.dev);
    assert.equal(taskNow.ino, scratchIdentity.ino);
    assert.equal(parentNow.dev, fixtureIdentity.dev);
    assert.equal(parentNow.ino, fixtureIdentity.ino);
    assert.deepEqual(readdirSync(fixtureRoot).sort(), fixtures.map(f =>
      f.root.slice(fixtureRoot.length + 1)).sort());
    assert.equal(pendingAcquisitions.size, 0, 'pending/unknown OPEN remains HOLD');
    assert.equal(activeRoots.size, 0, 'unknown owned DB remains HOLD');
    assert.equal(activeProducers.size, 0, 'unknown producer remains HOLD');
    assert.equal(activeRaw.size, 0, 'unknown raw DB remains HOLD');
    for (const entry of nativeEntries) {
      assert.equal(entry.closeAttempted, true);
      assert.equal(entry.closeReturned, true);
    }
    assert.equal(watchdogs.size, 0);
    assert.ok(fixtures.length <= MAX_ROOTS);
  } catch (error) { problems.push(error); }
  // All generated native paths/failures are retained for the approved manager.
  throwProblems(problems, 'SCENARIO_RESOURCE_OR_CLOSE_OUTCOME_UNKNOWN');
}

const scenarios = [
  [
    'actual V2 ordered completion for two and eight originals',
    async () => {
      assert.deepEqual(Object.keys(runnerModule), [
        'openServiceCreditCustodiedSqliteSequentialRunner',
      ]);
      for (const count of [2, 8]) {
        const f = fixture(count);
        seed(f);
        const entry = await openRoot(f);
        const values = Array.from({ length: count }, (_, index) =>
          submission('request.' + (index + 1), 7 + index));
        f.onRequest = exchange => {
          const index = f.exchanges.length - 1;
          const view = entry.runner.snapshot();
          const owner = view.runner.client.owner;
          assert.equal(owner.phase, 'DISPATCH_PENDING');
          assert.equal(owner.counts.loadReads, 2 * (index + 1));
          assert.equal(owner.counts.recordReads, 2 * (index + 1));
          assert.equal(owner.counts.retainCalls, index + 1);
          assert.equal(owner.counts.readbackConfirmations, index + 1);
          assert.equal(owner.counts.dispatchCalls, index + 1);
          assert.equal(owner.counts.callbackCompletions, index);
          assert.equal(view.runner.attempted, index + 1);
          assert.equal(view.runner.completed, index);
          assert.equal(view.resource.storeCloseAttempts, 0);
          for (const previous of f.exchanges.slice(0, -1)) {
            assert.equal(previous.request.fixtureClosed, true);
            assert.equal(previous.response.fixtureClosed, true);
          }
          assert.equal(exchange.resourceUrl, SERVICE);
          assert.deepEqual(exchange.options, {
            method: 'POST',
            headers: { Authorization: values[index].authorizationHeader },
            agent: false,
            rejectUnauthorized: true,
            maxHeaderSize: 16384,
            insecureHTTPParser: false,
          });
          assert.ok(Object.isFrozen(exchange.options));
          assert.ok(Object.isFrozen(exchange.options.headers));
          assertRedacted(view, f);
        };
        const operation = run(entry, values);
        assert.equal(entry.runner.runOriginals(values), operation);
        for (let index = 0; index < count; index++) {
          const exchange = await exchangeAt(f, index);
          assert.equal(exchange.request.endCalls, 1);
          assert.equal(exchange.request.writeCalls, 0);
          respond(exchange);
          goodEnd(exchange);
          await assertPending(operation);
          assert.equal(f.exchanges.length, index + 1);
          force(exchange.request);
          await assertPending(operation);
          assert.equal(f.exchanges.length, index + 1);
          assert.equal(entry.runner.snapshot().resource.storeCloseAttempts, 0);
          force(exchange.response);
        }
        assert.equal(await boundedWait(operation), undefined);
        assert.equal((await finishRootClose(entry)).ok, true);
        const view = entry.runner.snapshot();
        assert.equal(view.runner.phase, 'COMPLETED');
        assert.equal(view.runner.planned, count);
        assert.equal(view.runner.attempted, count);
        assert.equal(view.runner.completed, count);
        assert.equal(view.runner.queuedReferences, 0);
        assert.equal(view.runner.client.owner.trackedRequests, count);
        assert.equal(view.close.outcome, 'DRAINED');
        assert.equal(view.unknown, false);
        assert.equal(f.maxActive, 1);
        assertRedacted(view, f);
        assertView(f, values, 2); // CREATE_V2=1, actual owned open=2.
      }
    },
  ],
  [
    'async configuration existing-only and resource busy refusals',
    async () => {
      const empty = fixture();
      let touches = 0;
      const touch = () => { touches++; };
      const getter = () => { touch(); throw new Error(SECRET); };
      await expectRefusal(empty, [], RP + 'INVALID_CONFIGURATION');
      await expectRefusal(empty, [ownedOptions(empty), null],
        RP + 'INVALID_CONFIGURATION');
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
      const bad = [
        null, [], accessor,
        poisonProxy(ownedOptions(empty), touch),
        { ...ownedOptions(empty), extra: true },
        { ...ownedOptions(empty), testHooks: {} },
        { ...ownedOptions(empty), store: {} },
        ownedOptions(empty, { databasePath: primitive }),
        ownedOptions(empty, { databasePath: 'relative.sqlite' }),
        ownedOptions(empty, {
          databasePath: join(empty.root, 'nested', 'custody.sqlite'),
        }),
        ownedOptions(empty, { allowedRoot: primitive }),
        ownedOptions(empty, { selectedGrantId: 'bad://grant' }),
        ownedOptions(empty, { deadlineMs: 0 }),
        ownedOptions(empty, { deadlineMs: 60001 }),
        ownedOptions(empty, { deadlineMs: 1.5 }),
        ownedOptions(empty, { custodyPolicy: badPolicy }),
        ownedOptions(empty, { custodyPolicy: poisonProxy(policy(), touch) }),
        ownedOptions(empty, {
          requestImpl: poisonProxy(function () {}, touch),
        }),
      ];
      for (const configuration of bad) {
        await expectRefusal(empty, [configuration], RP + 'INVALID_CONFIGURATION');
        assert.deepEqual(readdirSync(empty.root), []);
      }
      assert.equal(touches, 0);
      await expectRefusal(empty, [ownedOptions(empty)], XP + 'ACQUISITION_FAILED');
      assert.deepEqual(readdirSync(empty.root), []);

      const v1 = fixture();
      withStore(v1, CREATE_V1, () => {}, { v1: true });
      const v1Before = databaseBytes(v1);
      await expectRefusal(v1, [ownedOptions(v1)], XP + 'ACQUISITION_FAILED');
      // V1 header refusal occurs before writable V2 acquisition.
      assert.deepEqual(databaseBytes(v1), v1Before);

      const firstFixture = fixture();
      const secondFixture = fixture();
      seed(firstFixture);
      seed(secondFixture);
      const pureBefore = databaseBytes(firstFixture);
      await expectRefusal(firstFixture, [
        ownedOptions(firstFixture, { selectedGrantId: 'bad://grant' }),
      ], RP + 'INVALID_CONFIGURATION');
      assert.deepEqual(databaseBytes(firstFixture), pureBefore);
      const logicalBefore = readView(firstFixture);
      await expectRefusal(firstFixture, [
        ownedOptions(firstFixture, { custodyPolicy: policy(3) }),
      ], XP + 'ACQUISITION_FAILED');
      assert.deepEqual(readView(firstFixture), logicalBefore);

      const secondBefore = databaseBytes(secondFixture);
      const first = await openRoot(firstFixture);
      assert.equal(first.runner.snapshot().runner.runClaimed, false);
      await expectRefusal(secondFixture, [ownedOptions(secondFixture)],
        XP + 'RESOURCE_BUSY');
      const closing = beginRootClose(first);
      assert.equal(first.runner.close(), closing);
      assert.equal(first.runner.snapshot().resource.phase, 'CLOSING');
      assert.equal(first.runner.snapshot().resource.storeCloseAttempts, 0);
      // Begin immediately, before awaiting a microtask that could finish close.
      const duringClose = beginAcquire(secondFixture, [ownedOptions(secondFixture)]);
      await assertRefusal(duringClose, XP + 'RESOURCE_BUSY');
      assert.equal((await finishRootClose(first)).ok, true);
      assert.deepEqual(databaseBytes(secondFixture), secondBefore);
      const second = await openRoot(secondFixture);
      assert.equal((await finishRootClose(second)).ok, true);
      for (const f of [firstFixture, secondFixture]) {
        assert.equal(f.calls.length, 0);
        assertView(f, [], 2);
      }
      assertRedacted(first.runner.snapshot(), firstFixture);
      assertRedacted(second.runner.snapshot(), secondFixture);
      assert.equal(fixtures.length, 4);
    },
  ],
  [
    'manual close fences queued work until captured dispatch drains',
    async () => {
      const f = fixture(3);
      seed(f);
      const entry = await openRoot(f);
      const values = [
        submission(), submission('request.two', 8), submission('request.three', 9),
      ];
      const operation = run(entry, values);
      const exchange = f.exchanges[0];
      respond(exchange);
      const closing = beginRootClose(entry);
      assert.equal(entry.runner.close(), closing);
      assert.equal(Object.getPrototypeOf(closing), Promise.prototype);
      let view = entry.runner.snapshot();
      assert.equal(view.runner.closed, true);
      assert.equal(view.runner.queuedReferences, 0);
      assert.equal(view.runner.closeCalls, 1);
      assert.equal(view.resource.admissionClosed, true);
      assert.equal(view.resource.phase, 'CLOSING');
      assert.equal(view.resource.storeCloseAttempts, 0);
      assert.equal(entry.runner.runOriginals(values), operation);
      await assert.rejects(run(entry, [submission('request.replacement')]), {
        code: RP + 'ALREADY_RUN',
      });
      goodEnd(exchange);
      force(exchange.request);
      await assertPending(closing);
      await assertPending(operation);
      assert.equal(entry.runner.snapshot().resource.storeCloseAttempts, 0);
      assert.equal(f.calls.length, 1);
      force(exchange.response);
      assert.equal((await finishRootClose(entry)).ok, true);
      await rejectRun(operation, f);
      assert.equal(entry.runner.close(), closing);
      view = entry.runner.snapshot();
      assert.equal(view.runner.failure, 'CLOSE_REQUESTED');
      assert.equal(view.runner.planned, 3);
      assert.equal(view.runner.attempted, 1);
      assert.equal(view.runner.completed, 1);
      assert.equal(view.runner.notAttempted, 2);
      assert.equal(view.runner.closeOutcome, 'FULFILLED');
      assert.equal(view.close.outcome, 'DRAINED');
      assert.equal(view.unknown, false);
      assertRedacted(view, f);
      assertView(f, [values[0]], 2);
    },
  ],
  [
    'first transport uncertainty survives positive owned db release',
    async () => {
      for (const mode of ['503', 'deadline', 'late-success']) {
        const f = fixture(3);
        seed(f);
        const entry = await openRoot(f, {
          deadlineMs: mode === 'deadline' ? 10 : 2000,
        }, true);
        const values = [
          submission(), submission('request.two', 8), submission('request.three', 9),
        ];
        const operation = run(entry, values);
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
        assert.equal(entry.runner.snapshot().resource.storeCloseAttempts, 0);
        exchange.response.statusCode = 200;
        goodEnd(exchange);
        assert.equal(
          entry.runner.snapshot().runner.client.lastTransport.replyValidated,
          false,
        );
        force(exchange.request);
        await assertPending(operation);
        assert.equal(f.calls.length, 1);
        force(exchange.response);
        await rejectRun(operation, f);
        const closing = beginRootClose(entry);
        await assert.rejects(boundedWait(closing), error => {
          assert.equal(error.code, XP + 'CHILD_OUTCOME_UNKNOWN');
          return assertSafeError(error, f);
        });
        assert.equal((await finishRootClose(entry)).ok, false);
        const view = entry.runner.snapshot();
        assert.equal(view.runner.attempted, 1);
        assert.equal(view.runner.completed, 0);
        assert.equal(view.runner.notAttempted, 2);
        assert.equal(view.runner.closeOutcome, 'REJECTED');
        assert.equal(view.close.childOutcome, 'REJECTED');
        assert.equal(view.close.childUncertainty, true);
        assert.equal(view.close.outcome, 'CHILD_UNKNOWN');
        assert.equal(view.resource.phase, 'RELEASED');
        assert.equal(view.resource.slotHeld, false);
        assert.equal(view.resource.storeCloseAttempts, 1);
        assert.equal(view.resource.storeCloseOutcome, 'RETURNED');
        assert.equal(view.unknown, true);
        assert.equal(view.unknownUndrained, false);
        assert.equal(view.runner.client.lastTransport.deadlineFired,
          mode === 'deadline');
        assert.equal(view.runner.client.lastTransport.timerArmed, false);
        assert.equal(entry.runner.close(), closing);
        assert.equal(entry.runner.runOriginals(values), operation);
        await assert.rejects(run(entry, [submission('request.replacement')]), {
          code: RP + 'ALREADY_RUN',
        });
        assert.equal(f.calls.length, 1);
        assertRedacted(view, f);
        assertView(f, [values[0]], 2);
      }
    },
  ],
  [
    'later semantic rejection preserves the first known original',
    async () => {
      for (const mode of ['original', 'authorization']) {
        const f = fixture(3);
        seed(f);
        const entry = await openRoot(f);
        const values = [
          submission(), submission('request.two', 8), submission('request.three', 9),
        ];
        if (mode === 'original') values[1].originalRequestJson = 'invalid-json';
        else values[1].authorizationHeader = 'ServiceCredit invalid_syntax';
        const operation = run(entry, values);
        complete(f.exchanges[0]);
        await rejectRun(operation, f);
        assert.equal((await finishRootClose(entry)).ok, true);
        const view = entry.runner.snapshot();
        assert.equal(view.runner.failure, 'ENTRY_REJECTED');
        assert.equal(view.runner.planned, 3);
        assert.equal(view.runner.attempted, 2);
        assert.equal(view.runner.completed, 1);
        assert.equal(view.runner.notAttempted, 1);
        assert.equal(view.runner.queuedReferences, 0);
        assert.equal(view.runner.client.owner.trackedRequests, 1);
        assert.equal(view.runner.client.owner.counts.retainCalls, 1);
        assert.equal(view.runner.client.owner.counts.dispatchCalls, 1);
        assert.equal(view.close.outcome, 'DRAINED');
        assert.equal(view.resource.storeCloseAttempts, 1);
        assert.equal(view.unknown, false);
        assert.equal(f.calls.length, 1);
        assertRedacted(view, f);
        assertView(f, [values[0]], 2);
      }
    },
  ],
  [
    'same-process reopen recovers without replay or conflict replacement',
    async () => {
      const f = fixture(2);
      seed(f);
      const value = submission();
      const first = await openRoot(f);
      const operation = run(first, [value]);
      complete(f.exchanges[0]);
      assert.equal(await boundedWait(operation), undefined);
      assert.equal((await finishRootClose(first)).ok, true);
      const originalView = assertView(f, [value], 2);
      const originalEnvelope = originalView.rows[0].envelope;
      withStore(f, OPEN_V2, store => {
        assert.deepEqual(store.load(), f.seed.funding);
        const recovered = store.getOriginalRequest(key(value));
        assertOriginal(recovered, value);
        assert.equal(SERIALIZE(recovered), originalEnvelope);
      });
      assertView(f, [value], 3);

      for (const mode of ['replay', 'conflict']) {
        const entry = await openRoot(f);
        const firstValue = mode === 'replay' ? value : submission('request.one', 8);
        const batch = [firstValue, submission('request.later', 9)];
        assert.equal(entry.runner.snapshot().runner.client.lastTransport, null);
        const refused = run(entry, batch);
        await rejectRun(refused, f);
        assert.equal((await finishRootClose(entry)).ok, true);
        const view = entry.runner.snapshot();
        assert.equal(view.runner.attempted, 1);
        assert.equal(view.runner.completed, 0);
        assert.equal(view.runner.notAttempted, 1);
        assert.equal(view.runner.failure, 'ENTRY_REJECTED');
        assert.equal(view.runner.client.lastTransport, null);
        assert.equal(view.runner.client.owner.counts.dispatchCalls, 0);
        assert.equal(view.runner.client.owner.counts.retainCalls, 0);
        assert.equal(view.close.outcome, 'DRAINED');
        assert.equal(f.calls.length, 1);
        if (mode === 'replay') {
          assert.equal(view.runner.client.owner.phase, 'RECOVERY_REQUIRED');
        }
        const rows = assertView(f, [value], mode === 'replay' ? 4 : 5);
        assert.equal(rows.rows[0].envelope, originalEnvelope);
        assertRedacted(view, f);
      }
      // Every actual writable store open advances epoch. No whole-file
      // equality, process-restart, durability or recovered-authority claim.
      assert.equal(f.calls.length, 1);
    },
  ],
  [
    'prepared funding blocks submission and preserves declared originals',
    async () => {
      for (const retained of [false, true]) {
        const f = fixture(2);
        const value = submission();
        seed(f, { bound: false, originals: retained ? [value] : [] });
        const entry = await openRoot(f);
        const operation = run(entry, [value, submission('request.later', 8)]);
        await rejectRun(operation, f);
        assert.equal((await finishRootClose(entry)).ok, true);
        const view = entry.runner.snapshot();
        assert.equal(view.runner.failure, 'ENTRY_REJECTED');
        assert.equal(view.runner.attempted, 1);
        assert.equal(view.runner.completed, 0);
        assert.equal(view.runner.notAttempted, 1);
        assert.equal(view.runner.client.lastTransport, null);
        assert.equal(view.runner.client.owner.counts.dispatchCalls, 0);
        assert.equal(view.runner.client.owner.counts.retainCalls, 0);
        assert.equal(view.close.outcome, 'DRAINED');
        assert.equal(view.unknown, false);
        assert.equal(f.calls.length, 0);
        assert.equal(f.seed.funding.status, 'PREPARED');
        assertView(f, retained ? [value] : [], 2);
        assertRedacted(view, f);
      }
    },
  ],
  [
    'new synthetic schema and custody corruption refuse without repair',
    async () => {
      for (const mode of ['schema', 'custody-envelope']) {
        const f = fixture(2);
        const value = submission();
        seed(f, { originals: mode === 'custody-envelope' ? [value] : [] });
        withDatabase(f, false, database => {
          // One bounded mutation of this NEW synthetic CLOSED fixture.
          if (mode === 'schema') {
            database.exec('CREATE TABLE draft_schema_extra(marker INTEGER) STRICT');
          } else {
            const changed = database.prepare(
              'UPDATE original_service_requests SET envelope=? WHERE grant_id=? AND request_id=?',
            ).run('{"draftCorruption":true}', value.grantId, value.requestId);
            assert.equal(changed.changes, 1);
          }
        });
        const corruptBefore = readView(f);
        assert.equal(corruptBefore.epoch, 1);
        // Pinned store validation emits SCHEMA_UNSUPPORTED or CORRUPT before
        // epoch increment, with transaction rollback. The actual owned client
        // maps these releasable refusals to ACQUISITION_FAILED. Its public
        // error does not expose the lower store code. Only ONE owned attempt
        // per corrupt fixture: no direct-store retry, repair or replacement.
        await expectRefusal(f, [ownedOptions(f)], XP + 'ACQUISITION_FAILED');
        assert.deepEqual(readView(f), corruptBefore);
        assert.equal(f.calls.length, 0);
      }
      // A separate fresh healthy fixture observes slot release without resetting
      // a module/global slot or revisiting either corrupt fixture.
      const healthy = fixture(2);
      seed(healthy);
      const entry = await openRoot(healthy);
      assert.equal((await finishRootClose(entry)).ok, true);
      assertView(healthy, [], 2);
      assertRedacted(entry.runner.snapshot(), healthy);
      assert.equal(healthy.calls.length, 0);
      assert.equal(fixtures.length, 3);
    },
  ],
];

assert.equal(scenarios.length, 8);
const [name, scenario] = scenarios[Number(selector) - 1];
// Exactly one registration/process; no default-all, skips or child launcher.
test(name, { timeout: 10000 }, async t => {
  t.after(cleanup);
  await scenario();
});
