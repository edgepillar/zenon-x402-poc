import test from 'node:test';
import {
  equal as q, deepEqual as same, notEqual as ne, throws, rejects, ok,
} from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as setTimer, clearTimeout as clearTimer } from 'node:timers';

// Isolated injected-transport lifecycle entry. Existing helpers and all eight
// scenarios are unchanged; the original server/client-DATA-pinned unit remains.

if (process.argv.length > 3
    || (process.argv.length === 3 && !/^[1-8]$/.test(process.argv[2]))) {
  throw new Error('INVALID_SCENARIO_SELECTOR');
}
const selector = process.argv[2] ?? 'all';
const specs = [
  ['../src/service-credit-http-execute-dispatch.js',
    27034, '254ba8eef5ea5efb3a1b901be09e9cb33afbc3cfcf63789ca4a23316b6180d1b'],
  ['../src/service-credit-custodied-request-owner.js', 22965,
    '4dabb9c49179e9d6533f5c3066faf730fa6d7deb3c4407d132841c1de4183f85'],
  ['../src/service-credit-original-request-custody-contract.js', 9810,
    '8f4d40d017a89e9a064c411c8e076cb21a45b9fb787fda7a664246b7bd744083'],
  ['../package.json', 1413,
    '8c9a25504fbf6f87c31cdf245a6f4eec5a88cc89c8352151dc66a577c5771ef5'],
];
const pins = specs.map(([path, bytes, sha]) => {
  const url = new URL(path, import.meta.url);
  const raw = readFileSync(url);
  q(raw.length, bytes);
  q(createHash('sha256').update(raw).digest('hex'), sha);
  const text = raw.toString('utf8');
  q(/[^\x00-\x7f]/.test(text), false);
  ok(text.endsWith('\n'));
  return Object.freeze({ url: url.href, text });
});
q(JSON.parse(pins[3].text).type, 'module');
q(JSON.parse(pins[3].text).engines.node, '>=24');
ok(Number(process.versions.node.split('.')[0]) >= 24);
// Package stays DATA. No server/client/verifier, HTTP/TLS, SQL or SDK import.
const { createServiceCreditHttpExecuteDispatch: createDispatch } = await import(pins[0].url);
const { createServiceCreditCustodiedRequestOwner: createOwner } = await import(pins[1].url);
const {
  captureOriginalServiceRequestCustody: capture,
  parseOriginalServiceRequestCustody: parse,
  serializeOriginalServiceRequestCustody: serialize,
} = await import(pins[2].url);

const P = Promise, THEN = P.prototype.then, APPLY = Reflect.apply;
const RESOURCE = 'https://dispatch.example.test/service-credit/v1/execute';
const FUNDING = 'https://dispatch.example.test/funding';
const NETWORK = 'zenon:declared';
const HASH = 'a'.repeat(64);
const EMPTY = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const GOOD = JSON.stringify({ ok: true, resultCode: 'result_OK' });
const PREFIX = 'SERVICE_CREDIT_HTTP_EXECUTE_DISPATCH_';
const OWNER_PREFIX = 'SERVICE_CREDIT_CUSTODIED_REQUEST_OWNER_';
const errorCode = (prefix, suffix) => error => error instanceof TypeError
  && error.name === 'TypeError' && error.code === prefix + suffix
  && error.message === prefix + suffix && error.stack === 'TypeError: ' + prefix + suffix;
const code = suffix => errorCode(PREFIX, suffix);
const ownerCode = suffix => errorCode(OWNER_PREFIX, suffix);
const unknownError = error => code('OUTCOME_UNKNOWN')(error)
  || code('UNKNOWN_UNDRAINED')(error);

function original(grantId = 'grant_A', requestId = 'request_A', maxCostUnits = 7) {
  return {
    grantId, requestId,
    originalRequestJson: JSON.stringify({
      modelVersion: 1, grantId, requestId, method: 'POST',
      routeId: 'service-credit.execute.v1', canonicalBodyDigest: EMPTY,
      selectedContentType: 'application/json', maxCostUnits,
    }),
    originalBodyBase64: '',
    serviceResourceUrl: RESOURCE,
  };
}
const value = original();
const binding = Object.freeze({
  fundingResourceUrl: FUNDING, paymentHash: HASH, network: NETWORK,
});
const record = capture({
  originalRequestJson: value.originalRequestJson,
  originalBodyBase64: '',
  serviceResourceUrl: RESOURCE,
}, binding);

function authorization(change = {}, textTransform) {
  // Declared syntax only: no key generation, signing or verification.
  const proof = {
    grantId: 'grant_A', maxCostUnits: 7, proofVersion: 1,
    publicKey: 'declared-public-key', requestId: 'request_A',
    signature: 'declared-signature',
    ...change,
  };
  let text = JSON.stringify(proof);
  if (textTransform) text = textTransform(text);
  return 'ServiceCredit ' + Buffer.from(text, 'utf8').toString('base64url');
}
const AUTH = authorization();

function goodHeaders(text = GOOD) {
  return [
    'Cache-Control', 'private, no-store, max-age=0',
    'Content-Type', 'application/json',
    'Vary', 'Authorization',
    'X-Content-Type-Options', 'nosniff',
    'Content-Length', String(Buffer.byteLength(text, 'utf8')),
    'Date', 'Thu, 15 Oct 2026 00:00:00 GMT',
    'Connection', 'close',
  ];
}
function setHeader(headers, wanted, replacement) {
  const copy = [...headers];
  const index = copy.findIndex((name, index) => index % 2 === 0
    && name.toLowerCase() === wanted.toLowerCase());
  q(index >= 0, true);
  copy[index + 1] = replacement;
  return copy;
}
function accessor(target, field, trap) {
  Object.defineProperty(target, field, { enumerable: true, configurable: true, get: trap });
  return target;
}

class FakeEmitter {
  #listeners = new Map();
  #closed = false;
  constructor(session) {
    this.session = session;
    this.onCalls = 0;
  }
  on(...args) {
    q(args.length, 2);
    const [event, listener] = args;
    q(typeof event, 'string');
    q(typeof listener, 'function');
    this.onCalls++;
    const list = this.#listeners.get(event) ?? [];
    list.push(listener);
    this.#listeners.set(event, list);
    return this;
  }
  emit(event, ...args) {
    const list = [...(this.#listeners.get(event) ?? [])];
    for (const listener of list) APPLY(listener, this, args);
  }
  forceClose() {
    if (this.#closed) return;
    this.#closed = true;
    fire(this, 'close');
  }
}
const EMIT = FakeEmitter.prototype.emit;
const FORCE_CLOSE = FakeEmitter.prototype.forceClose;
function fire(target, event, ...args) {
  APPLY(EMIT, target, [event, ...args]);
}
function forceClose(target) {
  APPLY(FORCE_CLOSE, target, []);
}

class FakeRequest extends FakeEmitter {
  constructor(session) {
    super(session);
    this.endCalls = 0;
    this.endArguments = [];
    this.writeCalls = 0;
    this.destroyCalls = 0;
    this.endHook = null;
    this.destroyHook = null;
  }
  end(...args) {
    this.endCalls++;
    this.endArguments.push(args);
    q(args.length, 0);
    if (this.endHook) this.endHook();
    return this;
  }
  write() {
    this.writeCalls++;
    throw new Error('UNREACHED_REQUEST_BODY_WRITE');
  }
  destroy(...args) {
    q(args.length, 0);
    this.destroyCalls++;
    if (this.destroyHook) this.destroyHook();
    this.session.signalDestroy();
    if (this.session.autoClose) forceClose(this);
    return this;
  }
}
class FakeResponse extends FakeEmitter {
  constructor(session, text = GOOD) {
    super(session);
    this.statusCode = 200;
    this.rawHeaders = goodHeaders(text);
    this.complete = false;
    this.destroyCalls = 0;
    this.destroyHook = null;
  }
  destroy(...args) {
    q(args.length, 0);
    this.destroyCalls++;
    if (this.destroyHook) this.destroyHook();
    this.session.signalDestroy();
    if (this.session.autoClose) forceClose(this);
    return this;
  }
}

function fixture(t, { autoClose = true } = {}) {
  const handles = [], sinks = [], timers = [], adapters = [];
  let notifyDestroy;
  const destroyed = new P(resolve => { notifyDestroy = resolve; });
  let destroyNotified = false;
  const f = {
    autoClose,
    calls: [],
    callback: null,
    adapters,
    signalDestroy() {
      if (!destroyNotified) { destroyNotified = true; notifyDestroy(); }
    },
    request: null,
    impl: null,
    track(promise) {
      sinks.push(APPLY(THEN, promise, [() => undefined, () => undefined]));
      return promise;
    },
    requestCall(receiver, args) {
      q(receiver, undefined);
      q(args.length, 3);
      this.calls.push({ url: args[0], options: args[1], callback: args[2] });
      this.callback = args[2];
    },
    makeResponse(text = GOOD) {
      const result = new FakeResponse(this, text);
      handles.push(result);
      return result;
    },
    respond(response) {
      q(typeof this.callback, 'function');
      this.callback(response);
    },
    data(response, chunk = Buffer.from(GOOD)) {
      fire(response, 'data', chunk);
    },
    end(response, complete = true) {
      Object.defineProperty(response, 'complete', {
        value: complete, writable: true, enumerable: true, configurable: true,
      });
      fire(response, 'end');
    },
    closeAll() {
      for (const handle of handles) forceClose(handle);
    },
    config(overrides = {}) {
      return {
        resourceUrl: RESOURCE,
        originalRequestJson: value.originalRequestJson,
        authorizationHeader: AUTH,
        deadlineMs: 1000,
        requestImpl: this.impl,
        ...overrides,
      };
    },
    adapter(overrides = {}) {
      const result = createDispatch(this.config(overrides));
      adapters.push(result);
      return result;
    },
    waitForDestroy() {
      let timer;
      const bounded = new P((resolve, reject) => {
        timer = setTimer(() => reject(new Error('SYNTHETIC_DESTROY_NOT_OBSERVED')), 1000);
        timers.push(timer);
        APPLY(THEN, destroyed, [
          () => { clearTimer(timer); resolve(undefined); },
          () => { clearTimer(timer); reject(new Error('SYNTHETIC_DESTROY_WAIT_FAILED')); },
        ]);
      });
      return this.track(bounded);
    },
  };
  f.request = new FakeRequest(f);
  handles.push(f.request);
  f.impl = function (...args) {
    f.requestCall(this, args);
    return f.request;
  };
  t.after(async () => {
    for (const timer of timers) clearTimer(timer);
    f.closeAll();
    await P.all(sinks);
    for (const adapter of adapters) q(adapter.snapshot().timerArmed, false);
  });
  return f;
}
function redacted(snapshot) {
  ok(Object.isFrozen(snapshot));
  ok(Object.isFrozen(snapshot.counts));
  const text = JSON.stringify(snapshot);
  for (const secret of [AUTH, RESOURCE, FUNDING, HASH, 'declared-signature', GOOD]) {
    q(text.includes(secret), false);
  }
  q(snapshot.qualification, 'SYNTHETIC_INTERFACE_ONLY');
  q(snapshot.serviceDelivery, 'NOT_ESTABLISHED');
  q(snapshot.realReady, 'NOT_ESTABLISHED');
  q(snapshot.restart, 'NOT_ESTABLISHED');
  q(snapshot.durability, 'NOT_ESTABLISHED');
}

function declaredFunding() {
  return Object.freeze({
    revision: 3, status: 'BOUND', ambiguityLatched: false, resourceUrl: FUNDING,
    challengeHeader: 'DECLARED_FUNDING_CHALLENGE',
    paymentHeader: 'DECLARED_FUNDING_PAYMENT',
    paymentRequired: Object.freeze({ declared: 'DATA_ONLY' }),
    paymentPayload: Object.freeze({
      x402Version: 2, resource: Object.freeze({ url: FUNDING }),
      accepted: Object.freeze({ declared: 'DATA_ONLY' }),
      payload: Object.freeze({
        transaction: Object.freeze({ hash: HASH }), intentDigest: 'b'.repeat(64),
      }),
    }),
    requirement: Object.freeze({
      scheme: 'exact', network: NETWORK, asset: 'declared-asset',
      amount: '1', payTo: 'declared-payee', maxTimeoutSeconds: 30,
      extra: Object.freeze({ declared: 'DATA_ONLY' }),
    }),
  });
}
class DeclaredStore {
  constructor() {
    this.funding = declaredFunding();
    this.rows = new Map();
    this.log = [];
    this.closeCalls = 0;
  }
  load() { this.log.push('load'); return this.funding; }
  getOriginalRequest(key) {
    this.log.push('get');
    const text = this.rows.get(key.grantId)?.get(key.requestId);
    return text === undefined ? null : parse(text);
  }
  retainOriginalRequest(input) {
    this.log.push('retain');
    const retained = capture({
      originalRequestJson: input.originalRequestJson,
      originalBodyBase64: input.originalBodyBase64,
      serviceResourceUrl: input.serviceResourceUrl,
    }, binding);
    let rows = this.rows.get(retained.grantId);
    if (!rows) { rows = new Map(); this.rows.set(retained.grantId, rows); }
    rows.set(retained.requestId, serialize(retained));
    return parse(serialize(retained));
  }
  close() { this.closeCalls++; }
}
function owner(store) {
  return createOwner({
    store, fundingResourceUrl: FUNDING,
    custodyPolicy: { policyVersion: 1, maxRequests: 2, serviceResourceUrl: RESOURCE },
    selectedGrantId: 'grant_A',
  });
}

const scenarios = [
  ['bodyless framing preserves authorization and waits for close boundaries', async t => {
    const f = fixture(t), d = f.adapter();
    const originalText = serialize(record);
    const operation = f.track(d.dispatch(record));
    q(f.calls.length, 1);
    const call = f.calls[0];
    q(call.url, RESOURCE);
    same(Object.keys(call.options), [
      'method', 'headers', 'agent', 'rejectUnauthorized', 'maxHeaderSize',
      'insecureHTTPParser',
    ]);
    same(call.options.headers, { Authorization: AUTH });
    ok(Object.isFrozen(call.options));
    ok(Object.isFrozen(call.options.headers));
    q(call.options.method, 'POST');
    q(call.options.agent, false);
    q(call.options.rejectUnauthorized, true);
    q(call.options.maxHeaderSize, 16384);
    q(call.options.insecureHTTPParser, false);
    q(Object.hasOwn(call.options.headers, 'Content-Type'), false);
    q(Object.hasOwn(call.options.headers, 'Transfer-Encoding'), false);
    q(Object.hasOwn(call.options, 'body'), false);
    q(f.request.endCalls, 1);
    same(f.request.endArguments, [[]]);
    q(f.request.writeCalls, 0);

    const response = f.makeResponse();
    f.respond(response);
    const first = Buffer.from(GOOD.slice(0, 10));
    f.data(response, first);
    first.fill(0);
    f.data(response, Buffer.from(GOOD.slice(10)));
    f.end(response);
    q(d.snapshot().replyValidated, true);
    let settled = false;
    f.track(APPLY(THEN, operation, [
      () => { settled = true; }, () => { settled = true; },
    ]));
    forceClose(response);
    await P.resolve();
    q(settled, false);
    forceClose(f.request);
    q(await operation, undefined);
    q(d.snapshot().requestClosed, true);
    q(d.snapshot().responseEnded, true);
    q(d.snapshot().responseClosed, true);
    q(d.snapshot().responseComplete, true);
    q(d.snapshot().counts.settlements, 1);
    q(d.snapshot().credentialReferenceReleased, true);
    q(d.snapshot().timerArmed, false);
    q(serialize(record), originalText);
    redacted(d.snapshot());
  }],
  ['factory metadata refuses malformed authorization before transport', async t => {
    const f = fixture(t);
    let touches = 0;
    const trap = () => { touches++; throw new Error('UNREACHED_CONFIG_TRAP'); };
    const traps = {
      get: trap, ownKeys: trap, getPrototypeOf: trap,
      getOwnPropertyDescriptor: trap, apply: trap,
    };
    const base = f.config();
    throws(() => createDispatch(), code('INVALID_CONFIGURATION'));
    throws(() => createDispatch(base, undefined), code('INVALID_CONFIGURATION'));
    throws(() => createDispatch(new Proxy(base, traps)), code('INVALID_CONFIGURATION'));
    throws(() => createDispatch(accessor({ ...base }, 'authorizationHeader', trap)),
      code('INVALID_CONFIGURATION'));
    throws(() => createDispatch({ ...base, extra: true }), code('INVALID_CONFIGURATION'));
    throws(() => createDispatch({ ...base, [Symbol('extra')]: 1 }),
      code('INVALID_CONFIGURATION'));
    for (const requestImpl of [undefined, {}, new Proxy(() => {}, traps)]) {
      throws(() => createDispatch({ ...base, requestImpl }), code('INVALID_CONFIGURATION'));
    }
    for (const deadlineMs of [0, -0, -1, NaN, Infinity, 1.5, 60001, 1n, new Number(5)]) {
      throws(() => createDispatch({ ...base, deadlineMs }), code('INVALID_CONFIGURATION'));
    }
    for (const resourceUrl of [
      RESOURCE + '?x=1', RESOURCE + '#x', RESOURCE + '?', RESOURCE + '#', RESOURCE + '/',
      RESOURCE.replace('https:', 'http:'),
      RESOURCE.replace('dispatch.example.test', 'user@dispatch.example.test'),
      RESOURCE.replace('dispatch.example.test', 'DISPATCH.example.test'),
      { [Symbol.toPrimitive]: trap },
    ]) throws(() => createDispatch({ ...base, resourceUrl }), code('INVALID_CONFIGURATION'));
    const invalidHeaders = [
      'Basic fixed', AUTH + '=', AUTH + ' ', new String(AUTH),
      authorization({ proofVersion: 2 }),
      authorization({ grantId: 'foreign' }),
      authorization({ requestId: 'foreign' }),
      authorization({ maxCostUnits: 8 }),
      authorization({ publicKey: '' }),
      authorization({ signature: '' }),
      authorization({ extra: 'not-accepted' }),
      authorization({}, text => ' ' + text),
      authorization({}, text => '\ufeff' + text),
      'ServiceCredit ' + Buffer.from([0xc3, 0x28]).toString('base64url'),
      'ServiceCredit ' + Buffer.from(JSON.stringify({
        proofVersion: 1, grantId: 'grant_A', requestId: 'request_A',
        publicKey: 'declared-public-key', maxCostUnits: 7, signature: 'declared-signature',
      })).toString('base64url'),
      'ServiceCredit ' + 'a'.repeat(1024),
    ];
    for (const authorizationHeader of invalidHeaders) {
      throws(() => createDispatch({ ...base, authorizationHeader }),
        code('INVALID_CONFIGURATION'));
    }
    for (const originalRequestJson of [
      value.originalRequestJson + ' ',
      value.originalRequestJson.replace('"method":"POST"', '"method":"GET"'),
      value.originalRequestJson.replace('"maxCostUnits":7', '"maxCostUnits":-0'),
      { toJSON: trap },
    ]) throws(() => createDispatch({ ...base, originalRequestJson }),
      code('INVALID_CONFIGURATION'));
    q(f.calls.length, 0);
    q(touches, 0);

    const d = f.adapter();
    await rejects(f.track(d.dispatch()), code('INVALID_INPUT'));
    await rejects(f.track(d.dispatch(record, undefined)), code('INVALID_INPUT'));
    await rejects(f.track(d.dispatch(new Proxy(record, traps))), code('INVALID_INPUT'));
    const other = capture({
      originalRequestJson: original('grant_A', 'request_A', 8).originalRequestJson,
      originalBodyBase64: '', serviceResourceUrl: RESOURCE,
    }, binding);
    await rejects(f.track(d.dispatch(other)), code('INVALID_INPUT'));
    q(d.snapshot().used, false);
    q(f.calls.length, 0);
    throws(() => d.snapshot(undefined), code('INVALID_INPUT'));
    q(touches, 0);
  }],
  ['bounded response failures remain unknown', async t => {
    const cases = [
      response => { response.rawHeaders = setHeader(goodHeaders(), 'Cache-Control', 'private,no-store,max-age=0'); },
      response => { response.rawHeaders = setHeader(goodHeaders(), 'Content-Type', 'text/plain'); },
      response => { response.rawHeaders = setHeader(goodHeaders(), 'Vary', 'Other'); },
      response => { response.rawHeaders = setHeader(goodHeaders(), 'X-Content-Type-Options', 'other'); },
      response => { response.rawHeaders.push('content-length', '1'); },
      response => { response.rawHeaders.push('Content-Encoding', 'gzip'); },
      response => { response.rawHeaders.push('Trailer', 'declared'); },
      response => { response.rawHeaders.push('Payment-Response', 'not-accepted'); },
      response => { response.rawHeaders.push('Location', 'https://other.example.test/'); },
      response => { response.rawHeaders = setHeader(goodHeaders(), 'Content-Length', '0'); },
      response => { response.rawHeaders = setHeader(goodHeaders(), 'Content-Length', '513'); },
      response => { response.rawHeaders = setHeader(goodHeaders(), 'Content-Length', '01'); },
      response => { response.rawHeaders = Array.from({ length: 65 }, () => ['Date', 'x']).flat(); },
    ];
    for (const change of cases) {
      const f = fixture(t), d = f.adapter(), response = f.makeResponse();
      const operation = f.track(d.dispatch(record));
      change(response);
      f.respond(response);
      f.closeAll();
      await rejects(operation, unknownError);
      q(d.snapshot().unknown, true);
      q(d.snapshot().counts.settlements, 1);
      redacted(d.snapshot());
    }
    const bodies = [
      { text: ' ' + GOOD },
      { text: '\ufeff' + GOOD },
      { text: JSON.stringify({ ok: true, resultCode: 'result_OK', extra: 1 }) },
      { text: JSON.stringify({ ok: false, resultCode: 'result_OK' }) },
      { text: JSON.stringify({ ok: true, resultCode: 'https://bad' }) },
      { bytes: Buffer.from([0xc3, 0x28]), length: 2 },
      { bytes: Buffer.alloc(513), length: 512 },
      { bytes: Buffer.from('xx'), length: 3 },
      { bytes: GOOD, length: Buffer.byteLength(GOOD) },
    ];
    for (const item of bodies) {
      const f = fixture(t), d = f.adapter(), response = f.makeResponse();
      const operation = f.track(d.dispatch(record));
      const bytes = item.bytes ?? Buffer.from(item.text);
      const length = item.length ?? Buffer.byteLength(item.text);
      response.rawHeaders = setHeader(goodHeaders(), 'Content-Length', String(length));
      f.respond(response);
      f.data(response, bytes);
      f.end(response);
      f.closeAll();
      await rejects(operation, unknownError);
      q(d.snapshot().unknown, true);
    }
    for (const ending of ['incomplete', 'aborted', 'error', 'close-first']) {
      const f = fixture(t), d = f.adapter(), response = f.makeResponse();
      const operation = f.track(d.dispatch(record));
      f.respond(response);
      f.data(response);
      if (ending === 'incomplete') f.end(response, false);
      if (ending === 'aborted') fire(response, 'aborted');
      if (ending === 'error') fire(response, 'error', new Error('PRIVATE_RESPONSE_ERROR'));
      if (ending === 'close-first') forceClose(response);
      f.closeAll();
      await rejects(operation, unknownError);
      q(d.snapshot().unknown, true);
    }
  }],
  ['one use survives transport errors without retry', async t => {
    const f = fixture(t);
    const secret = 'PRIVATE_REQUEST_FAILURE';
    f.impl = function (...args) {
      f.requestCall(this, args);
      throw new Error(secret);
    };
    const d = f.adapter();
    const before = serialize(record);
    await rejects(f.track(d.dispatch(record)), code('UNKNOWN_UNDRAINED'));
    await rejects(f.track(d.dispatch(record)), code('ALREADY_USED'));
    q(f.calls.length, 1);
    q(f.calls[0].options.headers.Authorization, AUTH);
    q(d.snapshot().credentialReferenceReleased, true);
    q(JSON.stringify(d.snapshot()).includes(secret), false);
    q(serialize(record), before);

    const emitted = fixture(t), emittedAdapter = emitted.adapter();
    const emittedOperation = emitted.track(emittedAdapter.dispatch(record));
    fire(emitted.request, 'error', new Error('PRIVATE_REQUEST_EVENT_FAILURE'));
    emitted.closeAll();
    await rejects(emittedOperation, code('OUTCOME_UNKNOWN'));
    q(emitted.request.destroyCalls, 1);
    q(emitted.calls.length, 1);
    redacted(emittedAdapter.snapshot());

    const ended = fixture(t);
    ended.request.endHook = () => { throw new Error('PRIVATE_END_FAILURE'); };
    const endedAdapter = ended.adapter();
    const endedOperation = ended.track(endedAdapter.dispatch(record));
    ended.closeAll();
    await rejects(endedOperation, code('OUTCOME_UNKNOWN'));
    q(ended.request.endCalls, 1);
    q(ended.request.destroyCalls, 1);
    q(ended.calls.length, 1);
    redacted(endedAdapter.snapshot());

    for (const status of [409, 503, 301, 302]) {
      const failed = fixture(t), adapter = failed.adapter();
      const response = failed.makeResponse();
      response.statusCode = status;
      const operation = failed.track(adapter.dispatch(record));
      failed.respond(response);
      failed.closeAll();
      await rejects(operation, unknownError);
      await rejects(failed.track(adapter.dispatch(record)), code('ALREADY_USED'));
      q(failed.calls.length, 1);
      q(failed.calls[0].options.headers.Authorization, AUTH);
      q(adapter.snapshot().counts.requestCalls, 1);
      redacted(adapter.snapshot());
    }
  }],
  ['deadline abort waits for closes and preserves owner uncertainty', async t => {
    const f = fixture(t, { autoClose: false }), d = f.adapter({ deadlineMs: 10 });
    const store = new DeclaredStore(), client = owner(store);
    const operation = f.track(client.submitOriginal(value, d.dispatch));
    const closing = f.track(client.close());
    const response = f.makeResponse();
    f.respond(response);
    let operationSettled = false, closeSettled = false;
    f.track(APPLY(THEN, operation, [
      () => { operationSettled = true; }, () => { operationSettled = true; },
    ]));
    f.track(APPLY(THEN, closing, [
      () => { closeSettled = true; }, () => { closeSettled = true; },
    ]));
    await f.waitForDestroy();
    q(d.snapshot().deadlineFired, true);
    q(d.snapshot().unknown, true);
    q(f.request.destroyCalls, 1);
    q(response.destroyCalls, 1);
    q(d.snapshot().settled, false);
    q(operationSettled, false);
    q(closeSettled, false);
    q(client.close(), closing);
    f.data(response);
    f.end(response);
    q(d.snapshot().replyValidated, false);
    forceClose(f.request);
    await P.resolve();
    q(closeSettled, false);
    forceClose(response);
    await rejects(operation, ownerCode('SUBMISSION_OUTCOME_UNKNOWN'));
    await rejects(closing, ownerCode('CLOSE_FAILED'));
    q(d.snapshot().counts.settlements, 1);
    q(d.snapshot().timerArmed, false);
    q(store.closeCalls, 0);
    q(client.snapshot().uncertainty.submission, true);
    redacted(d.snapshot());
  }],
  ['hostile capabilities and data execute no getters', async t => {
    let touches = 0;
    const trap = () => { touches++; throw new Error('UNREACHED_HANDLE_TRAP'); };
    const traps = {
      get: trap, getPrototypeOf: trap, ownKeys: trap,
      getOwnPropertyDescriptor: trap, apply: trap,
    };
    for (const kind of [
      'on-getter', 'on-throw', 'missing-end', 'destroy-proxy', 'prototype-proxy', 'root-proxy',
    ]) {
      const f = fixture(t);
      let returned = f.request;
      if (kind === 'on-getter') accessor(returned, 'on', trap);
      if (kind === 'on-throw') Object.defineProperty(returned, 'on', {
        value() { throw new Error('PRIVATE_LISTENER_REGISTRATION_FAILURE'); },
      });
      if (kind === 'missing-end') Object.defineProperty(returned, 'end', { value: undefined });
      if (kind === 'destroy-proxy') Object.defineProperty(returned, 'destroy', {
        value: new Proxy(() => undefined, traps),
      });
      if (kind === 'prototype-proxy') Object.setPrototypeOf(returned, new Proxy({}, traps));
      if (kind === 'root-proxy') returned = new Proxy(returned, traps);
      f.impl = function (...args) { f.requestCall(this, args); return returned; };
      const d = f.adapter();
      await rejects(f.track(d.dispatch(record)), code('UNKNOWN_UNDRAINED'));
      q(d.snapshot().undrained, true);
    }
    for (const field of ['on', 'destroy']) {
      const f = fixture(t), d = f.adapter(), response = f.makeResponse();
      accessor(response, field, trap);
      const operation = f.track(d.dispatch(record));
      f.respond(response);
      await rejects(operation, code('UNKNOWN_UNDRAINED'));
      q(d.snapshot().undrained, true);
    }
    for (const field of ['statusCode', 'rawHeaders', 'complete']) {
      const f = fixture(t), d = f.adapter(), response = f.makeResponse();
      accessor(response, field, trap);
      const operation = f.track(d.dispatch(record));
      f.respond(response);
      f.closeAll();
      await rejects(operation, unknownError);
    }
    const proxyHeaders = fixture(t), proxyAdapter = proxyHeaders.adapter();
    const proxyResponse = proxyHeaders.makeResponse();
    proxyResponse.rawHeaders = new Proxy(goodHeaders(), traps);
    const proxyOperation = proxyHeaders.track(proxyAdapter.dispatch(record));
    proxyHeaders.respond(proxyResponse);
    proxyHeaders.closeAll();
    await rejects(proxyOperation, unknownError);

    const indexed = fixture(t), indexedAdapter = indexed.adapter();
    const indexedResponse = indexed.makeResponse();
    accessor(indexedResponse.rawHeaders, '1', trap);
    const indexedOperation = indexed.track(indexedAdapter.dispatch(record));
    indexed.respond(indexedResponse);
    indexed.closeAll();
    await rejects(indexedOperation, unknownError);

    const proxiedChunk = fixture(t), chunkAdapter = proxiedChunk.adapter();
    const chunkResponse = proxiedChunk.makeResponse();
    const chunkOperation = proxiedChunk.track(chunkAdapter.dispatch(record));
    proxiedChunk.respond(chunkResponse);
    proxiedChunk.data(chunkResponse, new Proxy(Buffer.from(GOOD), traps));
    proxiedChunk.closeAll();
    await rejects(chunkOperation, unknownError);

    const safe = fixture(t), safeAdapter = safe.adapter(), response = safe.makeResponse();
    const safeOperation = safe.track(safeAdapter.dispatch(record));
    safe.respond(response);
    const nativeChunk = Buffer.from(GOOD);
    Object.defineProperty(nativeChunk, 'length', { get: trap });
    Object.defineProperty(nativeChunk, 'constructor', { get: trap });
    safe.data(response, nativeChunk);
    safe.end(response);
    safe.closeAll();
    q(await safeOperation, undefined);
    q(touches, 0);
  }],
  ['synchronous reentrant and duplicate events settle at most once', async t => {
    const early = fixture(t), earlyResponse = early.makeResponse();
    early.request.endHook = () => forceClose(early.request);
    early.impl = function (...args) {
      early.requestCall(this, args);
      early.respond(earlyResponse);
      early.data(earlyResponse);
      early.end(earlyResponse);
      forceClose(earlyResponse);
      return early.request;
    };
    const earlyAdapter = early.adapter();
    q(await early.track(earlyAdapter.dispatch(record)), undefined);
    q(earlyAdapter.snapshot().counts.settlements, 1);
    q(early.request.endCalls, 1);

    const ordered = fixture(t), orderedResponse = ordered.makeResponse();
    ordered.request.endHook = () => {
      ordered.respond(orderedResponse);
      forceClose(ordered.request);
      ordered.data(orderedResponse);
      ordered.end(orderedResponse);
      ordered.end(orderedResponse);
      forceClose(orderedResponse);
    };
    const orderedAdapter = ordered.adapter();
    q(await ordered.track(orderedAdapter.dispatch(record)), undefined);
    q(orderedAdapter.snapshot().counts.settlements, 1);

    const reentrant = fixture(t), reentrantResponse = reentrant.makeResponse();
    let nested, adapter;
    reentrant.request.endHook = () => forceClose(reentrant.request);
    reentrant.impl = function (...args) {
      reentrant.requestCall(this, args);
      nested = reentrant.track(adapter.dispatch(record));
      reentrant.respond(reentrantResponse);
      reentrant.respond(reentrantResponse);
      reentrant.data(reentrantResponse);
      reentrant.end(reentrantResponse);
      forceClose(reentrantResponse);
      return reentrant.request;
    };
    adapter = reentrant.adapter();
    q(await reentrant.track(adapter.dispatch(record)), undefined);
    await rejects(nested, code('ALREADY_USED'));
    reentrant.respond(reentrantResponse);
    fire(reentrantResponse, 'end');
    fire(reentrantResponse, 'error', new Error('LATE_DECLARED_ERROR'));
    q(reentrant.calls.length, 1);
    q(adapter.snapshot().counts.settlements, 1);
    q(adapter.snapshot().duplicateResponseCallback, true);

    const extra = fixture(t), extraAdapter = extra.adapter();
    const operation = extra.track(extraAdapter.dispatch(record));
    extra.respond(extra.makeResponse());
    extra.respond(extra.makeResponse());
    extra.closeAll();
    await rejects(operation, code('UNKNOWN_UNDRAINED'));
    q(extraAdapter.snapshot().counts.responseHandles, 2);
    q(extraAdapter.snapshot().counts.settlements, 1);
    q(extra.calls.length, 1);

    const truncated = fixture(t), truncatedAdapter = truncated.adapter();
    const truncatedResponse = truncated.makeResponse();
    const truncatedOperation = truncated.track(truncatedAdapter.dispatch(record));
    truncated.respond(truncatedResponse);
    forceClose(truncatedResponse);
    truncated.data(truncatedResponse);
    truncated.end(truncatedResponse);
    truncated.closeAll();
    await rejects(truncatedOperation, unknownError);
    q(truncatedAdapter.snapshot().unknown, true);
  }],
  ['actual custodied owner fences retention before transport', async t => {
    const f = fixture(t), store = new DeclaredStore(), client = owner(store);
    const originalJson = value.originalRequestJson;
    const challenge = store.funding.challengeHeader;
    const payment = store.funding.paymentHeader;
    f.impl = function (...args) {
      f.requestCall(this, args);
      same(store.log, ['load', 'get', 'retain', 'get', 'load']);
      const retained = store.rows.get('grant_A').get('request_A');
      q(parse(retained).originalRequestJson, originalJson);
      q(parse(retained).originalBodyBase64, '');
      q(args[1].headers.Authorization, AUTH);
      return f.request;
    };
    const d = f.adapter();
    const before = store.log.length;
    const foreign = original('foreign_grant', 'request_A');
    await rejects(f.track(client.submitOriginal(foreign, d.dispatch)),
      ownerCode('FOREIGN_GRANT'));
    q(store.log.length, before);
    q(d.snapshot().used, false);
    q(f.calls.length, 0);

    const operation = f.track(client.submitOriginal(value, d.dispatch));
    const response = f.makeResponse();
    f.respond(response);
    f.data(response);
    f.end(response);
    forceClose(response);
    forceClose(f.request);
    q(await operation, undefined);
    q(client.snapshot().phase, 'CALLBACK_COMPLETED');
    q(client.snapshot().counts.dispatchCalls, 1);
    q(client.snapshot().counts.callbackCompletions, 1);
    q(client.snapshot().serviceOutcome, 'NOT_ESTABLISHED');
    q(client.snapshot().durability, 'NOT_ESTABLISHED');
    q(store.funding.challengeHeader, challenge);
    q(store.funding.paymentHeader, payment);
    q(value.originalRequestJson, originalJson);
    q(value.originalBodyBase64, '');
    await rejects(f.track(client.submitOriginal(value, d.dispatch)),
      ownerCode('RECOVERY_REQUIRED'));
    q(f.calls.length, 1);
    q(await f.track(client.close()), undefined);
    q(store.closeCalls, 0);
    redacted(d.snapshot());
    same(Object.keys(d), ['dispatch', 'snapshot']);
    ok(Object.isFrozen(d));
  }],
];

q(scenarios.length, 8);
for (let index = 0; index < scenarios.length; index++) {
  if (selector === 'all' || selector === String(index + 1)) {
    const [name, run] = scenarios[index];
    test(name, { timeout: 5000 }, run);
  }
}
