import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as nativeSetTimeout, clearTimeout as nativeClearTimeout } from 'node:timers';
// All historical suffix bytes remain except ONE explicit module-export golden.
// The unrelated historical x402-wire DATA guard is excluded; it is not a runtime import.
const sourceSpecs = [["../src/service-credit-custodied-sequential-runner.js",4184,93,"793c2d383e6b96f75ed676fe98a274b8777e293b9bef56eed028f0825df31326"],["../src/service-credit-custodied-sequential-runner-core.js",15288,479,"36c99342bf9e47559e39535aefcde78acbbdd7fb210d42a77dbbb93c2fd9f8ff"],["../src/service-credit-custodied-http-client.js",10755,292,"ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15"],["../src/service-credit-custodied-request-owner.js",35073,938,"6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7"],["../src/service-credit-http-execute-dispatch.js",27034,770,"254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b"],["../src/service-credit-original-request-custody-contract.js",14051,356,"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"],["../package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"]];
for (const [relative, bytes, LF, sha] of sourceSpecs) {
  const raw = readFileSync(new URL(relative, import.meta.url));
  assert.equal(raw.length, bytes, 'SOURCE_BYTES');
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha, 'SOURCE_SHA256');
  const text = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(text), false); assert.equal(text.includes('\0'), false);
  assert.equal(text.split('\n').length - 1, LF); assert.ok(text.endsWith('\n'));
  if (relative === '../package.json') {
    const pkg = JSON.parse(text);
    assert.equal(pkg.type, 'module'); assert.equal(pkg.engines.node, '>=24');
  }
}
assert.equal(process.versions.node, '24.19.0', 'EXACT_NODE_VERSION_REQUIRED');
assert.equal(process.argv.length, 2, 'ONE_FILE_PROCESS_REQUIRED');
const runnerModule = await import('../src/service-credit-custodied-sequential-runner.js');
const {
  captureOriginalServiceRequestCustody: CAPTURE,
  serializeOriginalServiceRequestCustody: SERIALIZE,
  parseOriginalServiceRequestCustody: PARSE,
} = await import('../src/service-credit-original-request-custody-contract.js');
const CREATE = runnerModule.createServiceCreditCustodiedSequentialRunner;
const selector = 'all';

const RP = 'SERVICE_CREDIT_CUSTODIED_SEQUENTIAL_RUNNER_';
const CP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const SERVICE = 'https://synthetic.invalid/service-credit/v1/execute';
const FUNDING = 'https://synthetic.invalid/credit';
const GRANT = 'grant.selected';
const HASH = 'a'.repeat(64);
const NETWORK = 'zenon:synthetic';
const SECRET = 'synthetic-private-exception-do-not-expose';
const EMPTY_DIGEST =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const REPLY = Buffer.from('{"ok":true,"resultCode":"accepted"}', 'utf8');
const APPLY = Reflect.apply;

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

// Public synthetic fixture structures are adapted from the completed client
// unit DATA. That unit is neither imported, modified nor rerun.
class SyntheticStore {
  #control;
  #policy;
  #rows = new Map();
  #loads = 0;
  #gets = 0;

  constructor(control, policy) {
    this.#control = control;
    this.#policy = policy;
  }

  load() {
    this.#control.log.push('load');
    this.#loads++;
    return this.#control.onLoad === null ? this.#control.state
      : this.#control.onLoad(this.#loads, this.#control.state);
  }

  getOriginalRequest(key) {
    this.#control.log.push('get');
    this.#gets++;
    const record = this.#rows.get(slot(key)) ?? null;
    return this.#control.onGet === null ? record
      : this.#control.onGet(this.#gets, key, record);
  }

  retainOriginalRequest(input) {
    this.#control.log.push('retain');
    const record = custodyFor(input, this.#control.state);
    const identity = slot(record);
    const existing = this.#rows.get(identity);
    if (existing !== undefined) {
      if (SERIALIZE(existing) !== SERIALIZE(record)) {
        throw new Error('SYNTHETIC_CONFLICT');
      }
      return existing;
    }
    if (this.#rows.size >= this.#policy.maxRequests) {
      throw new Error('SYNTHETIC_CAPACITY');
    }
    const retained = PARSE(SERIALIZE(record));
    this.#rows.set(identity, retained);
    return this.#control.onRetain === null ? retained
      : this.#control.onRetain(retained);
  }

  seed(value) {
    const record = PARSE(SERIALIZE(custodyFor(value, this.#control.state)));
    this.#rows.set(slot(record), record);
  }

  row(key) {
    return this.#rows.get(slot(key)) ?? null;
  }

  size() {
    return this.#rows.size;
  }

  close() {
    this.#control.closeCalls++;
    throw new Error('BORROWED_STORE_MUST_NOT_BE_CLOSED');
  }
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

function fixture(t, settings = {}) {
  const policy = Object.freeze({
    policyVersion: 1,
    maxRequests: settings.maxRequests ?? 8,
    serviceResourceUrl: SERVICE,
  });
  const control = {
    state: funding(),
    log: [],
    closeCalls: 0,
    onLoad: null,
    onGet: null,
    onRetain: null,
  };
  const store = new SyntheticStore(control, policy);
  const f = {
    policy,
    control,
    store,
    runners: [],
    handles: [],
    exchanges: [],
    calls: [],
    sinks: [],
    watchdogs: new Set(),
    onRequest: null,
    returnTransform: null,
    maxActive: 0,
    requestImpl: null,

    observe(promise) {
      this.sinks.push(promise.then(
        value => ({ ok: true, value }),
        error => ({ ok: false, error }),
      ));
      return promise;
    },

    configuration(overrides = {}) {
      return {
        store,
        fundingResourceUrl: FUNDING,
        custodyPolicy: policy,
        selectedGrantId: GRANT,
        requestImpl: this.requestImpl,
        deadlineMs: settings.deadlineMs ?? 2000,
        ...overrides,
      };
    },

    make(overrides = {}) {
      const runner = CREATE(this.configuration(overrides));
      this.runners.push(runner);
      return runner;
    },

    run(runner, batch) {
      return this.observe(runner.runOriginals(batch));
    },

    close(runner) {
      return this.observe(runner.close());
    },

    respond(exchange) {
      exchange.callback(exchange.response);
    },

    emit(handle, event, ...args) {
      APPLY(EMIT, handle, [event, ...args]);
    },

    force(handle) {
      APPLY(FORCE_CLOSE, handle, []);
    },

    goodEnd(exchange) {
      exchange.response.complete = true;
      this.emit(exchange.response, 'data', Buffer.from(REPLY));
      this.emit(exchange.response, 'end');
    },

    complete(exchange) {
      this.respond(exchange);
      this.goodEnd(exchange);
      this.force(exchange.request);
      this.force(exchange.response);
    },
  };

  f.requestImpl = function requestImpl(url, options, callback) {
    assert.equal(this, undefined);
    assert.equal(arguments.length, 3);
    const previousOpen = f.exchanges.filter(exchange =>
      !exchange.request.fixtureClosed || !exchange.response.fixtureClosed).length;
    f.maxActive = Math.max(f.maxActive, previousOpen + 1);
    const request = new FakeRequest();
    const response = new FakeResponse();
    const exchange = { url, options, callback, request, response };
    f.handles.push(request, response);
    f.exchanges.push(exchange);
    f.calls.push({ url, options });
    if (f.onRequest !== null) f.onRequest(exchange);
    return f.returnTransform === null ? request : f.returnTransform(request);
  };

  t.after(async () => {
    const problems = [];
    for (const runner of f.runners) {
      try { f.observe(runner.close()); } catch (error) { problems.push(error); }
    }
    for (const handle of f.handles) {
      try { APPLY(FORCE_CLOSE, handle, []); }
      catch (error) { problems.push(error); }
      try { APPLY(SETTLE_SIGNALS, handle, []); }
      catch (error) { problems.push(error); }
    }
    for (const cancel of [...f.watchdogs]) {
      try { cancel(); } catch (error) { problems.push(error); }
    }
    await Promise.all(f.sinks);
    for (const runner of f.runners) {
      try {
        const snapshot = runner.snapshot();
        if (snapshot.client.lastTransport !== null) {
          assert.equal(snapshot.client.lastTransport.timerArmed, false);
        }
        assert.equal(snapshot.queuedReferences, 0);
      } catch (error) {
        problems.push(error);
      }
    }
    try {
      for (const handle of f.handles) assert.equal(handle.fixtureClosed, true);
      assert.equal(f.watchdogs.size, 0);
      assert.equal(control.closeCalls, 0);
    } catch (error) {
      problems.push(error);
    }
    if (problems.length === 1) throw problems[0];
    if (problems.length > 1) {
      throw new AggregateError(problems, 'OWNED_FIXTURE_CLEANUP_FAILED');
    }
  });
  return f;
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

async function exchangeAt(f, index) {
  for (let turn = 0; turn < 16; turn++) {
    if (f.exchanges.length > index) return f.exchanges[index];
    await Promise.resolve();
  }
  assert.fail('EXPECTED_NEXT_OWNED_EXCHANGE');
}

function boundedWait(f, promise) {
  const waited = new Promise((resolve, reject) => {
    let done = false;
    let timer;
    function finish(ok, value) {
      if (done) return;
      done = true;
      nativeClearTimeout(timer);
      f.watchdogs.delete(cancel);
      if (ok) resolve(value);
      else reject(value);
    }
    const cancel = () => finish(false, new Error('OWNED_WAIT_CANCELLED'));
    timer = nativeSetTimeout(() => {
      finish(false, new Error('OWNED_WAIT_TIMEOUT'));
    }, 1000);
    f.watchdogs.add(cancel);
    promise.then(
      value => finish(true, value),
      error => finish(false, error),
    );
  });
  return f.observe(waited);
}

function assertRecord(f, value) {
  const record = f.store.row(keyFor(value));
  assert.ok(record);
  assert.equal(record.originalRequestJson, value.originalRequestJson);
  assert.equal(record.originalBodyBase64, '');
  assert.equal(record.serviceResourceUrl, SERVICE);
  assert.equal(record.fundingResourceUrl, FUNDING);
  assert.equal(record.paymentHash, HASH);
  assert.equal(record.network, NETWORK);
  assert.equal(record.grantId, value.grantId);
  assert.equal(record.requestId, value.requestId);
  assert.deepEqual(PARSE(SERIALIZE(record)), record);
  assert.equal(JSON.stringify(record).includes('ServiceCredit '), false);
}

function safeError(error) {
  assert.ok(error instanceof TypeError);
  assert.equal(typeof error.code, 'string');
  assert.ok(error.code.startsWith(RP) || error.code.startsWith(CP)
    || error.code.startsWith(OP));
  assert.equal(error.message, error.code);
  assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.ok(Object.isFrozen(error));
  const text = JSON.stringify(error) + error.message + error.stack;
  for (const value of [
    SECRET, SERVICE, FUNDING, HASH, GRANT, 'request.one',
    'opaque-original', 'ServiceCredit ', 'declared-signature',
  ]) {
    assert.equal(text.includes(value), false);
  }
  return true;
}

function redacted(snapshot) {
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.limits));
  assert.ok(Object.isFrozen(snapshot.client));
  assert.ok(Object.isFrozen(snapshot.client.owner));
  assert.ok(Object.isFrozen(snapshot.client.owner.counts));
  assert.ok(Object.isFrozen(snapshot.client.owner.uncertainty));
  if (snapshot.client.lastTransport !== null) {
    assert.ok(Object.isFrozen(snapshot.client.lastTransport));
    assert.ok(Object.isFrozen(snapshot.client.lastTransport.counts));
  }
  assert.ok(snapshot.planned >= 0 && snapshot.planned <= 8);
  assert.ok(snapshot.completed >= 0 && snapshot.completed <= snapshot.attempted);
  assert.ok(snapshot.attempted <= snapshot.planned);
  assert.equal(snapshot.notAttempted, snapshot.planned - snapshot.attempted);
  assert.ok(snapshot.queuedReferences >= 0
    && snapshot.queuedReferences <= snapshot.notAttempted);
  assert.ok(snapshot.closeCalls === 0 || snapshot.closeCalls === 1);
  if (snapshot.runSettled) assert.equal(snapshot.queuedReferences, 0);
  assert.equal(snapshot.limits.maxOriginals, 8);
  assert.equal(snapshot.limits.maxBatchStringUtf8Bytes, 75776);
  const text = JSON.stringify(snapshot);
  assert.ok(text.length <= 6144);
  for (const value of [
    SECRET, SERVICE, FUNDING, HASH, GRANT, 'request.one', 'request.two',
    'opaque-original', 'ServiceCredit ', 'declared-public-key',
    'declared-signature',
  ]) {
    assert.equal(text.includes(value), false);
  }
  assert.equal(snapshot.storeOwnership, 'BORROWED');
  assert.equal(snapshot.qualification, 'SYNTHETIC_SEQUENTIAL_INTERFACE_ONLY');
  for (const field of [
    'serviceDelivery', 'currentAuthority', 'realReady',
    'durability', 'restart', 'osCleanup',
  ]) {
    assert.equal(snapshot[field], 'NOT_ESTABLISHED');
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
    deleteProperty: trap,
    has: trap,
    isExtensible: trap,
    preventExtensions: trap,
    apply: trap,
    construct: trap,
  });
}

const groups = [
  [
    'two originals use one client and wait for ordered bodyless completion',
    async t => {
      const f = fixture(t, { maxRequests: 2 });
      const runner = f.make();
      const batch = [inputFor(), inputFor('request.two', 2)];
      const fundingBefore = JSON.stringify(f.control.state);
      const observed = [];
      f.onRequest = exchange => {
        const index = f.calls.length - 1;
        const value = batch[index];
        assertRecord(f, value);
        assert.equal(exchange.url, SERVICE);
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
        const snapshot = runner.snapshot();
        assert.equal(snapshot.attempted, index + 1);
        assert.equal(snapshot.completed, index);
        assert.equal(snapshot.client.owner.counts.readbackConfirmations, index + 1);
        observed.push(index);
      };
      const operation = f.run(runner, batch);
      assert.equal(Object.getPrototypeOf(operation), Promise.prototype);
      assert.equal(f.exchanges.length, 1);
      assert.equal(f.store.row(keyFor(batch[1])), null);
      assert.deepEqual(f.control.log, ['load', 'get', 'retain', 'get', 'load']);
      const first = f.exchanges[0];
      assert.equal(first.request.endCalls, 1);
      assert.equal(first.request.writeCalls, 0);
      f.respond(first);
      f.goodEnd(first);
      await assertPending(operation);
      assert.equal(f.exchanges.length, 1);
      f.force(first.request);
      await assertPending(operation);
      assert.equal(f.exchanges.length, 1);
      f.force(first.response);
      const second = await exchangeAt(f, 1);
      assert.equal(second.request.endCalls, 1);
      assert.equal(second.request.writeCalls, 0);
      assert.equal(first.request.fixtureClosed, true);
      assert.equal(first.response.fixtureClosed, true);
      assert.equal(runner.snapshot().completed, 1);
      f.complete(second);
      assert.equal(await operation, undefined);

      const snapshot = runner.snapshot();
      assert.equal(snapshot.phase, 'COMPLETED');
      assert.equal(snapshot.outcome, 'CALLBACKS_COMPLETED');
      assert.equal(snapshot.planned, 2);
      assert.equal(snapshot.attempted, 2);
      assert.equal(snapshot.completed, 2);
      assert.equal(snapshot.queuedReferences, 0);
      assert.equal(snapshot.closeOutcome, 'FULFILLED');
      assert.equal(snapshot.closeCalls, 1);
      assert.equal(snapshot.client.owner.trackedRequests, 2);
      assert.equal(snapshot.client.owner.counts.callbackCompletions, 2);
      assert.equal(snapshot.client.owner.counts.loadReads, 4);
      assert.deepEqual(observed, [0, 1]);
      assert.equal(f.maxActive, 1);
      assert.equal(f.store.size(), 2);
      assert.equal(JSON.stringify(f.control.state), fundingBefore);
      for (const value of batch) assertRecord(f, value);
      const closing = f.close(runner);
      assert.equal(runner.close(), closing);
      assert.equal(await closing, undefined);
      assert.equal(f.control.closeCalls, 0);
      redacted(snapshot);
    },
  ],
  [
    'structural admission rejects hooks and isolates copied batch strings',
    async t => {
      const f = fixture(t);
      let touches = 0;
      const touch = () => { touches++; };
      const getter = () => {
        touch();
        throw new Error(SECRET);
      };
      assert.throws(() => CREATE(), { code: RP + 'INVALID_CONFIGURATION' });
      assert.throws(() => CREATE(f.configuration(), null), {
        code: RP + 'INVALID_CONFIGURATION',
      });
      const badConfig = f.configuration();
      Object.defineProperty(badConfig, 'selectedGrantId', {
        get: getter, enumerable: true,
      });
      assert.throws(() => CREATE(poisonProxy(f.configuration(), touch)), {
        code: RP + 'INVALID_CONFIGURATION',
      });
      assert.throws(() => CREATE(badConfig), { code: RP + 'INVALID_CONFIGURATION' });
      assert.throws(() => CREATE({ ...f.configuration(), extra: true }), {
        code: RP + 'INVALID_CONFIGURATION',
      });
      assert.throws(() => CREATE(f.configuration({
        requestImpl: poisonProxy(function () {}, touch),
      })), { code: RP + 'INVALID_CONFIGURATION' });

      const runner = f.make();
      const valid = inputFor();
      const sparse = new Array(1);
      const extra = [valid];
      extra.extra = true;
      const symbolic = [valid];
      symbolic[Symbol('extra')] = true;
      const accessorArray = [valid];
      Object.defineProperty(accessorArray, '0', {
        get: getter, enumerable: true,
      });
      const hiddenArray = [valid];
      Object.defineProperty(hiddenArray, '0', {
        value: valid, enumerable: false,
      });
      const wrongPrototype = [valid];
      Object.setPrototypeOf(wrongPrototype, poisonProxy({}, touch));
      const accessorEntry = { ...valid };
      Object.defineProperty(accessorEntry, 'authorizationHeader', {
        get: getter, enumerable: true,
      });
      const hiddenEntry = { ...valid };
      Object.defineProperty(hiddenEntry, 'requestId', {
        value: valid.requestId, enumerable: false,
      });
      const primitive = {};
      Object.defineProperty(primitive, Symbol.toPrimitive, { get: getter });
      class ArraySubclass extends Array {}
      const bad = [
        null, {}, [], sparse, extra, symbolic, accessorArray, hiddenArray,
        wrongPrototype, new ArraySubclass(valid),
        poisonProxy([valid], touch),
        [poisonProxy(valid, touch)],
        [accessorEntry], [hiddenEntry], [Object.create(null)],
        [{ ...valid, extra: true }],
        [{ ...valid, [Symbol('extra')]: true }],
        [{ ...valid, requestId: primitive }],
        [{ ...valid, requestId: 'bad://key' }],
        [inputFor('request.one', 1, 'grant.foreign')],
        [valid, { ...valid }],
        Array.from({ length: 9 }, (_, index) => inputFor('request.' + index)),
        [{ ...valid, originalBodyBase64: 'AA==' }],
        [{ ...valid, originalBodyBase64: Buffer.alloc(0) }],
        [{ ...valid, originalRequestJson: '' }],
        [{ ...valid, originalRequestJson: primitive }],
        [{ ...valid, originalRequestJson: 'x'.repeat(4097) }],
        [{ ...valid, originalRequestJson: '\u00e9'.repeat(2049) }],
        [{ ...valid, authorizationHeader: '' }],
        [{ ...valid, authorizationHeader: primitive }],
        [{ ...valid, authorizationHeader: 'x'.repeat(1025) }],
        [{ ...valid, authorizationHeader: '\u00e9'.repeat(513) }],
        [{ ...valid, serviceResourceUrl: '' }],
        [{ ...valid, serviceResourceUrl: primitive }],
        [{ ...valid, serviceResourceUrl: '\u00e9'.repeat(2049) }],
      ];
      await assert.rejects(f.observe(runner.runOriginals()), {
        code: RP + 'INVALID_INPUT',
      });
      await assert.rejects(f.observe(runner.runOriginals([valid], null)), {
        code: RP + 'INVALID_INPUT',
      });
      for (const value of bad) {
        await assert.rejects(f.run(runner, value), { code: RP + 'INVALID_INPUT' });
        assert.equal(runner.snapshot().runClaimed, false);
        assert.equal(runner.snapshot().planned, 0);
        assert.deepEqual(f.control.log, []);
        assert.equal(f.calls.length, 0);
      }
      assert.equal(touches, 0);

      const first = inputFor();
      const second = inputFor('request.two', 2);
      const saved = [{ ...first }, { ...second }];
      const batch = [first, second];
      f.control.onRetain = record => {
        if (f.store.size() === 1) {
          Object.defineProperty(batch, '0', {
            get: getter, enumerable: true, configurable: true,
          });
          Object.defineProperty(batch, '1', {
            get: getter, enumerable: true, configurable: true,
          });
          batch.push(inputFor('request.ignored'));
          for (const field of Object.keys(second)) {
            Object.defineProperty(second, field, {
              get: getter, enumerable: true, configurable: true,
            });
          }
        }
        return record;
      };
      const operation = f.run(runner, batch);
      assert.equal(runner.runOriginals(batch), operation);
      f.complete(f.exchanges[0]);
      const exchange = await exchangeAt(f, 1);
      assert.equal(exchange.options.headers.Authorization,
        saved[1].authorizationHeader);
      f.complete(exchange);
      assert.equal(await operation, undefined);
      assert.equal(runner.snapshot().planned, 2);
      assert.equal(f.calls.length, 2);
      for (const value of saved) assertRecord(f, value);
      assert.equal(f.store.row({ grantId: GRANT, requestId: 'request.ignored' }), null);
      assert.equal(touches, 0);
      redacted(runner.snapshot());
    },
  ],
  [
    'later semantic rejection preserves honest partial completion',
    async t => {
      for (const mode of ['original', 'authorization']) {
        const f = fixture(t);
        const runner = f.make();
        const first = inputFor();
        const later = inputFor('request.two', 2);
        if (mode === 'original') later.originalRequestJson = 'invalid-json';
        else later.authorizationHeader = 'ServiceCredit invalid_syntax';
        const batch = [first, later, inputFor('request.three', 3)];
        const fundingBefore = JSON.stringify(f.control.state);
        const operation = f.run(runner, batch);
        f.complete(f.exchanges[0]);
        await assert.rejects(operation, error => {
          assert.equal(error.code, RP + 'RUN_FAILED');
          return safeError(error);
        });
        const snapshot = runner.snapshot();
        assert.equal(snapshot.failure, 'ENTRY_REJECTED');
        assert.equal(snapshot.planned, 3);
        assert.equal(snapshot.attempted, 2);
        assert.equal(snapshot.completed, 1);
        assert.equal(snapshot.notAttempted, 1);
        assert.equal(snapshot.queuedReferences, 0);
        assert.equal(snapshot.closeOutcome, 'FULFILLED');
        assert.equal(snapshot.client.owner.trackedRequests, 1);
        assert.equal(snapshot.client.owner.counts.retainCalls, 1);
        assert.equal(snapshot.client.owner.counts.dispatchCalls, 1);
        assert.equal(f.calls.length, 1);
        assert.equal(f.store.size(), 1);
        assertRecord(f, first);
        assert.equal(f.store.row(keyFor(later)), null);
        assert.equal(f.store.row(keyFor(batch[2])), null);
        assert.deepEqual(f.control.log, ['load', 'get', 'retain', 'get', 'load']);
        assert.equal(JSON.stringify(f.control.state), fundingBefore);
        assert.equal(await f.close(runner), undefined);
        redacted(snapshot);
      }
    },
  ],
  [
    'first transport uncertainty stops the queue and preserves failed close',
    async t => {
      for (const mode of ['503', 'deadline']) {
        const f = fixture(t, { deadlineMs: mode === 'deadline' ? 10 : 2000 });
        const runner = f.make();
        const batch = [
          inputFor(), inputFor('request.two', 2), inputFor('request.three', 3),
        ];
        const fundingBefore = JSON.stringify(f.control.state);
        const operation = f.run(runner, batch);
        const exchange = f.exchanges[0];
        if (mode === '503') exchange.response.statusCode = 503;
        f.respond(exchange);
        if (mode === 'deadline') {
          assert.equal(await boundedWait(f, exchange.request.destroyObserved), true);
        }
        assert.equal(exchange.request.destroyCalls, 1);
        assert.equal(exchange.response.destroyCalls, 1);
        await assertPending(operation);
        assert.equal(f.calls.length, 1);
        f.emit(exchange.request, 'error', new Error(SECRET));
        exchange.response.statusCode = 200;
        f.goodEnd(exchange);
        assert.equal(runner.snapshot().client.lastTransport.replyValidated, false);
        f.force(exchange.request);
        await assertPending(operation);
        f.force(exchange.response);
        await assert.rejects(operation, error => {
          assert.equal(error.code, RP + 'RUN_FAILED');
          return safeError(error);
        });

        const closing = f.close(runner);
        assert.equal(runner.close(), closing);
        await assert.rejects(closing, { code: OP + 'CLOSE_FAILED' });
        const snapshot = runner.snapshot();
        assert.equal(snapshot.attempted, 1);
        assert.equal(snapshot.completed, 0);
        assert.equal(snapshot.notAttempted, 2);
        assert.equal(snapshot.queuedReferences, 0);
        assert.equal(snapshot.closeCalls, 1);
        assert.equal(snapshot.closeOutcome, 'REJECTED');
        assert.equal(snapshot.client.owner.uncertainty.submission, true);
        assert.equal(snapshot.client.owner.closeOutcome, 'UNKNOWN');
        assert.equal(snapshot.client.lastTransport.deadlineFired,
          mode === 'deadline');
        assert.equal(snapshot.client.lastTransport.unknown, true);
        assert.equal(snapshot.unknownUndrained, false);
        assert.equal(f.calls.length, 1);
        assertRecord(f, batch[0]);
        assert.equal(f.store.row(keyFor(batch[1])), null);
        assert.equal(f.store.row(keyFor(batch[2])), null);
        const log = f.control.log.slice();
        assert.equal(runner.runOriginals(batch), operation);
        await assert.rejects(f.run(runner, [inputFor('request.replacement')]), {
          code: RP + 'ALREADY_RUN',
        });
        assert.deepEqual(f.control.log, log);
        assert.equal(JSON.stringify(f.control.state), fundingBefore);
        assert.equal(f.control.closeCalls, 0);
        redacted(snapshot);
      }
    },
  ],
  [
    'reentrant run identity cannot admit a replacement list',
    async t => {
      const f = fixture(t);
      const runner = f.make();
      const batch = [inputFor(), inputFor('request.two', 2)];
      const replacement = [inputFor('request.replacement')];
      let reentrant;
      let refused;
      let touches = 0;
      f.onRequest = () => {
        if (f.calls.length !== 1) return;
        reentrant = f.observe(runner.runOriginals(batch));
        refused = f.observe(runner.runOriginals(replacement));
        Object.defineProperty(batch, '0', {
          get() { touches++; throw new Error(SECRET); },
          enumerable: true,
          configurable: true,
        });
        assert.equal(runner.snapshot().attempted, 1);
        assert.equal(runner.snapshot().queuedReferences, 1);
      };
      const operation = f.run(runner, batch);
      assert.equal(reentrant, operation);
      assert.equal(runner.runOriginals(batch), operation);
      await assert.rejects(refused, { code: RP + 'ALREADY_RUN' });
      f.complete(f.exchanges[0]);
      f.complete(await exchangeAt(f, 1));
      assert.equal(await operation, undefined);
      assert.equal(runner.runOriginals(batch), operation);
      const log = f.control.log.slice();
      await assert.rejects(f.run(runner, [inputFor(), inputFor('request.two', 2)]), {
        code: RP + 'ALREADY_RUN',
      });
      await assert.rejects(f.observe(runner.runOriginals(batch, null)), {
        code: RP + 'INVALID_INPUT',
      });
      assert.deepEqual(f.control.log, log);
      assert.equal(f.calls.length, 2);
      assert.equal(f.maxActive, 1);
      assert.equal(touches, 0);
      const snapshot = runner.snapshot();
      assert.equal(snapshot.runSettled, true);
      assert.equal(snapshot.queuedReferences, 0);
      assert.equal(snapshot.client.owner.trackedRequests, 2);
      assert.equal(snapshot.closeCalls, 1);
      redacted(snapshot);
    },
  ],
  [
    'manual close fences admission and queued work with one close promise',
    async t => {
      const before = fixture(t);
      const unused = before.make();
      const unusedClose = before.close(unused);
      assert.equal(unused.close(), unusedClose);
      assert.equal(await unusedClose, undefined);
      await assert.rejects(before.run(unused, [inputFor()]), {
        code: RP + 'CLOSED',
      });
      assert.equal(unused.snapshot().runClaimed, false);
      assert.equal(unused.snapshot().attempted, 0);
      assert.deepEqual(before.control.log, []);
      assert.equal(before.calls.length, 0);
      assert.equal(before.control.closeCalls, 0);

      const f = fixture(t);
      const runner = f.make();
      const batch = [
        inputFor(), inputFor('request.two', 2), inputFor('request.three', 3),
      ];
      let closing;
      let reentrant;
      f.onRequest = () => {
        closing = f.close(runner);
        assert.equal(runner.close(), closing);
        reentrant = f.observe(runner.runOriginals(batch));
        assert.equal(runner.snapshot().closed, true);
        assert.equal(runner.snapshot().queuedReferences, 0);
        // requestImpl still returns its own fake request, never this Promise.
      };
      const operation = f.run(runner, batch);
      assert.equal(operation, reentrant);
      assert.equal(Object.getPrototypeOf(closing), Promise.prototype);
      assert.equal(runner.close(), closing);
      await assertPending(operation);
      await assertPending(closing);
      const exchange = f.exchanges[0];
      f.respond(exchange);
      f.goodEnd(exchange);
      f.force(exchange.response);
      await assertPending(operation);
      await assertPending(closing);
      f.force(exchange.request);
      assert.equal(await closing, undefined);
      await assert.rejects(operation, { code: RP + 'RUN_FAILED' });
      assert.equal(runner.close(), closing);
      const snapshot = runner.snapshot();
      assert.equal(snapshot.failure, 'CLOSE_REQUESTED');
      assert.equal(snapshot.planned, 3);
      assert.equal(snapshot.attempted, 1);
      assert.equal(snapshot.completed, 1);
      assert.equal(snapshot.notAttempted, 2);
      assert.equal(snapshot.queuedReferences, 0);
      assert.equal(snapshot.closeCalls, 1);
      assert.equal(snapshot.closeOutcome, 'FULFILLED');
      assert.equal(snapshot.unknown, false);
      assert.equal(snapshot.client.owner.counts.callbackCompletions, 1);
      assert.equal(snapshot.client.owner.closeOutcome, 'DRAINED');
      assert.equal(f.calls.length, 1);
      assertRecord(f, batch[0]);
      assert.equal(f.store.row(keyFor(batch[1])), null);
      assert.equal(f.store.row(keyFor(batch[2])), null);
      assert.equal(f.control.closeCalls, 0);
      redacted(snapshot);
    },
  ],
  [
    'actual owner recovery conflict and binding fences prevent transport',
    async t => {
      for (const mode of ['existing', 'conflict', 'binding']) {
        const f = fixture(t);
        const existing = inputFor();
        if (mode !== 'binding') f.store.seed(existing);
        if (mode === 'binding') {
          f.control.onLoad = (ordinal, state) => ordinal === 2
            ? { ...state, revision: state.revision + 1 } : state;
        }
        const runner = f.make();
        const first = mode === 'conflict' ? inputFor('request.one', 2) : existing;
        const batch = [first, inputFor('request.two', 2)];
        const operation = f.run(runner, batch);
        await assert.rejects(operation, { code: RP + 'RUN_FAILED' });
        const snapshot = runner.snapshot();
        assert.equal(snapshot.failure, 'ENTRY_REJECTED');
        assert.equal(snapshot.attempted, 1);
        assert.equal(snapshot.completed, 0);
        assert.equal(snapshot.notAttempted, 1);
        assert.equal(snapshot.client.lastTransport, null);
        assert.equal(snapshot.client.owner.counts.dispatchCalls, 0);
        assert.equal(snapshot.client.owner.grantScoped, true);
        if (mode === 'existing') {
          assert.equal(snapshot.client.owner.phase, 'RECOVERY_REQUIRED');
        } else if (mode === 'conflict') {
          assert.equal(snapshot.client.owner.phase, 'IDLE');
        } else {
          assert.equal(snapshot.client.owner.phase, 'CUSTODY_OUTCOME_UNKNOWN');
          assert.equal(snapshot.client.owner.counts.readbackConfirmations, 0);
        }
        assert.equal(f.calls.length, 0);
        assert.equal(f.store.size(), 1);
        assertRecord(f, existing);
        assert.equal(f.store.row(keyFor(batch[1])), null);
        const log = f.control.log.slice();
        f.control.onLoad = null;
        await assert.rejects(f.run(runner, [inputFor('request.new')]), {
          code: RP + 'ALREADY_RUN',
        });
        assert.deepEqual(f.control.log, log);
        const closing = f.close(runner);
        if (mode === 'binding') {
          assert.equal(snapshot.client.owner.uncertainty.custody, true);
          assert.equal(snapshot.closeOutcome, 'REJECTED');
          await assert.rejects(closing, { code: OP + 'CLOSE_FAILED' });
        } else {
          assert.equal(snapshot.client.owner.uncertainty.custody, false);
          assert.equal(snapshot.closeOutcome, 'FULFILLED');
          assert.equal(await closing, undefined);
          assert.equal(snapshot.client.owner.counts.retainCalls, 0);
        }
        assert.equal(f.control.closeCalls, 0);
        redacted(snapshot);
      }
    },
  ],
  [
    'undrained failure and maximum batch keep frozen redacted bounds',
    async t => {
      assert.deepEqual(Object.keys(runnerModule), [
        'createServiceCreditCustodiedSequentialRunner',
        'createServiceCreditCustodiedSequentialRunnerV3',
      ]);
      const f = fixture(t);
      let touches = 0;
      f.returnTransform = request => poisonProxy(request, () => { touches++; });
      const runner = f.make();
      assert.deepEqual(Object.keys(runner), ['runOriginals', 'snapshot', 'close']);
      assert.ok(Object.isFrozen(runner));
      for (const name of Object.keys(runner)) {
        const descriptor = Object.getOwnPropertyDescriptor(runner, name);
        assert.equal(typeof descriptor.value, 'function');
        assert.ok(Object.isFrozen(descriptor.value));
        assert.equal(descriptor.writable, false);
        assert.equal(descriptor.configurable, false);
      }
      const batch = [
        inputFor(), inputFor('request.two', 2), inputFor('request.three', 3),
      ];
      const operation = f.run(runner, batch);
      await assert.rejects(operation, error => {
        assert.equal(error.code, RP + 'RUN_FAILED');
        return safeError(error);
      });
      const closing = f.close(runner);
      assert.equal(runner.close(), closing);
      await assert.rejects(closing, error => {
        assert.equal(error.code, OP + 'CLOSE_FAILED');
        return safeError(error);
      });
      let snapshot = runner.snapshot();
      assert.equal(snapshot.runSettled, true);
      assert.equal(snapshot.attempted, 1);
      assert.equal(snapshot.completed, 0);
      assert.equal(snapshot.notAttempted, 2);
      assert.equal(snapshot.queuedReferences, 0);
      assert.equal(snapshot.closeCalls, 1);
      assert.equal(snapshot.closeOutcome, 'REJECTED');
      assert.equal(snapshot.unknownUndrained, true);
      assert.equal(snapshot.client.lastTransport.phase, 'UNKNOWN_UNDRAINED');
      assert.equal(snapshot.client.lastTransport.requestObserved, false);
      assert.equal(snapshot.client.lastTransport.timerArmed, false);
      assert.equal(f.calls.length, 1);
      assert.equal(f.exchanges[0].request.endCalls, 0);
      assert.equal(f.exchanges[0].request.destroyCalls, 0);
      assert.equal(f.exchanges[0].request.fixtureClosed, false);
      assert.equal(touches, 0);
      assertRecord(f, batch[0]);
      redacted(snapshot);
      // Root rejection was not fake-handle cleanup. Independently close the
      // owned raw targets and settle their unused signals, also done in after.
      for (const handle of f.handles) {
        f.force(handle);
        APPLY(SETTLE_SIGNALS, handle, []);
      }
      snapshot = runner.snapshot();
      assert.equal(snapshot.unknownUndrained, true);
      assert.throws(() => runner.snapshot(null), { code: RP + 'INVALID_INPUT' });
      await assert.rejects(f.observe(runner.close(null)), {
        code: RP + 'INVALID_INPUT',
      });
      assert.equal(runner.close(), closing);
      assert.equal(f.control.closeCalls, 0);

      const maximum = fixture(t, { maxRequests: 8 });
      const bounded = maximum.make();
      const originals = Array.from({ length: 8 }, (_, index) =>
        inputFor('request.' + (index + 1), index + 1));
      const all = maximum.run(bounded, originals);
      for (let index = 0; index < originals.length; index++) {
        const exchange = await exchangeAt(maximum, index);
        const current = bounded.snapshot();
        assert.equal(current.planned, 8);
        assert.equal(current.attempted, index + 1);
        assert.equal(current.completed, index);
        assert.equal(current.queuedReferences, 7 - index);
        maximum.complete(exchange);
      }
      assert.equal(await all, undefined);
      const terminal = bounded.snapshot();
      assert.equal(terminal.planned, 8);
      assert.equal(terminal.attempted, 8);
      assert.equal(terminal.completed, 8);
      assert.equal(terminal.notAttempted, 0);
      assert.equal(terminal.queuedReferences, 0);
      assert.equal(terminal.closeCalls, 1);
      assert.equal(terminal.client.owner.trackedRequests, 8);
      assert.equal(maximum.store.size(), 8);
      assert.equal(maximum.maxActive, 1);
      for (const value of originals) assertRecord(maximum, value);
      assert.equal(maximum.control.closeCalls, 0);
      redacted(terminal);
    },
  ],
];

assert.equal(groups.length, 8);
// No skipped registrations or name filters: absent selector runs every group,
// while one numeric selector registers exactly its authored group.
// Timeouts/watchdogs do not prove hard cancellation or OS-resource cleanup.
for (let index = 0; index < groups.length; index++) {
  if (selector === 'all' || selector === String(index + 1)) {
    const [name, callback] = groups[index];
    test(name, { timeout: 5000 }, callback);
  }
}
