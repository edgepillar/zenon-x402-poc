import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as nativeSetTimeout, clearTimeout as nativeClearTimeout } from 'node:timers';
// Historical suffix is preserved except the TWO explicit versioned API goldens in the recipe.
const sourceSpecs = [["../src/service-credit-custodied-http-client.js",10755,292,"ddbc54faf4a14d95e6274bc9df27b7b49db251bab67c11b871cfb2f9e78b4f15"],["../src/service-credit-custodied-request-owner.js",35073,938,"6e7493a4859d48530820e68a4a19a513aad014ffc1048b42965a3ad36ae7c5f7"],["../src/service-credit-http-execute-dispatch.js",27034,770,"254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b"],["../src/service-credit-original-request-custody-contract.js",14051,356,"fd349de553a17abcc2e0567ba6640e6e3d5d26cfa79ee1e355928dc9fa8d3915"],["../package.json",1413,40,"8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5"]];
for (const [relative, bytes, LF, sha] of sourceSpecs) {
  const raw = readFileSync(new URL(relative, import.meta.url));
  assert.equal(raw.length, bytes, 'SOURCE_BYTES');
  assert.equal(createHash('sha256').update(raw).digest('hex'), sha, 'SOURCE_SHA256');
  const text = raw.toString('utf8');
  assert.equal(/[^\x00-\x7f]/.test(text), false);
  assert.equal(text.includes('\0'), false);
  assert.equal(text.split('\n').length - 1, LF);
  assert.ok(text.endsWith('\n'));
  if (relative === '../package.json') {
    const pkg = JSON.parse(text);
    assert.equal(pkg.type, 'module'); assert.equal(pkg.engines.node, '>=24');
  }
}
assert.equal(process.versions.node, '24.19.0', 'EXACT_NODE_VERSION_REQUIRED');
assert.equal(process.argv.length, 2, 'ONE_FILE_PROCESS_REQUIRED');
const clientModule = await import('../src/service-credit-custodied-http-client.js');
const {
  captureOriginalServiceRequestCustody: CAPTURE,
  serializeOriginalServiceRequestCustody: SERIALIZE,
  parseOriginalServiceRequestCustody: PARSE,
} = await import('../src/service-credit-original-request-custody-contract.js');
const CREATE = clientModule.createServiceCreditCustodiedHttpClient;
const selector = null;

const CP = 'SERVICE_CREDIT_CUSTODIED_HTTP_CLIENT_';
const OP = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const SERVICE = 'https://synthetic.invalid/service-credit/v1/execute';
const FUNDING = 'https://synthetic.invalid/credit';
const GRANT = 'grant.selected';
const HASH = 'a'.repeat(64);
const NETWORK = 'zenon:synthetic';
const EMPTY_DIGEST =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const SECRET = 'synthetic-private-exception-do-not-expose';
const REPLY = Buffer.from(
  '{"ok":true,"resultCode":"accepted"}',
  'utf8',
);
const APPLY = Reflect.apply;

function originalJson(grantId = GRANT, requestId = 'request.one', cost = 1) {
  return JSON.stringify({
    modelVersion: 1,
    grantId,
    requestId,
    method: 'POST',
    routeId: 'service-credit.execute.v1',
    canonicalBodyDigest: EMPTY_DIGEST,
    selectedContentType: 'application/json',
    maxCostUnits: cost,
  });
}

function proofJson(grantId = GRANT, requestId = 'request.one', cost = 1) {
  // Declared strings only. No key generation, signing or verification.
  return JSON.stringify({
    grantId,
    maxCostUnits: cost,
    proofVersion: 1,
    publicKey: 'declared-public-key',
    requestId,
    signature: 'declared-signature-' + requestId,
  });
}

function authorization(grantId = GRANT, requestId = 'request.one', cost = 1) {
  return 'ServiceCredit '
    + Buffer.from(proofJson(grantId, requestId, cost), 'utf8')
      .toString('base64url');
}

function inputFor(requestId = 'request.one', cost = 1, grantId = GRANT) {
  return {
    grantId,
    requestId,
    originalRequestJson: originalJson(grantId, requestId, cost),
    originalBodyBase64: '',
    serviceResourceUrl: SERVICE,
    authorizationHeader: authorization(grantId, requestId, cost),
  };
}

function keyFor(requestId = 'request.one', grantId = GRANT) {
  return { grantId, requestId };
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
      resource: {
        url: FUNDING,
        description: 'declared synthetic funding',
        mimeType: 'application/json',
      },
      accepted: requirement,
      payload: {
        transaction: {
          hash: HASH,
          bytes: 'opaque-original-signed-block-data',
        },
        intentDigest: 'opaque-original-intent',
      },
      extensions: { opaque: 'original-extension' },
    },
    requirement,
  };
}

function binding(state) {
  return {
    fundingResourceUrl: state.resourceUrl,
    paymentHash: state.paymentPayload.payload.transaction.hash,
    network: state.requirement.network,
  };
}

function custodyFor(input, state) {
  return CAPTURE({
    originalRequestJson: input.originalRequestJson,
    originalBodyBase64: input.originalBodyBase64,
    serviceResourceUrl: input.serviceResourceUrl,
  }, binding(state));
}

function slot(key) {
  return JSON.stringify([key.grantId, key.requestId]);
}

// Owned synchronous structural store. Private fields make receiver preservation
// observable. Its envelopes use the actual pure custody contract.
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
    if (this.#control.onLoad !== null) {
      return this.#control.onLoad(this.#loads, this.#control.state);
    }
    return this.#control.state;
  }

  getOriginalRequest(key) {
    this.#control.log.push('get');
    this.#gets++;
    const value = this.#rows.get(slot(key)) ?? null;
    if (this.#control.onGet !== null) {
      return this.#control.onGet(this.#gets, key, value);
    }
    return value;
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
    if (this.#control.onRetain !== null) {
      return this.#control.onRetain(retained);
    }
    return retained;
  }

  seed(record) {
    const retained = PARSE(SERIALIZE(record));
    this.#rows.set(slot(retained), retained);
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

  on(event, listener) {
    const listeners = this.#listeners.get(event) ?? [];
    listeners.push(listener);
    this.#listeners.set(event, listeners);
    return this;
  }

  emit(event, ...args) {
    const listeners = this.#listeners.get(event) ?? [];
    for (const listener of listeners.slice()) listener(...args);
  }

  forceClose() {
    if (this.#closed) return;
    this.#closed = true;
    APPLY(EMIT, this, ['close']);
  }
}
const EMIT = OwnedEmitter.prototype.emit;
const FORCE_CLOSE = OwnedEmitter.prototype.forceClose;

class OwnedHandle extends OwnedEmitter {
  #resolveDestroy;

  constructor(autoClose) {
    super();
    this.autoClose = autoClose;
    this.destroyCalls = 0;
    this.destroyObserved = new Promise(resolve => {
      this.#resolveDestroy = resolve;
    });
  }

  destroy(...args) {
    assert.equal(args.length, 0, 'destroy receives no exception or credential');
    this.destroyCalls++;
    this.#resolveDestroy(undefined);
    if (this.autoClose) APPLY(FORCE_CLOSE, this, []);
    return this;
  }
}

class FakeRequest extends OwnedHandle {
  constructor(autoClose) {
    super(autoClose);
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
  constructor(autoClose) {
    super(autoClose);
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
    maxRequests: settings.maxRequests ?? 2,
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
    clients: [],
    handles: [],
    exchanges: [],
    sinks: [],
    watchdogs: new Set(),
    autoClose: false,
    onRequest: null,
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
      const client = CREATE(this.configuration(overrides));
      this.clients.push(client);
      return client;
    },

    submit(client, input) {
      return this.observe(client.submitOriginal(input));
    },

    close(client) {
      return this.observe(client.close());
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

    endGood(exchange) {
      exchange.response.complete = true;
      this.emit(exchange.response, 'data', Buffer.from(REPLY));
      this.emit(exchange.response, 'end');
    },

    complete(exchange) {
      this.respond(exchange);
      this.endGood(exchange);
      this.force(exchange.request);
      this.force(exchange.response);
    },
  };

  f.requestImpl = function requestImpl(url, options, callback) {
    assert.equal(this, undefined, 'transport has no caller-selected receiver');
    assert.equal(arguments.length, 3);
    const request = new FakeRequest(f.autoClose);
    const response = new FakeResponse(f.autoClose);
    const exchange = { url, options, callback, request, response };
    f.handles.push(request, response);
    f.exchanges.push(exchange);
    if (f.onRequest !== null) f.onRequest(exchange);
    return request;
  };

  t.after(async () => {
    // Close admission first, then force-close every owned raw fake through
    // captured methods. This runs even after an assertion or watchdog failure.
    for (const client of f.clients) f.observe(client.close());
    for (const cancel of [...f.watchdogs]) cancel();
    for (const handle of f.handles) APPLY(FORCE_CLOSE, handle, []);
    await Promise.all(f.sinks);
    for (const client of f.clients) {
      const last = client.snapshot().lastTransport;
      if (last !== null) assert.equal(last.timerArmed, false);
    }
    assert.equal(f.watchdogs.size, 0);
    assert.equal(control.closeCalls, 0);
  });
  return f;
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
    const cancel = () => finish(false, new Error('SYNTHETIC_WAIT_CANCELLED'));
    timer = nativeSetTimeout(() => {
      finish(false, new Error('SYNTHETIC_WAIT_TIMEOUT'));
    }, 1000);
    f.watchdogs.add(cancel);
    promise.then(
      value => finish(true, value),
      error => finish(false, error),
    );
  });
  return f.observe(waited);
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
  assert.equal(settled, false, 'operation must still await interface closure');
}

function safeError(error) {
  assert.ok(error instanceof TypeError);
  assert.equal(typeof error.code, 'string');
  assert.ok(error.code.startsWith(CP) || error.code.startsWith(OP));
  assert.equal(error.message, error.code);
  assert.equal(error.stack, 'TypeError: ' + error.code);
  assert.ok(Object.isFrozen(error));
  const text = JSON.stringify(error) + error.message + error.stack;
  for (const value of [
    SECRET, SERVICE, FUNDING, HASH, GRANT, 'request.one',
    'opaque-original', 'declared-signature', 'ServiceCredit ',
  ]) {
    assert.equal(text.includes(value), false, 'error must remain redacted');
  }
  return true;
}

function redacted(snapshot) {
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.owner));
  assert.ok(Object.isFrozen(snapshot.owner.counts));
  assert.ok(Object.isFrozen(snapshot.owner.uncertainty));
  if (snapshot.lastTransport !== null) {
    assert.ok(Object.isFrozen(snapshot.lastTransport));
    assert.ok(Object.isFrozen(snapshot.lastTransport.counts));
  }
  const text = JSON.stringify(snapshot);
  assert.ok(text.length <= 4096, 'snapshot is bounded metadata');
  for (const value of [
    SECRET, SERVICE, FUNDING, HASH, GRANT, 'request.one',
    'opaque-original', 'declared-public-key', 'declared-signature',
    'ServiceCredit ',
  ]) {
    assert.equal(text.includes(value), false, 'snapshot must remain redacted');
  }
  assert.equal(snapshot.storeOwnership, 'BORROWED');
  assert.equal(snapshot.boundEstablishesAuthority, false);
  assert.equal(snapshot.qualification, 'SYNTHETIC_COMPOSITION_ONLY');
  for (const field of [
    'serviceDelivery', 'currentAuthority', 'realReady',
    'durability', 'restart', 'pilot',
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
    getPrototypeOf: trap,
    setPrototypeOf: trap,
    ownKeys: trap,
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
    'bodyless client fences custody before transport and waits for closes',
    async t => {
      const f = fixture(t);
      const client = f.make();
      const input = inputFor();
      const originalFunding = JSON.stringify(f.control.state);
      assert.deepEqual(f.control.log, []);
      assert.equal(client.snapshot().lastTransport, null);

      let fenceObserved = false;
      f.onRequest = exchange => {
        assert.deepEqual(f.control.log, [
          'load', 'get', 'retain', 'get', 'load',
        ]);
        const record = f.store.row(keyFor());
        assert.equal(record.originalRequestJson, input.originalRequestJson);
        assert.equal(record.originalBodyBase64, '');
        assert.equal(record.serviceResourceUrl, SERVICE);
        assert.equal(record.fundingResourceUrl, FUNDING);
        assert.equal(record.paymentHash, HASH);
        assert.equal(record.network, NETWORK);
        assert.equal(JSON.stringify(record).includes('ServiceCredit '), false);
        assert.equal(JSON.stringify(f.control.state), originalFunding);
        assert.equal(exchange.url, SERVICE);
        assert.deepEqual(exchange.options, {
          method: 'POST',
          headers: { Authorization: input.authorizationHeader },
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

      const operation = f.submit(client, input);
      assert.equal(Object.getPrototypeOf(operation), Promise.prototype);
      assert.equal(fenceObserved, true);
      assert.equal(f.exchanges.length, 1);
      const exchange = f.exchanges[0];
      assert.equal(exchange.request.endCalls, 1);
      assert.equal(exchange.request.writeCalls, 0);
      f.respond(exchange);

      const first = Buffer.from(REPLY.subarray(0, 7));
      f.emit(exchange.response, 'data', first);
      first.fill(0);
      f.emit(exchange.response, 'data', Buffer.from(REPLY.subarray(7)));
      exchange.response.complete = true;
      f.emit(exchange.response, 'end');
      await assertPending(operation);

      f.force(exchange.request);
      await assertPending(operation);
      f.force(exchange.response);
      assert.equal(await operation, undefined);

      const snapshot = client.snapshot();
      assert.equal(snapshot.owner.phase, 'CALLBACK_COMPLETED');
      assert.equal(snapshot.owner.counts.readbackConfirmations, 1);
      assert.equal(snapshot.owner.counts.dispatchCalls, 1);
      assert.equal(snapshot.owner.counts.callbackCompletions, 1);
      assert.equal(snapshot.lastTransport.phase, 'INTERFACE_COMPLETED');
      assert.equal(snapshot.lastTransport.counts.requestCalls, 1);
      assert.equal(snapshot.lastTransport.counts.endCalls, 1);
      assert.equal(snapshot.lastTransport.counts.settlements, 1);
      assert.equal(snapshot.lastTransport.credentialReferenceReleased, true);
      assert.equal(snapshot.lastTransport.timerArmed, false);
      assert.equal(JSON.stringify(f.control.state), originalFunding);
      redacted(snapshot);
      assert.equal(await f.close(client), undefined);
    },
  ],
  [
    'preflight rejects hostile or mismatched input before store access',
    async t => {
      const f = fixture(t);
      let touches = 0;
      const touch = () => { touches++; };
      const getter = () => {
        touch();
        throw new Error(SECRET);
      };

      assert.throws(() => CREATE(), { code: CP + 'INVALID_CONFIGURATION' });
      assert.throws(() => CREATE(f.configuration(), null), {
        code: CP + 'INVALID_CONFIGURATION',
      });

      const getterConfig = f.configuration();
      Object.defineProperty(getterConfig, 'requestImpl', {
        get: getter,
        enumerable: true,
      });
      const getterPolicy = {
        policyVersion: 1,
        maxRequests: 2,
      };
      Object.defineProperty(getterPolicy, 'serviceResourceUrl', {
        get: getter,
        enumerable: true,
      });
      const getterStore = {};
      Object.defineProperty(getterStore, 'load', { get: getter });
      const numericObject = {};
      Object.defineProperty(numericObject, Symbol.toPrimitive, { get: getter });
      const hiddenConfig = f.configuration();
      Object.defineProperty(hiddenConfig, 'selectedGrantId', {
        value: GRANT,
        enumerable: false,
      });
      const symbolicConfig = f.configuration();
      symbolicConfig[Symbol('extra')] = true;

      const badConfigurations = [
        null,
        [],
        poisonProxy(f.configuration(), touch),
        Object.create(poisonProxy({}, touch)),
        getterConfig,
        hiddenConfig,
        symbolicConfig,
        { ...f.configuration(), extra: true },
        f.configuration({ requestImpl: poisonProxy(function () {}, touch) }),
        f.configuration({ requestImpl: null }),
        f.configuration({ deadlineMs: numericObject }),
        f.configuration({ deadlineMs: 0 }),
        f.configuration({ deadlineMs: -0 }),
        f.configuration({ deadlineMs: 60001 }),
        f.configuration({ deadlineMs: 1.5 }),
        f.configuration({ custodyPolicy: getterPolicy }),
        f.configuration({ custodyPolicy: poisonProxy(f.policy, touch) }),
        f.configuration({ selectedGrantId: 'bad://grant' }),
        f.configuration({ fundingResourceUrl: 'http://synthetic.invalid/credit' }),
        f.configuration({ store: getterStore }),
        f.configuration({ store: poisonProxy(f.store, touch) }),
        f.configuration({
          store: Object.create(poisonProxy({}, touch)),
        }),
      ];
      for (const configuration of badConfigurations) {
        assert.throws(() => CREATE(configuration), {
          code: CP + 'INVALID_CONFIGURATION',
        });
      }

      const client = f.make();
      const valid = inputFor();
      const parsed = JSON.parse(valid.originalRequestJson);
      const badAuthBom = 'ServiceCredit ' + Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(proofJson(), 'utf8'),
      ]).toString('base64url');
      const originalObject = {};
      Object.defineProperty(originalObject, Symbol.toPrimitive, { get: getter });

      const getterInput = { ...valid };
      Object.defineProperty(getterInput, 'authorizationHeader', {
        get: getter,
        enumerable: true,
      });
      const hiddenInput = { ...valid };
      Object.defineProperty(hiddenInput, 'requestId', {
        value: valid.requestId,
        enumerable: false,
      });
      const symbolicInput = { ...valid };
      symbolicInput[Symbol('extra')] = true;

      const badInputs = [
        null,
        [],
        poisonProxy(valid, touch),
        Object.create(poisonProxy({}, touch)),
        getterInput,
        hiddenInput,
        symbolicInput,
        { ...valid, extra: true },
        { ...valid, authorizationHeader: 'Bearer invalid' },
        { ...valid, authorizationHeader: valid.authorizationHeader + '=' },
        { ...valid, authorizationHeader: badAuthBom },
        { ...valid, authorizationHeader: originalObject },
        { ...valid, originalRequestJson: originalObject },
        { ...valid, originalRequestJson: '\ufeff' + valid.originalRequestJson },
        { ...valid, originalRequestJson: ' ' + valid.originalRequestJson },
        { ...valid, originalRequestJson: JSON.stringify({
          ...parsed, maxCostUnits: 0,
        }) },
        { ...valid, originalRequestJson: JSON.stringify({
          ...parsed, maxCostUnits: 2,
        }) },
        { ...valid, originalRequestJson: JSON.stringify({
          ...parsed, maxCostUnits: '1',
        }) },
        { ...valid, authorizationHeader: authorization(GRANT, 'request.one', 2) },
        { ...valid, requestId: 'request.other' },
        {
          ...valid,
          originalRequestJson: originalJson(GRANT, 'request.other'),
          authorizationHeader: authorization(GRANT, 'request.other'),
        },
        {
          ...valid,
          originalRequestJson: originalJson('grant.other', 'request.one'),
          authorizationHeader: authorization('grant.other', 'request.one'),
        },
        { ...valid, grantId: 'bad://grant' },
        { ...valid, originalBodyBase64: 'AQ==' },
        { ...valid, serviceResourceUrl: SERVICE + '?extra=1' },
        {
          ...valid,
          serviceResourceUrl: 'https://synthetic.invalid/another',
        },
      ];
      for (const input of badInputs) {
        await assert.rejects(f.submit(client, input), {
          code: CP + 'INVALID_INPUT',
        });
      }
      await assert.rejects(f.submit(
        client,
        inputFor('request.one', 1, 'grant.other'),
      ), { code: CP + 'FOREIGN_GRANT' });
      await assert.rejects(f.observe(client.submitOriginal()), {
        code: CP + 'INVALID_INPUT',
      });
      await assert.rejects(f.observe(client.submitOriginal(valid, function () {})), {
        code: CP + 'INVALID_INPUT',
      });
      assert.throws(() => client.readOriginal(), { code: CP + 'INVALID_INPUT' });
      assert.throws(() => client.readOriginal(keyFor(), null), {
        code: CP + 'INVALID_INPUT',
      });
      assert.throws(() => client.readOriginal(keyFor('request.one', 'grant.other')), {
        code: OP + 'FOREIGN_GRANT',
      });
      const getterKey = { grantId: GRANT };
      Object.defineProperty(getterKey, 'requestId', {
        get: getter,
        enumerable: true,
      });
      assert.throws(() => client.readOriginal(getterKey), {
        code: OP + 'INVALID_INPUT',
      });
      assert.throws(() => client.readOriginal(poisonProxy(keyFor(), touch)), {
        code: OP + 'INVALID_INPUT',
      });

      assert.equal(touches, 0);
      assert.deepEqual(f.control.log, []);
      assert.equal(f.exchanges.length, 0);
      assert.equal(f.store.size(), 0);
      assert.equal(client.snapshot().lastTransport, null);
      assert.equal(await f.close(client), undefined);
    },
  ],
  [
    'distinct requests share one client without replay or capacity bypass',
    async t => {
      const f = fixture(t, { maxRequests: 2 });
      const client = f.make();
      const fundingBefore = JSON.stringify(f.control.state);
      const inputs = [inputFor('request.one'), inputFor('request.two', 2)];
      const snapshots = [];

      for (let index = 0; index < inputs.length; index++) {
        const input = inputs[index];
        const operation = f.submit(client, input);
        assert.equal(f.exchanges.length, index + 1);
        const exchange = f.exchanges[index];
        assert.equal(exchange.options.headers.Authorization,
          input.authorizationHeader);
        assert.equal(exchange.request.endCalls, 1);
        assert.equal(exchange.request.writeCalls, 0);
        assert.equal(f.store.row(keyFor(input.requestId)).originalRequestJson,
          input.originalRequestJson);
        assert.equal(JSON.stringify(f.control.state), fundingBefore);
        f.complete(exchange);
        assert.equal(await operation, undefined);
        const snapshot = client.snapshot();
        assert.equal(snapshot.lastTransport.counts.requestCalls, 1);
        assert.equal(snapshot.lastTransport.counts.settlements, 1);
        assert.equal(snapshot.lastTransport.credentialReferenceReleased, true);
        snapshots.push(snapshot.lastTransport);
      }

      assert.notEqual(f.exchanges[0].request, f.exchanges[1].request);
      assert.notEqual(f.exchanges[0].callback, f.exchanges[1].callback);
      assert.notEqual(inputs[0].authorizationHeader, inputs[1].authorizationHeader);
      assert.equal(snapshots[0].phase, 'INTERFACE_COMPLETED');
      assert.equal(snapshots[1].phase, 'INTERFACE_COMPLETED');

      const lastBeforeRefusal = client.snapshot().lastTransport;
      await assert.rejects(f.submit(client, inputs[0]), {
        code: OP + 'RECOVERY_REQUIRED',
      });
      assert.equal(f.exchanges.length, 2);
      assert.deepEqual(client.snapshot().lastTransport, lastBeforeRefusal);

      await assert.rejects(f.submit(client, inputFor('request.three', 3)), {
        code: OP + 'CAPACITY',
      });
      assert.equal(f.exchanges.length, 2);
      assert.equal(f.store.size(), 2);
      const snapshot = client.snapshot();
      assert.equal(snapshot.owner.trackedRequests, 2);
      assert.equal(snapshot.owner.counts.retainCalls, 2);
      assert.equal(snapshot.owner.counts.dispatchCalls, 2);
      assert.equal(snapshot.owner.counts.callbackCompletions, 2);
      assert.deepEqual(snapshot.lastTransport, lastBeforeRefusal);
      assert.equal(JSON.stringify(f.control.state), fundingBefore);
      redacted(snapshot);
      assert.equal(await f.close(client), undefined);
    },
  ],
  [
    'fresh clients recover metadata without acquiring replay authority',
    async t => {
      const f = fixture(t);
      const input = inputFor();
      const retained = custodyFor(input, f.control.state);
      f.store.seed(retained);
      const client = f.make();

      const recovered = client.readOriginal(keyFor());
      assert.equal(SERIALIZE(recovered), SERIALIZE(retained));
      assert.ok(Object.isFrozen(recovered));
      assert.deepEqual(f.control.log, ['load', 'get', 'load']);
      assert.equal(f.exchanges.length, 0);
      assert.equal(client.snapshot().lastTransport, null);

      await assert.rejects(f.submit(client, input), {
        code: OP + 'RECOVERY_REQUIRED',
      });
      await assert.rejects(f.submit(client, inputFor('request.one', 2)), {
        code: OP + 'CONFLICT',
      });
      assert.equal(f.exchanges.length, 0);
      assert.equal(f.control.log.includes('retain'), false);
      assert.equal(client.snapshot().lastTransport, null);

      f.control.state = { ...f.control.state, status: 'PREPARED' };
      const nonBoundRecovered = client.readOriginal(keyFor());
      assert.equal(SERIALIZE(nonBoundRecovered), SERIALIZE(retained));
      await assert.rejects(f.submit(client, input), {
        code: OP + 'FUNDING_NOT_BOUND',
      });
      assert.equal(f.exchanges.length, 0);

      f.control.state = { ...f.control.state, status: 'BOUND' };
      const anotherFreshClient = f.make();
      await assert.rejects(f.submit(anotherFreshClient, input), {
        code: OP + 'RECOVERY_REQUIRED',
      });
      assert.equal(SERIALIZE(anotherFreshClient.readOriginal(keyFor())),
        SERIALIZE(retained));
      assert.equal(anotherFreshClient.snapshot().owner.trackedRequests, 0);
      assert.equal(anotherFreshClient.snapshot().lastTransport, null);
      assert.equal(f.control.log.includes('retain'), false);
      assert.equal(f.exchanges.length, 0);
      assert.equal(f.store.size(), 1);
      assert.equal(await f.close(client), undefined);
      assert.equal(await f.close(anotherFreshClient), undefined);
    },
  ],
  [
    'custody failures remain held and never close the borrowed store',
    async t => {
      const modes = [
        'load-throws',
        'retain-throws-after-retention',
        'retained-envelope-mismatch',
        'readback-mismatch',
        'changed-binding',
      ];
      for (const mode of modes) {
        const f = fixture(t);
        const client = f.make();
        const input = inputFor();
        if (mode === 'load-throws') {
          f.control.onLoad = () => { throw new Error(SECRET); };
        } else if (mode === 'retain-throws-after-retention') {
          f.control.onRetain = () => { throw new Error(SECRET); };
        } else if (mode === 'retained-envelope-mismatch') {
          f.control.onRetain = record => ({
            ...record,
            originalBodyBase64: 'AQ==',
          });
        } else if (mode === 'readback-mismatch') {
          f.control.onGet = (ordinal, key, record) => ordinal === 2
            ? { ...record, checksum: 'invalid' }
            : record;
        } else {
          f.control.onLoad = (ordinal, state) => ordinal === 2
            ? { ...state, revision: state.revision + 1 }
            : state;
        }

        await assert.rejects(f.submit(client, input), error => {
          assert.equal(error.code, OP + 'CUSTODY_OUTCOME_UNKNOWN');
          return safeError(error);
        });
        assert.equal(f.exchanges.length, 0);
        assert.equal(client.snapshot().lastTransport, null);
        assert.equal(client.snapshot().owner.uncertainty.custody, true);
        const logAfterFailure = f.control.log.slice();

        // Removing the injected fault is not a client reset.
        f.control.onLoad = null;
        f.control.onGet = null;
        f.control.onRetain = null;
        await assert.rejects(f.submit(client, input), {
          code: CP + 'CUSTODY_OUTCOME_UNKNOWN',
        });
        assert.deepEqual(f.control.log, logAfterFailure);
        assert.equal(f.exchanges.length, 0);

        const closing = f.close(client);
        assert.equal(client.close(), closing);
        await assert.rejects(closing, error => {
          assert.equal(error.code, OP + 'CLOSE_FAILED');
          return safeError(error);
        });
        assert.equal(client.close(), closing);
        assert.equal(client.snapshot().owner.closeOutcome, 'UNKNOWN');
        assert.equal(f.control.closeCalls, 0);
        redacted(client.snapshot());
      }
    },
  ],
  [
    'deadline and response failure drain captured handles before unknown close',
    async t => {
      const thrown = fixture(t);
      let requestCalls = 0;
      const thrownClient = thrown.make({
        requestImpl() {
          requestCalls++;
          throw new Error(SECRET);
        },
      });
      const thrownInput = inputFor();
      await assert.rejects(thrown.submit(thrownClient, thrownInput), error => {
        assert.equal(error.code, OP + 'SUBMISSION_OUTCOME_UNKNOWN');
        return safeError(error);
      });
      const unknownSnapshot = thrownClient.snapshot();
      assert.equal(unknownSnapshot.owner.closed, false);
      assert.equal(unknownSnapshot.owner.uncertainty.submission, true);
      assert.equal(unknownSnapshot.lastTransport.phase, 'UNKNOWN_UNDRAINED');
      assert.equal(unknownSnapshot.lastTransport.credentialReferenceReleased, true);
      assert.equal(unknownSnapshot.lastTransport.timerArmed, false);
      assert.equal(requestCalls, 1);
      const logBeforeHeldSubmit = thrown.control.log.slice();
      await assert.rejects(thrown.submit(thrownClient, inputFor('request.next')), {
        code: CP + 'SUBMISSION_OUTCOME_UNKNOWN',
      });
      assert.deepEqual(thrown.control.log, logBeforeHeldSubmit);
      assert.equal(requestCalls, 1);
      const retained = thrownClient.readOriginal(keyFor());
      assert.equal(retained.originalRequestJson, thrownInput.originalRequestJson);
      assert.equal(retained.originalBodyBase64, '');
      assert.equal(requestCalls, 1);
      const thrownClose = thrown.close(thrownClient);
      assert.equal(thrownClient.close(), thrownClose);
      await assert.rejects(thrownClose, error => {
        assert.equal(error.code, OP + 'CLOSE_FAILED');
        return safeError(error);
      });
      assert.equal(thrown.control.closeCalls, 0);
      redacted(thrownClient.snapshot());

      for (const mode of ['deadline', 'response-failure']) {
        const f = fixture(t, { deadlineMs: mode === 'deadline' ? 10 : 2000 });
        const client = f.make();
        const input = inputFor();
        const originalFunding = JSON.stringify(f.control.state);
        const operation = f.submit(client, input);
        const exchange = f.exchanges[0];

        if (mode === 'response-failure') exchange.response.statusCode = 503;
        f.respond(exchange);
        const closing = f.close(client);
        assert.equal(client.close(), closing);
        assert.equal(Object.getPrototypeOf(closing), Promise.prototype);

        if (mode === 'deadline') {
          await boundedWait(f, exchange.request.destroyObserved);
        }
        assert.equal(exchange.request.destroyCalls, 1);
        assert.equal(exchange.response.destroyCalls, 1);
        await assertPending(operation);
        await assertPending(closing);

        // A late well-formed reply cannot turn the latched unknown into success.
        exchange.response.statusCode = 200;
        f.emit(exchange.response, 'error', new Error(SECRET));
        f.endGood(exchange);
        assert.equal(client.snapshot().lastTransport.replyValidated, false);
        assert.equal(client.snapshot().lastTransport.unknown, true);
        f.force(exchange.request);
        await assertPending(operation);
        await assertPending(closing);
        f.force(exchange.response);

        await assert.rejects(operation, error => {
          assert.equal(error.code, OP + 'SUBMISSION_OUTCOME_UNKNOWN');
          return safeError(error);
        });
        await assert.rejects(closing, error => {
          assert.equal(error.code, OP + 'CLOSE_FAILED');
          return safeError(error);
        });
        assert.equal(client.close(), closing);
        const snapshot = client.snapshot();
        assert.equal(snapshot.owner.uncertainty.submission, true);
        assert.equal(snapshot.owner.closeOutcome, 'UNKNOWN');
        assert.equal(snapshot.lastTransport.deadlineFired, mode === 'deadline');
        assert.equal(snapshot.lastTransport.timerArmed, false);
        assert.equal(snapshot.lastTransport.counts.requestCalls, 1);
        assert.equal(snapshot.lastTransport.counts.settlements, 1);
        assert.equal(snapshot.lastTransport.requestClosed, true);
        assert.equal(snapshot.lastTransport.responseClosed, true);
        await assert.rejects(f.submit(client, input), { code: CP + 'CLOSED' });
        assert.equal(f.exchanges.length, 1);
        assert.equal(JSON.stringify(f.control.state), originalFunding);
        assert.equal(f.control.closeCalls, 0);
        redacted(snapshot);
      }
    },
  ],
  [
    'reentrant close preserves busy gates and one shared promise',
    async t => {
      const f = fixture(t);
      let client;
      let nested;
      let future;
      let closing;
      let busyReadObserved = false;
      let reentryObserved = false;

      f.onRequest = () => {
        nested = f.submit(client, inputFor('request.nested'));
        assert.throws(() => client.readOriginal(keyFor()), {
          code: OP + 'BUSY',
        });
        busyReadObserved = true;
        closing = f.close(client);
        assert.equal(client.close(), closing);
        assert.equal(client.snapshot().owner.closed, true);
        future = f.submit(client, inputFor('request.future'));
        assert.throws(() => client.readOriginal(keyFor()), {
          code: OP + 'CLOSED',
        });
        reentryObserved = true;
        // The fake request is returned by fixture.requestImpl. The callback
        // does not return or depend on the client's close promise.
      };

      client = f.make();
      const operation = f.submit(client, inputFor());
      assert.equal(reentryObserved, true);
      assert.equal(busyReadObserved, true);
      assert.equal(f.exchanges.length, 1);
      assert.equal(f.exchanges[0].request.endCalls, 1);
      await assert.rejects(nested, { code: CP + 'BUSY' });
      await assert.rejects(future, { code: CP + 'CLOSED' });
      await assertPending(operation);
      await assertPending(closing);

      const exchange = f.exchanges[0];
      f.respond(exchange);
      f.endGood(exchange);
      await assertPending(closing);
      f.force(exchange.response);
      await assertPending(operation);
      await assertPending(closing);
      f.force(exchange.request);

      assert.equal(await operation, undefined);
      assert.equal(await closing, undefined);
      assert.equal(client.close(), closing);
      assert.equal(await client.close(), undefined);
      await assert.rejects(f.observe(client.close(null)), {
        code: CP + 'INVALID_INPUT',
      });
      assert.equal(client.close(), closing);
      await assert.rejects(f.submit(client, inputFor('request.after-close')), {
        code: CP + 'CLOSED',
      });
      assert.equal(f.exchanges.length, 1);
      const snapshot = client.snapshot();
      assert.equal(snapshot.owner.closed, true);
      assert.equal(snapshot.owner.active, false);
      assert.equal(snapshot.owner.closeOutcome, 'DRAINED');
      assert.equal(snapshot.owner.counts.dispatchCalls, 1);
      assert.equal(snapshot.owner.counts.callbackCompletions, 1);
      assert.equal(snapshot.lastTransport.counts.settlements, 1);
      assert.equal(f.control.closeCalls, 0);
      redacted(snapshot);
    },
  ],
  [
    'frozen redacted APIs preserve captured structural store receivers',
    async t => {
      assert.deepEqual(Object.keys(clientModule), [
        'createServiceCreditCustodiedHttpClient',
        'createServiceCreditCustodiedHttpClientV3',
      ]);
      const f = fixture(t);
      const configuration = f.configuration();
      const client = CREATE(configuration);
      f.clients.push(client);
      assert.deepEqual(Object.keys(client), [
        'submitOriginal', 'readOriginal', 'readOriginalRecoveryState', 'snapshot', 'close',
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
      const submit = client.submitOriginal;
      const read = client.readOriginal;
      const snapshot = client.snapshot;
      const close = client.close;
      const input = inputFor();
      const originalInput = { ...input };
      const originalFunding = JSON.stringify(f.control.state);

      await assert.rejects(f.observe(submit(poisonProxy(input, touch))), error => {
        assert.equal(error.code, CP + 'INVALID_INPUT');
        return safeError(error);
      });
      const bad = { ...input };
      Object.defineProperty(bad, 'authorizationHeader', {
        get: getter,
        enumerable: true,
      });
      await assert.rejects(f.observe(submit(bad)), error => {
        assert.equal(error.code, CP + 'INVALID_INPUT');
        return safeError(error);
      });
      assert.throws(() => snapshot(null), error => {
        assert.equal(error.code, CP + 'INVALID_INPUT');
        return safeError(error);
      });
      await assert.rejects(f.observe(close(null)), {
        code: CP + 'INVALID_INPUT',
      });
      assert.deepEqual(f.control.log, []);
      assert.equal(f.exchanges.length, 0);
      assert.equal(snapshot().lastTransport, null);
      redacted(snapshot());

      // These shadows are installed only after the actual owner captured
      // the class's private-field methods. No getter may run on later calls.
      for (const name of ['load', 'getOriginalRequest', 'retainOriginalRequest']) {
        Object.defineProperty(f.store, name, {
          get: getter,
          enumerable: true,
          configurable: true,
        });
      }
      Object.defineProperty(f.store, 'close', {
        get: getter,
        enumerable: true,
        configurable: true,
      });
      for (const name of Object.keys(configuration)) {
        Object.defineProperty(configuration, name, {
          get: getter,
          enumerable: true,
          configurable: true,
        });
      }

      f.control.onRetain = record => {
        // Raw caller properties can change during retention. The captured
        // exact strings, private callback and stored metadata remain fixed.
        for (const name of Object.keys(input)) {
          Object.defineProperty(input, name, {
            get: getter,
            enumerable: true,
            configurable: true,
          });
        }
        return record;
      };

      const operation = f.observe(submit(input));
      assert.equal(f.exchanges.length, 1);
      const exchange = f.exchanges[0];
      assert.equal(exchange.options.headers.Authorization,
        originalInput.authorizationHeader);
      assert.equal(f.store.row(keyFor()).originalRequestJson,
        originalInput.originalRequestJson);
      assert.deepEqual(f.control.log, [
        'load', 'get', 'retain', 'get', 'load',
      ]);
      assert.equal(touches, 0);
      redacted(snapshot());
      f.complete(exchange);
      assert.equal(await operation, undefined);

      const transportCount = f.exchanges.length;
      const recovered = read(keyFor());
      assert.equal(recovered.originalRequestJson,
        originalInput.originalRequestJson);
      assert.equal(recovered.originalBodyBase64, '');
      assert.equal(recovered.paymentHash, HASH);
      assert.equal(recovered.network, NETWORK);
      assert.equal(f.exchanges.length, transportCount);
      assert.equal(JSON.stringify(recovered).includes('ServiceCredit '), false);
      assert.equal(JSON.stringify(f.control.state), originalFunding);
      assert.equal(touches, 0);
      redacted(snapshot());

      const closing = f.observe(close());
      assert.equal(close(), closing);
      assert.equal(await closing, undefined);
      assert.equal(close(), closing);
      assert.equal(f.control.closeCalls, 0);
      assert.equal(touches, 0);
      redacted(snapshot());
    },
  ],
];

// Default registers all eight. A numeric path registers exactly one callback;
// there are no skipped registrations, old-unit imports or discovery filters.
// Test timeouts/watchdogs are diagnostics, not hard resource-lifetime proof.
if (selector === null) {
  for (const [name, callback] of groups) {
    test(name, { timeout: 5000 }, callback);
  }
} else {
  const [name, callback] = groups[Number(selector) - 1];
  test(name, { timeout: 5000 }, callback);
}
