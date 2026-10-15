import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  setImmediate as immediate,
  setTimeout as nativeSetTimeout,
  clearTimeout as nativeClearTimeout,
} from 'node:timers';

// Declared borrowed-runner component checks; completion is callback-only.
// Pristine native intrinsics are premises. No production implementation changes.
assert.equal(process.versions.node, '24.19.0', 'EXACT_NODE_VERSION_REQUIRED');
assert.equal(process.argv.length, 2, 'ONE_FILE_PROCESS_REQUIRED');
const mode = process.env.SPV_CUSTODY_RUNNER_LATE_RETAIN_REJECTION_PARENT_CONTROL;
if (mode !== undefined && mode !== '1') throw new Error('INVALID_PARENT_CONTROL');
const parent = mode === '1';
const pins = [
  ['../src/service-credit-custodied-sequential-runner.js', 3487, 80,
    'ab38aae9afadc37a1aa53adc691b7e3fcef61e996b168802d8692bf0b9796977'],
  ['../src/service-credit-custodied-sequential-runner-core.js', 15208, 478,
    '07b73745c1a85e049ea374f1fd054b75dba9c0cd46d64adf4cfe4d266c4bc5f1'],
  ['../src/service-credit-custodied-http-client.js', 9815, 274,
    '757c7d472410676b61baf2a3cda73e493a26ca6343d4e4c0a2c3af1a9e6abb9c'],
  ['../src/service-credit-custodied-request-owner.js',
    parent ? 22239 : 22965, parent ? 616 : 635,
    parent ? 'fa8d8dbb34363140a4f087c2200cdcfd850d9be09ffcf939e576c08228e19e96'
      : '4dabb9c49179e9d6533f5c3066faf730fa6d7deb3c4407d132841c1de4183f85'],
  ['../src/service-credit-original-request-custody-contract.js', 9810, 272,
    '8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083'],
  ['../src/service-credit-http-execute-dispatch.js', 27034, 770,
    '254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b'],
  ['../src/x402-wire.js', 39886, 934,
    '5fba91af5a352f62d1a335c7176a45a604e2af5d92b1c4b0e53825c1f20d4e56'],
  ['../package.json', 1413, 40,
    '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
];
const guarded = pins.map(([relative, bytes, LF, sha256]) => {
  const url = new URL(relative, import.meta.url);
  const raw = readFileSync(url);
  assert.equal(raw.length, bytes, 'SOURCE_BYTES');
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha256, 'SOURCE_SHA256');
  const text = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(text), false);
  assert.equal(text.includes('\0'), false);
  assert.equal(text.split('\n').length - 1, LF);
  assert.ok(text.endsWith('\n'));
  return Object.freeze({ url: url.href, text });
});
const pkg = JSON.parse(guarded[7].text);
assert.equal(pkg.type, 'module');
assert.equal(pkg.engines.node, '>=24');
// All six runtime sources and package are guarded before repository imports.
// x402-wire is DATA ONLY. Neither existing test unit is imported or selected.
const {
  createServiceCreditCustodiedSequentialRunner: CREATE,
} = await import(guarded[0].url);
const {
  captureOriginalServiceRequestCustody: CAPTURE,
  serializeOriginalServiceRequestCustody: SERIALIZE,
  parseOriginalServiceRequestCustody: PARSE,
} = await import(guarded[4].url);

const P = Promise, THEN = P.prototype.then, REJECT = P.reject, APPLY = Reflect.apply;
const QUEUE_MICROTASK = queueMicrotask;
const RP = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const SERVICE = 'https://synthetic.invalid/service-credit/v1/execute';
const FUNDING = 'https://synthetic.invalid/credit';
const GRANT = 'grant.selected';
const HASH = 'a'.repeat(64);
const NETWORK = 'zenon:synthetic';
const EMPTY_DIGEST =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const REPLY = Buffer.from('{"ok":true,"resultCode":"accepted"}', 'utf8');
const MARKER_TAG = 'DECLARED_LATE_RETAIN_REJECTION_ONLY';
const sha = value => createHash('sha256').update(value).digest('hex');
const turn = () => new P(resolve => immediate(resolve));
async function turns(count) {
  for (let index = 0; index < count; index++) await turn();
}

function inputFor(requestId = 'request.one', cost = 1, grantId = GRANT) {
  const originalRequestJson = JSON.stringify({
    modelVersion: 1,
    grantId,
    requestId,
    method: 'POST',
    routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: EMPTY_DIGEST,
    selectedContentType: 'application/json',
    maxCostUnits: cost,
  });
  // Declared metadata strings only. No keys, signature or proof operation.
  const proof = JSON.stringify({
    grantId,
    maxCostUnits: cost,
    proofVersion: 1,
    publicKey: 'declared-public-key',
    requestId,
    signature: 'declared-signature-' + requestId,
  });
  return {
    grantId,
    requestId,
    originalRequestJson,
    originalBodyBase64: '',
    serviceResourceUrl: SERVICE,
    authorizationHeader: 'ServiceCredit '
      + Buffer.from(proof, 'utf8').toString('base64url'),
  };
}

function keyFor(value = inputFor()) {
  return { grantId: value.grantId, requestId: value.requestId };
}

function funding() {
  const requirement = {
    scheme: 'exact',
    network: NETWORK,
    asset: 'synthetic:asset',
    amount: '17',
    payTo: 'synthetic-payee',
    maxTimeoutSeconds: 60,
    extra: { opaque: 'original-requirement-extra' },
  };
  return {
    revision: 1,
    status: 'BOUND',
    ambiguityLatched: false,
    resourceUrl: FUNDING,
    challengeHeader: 'opaque-original-challenge',
    paymentHeader: 'opaque-original-payment-header',
    paymentRequired: { opaque: 'original-payment-required' },
    paymentPayload: {
      x402Version: 2,
      resource: { url: FUNDING, description: 'declared', mimeType: 'application/json' },
      accepted: requirement,
      payload: {
        transaction: { hash: HASH, bytes: 'opaque-original-signed-block-data' },
        intentDigest: 'opaque-original-intent',
      },
      extensions: { opaque: 'original-extension' },
    },
    requirement,
  };
}

function custodyFor(value, state) {
  return CAPTURE({
    originalRequestJson: value.originalRequestJson,
    originalBodyBase64: value.originalBodyBase64,
    serviceResourceUrl: value.serviceResourceUrl,
  }, {
    fundingResourceUrl: state.resourceUrl,
    paymentHash: state.paymentPayload.payload.transaction.hash,
    network: state.requirement.network,
  });
}

function slot(key) {
  return JSON.stringify([key.grantId, key.requestId]);
}

// Synchronous structural fixture. Only the second retain RETURN is async.
// Actual pure exports form/check records; the actual owner enforces its fence.
class DeclaredStore {
  #control;
  #rows = new Map();
  constructor(control) { this.#control = control; }
  #note(method, args) {
    const c = this.#control;
    c.counts[method]++;
    const entry = {
      method, receiver: this, args,
      descriptors: args.map(value => Object.getOwnPropertyDescriptors(value)),
    };
    c.log.push(entry);
    return entry;
  }
  load(...args) {
    const entry = this.#note('load', args);
    entry.returned = this.#control.state;
    return entry.returned;
  }
  getOriginalRequest(...args) {
    const entry = this.#note('get', args);
    const text = this.#rows.get(slot(args[0]));
    entry.returned = text === undefined ? null : PARSE(text);
    return entry.returned;
  }
  retainOriginalRequest(...args) {
    const entry = this.#note('retain', args);
    const c = this.#control;
    if (c.counts.retain === 2) {
      // Runner entryCompleted has already counted the first callback. Capture
      // its actual counters and retained bytes BEFORE the second Map write.
      const firstText = this.#rows.get(slot(c.batch[0]));
      const firstRecord = PARSE(firstText);
      c.beforeSecondWrite = {
        snapshot: c.runner.snapshot(),
        rows: [...this.#rows.entries()],
        firstText,
        firstBytes: Buffer.from(firstText, 'utf8'),
        firstOriginalBytes: Buffer.from(firstRecord.originalRequestJson, 'utf8'),
        firstChecksum: firstRecord.checksum,
        log: c.log.map(value => value.method),
        fundingText: JSON.stringify(c.state),
      };
    }
    const record = custodyFor(args[0], c.state);
    const text = SERIALIZE(record);
    this.#rows.set(slot(record), text);
    c.writes.push([slot(record), text]);
    if (c.counts.retain === 2) {
      c.rowsAtRawCreation = [...this.#rows.entries()];
      entry.returned = c.makeRejected();
    } else {
      entry.returned = PARSE(text);
    }
    return entry.returned;
  }
  row(value) { return this.#rows.get(slot(value)) ?? null; }
  rows() { return [...this.#rows.entries()]; }
  close() { this.#control.closeCalls++; }
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
  #destroyed = false;

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
    this.#destroyed = true;
    this.#resolveDestroy(true);
    return this;
  }

  settleOwnedSignals() {
    // Cleanup settles even unused fixture signals without inventing destroy.
    this.#resolveDestroy(this.#destroyed);
  }
}
const SETTLE_SIGNALS = OwnedHandle.prototype.settleOwnedSignals;

class FakeRequest extends OwnedHandle {
  constructor() {
    super();
    this.endCalls = 0;
    this.writeCalls = 0;
  }

  end(...args) {
    assert.equal(args.length, 0, 'bodyless end receives zero arguments');
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

// Expected data shapes are assertions, never substitute runtime components.
function expectedOwner(stage) {
  const initial = stage === 'initial', first = stage === 'first';
  const terminal = stage === 'terminal';
  const counts = initial ? [0, 0, 0, 0, 0, 0]
    : first ? [2, 2, 1, 1, 1, 0] : [3, 3, 2, 1, 1, 1];
  return {
    phase: initial ? 'IDLE' : first ? 'DISPATCH_PENDING'
      : terminal ? 'CUSTODY_OUTCOME_UNKNOWN' : 'PERSISTING',
    closed: terminal, active: first || stage === 'boundary',
    grantScoped: true, trackedRequests: initial ? 0 : first ? 1 : 2,
    maxRequests: 3,
    drainStatus: initial ? 'NONE' : first ? 'PENDING' : 'OBSERVED',
    closeOutcome: terminal ? 'UNKNOWN' : 'NOT_REQUESTED',
    counts: {
      loadReads: counts[0], recordReads: counts[1], retainCalls: counts[2],
      readbackConfirmations: counts[3], dispatchCalls: counts[4],
      callbackCompletions: counts[5],
    },
    uncertainty: {
      custody: terminal, submission: false, undrained: false,
      declaredFundingAmbiguitySeen: false,
    },
    qualification: 'DECLARED_CALLBACK_LIFECYCLE_ONLY',
    serviceOutcome: 'NOT_ESTABLISHED', durability: 'NOT_ESTABLISHED',
    recoveryAuthority: 'NONE',
  };
}
function expectedTransport(completed) {
  return {
    phase: completed ? 'INTERFACE_COMPLETED' : 'ACTIVE',
    used: true, settled: completed, unknown: false, undrained: false,
    deadlineFired: false, timerArmed: !completed,
    credentialReferenceReleased: true, requestObserved: true,
    responseObserved: completed, requestClosed: completed,
    responseEnded: completed, responseClosed: completed,
    responseComplete: completed, replyValidated: completed,
    duplicateResponseCallback: false, lateEventSeen: false,
    counts: {
      requestCalls: 1, responseHandles: completed ? 1 : 0,
      listenerRegistrations: completed ? 7 : 2, endCalls: 1,
      destroyCalls: 0, dataChunks: completed ? 1 : 0,
      bodyBytes: completed ? REPLY.length : 0, settlements: completed ? 1 : 0,
    },
    qualification: 'SYNTHETIC_INTERFACE_ONLY',
    serviceDelivery: 'NOT_ESTABLISHED', realReady: 'NOT_ESTABLISHED',
    restart: 'NOT_ESTABLISHED', durability: 'NOT_ESTABLISHED',
  };
}
function expectedSnapshot(stage) {
  const initial = stage === 'initial', first = stage === 'first';
  const terminal = stage === 'terminal';
  return {
    phase: initial ? 'IDLE' : terminal ? 'FAILED' : 'RUNNING',
    outcome: initial ? 'NOT_RUN' : terminal ? 'RUN_FAILED' : 'PENDING',
    failure: terminal ? 'ENTRY_REJECTED' : 'NONE',
    closed: terminal, active: first || stage === 'boundary',
    runClaimed: !initial, runSettled: terminal,
    planned: initial ? 0 : 3,
    attempted: initial ? 0 : first ? 1 : 2,
    completed: initial || first ? 0 : 1,
    notAttempted: initial ? 0 : first ? 2 : 1,
    queuedReferences: initial || terminal ? 0 : first ? 2 : 1,
    closeCalls: terminal ? 1 : 0,
    closeOutcome: terminal ? 'REJECTED' : 'NOT_REQUESTED',
    unknown: terminal, unknownUndrained: false,
    limits: {
      maxOriginals: 8, maxRequestJsonUtf8Bytes: 4096,
      maxAuthorizationUtf8Bytes: 1024, maxUrlUtf8Bytes: 4096,
      maxBodyUtf8Bytes: 0, maxBatchStringUtf8Bytes: 75776,
    },
    client: {
      owner: expectedOwner(stage),
      lastTransport: initial ? null : expectedTransport(!first),
      storeOwnership: 'BORROWED', boundEstablishesAuthority: false,
      qualification: 'SYNTHETIC_COMPOSITION_ONLY',
      serviceDelivery: 'NOT_ESTABLISHED', currentAuthority: 'NOT_ESTABLISHED',
      realReady: 'NOT_ESTABLISHED', durability: 'NOT_ESTABLISHED',
      restart: 'NOT_ESTABLISHED', pilot: 'NOT_ESTABLISHED',
    },
    storeOwnership: 'BORROWED',
    qualification: 'SYNTHETIC_SEQUENTIAL_INTERFACE_ONLY',
    serviceDelivery: 'NOT_ESTABLISHED', currentAuthority: 'NOT_ESTABLISHED',
    realReady: 'NOT_ESTABLISHED', durability: 'NOT_ESTABLISHED',
    restart: 'NOT_ESTABLISHED', osCleanup: 'NOT_ESTABLISHED',
  };
}
function frozenTree(value) {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) frozenTree(child);
}
function redacted(value, batch) {
  const text = JSON.stringify(value);
  for (const secret of [
    SERVICE, FUNDING, GRANT, HASH, NETWORK, MARKER_TAG,
    'opaque-original', 'ServiceCredit ', 'declared-public-key',
    'declared-signature', 'request.one', 'request.two', 'request.three',
    ...batch.flatMap(item => [item.originalRequestJson, item.authorizationHeader]),
  ]) assert.equal(text.includes(secret), false, 'REDACTED_COMPONENT_RESULT');
}
function expectSnapshot(snapshot, stage, batch) {
  assert.deepEqual(snapshot, expectedSnapshot(stage));
  frozenTree(snapshot);
  redacted(snapshot, batch);
  assert.ok(JSON.stringify(snapshot).length <= 6144);
}
function expectError(error, code, batch) {
  assert.ok(error instanceof TypeError);
  assert.equal(Object.getPrototypeOf(error), TypeError.prototype);
  assert.equal(error.name, 'TypeError');
  assert.equal(error.code, code);
  assert.equal(error.message, code);
  assert.equal(error.stack, 'TypeError: ' + code);
  assert.ok(Object.isFrozen(error));
  assert.equal(Object.hasOwn(error, 'cause'), false);
  assert.deepEqual(Reflect.ownKeys(error).sort(), ['code', 'message', 'stack']);
  for (const field of ['code', 'message', 'stack']) {
    const descriptor = Object.getOwnPropertyDescriptor(error, field);
    assert.equal(Object.hasOwn(descriptor, 'value'), true);
    assert.equal(descriptor.writable, false);
    assert.equal(descriptor.configurable, false);
  }
  redacted(error, batch);
}
function rememberData(...roots) {
  const seen = new Set(), result = [];
  function visit(value) {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== Array.prototype) return;
    seen.add(value);
    const own = Object.getOwnPropertyDescriptors(value);
    result.push({ value, prototype, own });
    for (const descriptor of Object.values(own)) {
      if (Object.hasOwn(descriptor, 'value')) visit(descriptor.value);
    }
  }
  for (const root of roots) visit(root);
  return result;
}
function unchangedData(saved) {
  for (const item of saved) {
    assert.equal(Object.getPrototypeOf(item.value), item.prototype);
    assert.deepEqual(Object.getOwnPropertyDescriptors(item.value), item.own);
  }
}

function fixture(timing) {
  const batch = Object.freeze([
    Object.freeze(inputFor()),
    Object.freeze(inputFor('request.two', 2)),
    Object.freeze(inputFor('request.three', 3)),
  ]);
  const policy = Object.freeze({
    policyVersion: 1, maxRequests: 3, serviceResourceUrl: SERVICE,
  });
  const owned = new Map(), events = [], observed = new Map(), results = new Map();
  const marker = Object.freeze({ tag: MARKER_TAG });
  const c = {
    batch, state: funding(), runner: null, log: [], writes: [],
    counts: { load: 0, get: 0, retain: 0 }, closeCalls: 0, rawMade: 0,
    beforeSecondWrite: null, rowsAtRawCreation: null,
    makeRejected() {
      const entry = { settled: timing === 'immediate', own: null };
      let promise;
      if (timing === 'immediate') {
        promise = APPLY(REJECT, P, [marker]);
      } else {
        promise = new P((_resolve, reject) => {
          QUEUE_MICROTASK(() => {
            entry.settled = true;
            reject(marker);
          });
        });
      }
      entry.own = Object.getOwnPropertyDescriptors(promise);
      owned.set(promise, entry);
      c.rawMade++;
      return promise;
    },
  };
  const store = new DeclaredStore(c);
  const f = {
    c, batch, policy, owned, events, results, store,
    runner: null, operation: null, calls: [], handles: [], lifecycle: [],
    watchdogs: new Set(), responseCallbacks: 0, maxActive: 0,
    observe(promise) {
      assert.equal(owned.has(promise), false, 'RAW_STORE_PROMISE_SINK_FORBIDDEN');
      assert.equal(Object.getPrototypeOf(promise), P.prototype);
      if (observed.has(promise)) return observed.get(promise);
      const sink = APPLY(THEN, promise, [
        value => {
          const result = { ok: true, value };
          results.set(promise, result);
          return result;
        },
        error => {
          const result = { ok: false, error };
          results.set(promise, result);
          return result;
        },
      ]);
      observed.set(promise, sink);
      this.lifecycle.push(sink);
      return sink;
    },
    wait(promise) {
      assert.equal(owned.has(promise), false, 'RAW_STORE_PROMISE_WAIT_FORBIDDEN');
      return new P((resolve, reject) => {
        let done = false, timer;
        const finish = (ok, value) => {
          if (done) return;
          done = true;
          nativeClearTimeout(timer);
          this.watchdogs.delete(cancel);
          if (ok) resolve(value);
          else reject(value);
        };
        const cancel = () => finish(false, new Error('OWNED_WAIT_CANCELLED'));
        timer = nativeSetTimeout(() => {
          finish(false, new Error('OWNED_WAIT_TIMEOUT'));
        }, 1000);
        this.watchdogs.add(cancel);
        APPLY(THEN, promise, [
          value => { finish(true, value); },
          error => { finish(false, error); },
        ]);
      });
    },
    emit(handle, event, ...args) { APPLY(EMIT, handle, [event, ...args]); },
    force(handle) { APPLY(FORCE_CLOSE, handle, []); },
  };
  f.requestImpl = function (url, options, callback) {
    const open = f.calls.filter(call =>
      !call.request.fixtureClosed || !call.response.fixtureClosed).length;
    f.maxActive = Math.max(f.maxActive, open + 1);
    const request = new FakeRequest(), response = new FakeResponse();
    const call = {
      receiver: this, argc: arguments.length, url, options, callback,
      request, response,
      rowsAtRequest: store.rows(),
      snapshotAtRequest: c.runner.snapshot(),
    };
    f.calls.push(call);
    f.handles.push(request, response);
    return request;
  };
  f.config = Object.freeze({
    store, fundingResourceUrl: FUNDING, custodyPolicy: policy,
    selectedGrantId: GRANT, requestImpl: f.requestImpl, deadlineMs: 2000,
  });
  f.savedData = rememberData(c.state, batch, policy, f.config);
  f.fundingText = JSON.stringify(c.state);
  f.fundingSHA = sha(f.fundingText);
  f.batchText = JSON.stringify(batch);
  f.storeOwn = Object.getOwnPropertyDescriptors(store);
  f.storePrototypeOwn = Object.getOwnPropertyDescriptors(DeclaredStore.prototype);
  f.canonical = batch.map(value => SERIALIZE(custodyFor(value, c.state)));
  return f;
}
function assertRecords(f, count) {
  const expected = f.batch.slice(0, count).map((value, index) =>
    [slot(value), f.canonical[index]]);
  assert.deepEqual(f.store.rows(), expected);
  assert.deepEqual(f.c.writes, expected);
  for (let index = 0; index < count; index++) {
    const text = f.store.row(f.batch[index]);
    const record = PARSE(text);
    const expectedRecord = PARSE(f.canonical[index]);
    assert.deepEqual(record, expectedRecord);
    assert.equal(text, f.canonical[index]);
    assert.equal(sha(text), sha(f.canonical[index]));
    assert.equal(SERIALIZE(record), text);
    assert.equal(record.checksum, expectedRecord.checksum);
    assert.equal(record.originalRequestJson, f.batch[index].originalRequestJson);
    assert.deepEqual(Buffer.from(record.originalRequestJson, 'utf8'),
      Buffer.from(f.batch[index].originalRequestJson, 'utf8'));
    assert.equal(record.originalBodyBase64, '');
    assert.equal(record.serviceResourceUrl, SERVICE);
    assert.equal(record.fundingResourceUrl, FUNDING);
    assert.equal(record.paymentHash, HASH);
    assert.equal(record.network, NETWORK);
    assert.equal(record.grantId, GRANT);
    assert.equal(record.requestId, f.batch[index].requestId);
    assert.equal(text.includes('ServiceCredit '), false);
    assert.equal(text.includes('declared-signature'), false);
    assert.equal(text.includes('opaque-original'), false);
  }
  for (let index = count; index < f.batch.length; index++) {
    assert.equal(f.store.row(f.batch[index]), null);
  }
}
function assertUnchanged(f) {
  unchangedData(f.savedData);
  assert.equal(JSON.stringify(f.c.state), f.fundingText);
  assert.equal(sha(JSON.stringify(f.c.state)), f.fundingSHA);
  assert.equal(JSON.stringify(f.batch), f.batchText);
  assert.deepEqual(Object.getOwnPropertyDescriptors(f.store), f.storeOwn);
  assert.deepEqual(Object.getOwnPropertyDescriptors(DeclaredStore.prototype),
    f.storePrototypeOwn);
  assert.equal(Object.getPrototypeOf(f.store), DeclaredStore.prototype);
  assert.equal(f.c.state.paymentPayload.accepted, f.c.state.requirement);
  assert.equal(f.c.state.paymentPayload.payload.transaction.hash, HASH);
  assert.equal(f.c.state.requirement.network, NETWORK);
  assert.equal(f.c.state.status, 'BOUND');
  assert.equal(f.c.state.ambiguityLatched, false);
  assert.equal(f.c.closeCalls, 0);
}
function assertCall(f) {
  assert.equal(f.calls.length, 1);
  const call = f.calls[0];
  assert.equal(call.receiver, undefined);
  assert.equal(call.argc, 3);
  assert.equal(typeof call.callback, 'function');
  assert.equal(call.url, SERVICE);
  assert.deepEqual(call.options, {
    method: 'POST',
    headers: { Authorization: f.batch[0].authorizationHeader },
    agent: false, rejectUnauthorized: true, maxHeaderSize: 16384,
    insecureHTTPParser: false,
  });
  assert.ok(Object.isFrozen(call.options));
  assert.ok(Object.isFrozen(call.options.headers));
  assert.deepEqual(Reflect.ownKeys(call.options.headers), ['Authorization']);
  assert.equal(call.request.endCalls, 1);
  assert.equal(call.request.writeCalls, 0);
  assert.equal(call.request.destroyCalls, 0);
  assert.equal(call.response.destroyCalls, 0);
  assert.equal(f.maxActive, 1);
  assert.equal(call.snapshotAtRequest.attempted, 1);
  assert.equal(call.snapshotAtRequest.completed, 0);
  assert.deepEqual(call.snapshotAtRequest.client.owner.counts, {
    loadReads: 2, recordReads: 2, retainCalls: 1,
    readbackConfirmations: 1, dispatchCalls: 1, callbackCompletions: 0,
  });
  assert.deepEqual(call.rowsAtRequest, [[slot(f.batch[0]), f.canonical[0]]]);
}
function assertTerminal(f) {
  expectSnapshot(f.runner.snapshot(), 'terminal', f.batch);
  assert.deepEqual(f.c.counts, { load: 3, get: 3, retain: 2 });
  assert.deepEqual(f.c.log.map(entry => entry.method),
    ['load', 'get', 'retain', 'get', 'load', 'load', 'get', 'retain']);
  for (const entry of f.c.log) {
    assert.equal(entry.receiver, f.store);
    assert.equal(entry.args.length, entry.method === 'load' ? 0 : 1);
    if (entry.args.length) {
      const argument = entry.args[0];
      assert.equal(Object.getPrototypeOf(argument), Object.prototype);
      assert.equal(argument.grantId, GRANT);
      assert.equal(Object.hasOwn(argument, 'authorizationHeader'), false);
      assert.deepEqual(Object.getOwnPropertyDescriptors(argument), entry.descriptors[0]);
    }
  }
  assert.deepEqual(f.c.log.filter(entry => entry.method === 'get')
    .map(entry => entry.args[0]),
    [keyFor(f.batch[0]), keyFor(f.batch[0]), keyFor(f.batch[1])]);
  const retained = f.c.log.filter(entry => entry.method === 'retain');
  assert.equal(retained.length, 2);
  for (let index = 0; index < 2; index++) {
    const value = f.batch[index];
    assert.deepEqual(retained[index].args[0], {
      grantId: value.grantId, requestId: value.requestId,
      originalRequestJson: value.originalRequestJson,
      originalBodyBase64: '', serviceResourceUrl: SERVICE,
    });
  }
  assert.equal(f.c.rawMade, 1);
  assert.equal(f.owned.size, 1);
  assert.equal(f.owned.has(retained[1].returned), true);
  assert.equal(f.owned.has(retained[0].returned), false);
  for (const [promise, entry] of f.owned) {
    assert.equal(Object.getPrototypeOf(promise), P.prototype);
    assert.equal(Object.getOwnPropertyDescriptor(promise, 'constructor'), undefined);
    assert.deepEqual(Object.getOwnPropertyDescriptors(promise), entry.own);
  }
  const boundary = f.c.beforeSecondWrite;
  assert.ok(boundary);
  expectSnapshot(boundary.snapshot, 'boundary', f.batch);
  assert.deepEqual(boundary.rows, [[slot(f.batch[0]), f.canonical[0]]]);
  assert.deepEqual(boundary.log,
    ['load', 'get', 'retain', 'get', 'load', 'load', 'get', 'retain']);
  assert.equal(boundary.fundingText, f.fundingText);
  assert.equal(boundary.firstText, f.canonical[0]);
  assert.deepEqual(boundary.firstBytes, Buffer.from(f.canonical[0], 'utf8'));
  assert.equal(sha(boundary.firstBytes), sha(f.canonical[0]));
  assert.deepEqual(boundary.firstOriginalBytes,
    Buffer.from(f.batch[0].originalRequestJson, 'utf8'));
  assert.equal(boundary.firstChecksum, PARSE(f.canonical[0]).checksum);
  assert.deepEqual(f.c.rowsAtRawCreation, [
    [slot(f.batch[0]), f.canonical[0]], [slot(f.batch[1]), f.canonical[1]],
  ]);
  assertRecords(f, 2);
  assertCall(f);
  assert.equal(f.responseCallbacks, 1);
  assert.equal(f.handles.length, 2);
  assert.ok(f.calls[0].request.fixtureClosed);
  assert.ok(f.calls[0].response.fixtureClosed);
  assertUnchanged(f);
}

async function runCase(timing) {
  const f = fixture(timing), failures = [];
  function onUnhandled(_reason, promise) {
    // Exact owned native Promise identity only; never inspect rejection text.
    if (f.owned.has(promise)) f.events.push(promise);
  }
  process.on('unhandledRejection', onUnhandled);
  try {
    f.runner = CREATE(f.config);
    f.c.runner = f.runner;
    assert.ok(Object.isFrozen(f.runner));
    assert.deepEqual(Reflect.ownKeys(f.runner), ['runOriginals', 'snapshot', 'close']);
    for (const fn of Object.values(f.runner)) assert.ok(Object.isFrozen(fn));
    expectSnapshot(f.runner.snapshot(), 'initial', f.batch);
    assert.deepEqual(f.c.log, []);
    assert.deepEqual(f.store.rows(), []);

    const operation = f.runner.runOriginals(f.batch);
    f.operation = operation;
    const runResult = f.observe(operation); // Separate run result observed promptly.
    assert.equal(f.runner.runOriginals(f.batch), operation);
    expectSnapshot(f.runner.snapshot(), 'first', f.batch);
    assert.deepEqual(f.c.counts, { load: 2, get: 2, retain: 1 });
    assert.deepEqual(f.c.log.map(entry => entry.method),
      ['load', 'get', 'retain', 'get', 'load']);
    assertRecords(f, 1);
    assertCall(f);
    assertUnchanged(f);
    const first = f.calls[0];
    f.responseCallbacks++;
    first.callback(first.response);
    first.response.complete = true;
    f.emit(first.response, 'data', Buffer.from(REPLY));
    f.emit(first.response, 'end');
    await turns(1);
    assert.equal(f.results.has(operation), false);
    assert.equal(f.runner.snapshot().attempted, 1);
    assert.equal(f.runner.snapshot().completed, 0);
    assert.equal(f.runner.snapshot().client.owner.counts.callbackCompletions, 0);
    assert.equal(f.runner.snapshot().client.lastTransport.replyValidated, true);
    assert.equal(f.runner.snapshot().client.lastTransport.settled, false);
    assert.equal(f.calls.length, 1);
    assertRecords(f, 1);

    f.force(first.request); // One close is insufficient.
    await turns(1);
    assert.equal(f.results.has(operation), false);
    assert.equal(f.runner.snapshot().attempted, 1);
    assert.equal(f.runner.snapshot().completed, 0);
    assert.equal(f.runner.snapshot().client.lastTransport.requestClosed, true);
    assert.equal(f.runner.snapshot().client.lastTransport.responseClosed, false);
    assert.equal(f.calls.length, 1);
    assertRecords(f, 1);

    f.force(first.response); // Actual second close permits callback completion.
    const result = await f.wait(runResult);
    assert.equal(result.ok, false);
    expectError(result.error, RP + 'RUN_FAILED', f.batch);
    assertTerminal(f);

    const closing = f.runner.close();
    const closeResult = f.observe(closing);
    assert.notEqual(closing, operation);
    assert.equal(f.runner.close(), closing);
    assert.equal(Object.getPrototypeOf(closing), P.prototype);
    const closed = await f.wait(closeResult);
    assert.equal(closed.ok, false);
    expectError(closed.error, OP + 'CLOSE_FAILED', f.batch);
    assert.equal(f.runner.close(), closing);
    assert.equal(f.runner.runOriginals(f.batch), operation);
    assert.equal(f.runner.runOriginals(f.batch), operation);
    const replacement = f.runner.runOriginals(f.batch.slice());
    const replacementResult = f.observe(replacement);
    assert.notEqual(replacement, operation);
    const refused = await f.wait(replacementResult);
    assert.equal(refused.ok, false);
    expectError(refused.error, RP + 'ALREADY_RUN', f.batch);
    assertTerminal(f);

    // No test sink/await has touched the raw store Promise. Production alone
    // must observe it. Real turns allow Node's unhandled accounting to run.
    await turns(4);
    for (const entry of f.owned.values()) assert.equal(entry.settled, true);
    assert.equal(f.events.length, 0, 'OWNED_STORE_PROMISE_UNHANDLED');
    assertTerminal(f);
    await turns(4);
    assert.equal(f.events.length, 0, 'OWNED_STORE_PROMISE_UNHANDLED');
    assert.equal(f.runner.runOriginals(f.batch), operation);
    assert.equal(f.runner.close(), closing);
    assertTerminal(f);
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      try {
        // Gate the real child before finishing any owned synthetic handles.
        // If a test failed early, emit error before closes, never data/end or a
        // successful response. No transport success is manufactured in cleanup.
        if (f.runner !== null) f.observe(f.runner.close());
        for (const call of f.calls) {
          if (!call.request.fixtureClosed || !call.response.fixtureClosed) {
            f.emit(call.request, 'error');
          }
          f.force(call.request);
          f.force(call.response);
        }
        for (const handle of f.handles) APPLY(SETTLE_SIGNALS, handle, []);
        await f.wait(P.all(f.lifecycle));
        await f.wait(P.all(f.handles.map(handle => handle.destroyObserved)));
      } catch (error) {
        failures.push(error);
      }
      try {
        await turns(4);
        // Measure before every raw cleanup sink, including on assertion failure.
        try {
          assert.equal(f.events.length, 0, 'OWNED_STORE_PROMISE_UNHANDLED');
        } catch (error) {
          failures.push(error);
        }
        const tails = [];
        for (const [promise, entry] of f.owned) {
          try { assert.equal(entry.settled, true); }
          catch (error) { failures.push(error); }
          if (entry.settled) {
            tails.push(APPLY(THEN, promise, [() => undefined, () => undefined]));
          }
        }
        await f.wait(P.all(tails));
        await turns(2);
      } catch (error) {
        failures.push(error);
      }
      for (const handle of f.handles) assert.equal(handle.fixtureClosed, true);
      assert.equal(f.c.closeCalls, 0);
      if (f.runner !== null) {
        const snapshot = f.runner.snapshot();
        assert.equal(snapshot.queuedReferences, 0);
        if (snapshot.client.lastTransport !== null) {
          assert.equal(snapshot.client.lastTransport.timerArmed, false);
        }
      }
      assert.equal(f.watchdogs.size, 0);
    } catch (error) {
      failures.push(error);
    } finally {
      for (const cancel of [...f.watchdogs]) cancel();
      process.removeListener('unhandledRejection', onUnhandled);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'DECLARED_LATE_RETAIN_CHECKS_FAILED');
  }
}

test('immediate rejected second retain after one completed borrowed-runner callback',
  { timeout: 5000, concurrency: false }, async () => {
    await runCase('immediate');
  });

test('deferred rejected second retain after one completed borrowed-runner callback',
  { timeout: 5000, concurrency: false }, async () => {
    await runCase('deferred');
  });
