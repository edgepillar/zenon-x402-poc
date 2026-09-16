import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ServerResponse } from 'node:http';
import { types as utilTypes } from 'node:util';
import { runInNewContext } from 'node:vm';

import {
  createServiceCreditBoundedHttpsIngressOwner,
} from '../src/service-credit-bounded-https-ingress-owner.js';

const ORIGIN = 'https://service.example:8443';
const AUTHORITY = 'service.example:8443';
const TARGETS = Object.freeze(['/funding', '/handoff', '/service']);
const GENERATION = Object.freeze({
  generationId: 'bounded.https.synthetic',
  generationVersion: 1,
});
const LIMITS = Object.freeze({
  maxHeaderBytes: 4_096,
  maxHeaderCount: 16,
  maxConcurrentSockets: 3,
  maxConnectionStarts: 8,
  maxConcurrentRequests: 2,
  maxRequestStarts: 6,
  tlsHandshakeDeadlineMs: 100,
  headerDeadlineMs: 200,
  requestResponseDeadlineMs: 500,
  idleSocketDeadlineMs: 800,
  startDeadlineMs: 300,
  closeGraceMs: 1_000,
  metricsCounterLimit: 10_000,
});

const INVALID_CONFIGURATION =
  'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_INVALID_CONFIGURATION';
const INVALID_INPUT = 'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_INVALID_INPUT';
const START_UNCERTAIN =
  'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_START_UNCERTAIN';
const CLOSE_UNCERTAIN =
  'SERVICE_CREDIT_BOUNDED_HTTPS_INGRESS_OWNER_CLOSE_UNCERTAIN';

function frozenFunction(callback) {
  return Object.freeze(callback);
}

function exactError(error, code) {
  return error?.name === 'TypeError'
    && error?.code === code
    && error?.message === code
    && error?.stack === `TypeError: ${code}`
    && Object.isFrozen(error);
}

function controlledDeadlineRuntime({
  cancelResult = true,
  cancelResultFor = null,
  onCancel = null,
  onSchedule = null,
  synchronousDuration = null,
} = {}) {
  let sequence = 0;
  let cancellationSequence = 0;
  const tickets = new Map();
  const retainedCallbacks = [];
  const schedule = frozenFunction((callback, milliseconds) => {
    const handle = Object.freeze({ sequence: sequence += 1 });
    tickets.set(handle, { callback, milliseconds });
    retainedCallbacks.push(Object.freeze({ callback, milliseconds }));
    if (onSchedule !== null) onSchedule({ milliseconds });
    if (milliseconds === synchronousDuration) callback();
    return handle;
  });
  const cancel = frozenFunction(handle => {
    const ticket = tickets.get(handle);
    const cancellation = Object.freeze({
      sequence: cancellationSequence += 1,
      milliseconds: ticket?.milliseconds ?? null,
    });
    const result = cancelResultFor === null
      ? cancelResult
      : cancelResultFor(cancellation);
    if (result === true) tickets.delete(handle);
    if (onCancel !== null) onCancel(cancellation);
    return result;
  });
  return {
    runtime: Object.freeze({ schedule, cancel }),
    fire(milliseconds) {
      const found = [...tickets].find(([, ticket]) => ticket.milliseconds === milliseconds);
      assert.notEqual(found, undefined, `missing synthetic ${milliseconds}ms deadline`);
      const [handle, ticket] = found;
      tickets.delete(handle);
      ticket.callback();
    },
    fireAll() {
      for (const [handle, ticket] of [...tickets]) {
        tickets.delete(handle);
        ticket.callback();
      }
    },
    pending: () => tickets.size,
    durations: () => [...tickets.values()].map(ticket => ticket.milliseconds),
    retained(milliseconds = null) {
      return retainedCallbacks
        .filter(entry => milliseconds === null || entry.milliseconds === milliseconds)
        .map(entry => entry.callback);
    },
  };
}

function lifecycle({
  handle = (_request, response) => {
    response.statusCode = 204;
    response.end();
  },
  close = () => {},
} = {}) {
  const captured = {
    handle: frozenFunction((request, response, transportContext, completion) => {
      Reflect.apply(handle, undefined, [request, response, transportContext]);
      queueMicrotask(completion.success);
    }),
    close: frozenFunction(completion => {
      Reflect.apply(close, undefined, []);
      queueMicrotask(completion.success);
    }),
  };
  return Object.freeze(captured);
}

function capabilityLifecycle({
  handle = (_request, response, _transportContext, completion) => {
    response.statusCode = 204;
    response.end();
    completion.success();
  },
  close = completion => { completion.success(); },
} = {}) {
  return Object.freeze({
    handle: frozenFunction(handle),
    close: frozenFunction(close),
  });
}

function serverFactoryHarness({
  listen = callbacks => { callbacks.listening(); },
  close = callbacks => { callbacks.close(); },
  closeAllConnections = () => {},
  capabilityTransform = value => value,
} = {}) {
  const observed = {
    calls: 0,
    listens: 0,
    closes: 0,
    closeAll: 0,
    serverOptions: null,
    callbacks: null,
  };
  const factory = frozenFunction((serverOptions, callbacks) => {
    observed.calls += 1;
    observed.serverOptions = serverOptions;
    observed.callbacks = callbacks;
    const capability = Object.freeze({
      listen: frozenFunction(() => {
        observed.listens += 1;
        return listen(callbacks);
      }),
      close: frozenFunction(() => {
        observed.closes += 1;
        return close(callbacks);
      }),
      closeAllConnections: frozenFunction(() => {
        observed.closeAll += 1;
        return closeAllConnections(callbacks);
      }),
    });
    return capabilityTransform(capability, callbacks);
  });
  return { factory, observed };
}

function configuration({
  origin = ORIGIN,
  requestTargets = TARGETS,
  generation = GENERATION,
  limits = LIMITS,
  downstream = lifecycle(),
  deadlines = controlledDeadlineRuntime(),
  factoryHarness = serverFactoryHarness(),
} = {}) {
  return {
    options: {
      origin,
      requestTargets,
      generation,
      limits,
      downstream,
      deadlineRuntime: deadlines.runtime,
      httpsServerFactory: factoryHarness.factory,
    },
    deadlines,
    factoryHarness,
  };
}

class SyntheticSocket extends EventEmitter {
  constructor({
    alpnProtocol = 'http/1.1',
    servername = 'service.example',
    closeOnDestroy = true,
  } = {}) {
    super();
    this.alpnProtocol = alpnProtocol;
    this.servername = servername;
    this.destroyed = false;
    this.closeOnDestroy = closeOnDestroy;
    this.destroyCalls = 0;
    Object.defineProperty(this, 'remoteAddress', {
      configurable: false,
      enumerable: false,
      get() { throw new Error('network fields are outside the identity contract'); },
    });
  }

  destroy() {
    this.destroyCalls += 1;
    if (this.destroyed) return this;
    this.destroyed = true;
    if (this.closeOnDestroy) this.emit('close');
    return this;
  }
}

class SyntheticRequest extends EventEmitter {
  constructor(socket, {
    method = 'POST',
    url = '/service',
    httpVersion = '1.1',
    host = AUTHORITY,
    rawHeaders,
  } = {}) {
    super();
    this.socket = socket;
    this.method = method;
    this.url = url;
    this.httpVersion = httpVersion;
    this.rawHeaders = Object.freeze(rawHeaders ?? [
      'Host', host,
      'Content-Length', '0',
      'Connection', 'close',
      'X-Forwarded-For', '192.0.2.10',
    ]);
    this.bodyTouches = 0;
    Object.defineProperty(this, 'headers', {
      configurable: false,
      enumerable: false,
      get() { throw new Error('normalized headers must not be consulted'); },
    });
  }

  resume() {
    this.bodyTouches += 1;
  }
}

class SyntheticResponse extends EventEmitter {
  constructor(socket, { finishOnEnd = true } = {}) {
    super();
    this.socket = socket;
    this.statusCode = 0;
    this.headersSent = false;
    this.writableEnded = false;
    this.finished = false;
    this.destroyed = false;
    this.finishOnEnd = finishOnEnd;
    this.headers = Object.create(null);
    this.body = Buffer.alloc(0);
  }

  setHeader(name, value) {
    if (this.headersSent) throw new Error('headers already sent');
    this.headers[String(name).toLowerCase()] = String(value);
  }

  end(value = Buffer.alloc(0)) {
    this.headersSent = true;
    this.writableEnded = true;
    this.finished = true;
    this.body = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value));
    if (this.finishOnEnd) this.emit('finish');
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('close');
  }
}

async function startedOwner(overrides = {}) {
  const configured = configuration(overrides);
  const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
  assert.deepEqual(await owner.start(), Object.freeze({ status: 'LISTENING' }));
  return { ...configured, owner, callbacks: configured.factoryHarness.observed.callbacks };
}

function connect(callbacks, options) {
  const socket = new SyntheticSocket(options);
  callbacks.connection(socket);
  if (!socket.destroyed) callbacks.secureConnection(socket);
  return socket;
}

function dispatch(callbacks, socket, requestOptions, responseOptions) {
  const request = new SyntheticRequest(socket, requestOptions);
  const response = new SyntheticResponse(socket, responseOptions);
  callbacks.request(request, response);
  return { request, response };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

async function assertTlsCrossFieldMutationRejected(configureSocket) {
  let calls = 0;
  const started = await startedOwner({
    downstream: lifecycle({
      handle() {
        calls += 1;
        return Promise.resolve();
      },
    }),
  });
  const socket = new SyntheticSocket();
  const observations = configureSocket(socket);
  const request = new SyntheticRequest(socket);
  const response = new SyntheticResponse(socket, { finishOnEnd: false });

  started.callbacks.connection(socket);
  started.callbacks.secureConnection(socket);
  started.callbacks.request(request, response);
  await settle();

  assert.equal(observations(), 0);
  assert.equal(calls, 0);
  assert.equal(request.bodyTouches, 0);
  assert.equal(socket.destroyed, true);
  const beforeClose = started.owner.snapshotMetrics();
  assert.equal(beforeClose.tlsRejected, 1);
  assert.equal(beforeClose.requestsAdmitted, 0);
  assert.equal(beforeClose.requestsRejected, 1);
  assert.equal(beforeClose.trackedRequests, 0);
  assert.equal(beforeClose.trackedHandlers, 0);

  assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
  const terminal = started.owner.snapshotMetrics();
  assert.strictEqual(started.owner.snapshotMetrics(), terminal);
  assert.equal(Object.isFrozen(terminal), true);
  assert.equal(terminal.phase, 'CLOSED');
  assert.equal(terminal.closeClean, 1);
  assert.equal(terminal.closeUncertain, 0);
  assert.equal(terminal.requestsAdmitted, 0);
  assert.equal(terminal.trackedSockets, 0);
  assert.equal(terminal.trackedRequests, 0);
  assert.equal(terminal.trackedHandlers, 0);
  assert.equal(terminal.ownedTimers, 0);
  for (const [name, value] of Object.entries(terminal)) {
    if (name === 'phase') continue;
    assert.equal(Number.isSafeInteger(value) && value >= 0 && value <= LIMITS.metricsCounterLimit, true);
  }

  started.callbacks.secureConnection(socket);
  started.callbacks.request(request, response);
  assert.strictEqual(started.owner.snapshotMetrics(), terminal);
  assert.equal(calls, 0);
  assert.equal(request.bodyTouches, 0);
}

function hostileLateArguments() {
  let observations = 0;
  const accessor = {};
  for (const key of [
    'socket',
    'method',
    'url',
    'httpVersion',
    'rawHeaders',
    'alpnProtocol',
    'servername',
    'destroy',
    'once',
    'removeListener',
    'headersSent',
    'writableEnded',
  ]) Object.defineProperty(accessor, key, {
    configurable: true,
    enumerable: true,
    get() {
      observations += 1;
      return undefined;
    },
  });
  const proxy = new Proxy(accessor, {
    get(target, key, receiver) {
      observations += 1;
      return Reflect.get(target, key, receiver);
    },
    getOwnPropertyDescriptor(target, key) {
      observations += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    getPrototypeOf(target) {
      observations += 1;
      return Reflect.getPrototypeOf(target);
    },
    has(target, key) {
      observations += 1;
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      observations += 1;
      return Reflect.ownKeys(target);
    },
    set(target, key, value, receiver) {
      observations += 1;
      return Reflect.set(target, key, value, receiver);
    },
  });
  return { accessor, proxy, observations: () => observations };
}

function invokeEveryServerCallback(callbacks, argument) {
  for (const callback of Object.values(callbacks)) {
    Reflect.apply(callback, undefined, [argument, argument, argument]);
  }
}

test('import and construction are inert and the returned surface is exact and deeply frozen', () => {
  const configured = configuration();
  const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
  assert.equal(configured.factoryHarness.observed.calls, 0);
  assert.equal(configured.deadlines.pending(), 0);
  assert.deepEqual(Reflect.ownKeys(owner), ['start', 'close', 'snapshotMetrics']);
  assert.equal(Object.getPrototypeOf(owner), Object.prototype);
  assert.equal(Object.isFrozen(owner), true);
  for (const operation of Object.values(owner)) {
    assert.equal(typeof operation, 'function');
    assert.equal(Object.isFrozen(operation), true);
  }
  const metrics = owner.snapshotMetrics();
  assert.equal(Object.isFrozen(metrics), true);
  assert.equal(metrics.phase, 'DORMANT');
  assert.equal(metrics.trackedSockets, 0);
  assert.equal(metrics.trackedRequests, 0);
  assert.equal(metrics.trackedHandlers, 0);
  assert.equal(metrics.ownedTimers, 0);
});

test('configuration rejects proxies, accessors, symbols, inherited and extra fields', () => {
  const base = configuration().options;
  const candidates = [
    new Proxy(base, {}),
    Object.assign(Object.create({ origin: ORIGIN }), {
      requestTargets: base.requestTargets,
      generation: base.generation,
      limits: base.limits,
      downstream: base.downstream,
      deadlineRuntime: base.deadlineRuntime,
      httpsServerFactory: base.httpsServerFactory,
    }),
    { ...base, extra: true },
    { ...base, [Symbol('extra')]: true },
    Object.defineProperty({ ...base }, 'origin', {
      enumerable: true,
      get() { return ORIGIN; },
    }),
    { ...base, generation: new Proxy(base.generation, {}) },
    { ...base, generation: { ...base.generation, extra: true } },
    { ...base, generation: Object.defineProperty({}, 'generationId', {
      enumerable: true,
      get() { return GENERATION.generationId; },
    }) },
    { ...base, limits: new Proxy(base.limits, {}) },
    { ...base, limits: { ...base.limits, extra: 1 } },
    { ...base, deadlineRuntime: { ...base.deadlineRuntime, extra: true } },
    { ...base, downstream: { ...base.downstream, snapshotMetrics() {} } },
  ];
  for (const candidate of candidates) {
    assert.throws(
      () => createServiceCreditBoundedHttpsIngressOwner(candidate),
      error => exactError(error, INVALID_CONFIGURATION),
    );
  }
});

test('origin, authority, target and forbidden secret-like configuration fields are closed', () => {
  const base = configuration().options;
  for (const origin of [
    'http://service.example:8443',
    'https://SERVICE.example:8443',
    'https://service.example:443',
    'https://service.example:8443/',
    'https://service.example:8443/path',
    'https://user@service.example:8443',
    'https://service.example:8443?query=1',
    'https://service.example:8443#fragment',
    'https://service.example.:8443',
  ]) {
    assert.throws(
      () => createServiceCreditBoundedHttpsIngressOwner({ ...base, origin }),
      error => exactError(error, INVALID_CONFIGURATION),
    );
  }
  for (const requestTargets of [
    [],
    ['/service', '/service'],
    ['/service?query=1'],
    ['/service#fragment'],
    ['service'],
    ['/a/../service'],
    new Proxy(['/service'], {}),
    Object.assign(['/service'], { extra: true }),
    Object.freeze([Object.freeze(new String('/service'))]),
  ]) {
    assert.throws(
      () => createServiceCreditBoundedHttpsIngressOwner({ ...base, requestTargets }),
      error => exactError(error, INVALID_CONFIGURATION),
    );
  }
  for (const forbidden of [
    'key', 'certificate', 'ca', 'pem', 'secret', 'privateHostname', 'bind', 'environment',
  ]) {
    assert.throws(
      () => createServiceCreditBoundedHttpsIngressOwner({ ...base, [forbidden]: 'forbidden' }),
      error => exactError(error, INVALID_CONFIGURATION),
    );
  }
});

test('all operating bounds are explicit and invalid defensive or cross-layer relationships fail', () => {
  const base = configuration().options;
  for (const key of Reflect.ownKeys(LIMITS)) {
    const limits = { ...LIMITS };
    delete limits[key];
    assert.throws(
      () => createServiceCreditBoundedHttpsIngressOwner({ ...base, limits }),
      error => exactError(error, INVALID_CONFIGURATION),
    );
  }
  for (const limits of [
    { ...LIMITS, maxHeaderBytes: 0 },
    { ...LIMITS, maxHeaderCount: 0 },
    { ...LIMITS, maxConcurrentSockets: 0 },
    { ...LIMITS, maxConnectionStarts: Number.MAX_SAFE_INTEGER },
    { ...LIMITS, maxConcurrentRequests: LIMITS.maxConcurrentSockets + 1 },
    { ...LIMITS, maxRequestStarts: LIMITS.maxConnectionStarts + 1 },
    { ...LIMITS, headerDeadlineMs: LIMITS.requestResponseDeadlineMs + 1 },
    { ...LIMITS, requestResponseDeadlineMs: LIMITS.closeGraceMs + 1 },
    { ...LIMITS, tlsHandshakeDeadlineMs: LIMITS.idleSocketDeadlineMs + 1 },
    { ...LIMITS, metricsCounterLimit: 1 },
    { ...LIMITS, startDeadlineMs: 1.5 },
  ]) {
    assert.throws(
      () => createServiceCreditBoundedHttpsIngressOwner({ ...base, limits }),
      error => exactError(error, INVALID_CONFIGURATION),
    );
  }
});

test('input mutation after construction cannot alter the captured origin, targets or limits', async () => {
  const mutableTargets = [...TARGETS];
  const mutableLimits = { ...LIMITS };
  const factoryHarness = serverFactoryHarness();
  const configured = configuration({
    requestTargets: mutableTargets,
    limits: mutableLimits,
    factoryHarness,
  });
  const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
  mutableTargets[2] = '/changed';
  mutableLimits.maxHeaderBytes = 8_192;
  await owner.start();
  assert.equal(factoryHarness.observed.serverOptions.maxHeaderSize, LIMITS.maxHeaderBytes);
  const socket = connect(factoryHarness.observed.callbacks);
  const accepted = dispatch(factoryHarness.observed.callbacks, socket, { url: '/service' });
  await settle();
  assert.equal(accepted.response.statusCode, 204);
  const changedSocket = connect(factoryHarness.observed.callbacks);
  const rejected = dispatch(factoryHarness.observed.callbacks, changedSocket, { url: '/changed' });
  assert.equal(rejected.response.statusCode, 503);
  socket.destroy();
  changedSocket.destroy();
  await owner.close();
});

test('captured collection membership keeps route policy stable after setHeader replacement', async () => {
  let calls = 0;
  const started = await startedOwner({
    downstream: lifecycle({
      handle(_request, response) {
        calls += 1;
        response.statusCode = 204;
        response.end();
        return Promise.resolve();
      },
    }),
  });
  const socket = connect(started.callbacks);
  const request = new SyntheticRequest(socket);
  const response = new SyntheticResponse(socket);
  const nativeSetHeader = response.setHeader;
  const originalSetHas = Set.prototype.has;
  let replaced = false;
  response.setHeader = function setHeaderWithSetMembershipReplacement(name, value) {
    if (!replaced) {
      replaced = true;
      Set.prototype.has = function replacedSetMembership(candidate) {
        if (candidate === '/service') return false;
        return Reflect.apply(originalSetHas, this, [candidate]);
      };
    }
    return Reflect.apply(nativeSetHeader, this, [name, value]);
  };

  try {
    try {
      started.callbacks.request(request, response);
    } finally {
      Set.prototype.has = originalSetHas;
    }
    await settle();
    assert.equal(replaced, true);
    assert.equal(calls, 1);
    assert.equal(response.statusCode, 204);
    assert.equal(request.bodyTouches, 0);
  } finally {
    Set.prototype.has = originalSetHas;
    socket.destroy();
    await started.owner.close().catch(() => {});
  }
});

test('one valid start owns one native Promise and strict immutable HTTP/1.1 TLS options', async () => {
  const configured = configuration();
  const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
  await assert.rejects(owner.start('extra'), error => exactError(error, INVALID_INPUT));
  assert.equal(configured.factoryHarness.observed.calls, 0);
  const first = owner.start();
  assert.equal(utilTypes.isPromise(first), true);
  assert.strictEqual(owner.start(), first);
  assert.deepEqual(await first, Object.freeze({ status: 'LISTENING' }));
  assert.equal(configured.factoryHarness.observed.calls, 1);
  assert.equal(configured.factoryHarness.observed.listens, 1);
  const options = configured.factoryHarness.observed.serverOptions;
  assert.deepEqual(Reflect.ownKeys(options), [
    'minVersion',
    'maxVersion',
    'ALPNProtocols',
    'requestCert',
    'handshakeTimeout',
    'maxHeaderSize',
    'insecureHTTPParser',
    'requireHostHeader',
    'joinDuplicateHeaders',
    'rejectNonStandardBodyWrites',
    'headersTimeout',
    'requestTimeout',
    'keepAliveTimeout',
    'maxHeadersCount',
    'maxRequestsPerSocket',
    'maxConnections',
    'timeout',
  ]);
  assert.equal(Object.isFrozen(options), true);
  assert.deepEqual(options.ALPNProtocols, ['http/1.1']);
  assert.equal(Object.isFrozen(options.ALPNProtocols), true);
  assert.equal(options.minVersion, 'TLSv1.3');
  assert.equal(options.maxVersion, 'TLSv1.3');
  assert.equal(options.requestCert, false);
  assert.equal(options.insecureHTTPParser, false);
  assert.equal(options.requireHostHeader, true);
  assert.equal(options.joinDuplicateHeaders, false);
  assert.equal(options.rejectNonStandardBodyWrites, true);
  assert.equal(options.maxRequestsPerSocket, 1);
  for (const forbidden of [
    'key', 'cert', 'ca', 'pfx', 'passphrase', 'SNICallback', 'origin', 'authority',
    'host', 'port', 'path',
  ]) assert.equal(Object.hasOwn(options, forbidden), false);

  const callbacks = configured.factoryHarness.observed.callbacks;
  assert.equal(Object.isFrozen(callbacks), true);
  assert.deepEqual(Reflect.ownKeys(callbacks), [
    'connection',
    'secureConnection',
    'request',
    'checkContinue',
    'checkExpectation',
    'upgrade',
    'connect',
    'clientError',
    'tlsClientError',
    'dropRequest',
    'drop',
    'timeout',
    'listening',
    'close',
    'error',
  ]);
  for (const callback of Object.values(callbacks)) assert.equal(Object.isFrozen(callback), true);
  await owner.close();
});

test('start failures, start deadline and invalid server capabilities quarantine one generation', async t => {
  const cases = [
    ['factory throw', {
      factoryHarness: {
        observed: { calls: 0 },
        factory: frozenFunction(() => { throw new Error('synthetic factory failure'); }),
      },
    }],
    ['invalid return', {
      factoryHarness: serverFactoryHarness({ capabilityTransform: () => Object.freeze({}) }),
    }],
    ['extra capability', {
      factoryHarness: serverFactoryHarness({
        capabilityTransform: capability => Object.freeze({ ...capability, server: null }),
      }),
    }],
    ['unfrozen capability', {
      factoryHarness: serverFactoryHarness({
        capabilityTransform: capability => ({ ...capability }),
      }),
    }],
    ['listen throw', {
      factoryHarness: serverFactoryHarness({
        listen: () => { throw new Error('synthetic listen failure'); },
      }),
    }],
    ['listen asynchronous return', {
      factoryHarness: serverFactoryHarness({ listen: () => Promise.resolve() }),
    }],
    ['listener error', {
      factoryHarness: serverFactoryHarness({ listen: callbacks => callbacks.error() }),
    }],
  ];
  for (const [name, overrides] of cases) await t.test(name, async () => {
    const configured = configuration(overrides);
    const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    const first = owner.start();
    await assert.rejects(first, error => exactError(error, START_UNCERTAIN));
    assert.strictEqual(owner.start(), first);
    assert.equal(owner.snapshotMetrics().phase, 'QUARANTINED');
    await assert.rejects(owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
    assert.equal(owner.snapshotMetrics().closeUncertain, 1);
  });

  await t.test('deadline before listening', async () => {
    const deadlines = controlledDeadlineRuntime();
    const factoryHarness = serverFactoryHarness({ listen: () => {} });
    const configured = configuration({ deadlines, factoryHarness });
    const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    const first = owner.start();
    deadlines.fire(LIMITS.startDeadlineMs);
    await assert.rejects(first, error => exactError(error, START_UNCERTAIN));
    assert.strictEqual(owner.start(), first);
    await assert.rejects(owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  });

  await t.test('synchronous start deadline prevents factory invocation', async () => {
    const deadlines = controlledDeadlineRuntime({
      synchronousDuration: LIMITS.startDeadlineMs,
    });
    const factoryHarness = serverFactoryHarness();
    const configured = configuration({ deadlines, factoryHarness });
    const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    await assert.rejects(owner.start(), error => exactError(error, START_UNCERTAIN));
    assert.equal(factoryHarness.observed.calls, 0);
    assert.equal(deadlines.pending(), 0);
    await assert.rejects(owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  });

  for (const eventName of ['error', 'close']) await t.test(
    `synchronous listener ${eventName} during factory prevents listen`,
    async () => {
      let factoryCalls = 0;
      let listenCalls = 0;
      const factory = frozenFunction((_serverOptions, callbacks) => {
        factoryCalls += 1;
        callbacks[eventName]();
        return Object.freeze({
          listen: frozenFunction(() => { listenCalls += 1; }),
          close: frozenFunction(() => {}),
          closeAllConnections: frozenFunction(() => {}),
        });
      });
      const configured = configuration({
        factoryHarness: { factory, observed: {} },
      });
      const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
      await assert.rejects(owner.start(), error => exactError(error, START_UNCERTAIN));
      assert.equal(factoryCalls, 1);
      assert.equal(listenCalls, 0);
      await assert.rejects(owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
    },
  );

  await t.test('close racing an unconfirmed start makes both terminal results uncertain', async () => {
    const factoryHarness = serverFactoryHarness({ listen: () => {} });
    const configured = configuration({ factoryHarness });
    const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    const starting = owner.start();
    const closing = owner.close();
    await assert.rejects(starting, error => exactError(error, START_UNCERTAIN));
    await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));
    assert.equal(owner.snapshotMetrics().closeClean, 0);
    assert.equal(owner.snapshotMetrics().closeUncertain, 1);
  });

  await t.test('a callback before factory capability validation is a partial start', async () => {
    let observedCallbacks;
    const factory = frozenFunction((_serverOptions, callbacks) => {
      observedCallbacks = callbacks;
      callbacks.connection(new SyntheticSocket());
      return Object.freeze({
        listen: frozenFunction(() => {}),
        close: frozenFunction(() => { callbacks.close(); }),
        closeAllConnections: frozenFunction(() => {}),
      });
    });
    const configured = configuration({
      factoryHarness: { factory, observed: { callbacks: observedCallbacks } },
    });
    const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    await assert.rejects(owner.start(), error => exactError(error, START_UNCERTAIN));
    await assert.rejects(owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  });
});

// Pre-repair regression record: a factory result returned after terminal close was retained.
test('factory capability stays local after synchronous terminal close reentry', async () => {
  let owner;
  let closing = null;
  let callbacks = null;
  let listenCalls = 0;
  let disposalCloseCalls = 0;
  let disposalCloseAllCalls = 0;
  const factory = frozenFunction((_serverOptions, suppliedCallbacks) => {
    callbacks = suppliedCallbacks;
    closing = owner.close();
    closing.then(() => {}, () => {});
    return Object.freeze({
      listen: frozenFunction(() => { listenCalls += 1; }),
      close: frozenFunction(() => {
        disposalCloseCalls += 1;
        suppliedCallbacks.close();
      }),
      closeAllConnections: frozenFunction(() => {
        disposalCloseAllCalls += 1;
        suppliedCallbacks.error(new Error('synthetic terminal callback'));
      }),
    });
  });
  const configured = configuration({
    factoryHarness: { factory, observed: {} },
  });
  owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);

  const starting = owner.start();
  assert.strictEqual(owner.start(), starting);
  assert.notEqual(closing, null);
  assert.strictEqual(owner.close(), closing);
  await assert.rejects(starting, error => exactError(error, START_UNCERTAIN));
  await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));

  const terminal = owner.snapshotMetrics();
  const terminalBytes = JSON.stringify(terminal);
  const operationCounts = Object.freeze({
    listenCalls,
    disposalCloseCalls,
    disposalCloseAllCalls,
  });
  invokeEveryServerCallback(callbacks, new SyntheticSocket());
  assert.strictEqual(owner.start(), starting);
  assert.strictEqual(owner.close(), closing);
  await settle();

  assert.deepEqual(operationCounts, {
    listenCalls: 0,
    disposalCloseCalls: 1,
    disposalCloseAllCalls: 1,
  });
  assert.deepEqual({ listenCalls, disposalCloseCalls, disposalCloseAllCalls }, operationCounts);
  assert.equal(JSON.stringify(owner.snapshotMetrics()), terminalBytes);
  assert.equal(terminal.phase, 'CLOSE_UNCERTAIN');
  assert.equal(terminal.closeClean, 0);
  assert.equal(terminal.closeUncertain, 1);
  assert.equal(terminal.trackedSockets, 0);
  assert.equal(terminal.trackedRequests, 0);
  assert.equal(terminal.trackedHandlers, 0);
  assert.equal(terminal.ownedTimers, 0);
});

test('server capability validation rejects Promise, proxy, accessor, inherited and symbol surfaces', async t => {
  const baseCapability = callbacks => Object.freeze({
    listen: frozenFunction(() => { callbacks.listening(); }),
    close: frozenFunction(() => { callbacks.close(); }),
    closeAllConnections: frozenFunction(() => {}),
  });
  const transforms = [
    () => Promise.resolve(undefined),
    callbacks => new Proxy(baseCapability(callbacks), {}),
    callbacks => Object.freeze(Object.defineProperty({
      close: frozenFunction(() => { callbacks.close(); }),
      closeAllConnections: frozenFunction(() => {}),
    }, 'listen', { enumerable: true, get() { return frozenFunction(() => {}); } })),
    callbacks => Object.freeze(Object.assign(
      Object.create({ listen: frozenFunction(() => {}) }),
      {
        close: frozenFunction(() => { callbacks.close(); }),
        closeAllConnections: frozenFunction(() => {}),
      },
    )),
    callbacks => Object.freeze({ ...baseCapability(callbacks), [Symbol('extra')]: true }),
  ];
  for (const [index, transform] of transforms.entries()) await t.test(String(index), async () => {
    const factory = frozenFunction((_serverOptions, callbacks) => transform(callbacks));
    const configured = configuration({ factoryHarness: { factory, observed: {} } });
    const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    await assert.rejects(owner.start(), error => exactError(error, START_UNCERTAIN));
    assert.equal(owner.snapshotMetrics().startSucceeded, 0);
    await assert.rejects(owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  });
});

test('start cancellation revalidates reentrant listener and phase failures before success', async t => {
  for (const eventName of ['error', 'close']) await t.test(eventName, async () => {
    let reentered = false;
    const factoryHarness = serverFactoryHarness();
    const deadlines = controlledDeadlineRuntime({
      onCancel({ milliseconds }) {
        if (milliseconds !== LIMITS.startDeadlineMs || reentered) return;
        reentered = true;
        factoryHarness.observed.callbacks[eventName](
          ...(eventName === 'error' ? [new Error('synthetic listener failure')] : []),
        );
      },
    });
    const configured = configuration({ deadlines, factoryHarness });
    const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    await assert.rejects(owner.start(), error => exactError(error, START_UNCERTAIN));
    const metrics = owner.snapshotMetrics();
    assert.equal(reentered, true);
    assert.equal(metrics.startSucceeded, 0);
    assert.equal(metrics.startUncertain, 1);
    assert.equal(metrics.phase, 'QUARANTINED');
    await assert.rejects(owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  });

  await t.test('owner close', async () => {
    let owner;
    let reentrantClose = null;
    let reentered = false;
    let closeFulfillments = 0;
    let closeRejections = 0;
    const deadlines = controlledDeadlineRuntime({
      onCancel({ milliseconds }) {
        if (milliseconds !== LIMITS.startDeadlineMs || reentered) return;
        reentered = true;
        reentrantClose = owner.close();
        reentrantClose.then(
          () => { closeFulfillments += 1; },
          () => { closeRejections += 1; },
        );
      },
    });
    const configured = configuration({ deadlines });
    owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    const starting = owner.start();
    assert.strictEqual(owner.start(), starting);
    await assert.rejects(starting, error => exactError(error, START_UNCERTAIN));
    assert.notEqual(reentrantClose, null);
    assert.strictEqual(owner.close(), reentrantClose);
    await assert.rejects(reentrantClose, error => exactError(error, CLOSE_UNCERTAIN));
    await settle();
    const metrics = owner.snapshotMetrics();
    assert.equal(metrics.startSucceeded, 0);
    assert.equal(metrics.startUncertain, 1);
    assert.equal(metrics.closeStarted, 1);
    assert.equal(metrics.closeClean, 0);
    assert.equal(metrics.closeUncertain, 1);
    assert.equal(closeFulfillments, 0);
    assert.equal(closeRejections, 1);
  });
});

test('exact Host, applicable SNI and ALPN gates run before downstream authority', async t => {
  for (const [name, socketOptions, requestOptions] of [
    ['absent ALPN', { alpnProtocol: false }, {}],
    ['wrong ALPN', { alpnProtocol: 'h2' }, {}],
    ['absent DNS SNI', { servername: false }, {}],
    ['wrong DNS SNI', { servername: 'other.example' }, {}],
    ['HTTP/1.0', {}, { httpVersion: '1.0' }],
    ['missing Host', {}, { rawHeaders: ['Content-Length', '0'] }],
    ['wrong Host', {}, { host: 'other.example:8443' }],
    ['duplicate Host', {}, { rawHeaders: ['Host', AUTHORITY, 'Host', AUTHORITY] }],
    ['query target', {}, { url: '/service?query=1' }],
    ['wrong method', {}, { method: 'GET' }],
    ['CONNECT', {}, { method: 'CONNECT', url: AUTHORITY }],
    ['Expect', {}, { rawHeaders: ['Host', AUTHORITY, 'Expect', '100-continue'] }],
    ['Upgrade', {}, { rawHeaders: ['Host', AUTHORITY, 'Connection', 'Upgrade'] }],
    ['duplicate header', {}, {
      rawHeaders: ['Host', AUTHORITY, 'Content-Length', '0', 'Content-Length', '0'],
    }],
    ['transfer encoding', {}, {
      rawHeaders: ['Host', AUTHORITY, 'Transfer-Encoding', 'chunked'],
    }],
    ['header count ceiling', {}, {
      rawHeaders: [
        'Host', AUTHORITY,
        ...Array.from({ length: LIMITS.maxHeaderCount }, (_, index) => [
          `X-Bound-${index}`, 'x',
        ]).flat(),
      ],
    }],
    ['header byte ceiling', {}, {
      rawHeaders: ['Host', AUTHORITY, 'X-Bound', 'x'.repeat(LIMITS.maxHeaderBytes)],
    }],
  ]) await t.test(name, async () => {
    let calls = 0;
    const downstream = lifecycle({
      handle() { calls += 1; return Promise.resolve(); },
    });
    const started = await startedOwner({ downstream });
    const socket = connect(started.callbacks, socketOptions);
    const exchange = socket.destroyed
      ? null
      : dispatch(started.callbacks, socket, requestOptions);
    await settle();
    assert.equal(calls, 0);
    if (exchange !== null) {
      assert.equal(exchange.request.bodyTouches, 0);
      assert.equal(exchange.response.statusCode, 503);
      assert.equal(exchange.response.body.toString('utf8'), '{"error":"unavailable"}');
    }
    socket.destroy();
    await started.owner.close();
  });

  await t.test('numeric origin requires an own data SNI field and exact numeric Host', async () => {
    const configured = configuration({ origin: 'https://127.0.0.1:8443' });
    const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    await owner.start();
    for (const servername of [undefined, null, false, '']) {
      const socket = new SyntheticSocket({ servername: false });
      socket.servername = servername;
      configured.factoryHarness.observed.callbacks.connection(socket);
      configured.factoryHarness.observed.callbacks.secureConnection(socket);
      const exchange = dispatch(configured.factoryHarness.observed.callbacks, socket, {
        host: '127.0.0.1:8443',
      });
      await settle();
      assert.equal(exchange.response.statusCode, 204);
      socket.destroy();
    }
    const missing = new SyntheticSocket({ servername: false });
    delete missing.servername;
    configured.factoryHarness.observed.callbacks.connection(missing);
    configured.factoryHarness.observed.callbacks.secureConnection(missing);
    assert.equal(missing.destroyed, true);

    class InheritedServernameSocket extends SyntheticSocket {}
    const inherited = new InheritedServernameSocket({ servername: false });
    delete inherited.servername;
    let inheritedReads = 0;
    Object.defineProperty(InheritedServernameSocket.prototype, 'servername', {
      configurable: false,
      enumerable: false,
      get() { inheritedReads += 1; return false; },
    });
    configured.factoryHarness.observed.callbacks.connection(inherited);
    configured.factoryHarness.observed.callbacks.secureConnection(inherited);
    assert.equal(inheritedReads, 0);
    assert.equal(inherited.destroyed, true);
    await owner.close();
  });
});

// Pre-repair regression record: the final SNI getter could poison the already-observed ALPN.
test('SNI observation cannot mutate ALPN across TLS policy admission', async () => {
  await assertTlsCrossFieldMutationRejected(socket => {
    let reads = 0;
    Object.defineProperty(socket, 'servername', {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        if (reads === 2) {
          Object.defineProperty(socket, 'alpnProtocol', {
            configurable: true,
            enumerable: true,
            value: 'h2',
            writable: true,
          });
        }
        return 'service.example';
      },
    });
    return () => reads;
  });
});

// Pre-repair regression record: the final ALPN getter could install a self-poisoning SNI surface.
test('ALPN observation cannot mutate SNI across TLS policy admission', async () => {
  await assertTlsCrossFieldMutationRejected(socket => {
    let reads = 0;
    Object.defineProperty(socket, 'alpnProtocol', {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        if (reads === 2) {
          Object.defineProperty(socket, 'servername', {
            configurable: true,
            enumerable: true,
            get() {
              Object.defineProperty(socket, 'servername', {
                configurable: true,
                enumerable: true,
                value: 'other.example',
                writable: true,
              });
              return 'service.example';
            },
          });
        }
        return 'http/1.1';
      },
    });
    return () => reads;
  });
});

test('header-deadline installation revalidates the captured TLS property descriptors', async () => {
  let socket = null;
  let calls = 0;
  const deadlines = controlledDeadlineRuntime({
    onSchedule({ milliseconds }) {
      if (milliseconds !== LIMITS.headerDeadlineMs) return;
      Object.defineProperty(socket, 'alpnProtocol', {
        configurable: true,
        enumerable: true,
        value: 'http/1.1',
        writable: false,
      });
    },
  });
  const started = await startedOwner({
    deadlines,
    downstream: lifecycle({
      handle() {
        calls += 1;
        return Promise.resolve();
      },
    }),
  });
  socket = new SyntheticSocket();
  const request = new SyntheticRequest(socket);
  const response = new SyntheticResponse(socket, { finishOnEnd: false });

  started.callbacks.connection(socket);
  started.callbacks.secureConnection(socket);
  started.callbacks.request(request, response);
  await settle();

  assert.equal(calls, 0);
  assert.equal(request.bodyTouches, 0);
  assert.equal(socket.destroyed, true);
  const beforeClose = started.owner.snapshotMetrics();
  assert.equal(beforeClose.requestsAdmitted, 0);
  assert.equal(beforeClose.requestsRejected, 1);
  await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  const terminal = started.owner.snapshotMetrics();
  assert.strictEqual(started.owner.snapshotMetrics(), terminal);
  assert.equal(terminal.closeClean, 0);
  assert.equal(terminal.closeUncertain, 1);
  assert.equal(terminal.trackedSockets, 0);
  assert.equal(terminal.trackedRequests, 0);
  assert.equal(terminal.trackedHandlers, 0);
  assert.equal(terminal.ownedTimers, 0);
});

test('the last request gate revalidates the captured TLS property descriptors', async () => {
  let calls = 0;
  const started = await startedOwner({
    downstream: lifecycle({
      handle() {
        calls += 1;
        return Promise.resolve();
      },
    }),
  });
  const socket = connect(started.callbacks);
  const request = new SyntheticRequest(socket);
  const response = new SyntheticResponse(socket, { finishOnEnd: false });
  const setHeader = SyntheticResponse.prototype.setHeader;
  Object.defineProperty(response, 'setHeader', {
    configurable: true,
    enumerable: true,
    value: function mutateTlsPolicyDuringHeaderWrite(name, value) {
      Object.defineProperty(socket, 'servername', {
        configurable: true,
        enumerable: true,
        value: 'other.example',
        writable: true,
      });
      return Reflect.apply(setHeader, this, [name, value]);
    },
    writable: true,
  });

  started.callbacks.request(request, response);
  await settle();

  assert.equal(calls, 0);
  assert.equal(request.bodyTouches, 0);
  assert.equal(socket.destroyed, true);
  const beforeClose = started.owner.snapshotMetrics();
  assert.equal(beforeClose.requestsAdmitted, 0);
  assert.equal(beforeClose.requestsRejected, 1);
  await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  const terminal = started.owner.snapshotMetrics();
  assert.strictEqual(started.owner.snapshotMetrics(), terminal);
  assert.equal(terminal.closeClean, 0);
  assert.equal(terminal.closeUncertain, 1);
  assert.equal(terminal.trackedSockets, 0);
  assert.equal(terminal.trackedRequests, 0);
  assert.equal(terminal.trackedHandlers, 0);
  assert.equal(terminal.ownedTimers, 0);
});

test('numeric origin rejects an accessor-backed SNI value without observation', async () => {
  let calls = 0;
  let servernameReads = 0;
  const configured = configuration({
    origin: 'https://127.0.0.1:8443',
    downstream: lifecycle({
      handle() {
        calls += 1;
        return Promise.resolve();
      },
    }),
  });
  const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
  await owner.start();
  const socket = new SyntheticSocket({ servername: false });
  Object.defineProperty(socket, 'servername', {
    configurable: true,
    enumerable: true,
    get() {
      servernameReads += 1;
      throw new Error('synthetic unobservable servername');
    },
  });
  const callbacks = configured.factoryHarness.observed.callbacks;
  callbacks.connection(socket);
  callbacks.secureConnection(socket);
  assert.equal(servernameReads, 0);
  assert.equal(socket.destroyed, true);
  const response = new SyntheticResponse(socket);
  callbacks.request(new SyntheticRequest(socket, { host: '127.0.0.1:8443' }), response);
  assert.equal(calls, 0);
  assert.equal(owner.snapshotMetrics().tlsRejected, 1);
  assert.deepEqual(await owner.close(), Object.freeze({ status: 'CLOSED' }));
});

test('request Proxy and accessor surfaces reject without attacker observation', async t => {
  async function runHostileRequest(makeRequest) {
    let calls = 0;
    const started = await startedOwner({
      downstream: lifecycle({
        handle() {
          calls += 1;
          return Promise.resolve();
        },
      }),
    });
    const socket = connect(started.callbacks);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    const hostile = makeRequest(new SyntheticRequest(socket));
    started.callbacks.request(hostile.request, response);
    assert.equal(hostile.observations(), 0);
    assert.equal(calls, 0);
    assert.equal(socket.destroyed, true);
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.requestsAdmitted, 0);
    assert.equal(metrics.trackedSockets, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  }

  await t.test('Proxy', async () => {
    await runHostileRequest(target => {
      let observations = 0;
      return {
        request: new Proxy(target, {
          get(object, key, receiver) {
            observations += 1;
            return Reflect.get(object, key, receiver);
          },
          getOwnPropertyDescriptor(object, key) {
            observations += 1;
            return Reflect.getOwnPropertyDescriptor(object, key);
          },
          getPrototypeOf(object) {
            observations += 1;
            return Reflect.getPrototypeOf(object);
          },
          ownKeys(object) {
            observations += 1;
            return Reflect.ownKeys(object);
          },
        }),
        observations: () => observations,
      };
    });
  });

  for (const field of ['socket', 'method', 'url', 'httpVersion', 'rawHeaders']) await t.test(
    `accessor-backed ${field}`,
    async () => {
      await runHostileRequest(request => {
        let observations = 0;
        const original = request[field];
        Object.defineProperty(request, field, {
          configurable: true,
          enumerable: true,
          get() {
            observations += 1;
            return original;
          },
        });
        return { request, observations: () => observations };
      });
    },
  );
});

test('native response callbacks settle cleanly and preserve ordered non-owner listeners', async () => {
  let handlerCompletion;
  let downstreamCalls = 0;
  const observedNonOwnerCalls = [];
  const started = await startedOwner({
    downstream: capabilityLifecycle({
      handle(_request, _response, _context, completion) {
        downstreamCalls += 1;
        handlerCompletion = completion;
      },
    }),
  });
  const socket = connect(started.callbacks);
  const request = new SyntheticRequest(socket);
  const response = new SyntheticResponse(socket, { finishOnEnd: false });
  const nonOwnerCallbacks = new Map();
  for (const eventName of ['finish', 'close', 'error']) {
    const first = function firstNonOwnerSettlementCallback() {
      observedNonOwnerCalls.push(`${eventName}:first`);
    };
    const second = function secondNonOwnerSettlementCallback() {
      observedNonOwnerCalls.push(`${eventName}:second`);
    };
    nonOwnerCallbacks.set(eventName, [first, second]);
    response.on(eventName, first);
    response.on(eventName, second);
  }

  started.callbacks.request(request, response);

  assert.equal(downstreamCalls, 1);
  const ownerCallbacks = new Map();
  for (const eventName of ['finish', 'close', 'error']) {
    const registered = response.rawListeners(eventName);
    const expectedNonOwner = nonOwnerCallbacks.get(eventName);
    assert.equal(registered.length, 3);
    assert.strictEqual(registered[0], expectedNonOwner[0]);
    assert.strictEqual(registered[1], expectedNonOwner[1]);
    const ownerCallback = registered[2];
    ownerCallbacks.set(eventName, ownerCallback);
    assert.equal(Object.isFrozen(ownerCallback), true);
    assert.equal(Object.getOwnPropertyDescriptor(ownerCallback, 'listener'), undefined);
    assert.equal(registered.filter(callback => callback === ownerCallback).length, 1);
  }

  response.emit('finish');
  assert.deepEqual(observedNonOwnerCalls, ['finish:first', 'finish:second']);
  handlerCompletion.success();
  await settle();

  for (const eventName of ['finish', 'close', 'error']) {
    const remaining = response.rawListeners(eventName);
    const expectedNonOwner = nonOwnerCallbacks.get(eventName);
    assert.deepEqual(remaining, expectedNonOwner);
    assert.equal(remaining.includes(ownerCallbacks.get(eventName)), false);
  }
  const metrics = started.owner.snapshotMetrics();
  assert.equal(metrics.requestsAdmitted, 1);
  assert.equal(metrics.trackedRequests, 0);
  assert.equal(metrics.trackedHandlers, 0);
  assert.equal(metrics.ownedTimers, 0);
  socket.destroy();
  assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
});

test('post-settlement cleanup accepts native same-event once-listener slot collapse only', async () => {
  let handlerCompletion;
  let downstreamCalls = 0;
  const observedFinishCalls = [];
  const started = await startedOwner({
    downstream: capabilityLifecycle({
      handle(_request, _response, _context, completion) {
        downstreamCalls += 1;
        handlerCompletion = completion;
      },
    }),
  });
  const socket = connect(started.callbacks);
  const request = new SyntheticRequest(socket);
  const response = new SyntheticResponse(socket);
  const onceFinish = function onceFinishListener() {
    observedFinishCalls.push('once');
  };
  const closeListener = function persistentCloseListener() {};
  const errorListener = function persistentErrorListener() {};
  response.once('finish', onceFinish);
  response.on('close', closeListener);
  response.on('error', errorListener);

  started.callbacks.request(request, response);

  assert.equal(downstreamCalls, 1);
  const finishBeforeSettlement = response.rawListeners('finish');
  assert.equal(finishBeforeSettlement.length, 2);
  const onceWrapper = finishBeforeSettlement[0];
  const onceListenerDescriptor = Object.getOwnPropertyDescriptor(onceWrapper, 'listener');
  assert.strictEqual(
    onceListenerDescriptor?.value,
    onceFinish,
  );
  const ownerCallbacks = new Map();
  for (const eventName of ['finish', 'close', 'error']) {
    const registered = response.rawListeners(eventName);
    const ownerCallback = registered[registered.length - 1];
    ownerCallbacks.set(eventName, ownerCallback);
    assert.equal(Object.isFrozen(ownerCallback), true);
    assert.equal(Object.getOwnPropertyDescriptor(ownerCallback, 'listener'), undefined);
  }
  const finishOwnerCallback = ownerCallbacks.get('finish');
  assert.strictEqual(finishOwnerCallback, finishBeforeSettlement[1]);
  assert.equal(
    finishBeforeSettlement.filter(callback => callback === finishOwnerCallback).length,
    1,
  );
  assert.strictEqual(finishBeforeSettlement[finishBeforeSettlement.length - 1], finishOwnerCallback);
  const responseEvents = Object.getOwnPropertyDescriptor(response, '_events').value;
  const finishSlotBeforeSettlement = Object.getOwnPropertyDescriptor(responseEvents, 'finish');
  assert.equal(Object.hasOwn(finishSlotBeforeSettlement, 'value'), true);
  const finishContainerBeforeSettlement = finishSlotBeforeSettlement.value;
  assert.equal(Array.isArray(finishContainerBeforeSettlement), true);
  assert.strictEqual(finishContainerBeforeSettlement[0], onceWrapper);
  assert.strictEqual(finishContainerBeforeSettlement[1], finishOwnerCallback);

  response.end();

  assert.equal(response.finished, true);
  assert.equal(response.writableEnded, true);
  assert.equal(socket.destroyed, false);
  assert.deepEqual(observedFinishCalls, ['once']);
  assert.deepEqual(Object.getOwnPropertyDescriptor(onceWrapper, 'listener'), onceListenerDescriptor);
  assert.equal(Object.getOwnPropertyDescriptor(finishOwnerCallback, 'listener'), undefined);
  const finishSlotAfterSettlement = Object.getOwnPropertyDescriptor(responseEvents, 'finish');
  assert.equal(Object.hasOwn(finishSlotAfterSettlement, 'value'), true);
  assert.notStrictEqual(finishSlotAfterSettlement.value, finishContainerBeforeSettlement);
  assert.strictEqual(finishSlotAfterSettlement.value, finishOwnerCallback);
  const finishAfterSettlement = response.rawListeners('finish');
  assert.deepEqual(finishAfterSettlement, [finishOwnerCallback]);
  assert.equal(
    finishAfterSettlement.filter(callback => callback === finishOwnerCallback).length,
    1,
  );
  assert.strictEqual(finishAfterSettlement[finishAfterSettlement.length - 1], finishOwnerCallback);

  handlerCompletion.success();
  await settle();

  assert.equal(socket.destroyed, false);
  assert.deepEqual(response.rawListeners('finish'), []);
  assert.deepEqual(response.rawListeners('close'), [closeListener]);
  assert.deepEqual(response.rawListeners('error'), [errorListener]);
  for (const eventName of ['finish', 'close', 'error']) {
    assert.equal(response.rawListeners(eventName).includes(ownerCallbacks.get(eventName)), false);
  }
  let metrics = started.owner.snapshotMetrics();
  assert.equal(metrics.trackedRequests, 0);
  assert.equal(metrics.trackedHandlers, 0);
  assert.equal(metrics.ownedTimers, 0);
  assert.equal(metrics.trackedSockets, 1);
  socket.destroy();
  metrics = started.owner.snapshotMetrics();
  assert.equal(metrics.trackedSockets, 0);
  assert.equal(metrics.trackedRequests, 0);
  assert.equal(metrics.trackedHandlers, 0);
  assert.equal(metrics.ownedTimers, 0);
  assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
});

for (const targetEventName of ['close', 'error']) test(
  `finish settlement does not authorize cross-slot ${targetEventName} listener collapse`,
  async () => {
    let handlerCompletion;
    let downstreamCalls = 0;
    let targetOwnerCallback = null;
    let targetOwnerCallbackObservations = 0;
    const started = await startedOwner({
      downstream: capabilityLifecycle({
        handle(_request, _response, _context, completion) {
          downstreamCalls += 1;
          handlerCompletion = completion;
        },
      }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    const nativeEmit = response.emit;
    Object.defineProperty(response, 'emit', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function emitWithTargetOwnerObservation(name, ...args) {
        if (
          name === targetEventName
          && targetOwnerCallback !== null
          && this.rawListeners(name).includes(targetOwnerCallback)
        ) targetOwnerCallbackObservations += 1;
        return Reflect.apply(nativeEmit, this, [name, ...args]);
      },
    });
    const preOwnerListener = function preOwnerTargetSettlementListener() {};
    response.on(targetEventName, preOwnerListener);

    started.callbacks.request(request, response);

    assert.equal(downstreamCalls, 1);
    const registered = response.rawListeners(targetEventName);
    assert.equal(registered.length, 2);
    assert.strictEqual(registered[0], preOwnerListener);
    targetOwnerCallback = registered[1];
    assert.equal(Object.isFrozen(targetOwnerCallback), true);
    assert.equal(Object.getOwnPropertyDescriptor(targetOwnerCallback, 'listener'), undefined);
    assert.equal(
      registered.filter(callback => callback === targetOwnerCallback).length,
      1,
    );
    assert.strictEqual(registered[registered.length - 1], targetOwnerCallback);
    const responseEvents = Object.getOwnPropertyDescriptor(response, '_events').value;
    const targetSlotBeforeDrift = Object.getOwnPropertyDescriptor(
      responseEvents,
      targetEventName,
    );
    assert.equal(Object.hasOwn(targetSlotBeforeDrift, 'value'), true);
    const targetContainerBeforeDrift = targetSlotBeforeDrift.value;
    assert.equal(Array.isArray(targetContainerBeforeDrift), true);
    assert.strictEqual(targetContainerBeforeDrift[0], preOwnerListener);
    assert.strictEqual(targetContainerBeforeDrift[1], targetOwnerCallback);

    response.emit('finish');

    assert.equal(targetOwnerCallbackObservations, 0);
    assert.equal(socket.destroyed, false);
    response.removeListener(targetEventName, preOwnerListener);
    const driftedTargetSlot = Object.getOwnPropertyDescriptor(
      responseEvents,
      targetEventName,
    );
    assert.equal(Object.hasOwn(driftedTargetSlot, 'value'), true);
    assert.notStrictEqual(driftedTargetSlot.value, targetContainerBeforeDrift);
    assert.strictEqual(driftedTargetSlot.value, targetOwnerCallback);
    assert.deepEqual(response.rawListeners(targetEventName), [targetOwnerCallback]);

    handlerCompletion.success();
    await settle();

    assert.equal(targetOwnerCallbackObservations, 0);
    assert.equal(socket.destroyed, true);
    assert.equal(socket.destroyCalls, 1);
    assert.equal(request.bodyTouches, 0);
    const retainedTargetSlot = Object.getOwnPropertyDescriptor(
      responseEvents,
      targetEventName,
    );
    assert.deepEqual(retainedTargetSlot, driftedTargetSlot);
    assert.strictEqual(retainedTargetSlot.value, targetOwnerCallback);
    assert.deepEqual(response.rawListeners(targetEventName), [targetOwnerCallback]);
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.trackedSockets, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    assert.equal(started.deadlines.pending(), 0);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  },
);

test('settled cleanup rejects unsafe response listener drift without rewriting it', async t => {
  const cases = [
    ['listener replacement', state => {
      const replacement = function replacementFinishListener() {};
      state.container[0] = replacement;
      return () => {
        const descriptor = Object.getOwnPropertyDescriptor(state.events, 'finish');
        assert.strictEqual(descriptor.value, state.container);
        assert.equal(state.container.length, 2);
        assert.strictEqual(state.container[0], replacement);
        assert.strictEqual(state.container[1], state.ownerCallback);
      };
    }],
    ['listener reordering', state => {
      state.container.reverse();
      return () => {
        const descriptor = Object.getOwnPropertyDescriptor(state.events, 'finish');
        assert.strictEqual(descriptor.value, state.container);
        assert.equal(state.container.length, 2);
        assert.strictEqual(state.container[0], state.ownerCallback);
        assert.strictEqual(state.container[1], state.persistentFinish);
      };
    }],
    ['copied callback alias', state => {
      const copied = function copiedFinishListener(...args) {
        return Reflect.apply(state.ownerCallback, this, args);
      };
      Object.defineProperty(copied, 'listener', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: state.ownerCallback,
      });
      state.container.splice(1, 0, copied);
      const copiedDescriptor = Object.getOwnPropertyDescriptor(copied, 'listener');
      return () => {
        const descriptor = Object.getOwnPropertyDescriptor(state.events, 'finish');
        assert.strictEqual(descriptor.value, state.container);
        assert.equal(state.container.length, 3);
        assert.strictEqual(state.container[0], state.persistentFinish);
        assert.strictEqual(state.container[1], copied);
        assert.strictEqual(state.container[2], state.ownerCallback);
        assert.deepEqual(Object.getOwnPropertyDescriptor(copied, 'listener'), copiedDescriptor);
      };
    }],
    ['index descriptor drift', state => {
      const descriptor = Object.getOwnPropertyDescriptor(state.container, '0');
      Object.defineProperty(state.container, '0', {
        ...descriptor,
        enumerable: !descriptor.enumerable,
      });
      const drifted = Object.getOwnPropertyDescriptor(state.container, '0');
      return () => {
        assert.strictEqual(
          Object.getOwnPropertyDescriptor(state.events, 'finish').value,
          state.container,
        );
        assert.deepEqual(Object.getOwnPropertyDescriptor(state.container, '0'), drifted);
      };
    }],
    ['Proxy event slot', state => {
      let trapCalls = 0;
      const trap = () => {
        trapCalls += 1;
        throw new Error('settled cleanup must not invoke a Proxy trap');
      };
      const proxy = new Proxy(state.container, {
        defineProperty: trap,
        deleteProperty: trap,
        get: trap,
        getOwnPropertyDescriptor: trap,
        getPrototypeOf: trap,
        has: trap,
        isExtensible: trap,
        ownKeys: trap,
        preventExtensions: trap,
        set: trap,
        setPrototypeOf: trap,
      });
      const descriptor = Object.getOwnPropertyDescriptor(state.events, 'finish');
      Object.defineProperty(state.events, 'finish', { ...descriptor, value: proxy });
      return () => {
        assert.strictEqual(
          Object.getOwnPropertyDescriptor(state.events, 'finish').value,
          proxy,
        );
        assert.equal(trapCalls, 0);
      };
    }],
    ['accessor event slot', state => {
      let getterCalls = 0;
      let setterCalls = 0;
      const getter = function settledFinishGetter() {
        getterCalls += 1;
        throw new Error('settled cleanup must not invoke an event-slot getter');
      };
      const setter = function settledFinishSetter() {
        setterCalls += 1;
        throw new Error('settled cleanup must not invoke an event-slot setter');
      };
      const descriptor = Object.getOwnPropertyDescriptor(state.events, 'finish');
      Object.defineProperty(state.events, 'finish', {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: getter,
        set: setter,
      });
      return () => {
        const current = Object.getOwnPropertyDescriptor(state.events, 'finish');
        assert.strictEqual(current.get, getter);
        assert.strictEqual(current.set, setter);
        assert.equal(getterCalls, 0);
        assert.equal(setterCalls, 0);
      };
    }],
    ['duplicate owner identity', state => {
      state.container.splice(state.container.length - 1, 0, state.ownerCallback);
      return () => {
        assert.strictEqual(
          Object.getOwnPropertyDescriptor(state.events, 'finish').value,
          state.container,
        );
        assert.equal(state.container.length, 3);
        assert.strictEqual(state.container[0], state.persistentFinish);
        assert.strictEqual(state.container[1], state.ownerCallback);
        assert.strictEqual(state.container[2], state.ownerCallback);
      };
    }],
    ['post-owner insertion', state => {
      const inserted = function postOwnerFinishListener() {};
      state.container.push(inserted);
      return () => {
        assert.strictEqual(
          Object.getOwnPropertyDescriptor(state.events, 'finish').value,
          state.container,
        );
        assert.equal(state.container.length, 3);
        assert.strictEqual(state.container[0], state.persistentFinish);
        assert.strictEqual(state.container[1], state.ownerCallback);
        assert.strictEqual(state.container[2], inserted);
      };
    }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    let handlerCompletion;
    let downstreamCalls = 0;
    const started = await startedOwner({
      downstream: capabilityLifecycle({
        handle(_request, _response, _context, completion) {
          downstreamCalls += 1;
          handlerCompletion = completion;
        },
      }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    const persistentFinish = function persistentFinishListener() {};
    response.on('finish', persistentFinish);
    started.callbacks.request(request, response);
    const registered = response.rawListeners('finish');
    assert.equal(registered.length, 2);
    const ownerCallback = registered[1];
    assert.strictEqual(registered[0], persistentFinish);
    assert.equal(Object.getOwnPropertyDescriptor(ownerCallback, 'listener'), undefined);
    response.emit('finish');
    assert.deepEqual(response.rawListeners('finish'), [persistentFinish, ownerCallback]);
    const events = Object.getOwnPropertyDescriptor(response, '_events').value;
    const container = Object.getOwnPropertyDescriptor(events, 'finish').value;
    assert.equal(Array.isArray(container), true);
    const verifyUntouched = mutate({
      container,
      events,
      ownerCallback,
      persistentFinish,
    });

    handlerCompletion.success();
    await settle();

    assert.equal(downstreamCalls, 1);
    assert.equal(socket.destroyed, true);
    assert.equal(request.bodyTouches, 0);
    verifyUntouched();
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.trackedSockets, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  });
});

// Pre-repair regression record: synchronous writeHead could commit before downstream.
test('response commit during setHeader cannot cross the final authority gate', async () => {
  let calls = 0;
  const started = await startedOwner({
    downstream: lifecycle({
      handle() {
        calls += 1;
        return Promise.resolve();
      },
    }),
  });
  const socket = connect(started.callbacks);
  const request = new SyntheticRequest(socket);
  const response = new ServerResponse(request);
  const nativeSetHeader = response.setHeader;
  const nativeWriteHead = response.writeHead;
  let commits = 0;
  response.setHeader = function setHeaderWithSynchronousCommit(name, value) {
    const result = Reflect.apply(nativeSetHeader, this, [name, value]);
    commits += 1;
    Reflect.apply(nativeWriteHead, this, [204]);
    return result;
  };

  started.callbacks.request(request, response);
  socket.destroy();
  await settle();
  let closeUncertain = false;
  await started.owner.close().then(
    () => {},
    error => { closeUncertain = exactError(error, CLOSE_UNCERTAIN); },
  );

  const metrics = started.owner.snapshotMetrics();
  assert.equal(commits, 1);
  assert.equal(response.headersSent, true);
  assert.equal(calls, 0);
  assert.equal(request.bodyTouches, 0);
  assert.equal(metrics.requestsAdmitted, 0);
  assert.equal(metrics.requestsRejected, 1);
  assert.equal(metrics.trackedSockets, 0);
  assert.equal(metrics.trackedRequests, 0);
  assert.equal(metrics.trackedHandlers, 0);
  assert.equal(metrics.ownedTimers, 0);
  assert.equal(metrics.closeClean, 0);
  assert.equal(metrics.closeUncertain, 1);
  assert.equal(closeUncertain, true);
});

test('ambiguous response terminal accessors fail closed without getter execution', async t => {
  for (const field of ['headersSent', 'writableEnded']) await t.test(field, async () => {
    let calls = 0;
    let getterReads = 0;
    const started = await startedOwner({
      downstream: lifecycle({
        handle() {
          calls += 1;
          return Promise.resolve();
        },
      }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    Object.defineProperty(response, field, {
      configurable: true,
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error('ambiguous response state');
      },
    });
    response.setHeader = function descriptorSafeSetHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    };

    started.callbacks.request(request, response);
    socket.destroy();
    await settle();
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );

    assert.equal(getterReads, 0);
    assert.equal(calls, 0);
    assert.equal(request.bodyTouches, 0);
    assert.equal(started.owner.snapshotMetrics().requestsAdmitted, 0);
  });
});

test('response ownership rejects request drift and settlement before downstream', async t => {
  for (const [name, drift] of [
    ['method', request => { request.method = 'GET'; }],
    ['target', request => { request.url = '/handoff'; }],
    ['HTTP version', request => { request.httpVersion = '1.0'; }],
    ['socket', request => { request.socket = new SyntheticSocket(); }],
    ['Host and framing headers', request => {
      request.rawHeaders = Object.freeze([
        'Host', AUTHORITY,
        'Content-Length', '0',
        'Connection', 'close',
        'X-Stable-Admission', 'changed',
      ]);
    }],
  ]) await t.test(`setHeader ${name} drift`, async () => {
    let calls = 0;
    const started = await startedOwner({
      downstream: lifecycle({
        handle() {
          calls += 1;
          return Promise.resolve();
        },
      }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    const nativeSetHeader = response.setHeader;
    response.setHeader = function setHeaderWithRequestDrift(name, value) {
      drift(request);
      return Reflect.apply(nativeSetHeader, this, [name, value]);
    };
    started.callbacks.request(request, response);
    assert.equal(calls, 0);
    assert.equal(socket.destroyed, true);
    assert.equal(response.listenerCount('finish'), 0);
    assert.equal(response.listenerCount('close'), 0);
    assert.equal(response.listenerCount('error'), 0);
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.requestsAdmitted, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  });

  for (const eventName of ['finish', 'close', 'error']) await t.test(
    `setHeader synchronous ${eventName}`,
    async () => {
      let calls = 0;
      const started = await startedOwner({
        downstream: capabilityLifecycle({
          handle() {
            calls += 1;
            return Promise.resolve();
          },
        }),
      });
      const socket = connect(started.callbacks);
      const request = new SyntheticRequest(socket);
      const response = new SyntheticResponse(socket, { finishOnEnd: false });
      const nativeSetHeader = response.setHeader;
      response.setHeader = function setHeaderWithSettlement(name, value) {
        const result = Reflect.apply(nativeSetHeader, this, [name, value]);
        this.emit(eventName);
        return result;
      };
      started.callbacks.request(request, response);
      assert.equal(calls, 0);
      assert.equal(socket.destroyed, true);
      assert.equal(response.listenerCount('finish'), 0);
      assert.equal(response.listenerCount('close'), 0);
      assert.equal(response.listenerCount('error'), 0);
      const metrics = started.owner.snapshotMetrics();
      assert.equal(metrics.requestsAdmitted, 0);
      assert.equal(metrics.trackedRequests, 0);
      assert.equal(metrics.trackedHandlers, 0);
      assert.equal(metrics.ownedTimers, 0);
      await assert.rejects(
        started.owner.close(),
        error => exactError(error, CLOSE_UNCERTAIN),
      );
      assert.equal(started.owner.snapshotMetrics().closeClean, 0);
    },
  );

  for (const methodName of ['setHeader', 'on', 'removeListener']) await t.test(
    `setHeader cannot drift the captured response ${methodName} surface`,
    async () => {
      let calls = 0;
      let settlementEntriesPresent = false;
      const started = await startedOwner({
        downstream: lifecycle({
          handle(_request, response) {
            calls += 1;
            response.end();
            return Promise.resolve();
          },
        }),
      });
      const socket = connect(started.callbacks);
      const request = new SyntheticRequest(socket);
      const response = new SyntheticResponse(socket, { finishOnEnd: false });
      const nativeSetHeader = response.setHeader;
      response.setHeader = function setHeaderWithResponseMethodDrift(name, value) {
        const result = Reflect.apply(nativeSetHeader, this, [name, value]);
        settlementEntriesPresent = ['finish', 'close', 'error'].every(
          eventName => this.rawListeners(eventName).length === 1,
        );
        this[methodName] = function driftedResponseMethod() {};
        return result;
      };

      started.callbacks.request(request, response);

      assert.equal(settlementEntriesPresent, true);
      assert.equal(calls, 0);
      assert.equal(socket.destroyed, true);
      assert.equal(request.bodyTouches, 0);
      assert.equal(response.listenerCount('finish'), 0);
      assert.equal(response.listenerCount('close'), 0);
      assert.equal(response.listenerCount('error'), 0);
      const metrics = started.owner.snapshotMetrics();
      assert.equal(metrics.requestStarts, 1);
      assert.equal(metrics.requestsAdmitted, 0);
      assert.equal(metrics.requestsRejected, 1);
      assert.equal(metrics.trackedRequests, 0);
      assert.equal(metrics.trackedHandlers, 0);
      assert.equal(metrics.ownedTimers, 0);
      await assert.rejects(
        started.owner.close(),
        error => exactError(error, CLOSE_UNCERTAIN),
      );
      assert.equal(started.owner.snapshotMetrics().closeClean, 0);
    },
  );

  for (const methodName of ['setHeader', 'on', 'removeListener']) await t.test(
    `setHeader rejects captured response ${methodName} descriptor drift with stable identity`,
    async () => {
      let calls = 0;
      let identityPreserved = false;
      const started = await startedOwner({
        downstream: lifecycle({
          handle(_request, response) {
            calls += 1;
            response.end();
            return Promise.resolve();
          },
        }),
      });
      const socket = connect(started.callbacks);
      const request = new SyntheticRequest(socket);
      const response = new SyntheticResponse(socket, { finishOnEnd: false });
      const nativeSetHeader = response.setHeader;
      response.setHeader = function setHeaderWithResponseDescriptorDrift(name, value) {
        const result = Reflect.apply(nativeSetHeader, this, [name, value]);
        const stableValue = this[methodName];
        if (methodName === 'setHeader') {
          const descriptor = Object.getOwnPropertyDescriptor(this, methodName);
          Object.defineProperty(this, methodName, {
            ...descriptor,
            writable: false,
          });
        } else {
          assert.strictEqual(stableValue, EventEmitter.prototype[methodName]);
          Object.defineProperty(this, methodName, {
            configurable: true,
            enumerable: false,
            writable: true,
            value: stableValue,
          });
        }
        identityPreserved = this[methodName] === stableValue;
        return result;
      };

      started.callbacks.request(request, response);

      assert.equal(identityPreserved, true);
      assert.equal(calls, 0);
      assert.equal(socket.destroyed, true);
      assert.equal(request.bodyTouches, 0);
      assert.equal(response.listenerCount('finish'), 0);
      assert.equal(response.listenerCount('close'), 0);
      assert.equal(response.listenerCount('error'), 0);
      const metrics = started.owner.snapshotMetrics();
      assert.equal(metrics.requestStarts, 1);
      assert.equal(metrics.requestsAdmitted, 0);
      assert.equal(metrics.requestsRejected, 1);
      assert.equal(metrics.trackedRequests, 0);
      assert.equal(metrics.trackedHandlers, 0);
      assert.equal(metrics.ownedTimers, 0);
      await assert.rejects(
        started.owner.close(),
        error => exactError(error, CLOSE_UNCERTAIN),
      );
      assert.equal(started.owner.snapshotMetrics().closeClean, 0);
    },
  );

  await t.test('setHeader cannot replace exact settlement callback identities with copies', async () => {
    let calls = 0;
    const ownerCallbacks = new Map();
    const copiedCallbacks = new Map();
    const started = await startedOwner({
      downstream: lifecycle({
        handle() {
          calls += 1;
          return Promise.resolve();
        },
      }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    const nativeSetHeader = response.setHeader;
    response.setHeader = function setHeaderWithSettlementListenerReplacement(name, value) {
      const result = Reflect.apply(nativeSetHeader, this, [name, value]);
      for (const eventName of ['finish', 'close', 'error']) {
        const registered = this.rawListeners(eventName);
        assert.equal(registered.length, 1);
        const ownerCallback = registered[0];
        assert.equal(Object.getOwnPropertyDescriptor(ownerCallback, 'listener'), undefined);
        const copiedCallback = function copiedSettlementCallback(...args) {
          return Reflect.apply(ownerCallback, this, args);
        };
        this.removeListener(eventName, ownerCallback);
        this.on(eventName, copiedCallback);
        ownerCallbacks.set(eventName, ownerCallback);
        copiedCallbacks.set(eventName, copiedCallback);
        assert.notStrictEqual(copiedCallback, ownerCallback);
        assert.strictEqual(this.rawListeners(eventName)[0], copiedCallback);
      }
      return result;
    };
    started.callbacks.request(request, response);
    assert.equal(ownerCallbacks.size, 3);
    assert.equal(copiedCallbacks.size, 3);
    assert.equal(calls, 0);
    assert.equal(socket.destroyed, true);
    assert.equal(request.bodyTouches, 0);
    for (const eventName of ['finish', 'close', 'error']) {
      assert.equal(response.listenerCount(eventName), 1);
      assert.strictEqual(
        response.rawListeners(eventName)[0],
        copiedCallbacks.get(eventName),
      );
      assert.notStrictEqual(
        response.rawListeners(eventName)[0],
        ownerCallbacks.get(eventName),
      );
    }
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.requestsAdmitted, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  });

  for (const [name, mutateSlot] of [
    ['settlement event-slot array container replacement with identical entries', state => {
      const replacement = [...state.container];
      state.response._events.finish = replacement;
      assert.notStrictEqual(replacement, state.container);
      assert.strictEqual(replacement[0], state.nonOwnerListener);
      assert.strictEqual(replacement[1], state.ownerCallback);
      state.expectedContainer = replacement;
      state.expectedEntries = [state.nonOwnerListener, state.ownerCallback];
    }],
    ['in-place settlement event-slot array reorder', state => {
      state.container.reverse();
      assert.strictEqual(state.response._events.finish, state.container);
      assert.strictEqual(state.container[0], state.ownerCallback);
      assert.strictEqual(state.container[1], state.nonOwnerListener);
      state.expectedEntries = [state.ownerCallback, state.nonOwnerListener];
    }],
    ['settlement event-slot non-owner listener replacement', state => {
      const replacement = function replacementNonOwnerFinishListener() {};
      state.container[0] = replacement;
      assert.strictEqual(state.response._events.finish, state.container);
      assert.strictEqual(state.container[0], replacement);
      assert.strictEqual(state.container[1], state.ownerCallback);
      state.expectedEntries = [replacement, state.ownerCallback];
    }],
    ['settlement event-slot descriptor drift with a stable container', state => {
      const descriptor = Object.getOwnPropertyDescriptor(
        state.response._events,
        'finish',
      );
      Object.defineProperty(state.response._events, 'finish', {
        ...descriptor,
        enumerable: !descriptor.enumerable,
      });
      assert.strictEqual(state.response._events.finish, state.container);
    }],
    ['settlement event-slot index descriptor drift with stable listeners', state => {
      const descriptor = Object.getOwnPropertyDescriptor(state.container, '0');
      Object.defineProperty(state.container, '0', {
        ...descriptor,
        enumerable: !descriptor.enumerable,
      });
      assert.strictEqual(state.container[0], state.nonOwnerListener);
      assert.strictEqual(state.container[1], state.ownerCallback);
    }],
  ]) await t.test(`setHeader rejects ${name}`, async () => {
    let calls = 0;
    let mutated = false;
    const started = await startedOwner({
      downstream: lifecycle({
        handle() {
          calls += 1;
          return Promise.resolve();
        },
      }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    const nonOwnerListener = function preExistingNonOwnerFinishListener() {};
    response.on('finish', nonOwnerListener);
    const nativeSetHeader = response.setHeader;
    const state = {
      response,
      nonOwnerListener,
      container: null,
      ownerCallback: null,
      expectedContainer: null,
      expectedEntries: null,
    };
    response.setHeader = function setHeaderWithSettlementEventSlotMutation(header, value) {
      const result = Reflect.apply(nativeSetHeader, this, [header, value]);
      const slotDescriptor = Object.getOwnPropertyDescriptor(this._events, 'finish');
      assert.notEqual(slotDescriptor, undefined);
      assert.equal(Object.hasOwn(slotDescriptor, 'value'), true);
      assert.equal(Array.isArray(slotDescriptor.value), true);
      assert.equal(slotDescriptor.value.length, 2);
      state.container = slotDescriptor.value;
      assert.strictEqual(state.container[0], nonOwnerListener);
      state.ownerCallback = state.container[1];
      state.expectedContainer = state.container;
      state.expectedEntries = [state.nonOwnerListener, state.ownerCallback];
      assert.strictEqual(
        this.rawListeners('finish')[this.rawListeners('finish').length - 1],
        state.ownerCallback,
      );
      assert.equal(
        Object.getOwnPropertyDescriptor(state.ownerCallback, 'listener'),
        undefined,
      );
      mutateSlot(state);
      assert.equal(
        Object.getOwnPropertyDescriptor(state.ownerCallback, 'listener'),
        undefined,
      );
      mutated = true;
      return result;
    };

    started.callbacks.request(request, response);

    assert.equal(mutated, true);
    assert.equal(calls, 0);
    assert.equal(socket.destroyed, true);
    assert.equal(socket.listenerCount('close'), 0);
    assert.equal(socket.listenerCount('error'), 0);
    assert.equal(request.bodyTouches, 0);
    const finishDescriptor = Object.getOwnPropertyDescriptor(response._events, 'finish');
    assert.equal(Object.hasOwn(finishDescriptor, 'value'), true);
    assert.strictEqual(finishDescriptor.value, state.expectedContainer);
    assert.equal(state.expectedContainer.length, 2);
    assert.strictEqual(state.expectedContainer[0], state.expectedEntries[0]);
    assert.strictEqual(state.expectedContainer[1], state.expectedEntries[1]);
    assert.equal(response.listenerCount('close'), 0);
    assert.equal(response.listenerCount('error'), 0);
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.requestStarts, 1);
    assert.equal(metrics.requestsAdmitted, 0);
    assert.equal(metrics.requestsRejected, 1);
    assert.equal(metrics.trackedSockets, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    assert.equal(started.deadlines.pending(), 0);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  });

  for (const [name, mutateListeners] of [
    ['partial exact settlement callback replacement', response => {
      const [ownerCallback] = response.rawListeners('finish');
      assert.equal(Object.getOwnPropertyDescriptor(ownerCallback, 'listener'), undefined);
      const replacementCallback = function replacementFinishCallback() {};
      response.removeListener('finish', ownerCallback);
      response.on('finish', replacementCallback);
      assert.notStrictEqual(replacementCallback, ownerCallback);
    }],
    ['duplicate exact settlement callback identity', response => {
      const [ownerCallback] = response.rawListeners('finish');
      assert.equal(Object.getOwnPropertyDescriptor(ownerCallback, 'listener'), undefined);
      response.on('finish', ownerCallback);
      const duplicated = response.rawListeners('finish');
      assert.equal(duplicated.length, 2);
      assert.strictEqual(duplicated[0], ownerCallback);
      assert.strictEqual(duplicated[1], ownerCallback);
    }],
    ['forwarding callback copy after the exact owner callback', response => {
      const [ownerCallback] = response.rawListeners('finish');
      const copiedCallback = function copiedFinishCallback(...args) {
        return Reflect.apply(ownerCallback, this, args);
      };
      response.on('finish', copiedCallback);
      const copied = response.rawListeners('finish');
      assert.equal(copied.length, 2);
      assert.strictEqual(copied[0], ownerCallback);
      assert.strictEqual(copied[1], copiedCallback);
      assert.notStrictEqual(copiedCallback, ownerCallback);
    }],
    ['Proxy settlement callback replacement', response => {
      const [ownerCallback] = response.rawListeners('finish');
      const replacementTarget = function proxiedFinishCallback() {};
      const replacementCallback = new Proxy(replacementTarget, {});
      response.removeListener('finish', ownerCallback);
      response.on('finish', replacementCallback);
    }],
  ]) await t.test(`setHeader rejects ${name}`, async () => {
    let calls = 0;
    let expectedFinishValue = null;
    const started = await startedOwner({
      downstream: lifecycle({
        handle() {
          calls += 1;
          return Promise.resolve();
        },
      }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    const nativeSetHeader = response.setHeader;
    response.setHeader = function setHeaderWithHostileSettlementListeners(header, value) {
      const result = Reflect.apply(nativeSetHeader, this, [header, value]);
      mutateListeners(this);
      expectedFinishValue = Object.getOwnPropertyDescriptor(
        this._events,
        'finish',
      ).value;
      return result;
    };
    started.callbacks.request(request, response);
    assert.equal(calls, 0);
    assert.equal(socket.destroyed, true);
    assert.equal(request.bodyTouches, 0);
    const finishDescriptor = Object.getOwnPropertyDescriptor(response._events, 'finish');
    assert.equal(Object.hasOwn(finishDescriptor, 'value'), true);
    assert.strictEqual(finishDescriptor.value, expectedFinishValue);
    assert.equal(response.listenerCount('close'), 0);
    assert.equal(response.listenerCount('error'), 0);
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.requestsAdmitted, 0);
    assert.equal(metrics.requestsRejected, 1);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );
  });

  await t.test('setHeader cannot remove settlement ownership', async () => {
    let calls = 0;
    const started = await startedOwner({
      downstream: lifecycle({
        handle() {
          calls += 1;
          return Promise.resolve();
        },
      }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    const nativeSetHeader = response.setHeader;
    response.setHeader = function setHeaderWithoutSettlementOwnership(name, value) {
      const result = Reflect.apply(nativeSetHeader, this, [name, value]);
      this.removeAllListeners('finish');
      this.removeAllListeners('close');
      this.removeAllListeners('error');
      return result;
    };
    started.callbacks.request(request, response);
    assert.equal(calls, 0);
    assert.equal(socket.destroyed, true);
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.requestsAdmitted, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  });

  await t.test('setHeader reentrant close completes owned cleanup before returning', async () => {
    let calls = 0;
    let closing = null;
    let duringClose = null;
    const started = await startedOwner({
      downstream: lifecycle({
        handle() {
          calls += 1;
          return Promise.resolve();
        },
      }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    const nativeSetHeader = response.setHeader;
    response.setHeader = function setHeaderWithOwnerClose(name, value) {
      closing = started.owner.close();
      closing.then(() => {}, () => {});
      duringClose = started.owner.snapshotMetrics();
      return Reflect.apply(nativeSetHeader, this, [name, value]);
    };
    started.callbacks.request(request, response);
    assert.notEqual(closing, null);
    assert.equal(duringClose.closeClean, 0);
    assert.equal(duringClose.trackedSockets, 0);
    assert.equal(duringClose.trackedRequests, 0);
    assert.equal(duringClose.trackedHandlers, 0);
    assert.equal(calls, 0);
    assert.deepEqual(await closing, Object.freeze({ status: 'CLOSED' }));
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.closeClean, 1);
    assert.equal(metrics.trackedSockets, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    assert.equal(response.listenerCount('finish'), 0);
    assert.equal(response.listenerCount('close'), 0);
    assert.equal(response.listenerCount('error'), 0);
  });
});

test('special parser, expectation, upgrade, CONNECT, drop and idle paths never delegate', async () => {
  let calls = 0;
  const started = await startedOwner({
    downstream: lifecycle({ handle() { calls += 1; return Promise.resolve(); } }),
  });
  for (const eventName of ['upgrade', 'connect', 'clientError', 'tlsClientError', 'dropRequest']) {
    const socket = connect(started.callbacks);
    if (eventName === 'upgrade' || eventName === 'connect') {
      const request = new SyntheticRequest(socket);
      started.callbacks[eventName](request, socket, Buffer.from('synthetic'));
    } else if (eventName === 'clientError' || eventName === 'tlsClientError') {
      started.callbacks[eventName](new Error('synthetic'), socket);
    } else {
      started.callbacks[eventName](new SyntheticRequest(socket), socket);
    }
    assert.equal(socket.destroyed, true);
  }
  for (const eventName of ['checkContinue', 'checkExpectation']) {
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket);
    started.callbacks[eventName](request, response);
    assert.equal(response.statusCode, 503);
    assert.equal(request.bodyTouches, 0);
    socket.destroy();
  }
  const idle = connect(started.callbacks);
  started.callbacks.timeout(idle);
  assert.equal(idle.destroyed, true);
  started.callbacks.drop(Object.freeze({ ignored: true }));
  assert.equal(calls, 0);
  await started.owner.close();
});

test('forced rejection reserves the final lifetime start before cancellation reentry', async t => {
  for (const eventName of ['checkContinue', 'checkExpectation']) await t.test(
    eventName,
    async () => {
      const limits = Object.freeze({
        ...LIMITS,
        maxConcurrentSockets: 2,
        maxConnectionStarts: 4,
        maxConcurrentRequests: 1,
        maxRequestStarts: 1,
      });
      let calls = 0;
      let owner;
      let callbacks;
      let innerRequest;
      let innerResponse;
      let reentered = false;
      let startsBeforeReentry = null;
      let startsAfterReentry = null;
      const deadlines = controlledDeadlineRuntime({
        onCancel({ milliseconds }) {
          if (milliseconds !== limits.headerDeadlineMs || reentered) return;
          reentered = true;
          startsBeforeReentry = owner.snapshotMetrics().requestStarts;
          callbacks.request(innerRequest, innerResponse);
          startsAfterReentry = owner.snapshotMetrics().requestStarts;
        },
      });
      const started = await startedOwner({
        limits,
        deadlines,
        downstream: lifecycle({
          handle(_request, response) {
            calls += 1;
            response.end();
            return Promise.resolve();
          },
        }),
      });
      owner = started.owner;
      callbacks = started.callbacks;
      const outerSocket = connect(callbacks);
      const innerSocket = connect(callbacks);
      const outerRequest = new SyntheticRequest(outerSocket);
      const outerResponse = new SyntheticResponse(outerSocket);
      innerRequest = new SyntheticRequest(innerSocket);
      innerResponse = new SyntheticResponse(innerSocket);

      callbacks[eventName](outerRequest, outerResponse);

      assert.equal(reentered, true);
      assert.equal(startsBeforeReentry, 1);
      assert.equal(startsAfterReentry, 1);
      assert.equal(calls, 0);
      assert.equal(outerRequest.bodyTouches, 0);
      assert.equal(innerRequest.bodyTouches, 0);
      assert.equal(outerResponse.statusCode, 503);
      assert.equal(innerResponse.statusCode, 503);
      for (const response of [outerResponse, innerResponse]) {
        assert.equal(response.listenerCount('finish'), 0);
        assert.equal(response.listenerCount('close'), 0);
        assert.equal(response.listenerCount('error'), 0);
      }
      const metrics = owner.snapshotMetrics();
      assert.equal(metrics.requestStarts, 1);
      assert.equal(metrics.requestsAdmitted, 0);
      assert.equal(metrics.requestsRejected, 2);
      assert.equal(metrics.trackedRequests, 0);
      assert.equal(metrics.trackedHandlers, 0);
      assert.equal(metrics.ownedTimers, 0);
      outerSocket.destroy();
      innerSocket.destroy();
      assert.deepEqual(await owner.close(), Object.freeze({ status: 'CLOSED' }));
      assert.equal(outerSocket.listenerCount('close'), 0);
      assert.equal(outerSocket.listenerCount('error'), 0);
      assert.equal(innerSocket.listenerCount('close'), 0);
      assert.equal(innerSocket.listenerCount('error'), 0);
    },
  );
});

test('header and complete request deadlines destroy only owned sockets with no body read', async t => {
  await t.test('header deadline', async () => {
    const deadlines = controlledDeadlineRuntime();
    const started = await startedOwner({ deadlines });
    const socket = connect(started.callbacks);
    assert.equal(deadlines.durations().includes(LIMITS.headerDeadlineMs), true);
    deadlines.fire(LIMITS.headerDeadlineMs);
    assert.equal(socket.destroyed, true);
    assert.equal(started.owner.snapshotMetrics().deadlineExpirations, 1);
    await started.owner.close();
    assert.deepEqual(deadlines.durations(), []);
  });

  await t.test('complete request and response deadline', async () => {
    const deadlines = controlledDeadlineRuntime();
    let handlerCompletion;
    const started = await startedOwner({
      deadlines,
      downstream: capabilityLifecycle({
        handle(_request, _response, _context, completion) {
          handlerCompletion = completion;
        },
      }),
    });
    const socket = connect(started.callbacks);
    const exchange = dispatch(started.callbacks, socket, {}, { finishOnEnd: false });
    assert.equal(exchange.request.bodyTouches, 0);
    deadlines.fire(LIMITS.requestResponseDeadlineMs);
    assert.equal(socket.destroyed, true);
    handlerCompletion.success();
    await settle();
    await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
    assert.deepEqual(deadlines.durations(), []);
  });
});

test('a synchronous request deadline cannot invoke downstream or retain listeners', async () => {
  const deadlines = controlledDeadlineRuntime({
    synchronousDuration: LIMITS.requestResponseDeadlineMs,
  });
  let calls = 0;
  const started = await startedOwner({
    deadlines,
    downstream: lifecycle({ handle() { calls += 1; return Promise.resolve(); } }),
  });
  const socket = connect(started.callbacks);
  const exchange = dispatch(started.callbacks, socket, {}, { finishOnEnd: false });
  assert.equal(calls, 0);
  assert.equal(socket.destroyed, true);
  assert.equal(exchange.request.bodyTouches, 0);
  assert.equal(exchange.response.listenerCount('finish'), 0);
  assert.equal(exchange.response.listenerCount('close'), 0);
  assert.equal(exchange.response.listenerCount('error'), 0);
  assert.equal(socket.listenerCount('close'), 0);
  assert.equal(socket.listenerCount('error'), 0);
  const metrics = started.owner.snapshotMetrics();
  assert.equal(metrics.trackedSockets, 0);
  assert.equal(metrics.trackedRequests, 0);
  assert.equal(metrics.trackedHandlers, 0);
  await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  assert.equal(deadlines.pending(), 0);
});

test('descriptor-safe cleanup never invokes a drifted response event-slot accessor', async () => {
  let calls = 0;
  let getterCalls = 0;
  let setterCalls = 0;
  let mutated = false;
  let accessorGet;
  let accessorSet;
  const started = await startedOwner({
    downstream: lifecycle({ handle() { calls += 1; return Promise.resolve(); } }),
  });
  const socket = connect(started.callbacks);
  const request = new SyntheticRequest(socket);
  const response = new SyntheticResponse(socket, { finishOnEnd: false });
  const nativeSetHeader = response.setHeader;
  response.setHeader = function setHeaderWithAccessorEventSlot(name, value) {
    const result = Reflect.apply(nativeSetHeader, this, [name, value]);
    const eventsDescriptor = Object.getOwnPropertyDescriptor(this, '_events');
    const slotDescriptor = Object.getOwnPropertyDescriptor(
      eventsDescriptor.value,
      'finish',
    );
    assert.notEqual(slotDescriptor, undefined);
    assert.equal(Object.hasOwn(slotDescriptor, 'value'), true);
    accessorGet = function hostileFinishSlotGetter() {
      getterCalls += 1;
      throw new Error('cleanup must not invoke the finish slot getter');
    };
    accessorSet = function hostileFinishSlotSetter() {
      setterCalls += 1;
      throw new Error('cleanup must not invoke the finish slot setter');
    };
    Object.defineProperty(eventsDescriptor.value, 'finish', {
      configurable: slotDescriptor.configurable,
      enumerable: slotDescriptor.enumerable,
      get: accessorGet,
      set: accessorSet,
    });
    mutated = true;
    return result;
  };

  started.callbacks.request(request, response);

  assert.equal(mutated, true);
  assert.equal(calls, 0);
  assert.equal(getterCalls, 0);
  assert.equal(setterCalls, 0);
  assert.equal(socket.destroyed, true);
  assert.equal(request.bodyTouches, 0);
  const finishDescriptor = Object.getOwnPropertyDescriptor(response._events, 'finish');
  assert.strictEqual(finishDescriptor.get, accessorGet);
  assert.strictEqual(finishDescriptor.set, accessorSet);
  assert.equal(response.listenerCount('close'), 0);
  assert.equal(response.listenerCount('error'), 0);
  const metrics = started.owner.snapshotMetrics();
  assert.equal(metrics.requestsAdmitted, 0);
  assert.equal(metrics.requestsRejected, 1);
  assert.equal(metrics.trackedRequests, 0);
  assert.equal(metrics.trackedHandlers, 0);
  assert.equal(metrics.ownedTimers, 0);
  await assert.rejects(
    started.owner.close(),
    error => exactError(error, CLOSE_UNCERTAIN),
  );
  assert.equal(started.owner.snapshotMetrics().closeClean, 0);
});

test('descriptor-safe cleanup never invokes traps on a drifted Proxy event slot', async () => {
  let calls = 0;
  let trapCalls = 0;
  let replacement = null;
  let target = null;
  const trap = () => {
    trapCalls += 1;
    throw new Error('cleanup must not invoke a Proxy trap');
  };
  const started = await startedOwner({
    downstream: lifecycle({ handle() { calls += 1; return Promise.resolve(); } }),
  });
  const socket = connect(started.callbacks);
  const request = new SyntheticRequest(socket);
  const response = new SyntheticResponse(socket, { finishOnEnd: false });
  const nonOwnerListener = function preExistingNonOwnerFinishListener() {};
  response.on('finish', nonOwnerListener);
  const nativeSetHeader = response.setHeader;
  response.setHeader = function setHeaderWithProxyEventSlot(name, value) {
    const result = Reflect.apply(nativeSetHeader, this, [name, value]);
    const eventsDescriptor = Object.getOwnPropertyDescriptor(this, '_events');
    const slotDescriptor = Object.getOwnPropertyDescriptor(
      eventsDescriptor.value,
      'finish',
    );
    assert.notEqual(slotDescriptor, undefined);
    assert.equal(Object.hasOwn(slotDescriptor, 'value'), true);
    assert.equal(Array.isArray(slotDescriptor.value), true);
    target = slotDescriptor.value;
    replacement = new Proxy(target, {
      apply: trap,
      construct: trap,
      defineProperty: trap,
      deleteProperty: trap,
      get: trap,
      getOwnPropertyDescriptor: trap,
      getPrototypeOf: trap,
      has: trap,
      isExtensible: trap,
      ownKeys: trap,
      preventExtensions: trap,
      set: trap,
      setPrototypeOf: trap,
    });
    Object.defineProperty(eventsDescriptor.value, 'finish', {
      ...slotDescriptor,
      value: replacement,
    });
    return result;
  };

  started.callbacks.request(request, response);

  assert.notEqual(replacement, null);
  assert.equal(calls, 0);
  assert.equal(trapCalls, 0);
  assert.equal(socket.destroyed, true);
  assert.equal(request.bodyTouches, 0);
  const finishDescriptor = Object.getOwnPropertyDescriptor(response._events, 'finish');
  assert.strictEqual(finishDescriptor.value, replacement);
  assert.equal(target.length, 2);
  assert.strictEqual(target[0], nonOwnerListener);
  assert.equal(response.listenerCount('close'), 0);
  assert.equal(response.listenerCount('error'), 0);
  const metrics = started.owner.snapshotMetrics();
  assert.equal(metrics.requestsAdmitted, 0);
  assert.equal(metrics.requestsRejected, 1);
  assert.equal(metrics.trackedRequests, 0);
  assert.equal(metrics.trackedHandlers, 0);
  assert.equal(metrics.ownedTimers, 0);
  await assert.rejects(
    started.owner.close(),
    error => exactError(error, CLOSE_UNCERTAIN),
  );
  assert.equal(started.owner.snapshotMetrics().closeClean, 0);
});

test('descriptor-safe cleanup leaves duplicate and copied callback drift untouched', async () => {
  let calls = 0;
  let ownerCallback = null;
  let copiedCallback = null;
  let container = null;
  const started = await startedOwner({
    downstream: lifecycle({ handle() { calls += 1; return Promise.resolve(); } }),
  });
  const socket = connect(started.callbacks);
  const request = new SyntheticRequest(socket);
  const response = new SyntheticResponse(socket, { finishOnEnd: false });
  const nativeSetHeader = response.setHeader;
  response.setHeader = function setHeaderWithDuplicateAndCopiedCallbacks(name, value) {
    const result = Reflect.apply(nativeSetHeader, this, [name, value]);
    const eventsDescriptor = Object.getOwnPropertyDescriptor(this, '_events');
    const slotDescriptor = Object.getOwnPropertyDescriptor(
      eventsDescriptor.value,
      'finish',
    );
    assert.notEqual(slotDescriptor, undefined);
    assert.equal(Object.hasOwn(slotDescriptor, 'value'), true);
    ownerCallback = slotDescriptor.value;
    assert.equal(Object.getOwnPropertyDescriptor(ownerCallback, 'listener'), undefined);
    copiedCallback = function copiedFinishCallback(...args) {
      return Reflect.apply(ownerCallback, this, args);
    };
    container = [ownerCallback, ownerCallback, copiedCallback, copiedCallback];
    Object.defineProperty(eventsDescriptor.value, 'finish', {
      ...slotDescriptor,
      value: container,
    });
    return result;
  };

  started.callbacks.request(request, response);

  assert.notEqual(ownerCallback, null);
  assert.notEqual(copiedCallback, null);
  assert.equal(calls, 0);
  assert.equal(socket.destroyed, true);
  assert.equal(request.bodyTouches, 0);
  const finishDescriptor = Object.getOwnPropertyDescriptor(response._events, 'finish');
  assert.strictEqual(finishDescriptor.value, container);
  assert.deepEqual(container, [
    ownerCallback,
    ownerCallback,
    copiedCallback,
    copiedCallback,
  ]);
  assert.equal(response.listenerCount('close'), 0);
  assert.equal(response.listenerCount('error'), 0);
  const metrics = started.owner.snapshotMetrics();
  assert.equal(metrics.requestsAdmitted, 0);
  assert.equal(metrics.requestsRejected, 1);
  assert.equal(metrics.trackedRequests, 0);
  assert.equal(metrics.trackedHandlers, 0);
  assert.equal(metrics.ownedTimers, 0);
  await assert.rejects(
    started.owner.close(),
    error => exactError(error, CLOSE_UNCERTAIN),
  );
  assert.equal(started.owner.snapshotMetrics().closeClean, 0);
});

test('partial response registration removes only the safely captured callback', async () => {
  let calls = 0;
  let getterCalls = 0;
  let setterCalls = 0;
  const started = await startedOwner({
    downstream: lifecycle({ handle() { calls += 1; return Promise.resolve(); } }),
  });
  const socket = connect(started.callbacks);
  const request = new SyntheticRequest(socket);
  const response = new SyntheticResponse(socket, { finishOnEnd: false });
  const firstCloseListener = function firstNonOwnerCloseListener() {};
  const secondCloseListener = function secondNonOwnerCloseListener() {};
  response.on('close', firstCloseListener);
  response.on('close', secondCloseListener);
  const closeContainer = response._events.close;
  Object.freeze(closeContainer);
  Object.defineProperty(response._events, 'error', {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('unregistered error slot getter must not be invoked');
    },
    set() {
      setterCalls += 1;
      throw new Error('unregistered error slot setter must not be invoked');
    },
  });

  started.callbacks.request(request, response);

  assert.equal(calls, 0);
  assert.equal(getterCalls, 0);
  assert.equal(setterCalls, 0);
  assert.equal(socket.destroyed, true);
  assert.equal(request.bodyTouches, 0);
  assert.equal(
    Object.getOwnPropertyDescriptor(response._events, 'finish'),
    undefined,
  );
  const closeDescriptor = Object.getOwnPropertyDescriptor(response._events, 'close');
  assert.strictEqual(closeDescriptor.value, closeContainer);
  assert.equal(closeContainer.length, 2);
  assert.strictEqual(closeContainer[0], firstCloseListener);
  assert.strictEqual(closeContainer[1], secondCloseListener);
  const errorDescriptor = Object.getOwnPropertyDescriptor(response._events, 'error');
  assert.equal(Object.hasOwn(errorDescriptor, 'value'), false);
  const metrics = started.owner.snapshotMetrics();
  assert.equal(metrics.requestsAdmitted, 0);
  assert.equal(metrics.requestsRejected, 1);
  assert.equal(metrics.trackedRequests, 0);
  assert.equal(metrics.trackedHandlers, 0);
  assert.equal(metrics.ownedTimers, 0);
  await assert.rejects(
    started.owner.close(),
    error => exactError(error, CLOSE_UNCERTAIN),
  );
  assert.equal(started.owner.snapshotMetrics().closeClean, 0);
});

test('unsafe own response bookkeeping fails closed before native listener registration', async t => {
  async function runRejectedBookkeepingCase(mutateResponse) {
    let calls = 0;
    const started = await startedOwner({
      downstream: lifecycle({ handle() { calls += 1; return Promise.resolve(); } }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    const verifyMutation = mutateResponse(response);

    started.callbacks.request(request, response);

    verifyMutation();
    assert.equal(calls, 0);
    assert.equal(socket.destroyed, true);
    assert.equal(request.bodyTouches, 0);
    assert.deepEqual(Reflect.ownKeys(response.headers), []);
    for (const eventName of ['finish', 'close', 'error']) {
      assert.equal(
        Object.getOwnPropertyDescriptor(response._events, eventName),
        undefined,
      );
    }
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.requestStarts, 1);
    assert.equal(metrics.requestsAdmitted, 0);
    assert.equal(metrics.requestsRejected, 1);
    assert.equal(metrics.trackedSockets, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  }

  for (const field of ['_eventsCount', '_maxListeners']) await t.test(
    `accessor-backed own ${field}`,
    async () => {
      let getterCalls = 0;
      let setterCalls = 0;
      await runRejectedBookkeepingCase(response => {
        const original = Object.getOwnPropertyDescriptor(response, field);
        const get = function hostileBookkeepingGetter() {
          getterCalls += 1;
          throw new Error('response bookkeeping getter must not be invoked');
        };
        const set = function hostileBookkeepingSetter() {
          setterCalls += 1;
          throw new Error('response bookkeeping setter must not be invoked');
        };
        Object.defineProperty(response, field, {
          configurable: original.configurable,
          enumerable: original.enumerable,
          get,
          set,
        });
        const expected = Object.getOwnPropertyDescriptor(response, field);
        return () => {
          assert.equal(getterCalls, 0);
          assert.equal(setterCalls, 0);
          assert.deepEqual(Object.getOwnPropertyDescriptor(response, field), expected);
        };
      });
    },
  );

  for (const [name, field, value, writable] of [
    ['non-writable own _eventsCount', '_eventsCount', 0, false],
    ['overflowing own _eventsCount', '_eventsCount', Number.MAX_SAFE_INTEGER, true],
    ['negative own _maxListeners', '_maxListeners', -1, true],
    ['fractional own _maxListeners', '_maxListeners', 1.5, true],
  ]) await t.test(name, async () => {
    await runRejectedBookkeepingCase(response => {
      const original = Object.getOwnPropertyDescriptor(response, field);
      Object.defineProperty(response, field, {
        ...original,
        value,
        writable,
      });
      const expected = Object.getOwnPropertyDescriptor(response, field);
      return () => {
        assert.deepEqual(Object.getOwnPropertyDescriptor(response, field), expected);
      };
    });
  });
});

test('accessor-backed response event slots fail closed before native listener registration', async t => {
  for (const slot of ['newListener', 'removeListener']) await t.test(slot, async () => {
    let calls = 0;
    let accessorReads = 0;
    const started = await startedOwner({
      downstream: lifecycle({ handle() { calls += 1; return Promise.resolve(); } }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    assert.strictEqual(response.on, EventEmitter.prototype.on);
    assert.strictEqual(response.removeListener, EventEmitter.prototype.removeListener);
    Object.defineProperty(response._events, slot, {
      configurable: true,
      enumerable: true,
      get() {
        accessorReads += 1;
        throw new Error('response event slot accessor must not be invoked');
      },
    });

    started.callbacks.request(request, response);

    assert.equal(accessorReads, 0);
    assert.equal(calls, 0);
    assert.equal(socket.destroyed, true);
    assert.equal(request.bodyTouches, 0);
    for (const eventName of ['finish', 'close', 'error']) {
      assert.equal(
        Object.getOwnPropertyDescriptor(response._events, eventName),
        undefined,
      );
    }
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.requestStarts, 1);
    assert.equal(metrics.requestsAdmitted, 0);
    assert.equal(metrics.requestsRejected, 1);
    assert.equal(metrics.trackedSockets, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );
  });
});

test('native on registration rejects reentrant replacement, reorder and copy activity', async t => {
  for (const [name, ownerIsFinal, mutateDuringPush] of [
    ['replacement', false, ({ container }) => {
      const replacement = function replacementFinishCallback() {};
      Reflect.apply(Array.prototype.push, container, [replacement]);
      return [container[0], container[1], replacement];
    }],
    ['reorder', true, ({ container, ownerCallback }) => {
      const first = container[0];
      container[0] = container[1];
      container[1] = first;
      Reflect.apply(Array.prototype.push, container, [ownerCallback]);
      return [container[0], container[1], ownerCallback];
    }],
    ['copy plus exact final callback', true, ({ container, ownerCallback }) => {
      const copiedCallback = function copiedFinishCallback(...args) {
        return Reflect.apply(ownerCallback, this, args);
      };
      Reflect.apply(Array.prototype.push, container, [copiedCallback, ownerCallback]);
      return [container[0], container[1], copiedCallback, ownerCallback];
    }],
  ]) await t.test(name, async () => {
    let calls = 0;
    let pushCalls = 0;
    let ownerCallback = null;
    let expectedEntries = null;
    const started = await startedOwner({
      downstream: lifecycle({ handle() { calls += 1; return Promise.resolve(); } }),
    });
    const socket = connect(started.callbacks);
    const request = new SyntheticRequest(socket);
    const response = new SyntheticResponse(socket, { finishOnEnd: false });
    assert.strictEqual(response.on, EventEmitter.prototype.on);
    const firstNonOwner = function firstNonOwnerFinishCallback() {};
    const secondNonOwner = function secondNonOwnerFinishCallback() {};
    response.on('finish', firstNonOwner);
    response.on('finish', secondNonOwner);
    const finishDescriptorBefore = Object.getOwnPropertyDescriptor(
      response._events,
      'finish',
    );
    const container = finishDescriptorBefore.value;
    assert.equal(Array.isArray(container), true);
    assert.equal(container.length, 2);
    assert.strictEqual(container[0], firstNonOwner);
    assert.strictEqual(container[1], secondNonOwner);
    const registrationPush = function registrationReentryPush(callback) {
      pushCalls += 1;
      ownerCallback = callback;
      assert.strictEqual(this, container);
      assert.equal(Object.isFrozen(ownerCallback), true);
      assert.equal(Object.getOwnPropertyDescriptor(ownerCallback, 'listener'), undefined);
      expectedEntries = mutateDuringPush({ container, ownerCallback });
      return container.length;
    };
    Object.defineProperty(container, 'push', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: registrationPush,
    });
    const pushDescriptor = Object.getOwnPropertyDescriptor(container, 'push');

    started.callbacks.request(request, response);

    assert.equal(pushCalls, 1);
    assert.notEqual(ownerCallback, null);
    assert.notEqual(expectedEntries, null);
    assert.equal(calls, 0);
    assert.equal(socket.destroyed, true);
    assert.equal(request.bodyTouches, 0);
    assert.deepEqual(Reflect.ownKeys(response.headers), []);
    const finishDescriptorAfter = Object.getOwnPropertyDescriptor(
      response._events,
      'finish',
    );
    assert.strictEqual(finishDescriptorAfter.value, container);
    assert.deepEqual(response.rawListeners('finish'), expectedEntries);
    assert.equal(
      expectedEntries[expectedEntries.length - 1] === ownerCallback,
      ownerIsFinal,
    );
    assert.deepEqual(Object.getOwnPropertyDescriptor(container, 'push'), pushDescriptor);
    assert.equal(
      Object.getOwnPropertyDescriptor(response._events, 'close'),
      undefined,
    );
    assert.equal(
      Object.getOwnPropertyDescriptor(response._events, 'error'),
      undefined,
    );
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.requestsAdmitted, 0);
    assert.equal(metrics.requestsRejected, 1);
    assert.equal(metrics.trackedSockets, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  });
});

test('post-start selective timer cancellation failures quarantine every cleanup path', async t => {
  await t.test('header cleanup', async () => {
    const deadlines = controlledDeadlineRuntime({
      cancelResultFor: ({ milliseconds }) => milliseconds !== LIMITS.headerDeadlineMs,
    });
    const started = await startedOwner({ deadlines });
    const socket = connect(started.callbacks);
    socket.destroy();
    assert.equal(started.owner.snapshotMetrics().phase, 'QUARANTINED');
    await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  });

  await t.test('request cleanup', async () => {
    const deadlines = controlledDeadlineRuntime({
      cancelResultFor: ({ milliseconds }) =>
        milliseconds !== LIMITS.requestResponseDeadlineMs,
    });
    const started = await startedOwner({ deadlines });
    const socket = connect(started.callbacks);
    dispatch(started.callbacks, socket);
    await settle();
    assert.equal(started.owner.snapshotMetrics().phase, 'QUARANTINED');
    socket.destroy();
    await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  });

  await t.test('close cleanup', async () => {
    const deadlines = controlledDeadlineRuntime({
      cancelResultFor: ({ milliseconds }) => milliseconds !== LIMITS.closeGraceMs,
    });
    const started = await startedOwner({ deadlines });
    await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.closeClean, 0);
    assert.equal(metrics.closeUncertain, 1);
  });

  await t.test('reentrant request cleanup', async () => {
    let owner;
    let reentrantClose = null;
    let reentered = false;
    const deadlines = controlledDeadlineRuntime({
      cancelResultFor: ({ milliseconds }) =>
        milliseconds !== LIMITS.requestResponseDeadlineMs,
      onCancel({ milliseconds }) {
        if (milliseconds !== LIMITS.requestResponseDeadlineMs || reentered) return;
        reentered = true;
        reentrantClose = owner.close();
        reentrantClose.then(() => {}, () => {});
      },
    });
    const configured = configuration({ deadlines });
    owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    await owner.start();
    const callbacks = configured.factoryHarness.observed.callbacks;
    const socket = connect(callbacks);
    dispatch(callbacks, socket);
    await settle();
    assert.equal(reentered, true);
    assert.notEqual(reentrantClose, null);
    await assert.rejects(reentrantClose, error => exactError(error, CLOSE_UNCERTAIN));
    assert.equal(owner.snapshotMetrics().closeClean, 0);
  });
});

test('connection-scoped tokens are opaque, stable, reconnect-distinct and unrelated to network fields', async () => {
  const contexts = [];
  let callbacks;
  const started = await startedOwner({
    downstream: lifecycle({
      handle(request, response, context) {
        contexts.push(context);
        const beforeDuplicateSecureEvent = context.peerToken;
        callbacks.secureConnection(request.socket);
        assert.strictEqual(context.peerToken, beforeDuplicateSecureEvent);
        response.statusCode = 204;
        response.end();
        return Promise.resolve();
      },
    }),
  });
  callbacks = started.callbacks;
  const firstSocket = connect(started.callbacks);
  const first = dispatch(started.callbacks, firstSocket);
  await settle();
  assert.equal(contexts.length, 1);
  assert.deepEqual(Reflect.ownKeys(contexts[0]), ['peerToken', 'abort']);
  assert.equal(Object.isFrozen(contexts[0]), true);
  assert.equal(typeof contexts[0].peerToken, 'symbol');
  assert.equal(contexts[0].peerToken.description, undefined);
  assert.equal(contexts[0].abort.length, 0);
  assert.equal(Object.isFrozen(contexts[0].abort), true);
  const stableToken = contexts[0].peerToken;
  assert.strictEqual(contexts[0].peerToken, stableToken);
  const duplicate = dispatch(started.callbacks, firstSocket);
  assert.equal(firstSocket.destroyed, true);
  assert.equal(duplicate.request.bodyTouches, 0);
  assert.equal(contexts.length, 1);
  firstSocket.destroy();

  const secondSocket = connect(started.callbacks);
  dispatch(started.callbacks, secondSocket);
  await settle();
  assert.equal(contexts.length, 2);
  assert.notStrictEqual(contexts[1].peerToken, stableToken);
  assert.equal(first.request.rawHeaders.includes('192.0.2.10'), true);
  secondSocket.destroy();
  await started.owner.close();
});

test('secureConnection consumes one accepted-handshake unit and cannot bypass budgets', async () => {
  const contexts = [];
  let calls = 0;
  const limits = Object.freeze({
    ...LIMITS,
    maxConcurrentSockets: 1,
    maxConnectionStarts: 2,
    maxConcurrentRequests: 1,
    maxRequestStarts: 2,
  });
  const started = await startedOwner({
    limits,
    downstream: lifecycle({
      handle(_request, response, context) {
        calls += 1;
        contexts.push(context);
        response.end();
        return Promise.resolve();
      },
    }),
  });

  const unadmittedSecureSocket = new SyntheticSocket();
  started.callbacks.secureConnection(unadmittedSecureSocket);
  assert.equal(unadmittedSecureSocket.destroyed, true);
  assert.equal(started.owner.snapshotMetrics().connectionStarts, 0);

  const rawSocket = new SyntheticSocket();
  const secureSocket = new SyntheticSocket();
  started.callbacks.connection(rawSocket);
  assert.equal(rawSocket.destroyed, false);
  started.callbacks.secureConnection(secureSocket);
  assert.equal(secureSocket.destroyed, false);
  dispatch(started.callbacks, secureSocket);
  await settle();
  assert.equal(calls, 1);
  assert.equal(contexts.length, 1);
  assert.equal(typeof contexts[0].peerToken, 'symbol');
  assert.equal(contexts[0].peerToken.description, undefined);

  const duplicateSecureSocket = new SyntheticSocket();
  started.callbacks.secureConnection(duplicateSecureSocket);
  assert.equal(duplicateSecureSocket.destroyed, true);
  const replacementRawSocket = new SyntheticSocket();
  started.callbacks.connection(replacementRawSocket);
  assert.equal(replacementRawSocket.destroyed, false);
  const replacementTlsFailure = new SyntheticSocket();
  started.callbacks.tlsClientError(undefined, replacementTlsFailure);
  assert.equal(replacementTlsFailure.destroyed, true);
  const exhaustedRawSocket = new SyntheticSocket();
  started.callbacks.connection(exhaustedRawSocket);
  assert.equal(exhaustedRawSocket.destroyed, true);
  assert.equal(started.owner.snapshotMetrics().connectionStarts, 2);
  assert.equal(started.owner.snapshotMetrics().requestsAdmitted, 1);
  assert.equal(calls, 1);

  secureSocket.destroy();
  rawSocket.destroy();
  replacementRawSocket.destroy();
  await started.owner.close();
  assert.equal(secureSocket.listenerCount('close'), 0);
  assert.equal(secureSocket.listenerCount('error'), 0);
  assert.equal(rawSocket.listenerCount('close'), 0);
  assert.equal(rawSocket.listenerCount('error'), 0);
});

test('accepted raw handshakes settle out of order without wrapper identity or cross-revocation',
  async () => {
    let calls = 0;
    const started = await startedOwner({
      downstream: capabilityLifecycle({
        handle(_request, response, _context, completion) {
          calls += 1;
          response.end();
          completion.success();
        },
      }),
    });
    const firstRaw = new SyntheticSocket({ closeOnDestroy: false });
    const secondRaw = new SyntheticSocket({ closeOnDestroy: false });
    const failedTls = new SyntheticSocket({ closeOnDestroy: false });
    const secure = new SyntheticSocket();

    started.callbacks.connection(firstRaw);
    started.callbacks.connection(secondRaw);
    assert.equal(firstRaw.destroyed, false);
    assert.equal(secondRaw.destroyed, false);
    assert.equal(firstRaw.listenerCount('close'), 0);
    assert.equal(firstRaw.listenerCount('error'), 0);
    assert.equal(secondRaw.listenerCount('close'), 0);
    assert.equal(secondRaw.listenerCount('error'), 0);
    assert.equal(started.owner.snapshotMetrics().connectionStarts, 2);
    assert.equal(started.owner.snapshotMetrics().trackedSockets, 0);

    started.callbacks.tlsClientError(undefined, failedTls);
    assert.equal(failedTls.destroyed, true);
    assert.equal(firstRaw.destroyed, false);
    assert.equal(secondRaw.destroyed, false);

    started.callbacks.secureConnection(secure);
    assert.equal(secure.destroyed, false);
    dispatch(started.callbacks, secure);
    await settle();
    assert.equal(calls, 1);
    assert.equal(started.owner.snapshotMetrics().requestsAdmitted, 1);

    secure.destroy();
    firstRaw.destroy();
    secondRaw.destroy();
    failedTls.emit('close');
    assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
  });

test('unsolicited and excess TLS terminal callbacks cannot transfer accounting authority',
  async () => {
    let calls = 0;
    const started = await startedOwner({
      downstream: capabilityLifecycle({
        handle(_request, response, _context, completion) {
          calls += 1;
          response.end();
          completion.success();
        },
      }),
    });
    const unsolicitedSecure = new SyntheticSocket();
    const unsolicitedFailure = new SyntheticSocket();
    const excessFailure = new SyntheticSocket();
    started.callbacks.secureConnection(unsolicitedSecure);
    started.callbacks.tlsClientError(undefined, unsolicitedFailure);
    started.callbacks.tlsClientError(undefined, excessFailure);
    assert.equal(unsolicitedSecure.destroyed, true);
    assert.equal(unsolicitedFailure.destroyed, true);
    assert.equal(excessFailure.destroyed, true);
    assert.equal(started.owner.snapshotMetrics().connectionStarts, 0);
    assert.equal(started.owner.snapshotMetrics().trackedSockets, 0);

    const raw = new SyntheticSocket({ closeOnDestroy: false });
    const secure = new SyntheticSocket();
    started.callbacks.connection(raw);
    assert.equal(raw.listenerCount('close'), 0);
    assert.equal(raw.listenerCount('error'), 0);
    started.callbacks.secureConnection(secure);
    dispatch(started.callbacks, secure);
    await settle();
    assert.equal(calls, 1);
    assert.equal(started.owner.snapshotMetrics().connectionStarts, 1);
    assert.equal(started.owner.snapshotMetrics().requestsAdmitted, 1);

    secure.destroy();
    raw.destroy();
    assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
  });

test('TLS failure destroys only its candidate while an active secure reservation stays eligible',
  async () => {
    let calls = 0;
    const limits = Object.freeze({
      ...LIMITS,
      maxConcurrentSockets: 1,
      maxConcurrentRequests: 1,
    });
    const started = await startedOwner({
      limits,
      downstream: capabilityLifecycle({
        handle(_request, response, _context, completion) {
          calls += 1;
          response.end();
          completion.success();
        },
      }),
    });
    const activeRaw = new SyntheticSocket({ closeOnDestroy: false });
    const activeSecure = new SyntheticSocket();
    started.callbacks.connection(activeRaw);
    started.callbacks.secureConnection(activeSecure);

    const failingRaw = new SyntheticSocket({ closeOnDestroy: false });
    const failingTls = new SyntheticSocket({ closeOnDestroy: false });
    started.callbacks.connection(failingRaw);
    assert.equal(failingRaw.destroyed, false);
    assert.equal(failingRaw.listenerCount('close'), 0);
    assert.equal(failingRaw.listenerCount('error'), 0);
    started.callbacks.tlsClientError(undefined, failingTls);
    assert.equal(failingTls.destroyed, true);
    assert.equal(failingRaw.destroyed, false);
    assert.equal(activeSecure.destroyed, false);

    dispatch(started.callbacks, activeSecure);
    await settle();
    assert.equal(calls, 1);
    assert.equal(started.owner.snapshotMetrics().requestsAdmitted, 1);

    activeSecure.destroy();
    activeRaw.destroy();
    failingRaw.destroy();
    failingTls.emit('close');
    assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
  });

test('failed handshakes consume lifetime starts while secure concurrency begins post-handshake',
  async () => {
    let calls = 0;
    const limits = Object.freeze({
      ...LIMITS,
      maxConcurrentSockets: 1,
      maxConnectionStarts: 5,
      maxConcurrentRequests: 1,
      maxRequestStarts: 2,
    });
    const started = await startedOwner({
      limits,
      downstream: capabilityLifecycle({
        handle(_request, response, _context, completion) {
          calls += 1;
          response.end();
          completion.success();
        },
      }),
    });
    const failedRawA = new SyntheticSocket({ closeOnDestroy: false });
    const failedRawB = new SyntheticSocket({ closeOnDestroy: false });
    const failedTlsA = new SyntheticSocket({ closeOnDestroy: false });
    const failedTlsB = new SyntheticSocket({ closeOnDestroy: false });
    started.callbacks.connection(failedRawA);
    started.callbacks.connection(failedRawB);
    started.callbacks.tlsClientError(undefined, failedTlsB);
    started.callbacks.tlsClientError(undefined, failedTlsA);

    const activeRaw = new SyntheticSocket({ closeOnDestroy: false });
    const activeSecure = new SyntheticSocket();
    started.callbacks.connection(activeRaw);
    started.callbacks.secureConnection(activeSecure);
    assert.equal(activeSecure.destroyed, false);

    const capacityRaw = new SyntheticSocket({ closeOnDestroy: false });
    const capacitySecure = new SyntheticSocket();
    started.callbacks.connection(capacityRaw);
    assert.equal(capacityRaw.destroyed, false);
    started.callbacks.secureConnection(capacitySecure);
    assert.equal(capacitySecure.destroyed, true);
    assert.equal(activeSecure.destroyed, false);

    const finalRaw = new SyntheticSocket({ closeOnDestroy: false });
    const finalFailure = new SyntheticSocket({ closeOnDestroy: false });
    started.callbacks.connection(finalRaw);
    started.callbacks.tlsClientError(undefined, finalFailure);
    const rejectedRaw = new SyntheticSocket();
    started.callbacks.connection(rejectedRaw);
    assert.equal(rejectedRaw.destroyed, true);
    assert.equal(started.owner.snapshotMetrics().connectionStarts, 5);

    dispatch(started.callbacks, activeSecure);
    await settle();
    assert.equal(calls, 1);
    assert.equal(started.owner.snapshotMetrics().requestsAdmitted, 1);

    activeSecure.destroy();
    for (const raw of [failedRawA, failedRawB, activeRaw, capacityRaw, finalRaw]) raw.destroy();
    for (const failed of [failedTlsA, failedTlsB, finalFailure]) failed.emit('close');
    assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
  });

test('unresolved handshake accounting requires trusted listener terminal evidence for clean close',
  async t => {
    await t.test('missing listener terminal evidence remains bounded and uncertain', async () => {
      const deadlines = controlledDeadlineRuntime();
      const factoryHarness = serverFactoryHarness({ close: () => {} });
      const started = await startedOwner({ deadlines, factoryHarness });
      const raw = new SyntheticSocket({ closeOnDestroy: false });
      started.callbacks.connection(raw);
      assert.equal(raw.listenerCount('close'), 0);
      assert.equal(raw.listenerCount('error'), 0);
      const closing = started.owner.close();
      deadlines.fire(LIMITS.closeGraceMs);
      await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));
      assert.equal(started.owner.snapshotMetrics().closeClean, 0);
      assert.equal(started.owner.snapshotMetrics().closeUncertain, 1);
      raw.destroy();
    });

    await t.test('listener close supplies terminal evidence for unresolved handshakes', async () => {
      const deadlines = controlledDeadlineRuntime();
      const started = await startedOwner({ deadlines });
      const raw = new SyntheticSocket({ closeOnDestroy: false });
      started.callbacks.connection(raw);
      assert.equal(raw.listenerCount('close'), 0);
      assert.equal(raw.listenerCount('error'), 0);
      const closing = started.owner.close();
      await settle();
      if (deadlines.durations().includes(LIMITS.closeGraceMs)) {
        deadlines.fire(LIMITS.closeGraceMs);
      }
      assert.deepEqual(await closing, Object.freeze({ status: 'CLOSED' }));
      assert.equal(started.owner.snapshotMetrics().closeClean, 1);
      assert.equal(started.owner.snapshotMetrics().closeUncertain, 0);
      raw.destroy();
    });
  });

test('duplicate secureConnection rejects that socket without consuming another admission', async () => {
  let calls = 0;
  const started = await startedOwner({
    downstream: lifecycle({
      handle(_request, response) {
        calls += 1;
        response.end();
        return Promise.resolve();
      },
    }),
  });
  const rawA = new SyntheticSocket();
  const rawB = new SyntheticSocket();
  const tlsA = new SyntheticSocket();
  const tlsB = new SyntheticSocket();
  started.callbacks.connection(rawA);
  started.callbacks.secureConnection(tlsA);
  started.callbacks.connection(rawB);
  const before = started.owner.snapshotMetrics();

  started.callbacks.secureConnection(tlsA);
  const afterDuplicate = started.owner.snapshotMetrics();
  assert.equal(tlsA.destroyed, true);
  assert.equal(afterDuplicate.tlsRejected, before.tlsRejected + 1);
  assert.equal(afterDuplicate.connectionStarts, 2);

  started.callbacks.secureConnection(tlsB);
  assert.equal(tlsB.destroyed, false);
  dispatch(started.callbacks, tlsB);
  await settle();
  assert.equal(calls, 1);
  assert.equal(started.owner.snapshotMetrics().requestsAdmitted, 1);

  tlsB.destroy();
  rawA.destroy();
  rawB.destroy();
  await started.owner.close();
});

test('a late lifetime duplicate TLS socket cannot consume a later raw admission', async () => {
  let calls = 0;
  const started = await startedOwner({
    downstream: lifecycle({
      handle(_request, response) {
        calls += 1;
        response.end();
        return Promise.resolve();
      },
    }),
  });
  const rawA = new SyntheticSocket();
  const tlsA = new SyntheticSocket();
  started.callbacks.connection(rawA);
  started.callbacks.secureConnection(tlsA);

  started.callbacks.secureConnection(tlsA);
  assert.equal(tlsA.destroyed, true);
  assert.equal(tlsA.listenerCount('close'), 0);
  assert.equal(tlsA.listenerCount('error'), 0);

  const rawB = new SyntheticSocket();
  const tlsB = new SyntheticSocket();
  started.callbacks.connection(rawB);
  const beforeLateDuplicate = started.owner.snapshotMetrics();
  started.callbacks.secureConnection(tlsA);
  const afterLateDuplicate = started.owner.snapshotMetrics();
  assert.equal(afterLateDuplicate.tlsRejected, beforeLateDuplicate.tlsRejected + 1);
  assert.equal(afterLateDuplicate.connectionStarts, 2);

  started.callbacks.secureConnection(tlsB);
  assert.equal(tlsB.destroyed, false);
  dispatch(started.callbacks, tlsB);
  await settle();
  assert.equal(calls, 1);
  assert.equal(started.owner.snapshotMetrics().requestsAdmitted, 1);

  tlsB.destroy();
  rawA.destroy();
  rawB.destroy();
  assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
});

test('secure-only reservations ignore raw termination and release exactly once', async t => {
  await t.test('raw wrappers do not own secure eligibility or concurrent capacity', async () => {
    const limits = Object.freeze({
      ...LIMITS,
      maxConcurrentSockets: 1,
      maxConnectionStarts: 8,
      maxConcurrentRequests: 1,
    });
    const started = await startedOwner({ limits, downstream: capabilityLifecycle() });

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const raw = new SyntheticSocket({ closeOnDestroy: false });
      const secure = new SyntheticSocket();
      started.callbacks.connection(raw);
      started.callbacks.secureConnection(secure);
      assert.equal(secure.destroyed, false);

      raw.destroy();
      assert.equal(secure.destroyed, false);
      const capacityRaw = new SyntheticSocket({ closeOnDestroy: false });
      const capacitySecure = new SyntheticSocket();
      started.callbacks.connection(capacityRaw);
      started.callbacks.secureConnection(capacitySecure);
      assert.equal(capacityRaw.destroyed, false);
      assert.equal(capacitySecure.destroyed, true);
      assert.equal(secure.destroyed, false);

      secure.destroy();
      capacityRaw.destroy();
    }

    assert.equal(started.owner.snapshotMetrics().connectionStarts, 6);
    assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
    assert.equal(started.owner.snapshotMetrics().trackedSockets, 0);
  });

  await t.test('owned request delays secure-capacity release after transport terminal', async () => {
    let handlerCompletion;
    const limits = Object.freeze({
      ...LIMITS,
      maxConcurrentSockets: 1,
      maxConnectionStarts: 5,
      maxConcurrentRequests: 1,
      maxRequestStarts: 5,
    });
    const started = await startedOwner({
      limits,
      downstream: capabilityLifecycle({
        handle(_request, _response, _context, completion) {
          handlerCompletion = completion;
        },
      }),
    });
    const raw = new SyntheticSocket({ closeOnDestroy: false });
    const secure = new SyntheticSocket();
    started.callbacks.connection(raw);
    started.callbacks.secureConnection(secure);
    dispatch(started.callbacks, secure, {}, { finishOnEnd: false });
    secure.destroy();

    const capacityRaw = new SyntheticSocket({ closeOnDestroy: false });
    const capacitySecure = new SyntheticSocket();
    started.callbacks.connection(capacityRaw);
    started.callbacks.secureConnection(capacitySecure);
    assert.equal(capacitySecure.destroyed, true);

    handlerCompletion.success();
    await settle();
    const replacementRaw = new SyntheticSocket({ closeOnDestroy: false });
    const replacementSecure = new SyntheticSocket();
    started.callbacks.connection(replacementRaw);
    started.callbacks.secureConnection(replacementSecure);
    assert.equal(replacementSecure.destroyed, false);

    replacementSecure.destroy();
    raw.destroy();
    capacityRaw.destroy();
    replacementRaw.destroy();
    const closing = started.owner.close();
    await settle();
    const closingMetrics = started.owner.snapshotMetrics();
    assert.equal(closingMetrics.trackedSockets, 0);
    assert.equal(closingMetrics.trackedRequests, 0);
    assert.equal(closingMetrics.trackedHandlers, 0);
    assert.equal(closingMetrics.ownedTimers, 0);
    assert.equal(closingMetrics.phase, 'CLOSED');
    assert.deepEqual(await closing, Object.freeze({ status: 'CLOSED' }));
  });
});

test('exact secure terminal signals revoke post-handshake authority', async t => {
  const terminalCases = [
    ['clientError on secure',
      (started, _raw, secure) => started.callbacks.clientError(undefined, secure)],
    ['error on secure',
      (_started, _raw, secure) => secure.emit('error', new Error('synthetic secure error'))],
    ['close on secure', (_started, _raw, secure) => secure.destroy()],
  ];

  for (const [name, terminalize] of terminalCases) await t.test(name, async () => {
    let downstreamCalls = 0;
    const started = await startedOwner({
      downstream: lifecycle({
        handle(_request, response) {
          downstreamCalls += 1;
          response.end();
          return Promise.resolve();
        },
      }),
    });
    const raw = new SyntheticSocket();
    const secure = new SyntheticSocket();
    started.callbacks.connection(raw);
    started.callbacks.secureConnection(secure);

    terminalize(started, raw, secure);
    const exchange = dispatch(started.callbacks, secure);
    await settle();

    assert.equal(downstreamCalls, 0);
    assert.equal(exchange.request.bodyTouches, 0);
    assert.equal(secure.destroyed, true);
    raw.destroy();
    secure.destroy();
    assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
  });
});

test('failed distinct secure tracking rolls back reservation eligibility and capacity', async () => {
  const limits = Object.freeze({
    ...LIMITS,
    maxConcurrentSockets: 1,
    maxConnectionStarts: 3,
    maxConcurrentRequests: 1,
    maxRequestStarts: 3,
  });
  const started = await startedOwner({ limits, downstream: capabilityLifecycle() });
  const raw = new SyntheticSocket();
  const secure = new SyntheticSocket();
  const nativeOnce = secure.once;
  let closedDuringTracking = false;
  secure.once = function onceWithSynchronousClose(name, callback) {
    const result = Reflect.apply(nativeOnce, this, [name, callback]);
    if (name === 'close' && !closedDuringTracking) {
      closedDuringTracking = true;
      this.destroy();
    }
    return result;
  };

  started.callbacks.connection(raw);
  started.callbacks.secureConnection(secure);
  assert.equal(closedDuringTracking, true);
  assert.equal(raw.destroyed, false);

  const replacementRaw = new SyntheticSocket();
  const replacementSecure = new SyntheticSocket();
  started.callbacks.connection(replacementRaw);
  started.callbacks.secureConnection(replacementSecure);
  assert.equal(replacementSecure.destroyed, false);
  replacementSecure.destroy();
  replacementRaw.destroy();
  raw.destroy();
  assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
});

// Pre-repair regression record: secure state was request-visible while scheduling ran.
test('header deadline publication waits for completed scheduling', async t => {
  await t.test('synchronous request reentry followed by schedule failure', async () => {
    let owner;
    let callbacks;
    let request;
    let response;
    let reentered = false;
    let calls = 0;
    const deadlines = controlledDeadlineRuntime({
      onSchedule({ milliseconds }) {
        if (milliseconds !== LIMITS.headerDeadlineMs || reentered) return;
        reentered = true;
        callbacks.request(request, response);
        throw new Error('synthetic header scheduling failure');
      },
    });
    const configured = configuration({
      deadlines,
      downstream: lifecycle({
        handle() {
          calls += 1;
          return Promise.resolve();
        },
      }),
    });
    owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    await owner.start();
    callbacks = configured.factoryHarness.observed.callbacks;
    const socket = new SyntheticSocket();
    request = new SyntheticRequest(socket);
    response = new SyntheticResponse(socket, { finishOnEnd: false });

    callbacks.connection(socket);
    callbacks.secureConnection(socket);
    socket.destroy();
    await settle();
    await assert.rejects(owner.close(), error => exactError(error, CLOSE_UNCERTAIN));

    const metrics = owner.snapshotMetrics();
    assert.equal(reentered, true);
    assert.equal(calls, 0);
    assert.equal(request.bodyTouches, 0);
    assert.equal(metrics.requestsAdmitted, 0);
    assert.equal(metrics.requestsRejected, 1);
    assert.equal(metrics.trackedSockets, 0);
    assert.equal(metrics.trackedRequests, 0);
    assert.equal(metrics.trackedHandlers, 0);
    assert.equal(metrics.ownedTimers, 0);
    assert.equal(metrics.closeClean, 0);
    assert.equal(metrics.closeUncertain, 1);
  });

  await t.test('synchronous header deadline firing never becomes a clean setup', async () => {
    let calls = 0;
    const deadlines = controlledDeadlineRuntime({
      synchronousDuration: LIMITS.headerDeadlineMs,
    });
    const started = await startedOwner({
      deadlines,
      downstream: lifecycle({
        handle() {
          calls += 1;
          return Promise.resolve();
        },
      }),
    });
    const socket = new SyntheticSocket();

    started.callbacks.connection(socket);
    started.callbacks.secureConnection(socket);
    await assert.rejects(
      started.owner.close(),
      error => exactError(error, CLOSE_UNCERTAIN),
    );

    const metrics = started.owner.snapshotMetrics();
    assert.equal(socket.destroyed, true);
    assert.equal(calls, 0);
    assert.equal(metrics.requestsAdmitted, 0);
    assert.equal(metrics.deadlineExpirations, 1);
    assert.equal(metrics.trackedSockets, 0);
    assert.equal(metrics.ownedTimers, 0);
    assert.equal(metrics.closeClean, 0);
    assert.equal(metrics.closeUncertain, 1);
  });
});

// Pre-repair regression record: resumed socket setup could retain work after terminal close.
test('terminal reentry cannot publish socket state or listeners after setup resumes', async t => {
  async function runBoundary(boundary) {
    let owner;
    let closing = null;
    let reentered = false;
    const deadlines = controlledDeadlineRuntime({
      synchronousDuration: LIMITS.closeGraceMs,
    });
    const configured = configuration({ deadlines });
    owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    await owner.start();
    const socket = new SyntheticSocket({ closeOnDestroy: false });
    const nativeDestroy = SyntheticSocket.prototype.destroy;
    const nativeOnce = socket.once;
    const terminalize = () => {
      if (reentered) return;
      reentered = true;
      closing = owner.close();
      closing.then(() => {}, () => {});
    };

    if (boundary === 'capability') {
      Object.defineProperty(socket, 'destroy', {
        configurable: true,
        enumerable: false,
        get() {
          terminalize();
          return nativeDestroy;
        },
      });
    } else {
      socket.once = function onceWithTerminalReentry(name, callback) {
        if (name === boundary) terminalize();
        return Reflect.apply(nativeOnce, this, [name, callback]);
      };
    }

    configured.factoryHarness.observed.callbacks.connection(socket);
    configured.factoryHarness.observed.callbacks.secureConnection(socket);
    assert.equal(reentered, true);
    assert.notEqual(closing, null);
    await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));
    const terminal = owner.snapshotMetrics();
    const terminalBytes = JSON.stringify(terminal);
    await settle();

    assert.equal(terminal.phase, 'CLOSE_UNCERTAIN');
    assert.equal(terminal.closeClean, 0);
    assert.equal(terminal.closeUncertain, 1);
    assert.equal(terminal.trackedSockets, 0);
    assert.equal(terminal.trackedRequests, 0);
    assert.equal(terminal.trackedHandlers, 0);
    assert.equal(terminal.ownedTimers, 0);
    assert.equal(socket.listenerCount('close'), 0);
    assert.equal(socket.listenerCount('error'), 0);
    assert.equal(JSON.stringify(owner.snapshotMetrics()), terminalBytes);
    assert.strictEqual(owner.close(), closing);
  }

  for (const boundary of ['capability', 'close', 'error']) await t.test(
    boundary,
    () => runBoundary(boundary),
  );
});

test('socket lifecycle operations prevent reentrant close from overtaking exact destruction', async t => {
  await t.test('untracked destroy accessor reenters close before returning destroy', async () => {
    const started = await startedOwner({ downstream: capabilityLifecycle() });
    const socket = new SyntheticSocket();
    const nativeDestroy = SyntheticSocket.prototype.destroy;
    let closing = null;
    let duringAccessor = null;
    Object.defineProperty(socket, 'destroy', {
      configurable: true,
      enumerable: false,
      get() {
        if (closing === null) {
          closing = started.owner.close();
          duringAccessor = started.owner.snapshotMetrics();
        }
        return nativeDestroy;
      },
    });

    started.callbacks.secureConnection(socket);
    assert.notEqual(closing, null);
    assert.notEqual(duringAccessor, null);
    assert.equal(duringAccessor.closeClean, 0);
    assert.equal(duringAccessor.closeUncertain, 0);
    assert.equal(socket.destroyed, true);
    assert.deepEqual(await closing, Object.freeze({ status: 'CLOSED' }));
    const terminal = started.owner.snapshotMetrics();
    const terminalBytes = JSON.stringify(terminal);
    assert.equal(terminal.closeClean, 1);
    assert.equal(terminal.closeUncertain, 0);
    started.callbacks.close();
    await settle();
    assert.equal(JSON.stringify(started.owner.snapshotMetrics()), terminalBytes);
  });

  await t.test('tracked destroy emits close and then throws', async () => {
    const started = await startedOwner({ downstream: capabilityLifecycle() });
    const socket = new SyntheticSocket({ closeOnDestroy: false });
    socket.destroy = function destroyWithPostCloseThrow() {
      this.destroyCalls += 1;
      if (!this.destroyed) {
        this.destroyed = true;
        this.emit('close');
      }
      throw new Error('synthetic post-close destroy failure');
    };
    started.callbacks.connection(socket);
    started.callbacks.secureConnection(socket);

    const closing = started.owner.close();
    await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));
    const terminal = started.owner.snapshotMetrics();
    const terminalBytes = JSON.stringify(terminal);
    assert.equal(socket.destroyed, true);
    assert.equal(terminal.closeClean, 0);
    assert.equal(terminal.closeUncertain, 1);
    started.callbacks.close();
    socket.emit('close');
    await settle();
    assert.equal(JSON.stringify(started.owner.snapshotMetrics()), terminalBytes);
  });

  await t.test('nested socket reentry neither underflows nor publishes clean early', async () => {
    const started = await startedOwner({ downstream: capabilityLifecycle() });
    const tracked = new SyntheticSocket({ closeOnDestroy: false });
    tracked.destroy = function nestedTrackedDestroy() {
      this.destroyCalls += 1;
      if (!this.destroyed) {
        this.destroyed = true;
        this.emit('close');
      }
      throw new Error('synthetic nested destroy failure');
    };
    started.callbacks.connection(tracked);
    started.callbacks.secureConnection(tracked);

    const untracked = new SyntheticSocket();
    const nativeDestroy = SyntheticSocket.prototype.destroy;
    let closing = null;
    let duringAccessor = null;
    Object.defineProperty(untracked, 'destroy', {
      configurable: true,
      enumerable: false,
      get() {
        if (closing === null) {
          closing = started.owner.close();
          duringAccessor = started.owner.snapshotMetrics();
        }
        return nativeDestroy;
      },
    });

    started.callbacks.secureConnection(untracked);
    assert.notEqual(closing, null);
    assert.notEqual(duringAccessor, null);
    assert.equal(duringAccessor.closeClean, 0);
    assert.equal(tracked.destroyed, true);
    assert.equal(untracked.destroyed, true);
    await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));
    const terminal = started.owner.snapshotMetrics();
    const terminalBytes = JSON.stringify(terminal);
    assert.equal(terminal.closeClean, 0);
    assert.equal(terminal.closeUncertain, 1);
    assert.equal(terminal.trackedSockets, 0);
    started.callbacks.close();
    tracked.emit('close');
    untracked.emit('close');
    await settle();
    assert.equal(JSON.stringify(started.owner.snapshotMetrics()), terminalBytes);
  });
});

test('synchronous secure close during listener registration leaves no reservation', async () => {
  let calls = 0;
  const started = await startedOwner({
    downstream: lifecycle({ handle() { calls += 1; return Promise.resolve(); } }),
  });
  const socket = new SyntheticSocket();
  const nativeOnce = socket.once;
  let emitted = false;
  socket.once = function onceWithSynchronousClose(name, callback) {
    const result = Reflect.apply(nativeOnce, this, [name, callback]);
    if (name === 'close' && !emitted) {
      emitted = true;
      this.emit('close');
    }
    return result;
  };
  started.callbacks.connection(socket);
  started.callbacks.secureConnection(socket);
  const metrics = started.owner.snapshotMetrics();
  assert.equal(calls, 0);
  assert.equal(metrics.connectionStarts, 1);
  assert.equal(metrics.connectionsAccepted, 1);
  assert.equal(metrics.tlsRejected, 1);
  assert.equal(metrics.trackedSockets, 0);
  assert.equal(socket.listenerCount('close'), 0);
  assert.equal(socket.listenerCount('error'), 0);
  assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
});

test('listener registration failure rolls back tracked state and bounds terminal ambiguity', async () => {
  const limits = Object.freeze({
    ...LIMITS,
    maxConcurrentSockets: 1,
    maxConcurrentRequests: 1,
  });
  const started = await startedOwner({ limits });
  const socket = new SyntheticSocket({ closeOnDestroy: false });
  let duringRegistration = null;
  socket.once = function failingListenerRegistration(name) {
    if (name === 'close') duringRegistration = started.owner.snapshotMetrics();
    throw new Error('synthetic listener registration failure');
  };

  started.callbacks.connection(socket);
  started.callbacks.secureConnection(socket);

  assert.notEqual(duringRegistration, null);
  assert.equal(duringRegistration.connectionStarts, 1);
  assert.equal(duringRegistration.trackedSockets, 1);
  const metrics = started.owner.snapshotMetrics();
  assert.equal(metrics.connectionStarts, 1);
  assert.equal(metrics.connectionsAccepted, 1);
  assert.equal(metrics.trackedSockets, 0);
  assert.equal(socket.destroyed, true);
  await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  assert.equal(started.owner.snapshotMetrics().trackedSockets, 0);
  assert.equal(socket.listenerCount('close'), 0);
  assert.equal(socket.listenerCount('error'), 0);
});

test('secure reservation publication bounds listener-registration reentry', async () => {
  const limits = Object.freeze({
    ...LIMITS,
    maxConcurrentSockets: 1,
    maxConnectionStarts: 3,
    maxConcurrentRequests: 1,
    maxRequestStarts: 1,
  });
  const started = await startedOwner({ limits });
  const outerRaw = new SyntheticSocket({ closeOnDestroy: false });
  const innerRaw = new SyntheticSocket({ closeOnDestroy: false });
  const outerSecure = new SyntheticSocket();
  const innerSecure = new SyntheticSocket();
  started.callbacks.connection(outerRaw);
  started.callbacks.connection(innerRaw);
  const nativeOnce = outerSecure.once;
  let duringRegistration = null;
  let reentered = false;
  outerSecure.once = function onceWithReentrantSecure(name, callback) {
    const result = Reflect.apply(nativeOnce, this, [name, callback]);
    if (name === 'close' && !reentered) {
      reentered = true;
      started.callbacks.secureConnection(innerSecure);
      duringRegistration = started.owner.snapshotMetrics();
    }
    return result;
  };

  started.callbacks.secureConnection(outerSecure);
  assert.equal(reentered, true);
  assert.notEqual(duringRegistration, null);
  assert.equal(duringRegistration.connectionStarts, 2);
  assert.equal(duringRegistration.trackedSockets, 1);
  assert.equal(innerSecure.destroyed, true);
  assert.equal(outerSecure.destroyed, false);
  assert.equal(started.owner.snapshotMetrics().trackedSockets, 1);

  outerSecure.destroy();
  outerRaw.destroy();
  innerRaw.destroy();
  assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
});

test('secure reservation is visible during socket capability reentry', async () => {
  const limits = Object.freeze({
    ...LIMITS,
    maxConcurrentSockets: 1,
    maxConnectionStarts: 3,
    maxConcurrentRequests: 1,
    maxRequestStarts: 1,
  });
  const started = await startedOwner({ limits });
  const outerRaw = new SyntheticSocket({ closeOnDestroy: false });
  const innerRaw = new SyntheticSocket({ closeOnDestroy: false });
  const reentrantSocket = new SyntheticSocket();
  const outerSocket = new SyntheticSocket();
  const nativeDestroy = SyntheticSocket.prototype.destroy;
  let duringCapture = null;
  let reentered = false;
  Object.defineProperty(outerSocket, 'destroy', {
    configurable: true,
    enumerable: false,
    get() {
      if (!reentered) {
        reentered = true;
        started.callbacks.secureConnection(reentrantSocket);
        duringCapture = started.owner.snapshotMetrics();
      }
      return nativeDestroy;
    },
  });

  try {
    started.callbacks.connection(outerRaw);
    started.callbacks.connection(innerRaw);
    started.callbacks.secureConnection(outerSocket);
    assert.equal(reentered, true);
    assert.notEqual(duringCapture, null);
    assert.equal(duringCapture.connectionStarts, 2);
    assert.equal(duringCapture.trackedSockets, 1);
    assert.equal(outerSocket.destroyed, false);
    assert.equal(reentrantSocket.destroyed, true);
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.connectionStarts, 2);
    assert.equal(metrics.connectionsAccepted, 2);
    assert.equal(metrics.trackedSockets, 1);
  } finally {
    outerSocket.destroy();
    reentrantSocket.destroy();
    outerRaw.destroy();
    innerRaw.destroy();
    await started.owner.close().catch(() => {});
  }
});

test('pre-eligibility request reentry seals only its exact secure reservation', async t => {
  await t.test('request during secure capability capture cannot gain later authority', async () => {
    let calls = 0;
    const deadlines = controlledDeadlineRuntime();
    const started = await startedOwner({
      deadlines,
      downstream: capabilityLifecycle({
        handle(_request, response, _context, completion) {
          calls += 1;
          response.end();
          completion.success();
        },
      }),
    });
    const raw = new SyntheticSocket({ closeOnDestroy: false });
    const secure = new SyntheticSocket();
    const firstRequest = new SyntheticRequest(secure);
    const firstResponse = new SyntheticResponse(secure);
    const nativeDestroy = SyntheticSocket.prototype.destroy;
    let reentered = false;
    Object.defineProperty(secure, 'destroy', {
      configurable: true,
      enumerable: false,
      get() {
        if (!reentered) {
          reentered = true;
          started.callbacks.request(firstRequest, firstResponse);
        }
        return nativeDestroy;
      },
    });

    started.callbacks.connection(raw);
    started.callbacks.secureConnection(secure);
    const later = dispatch(started.callbacks, secure);
    assert.equal(reentered, true);
    assert.equal(calls, 0);
    assert.equal(firstRequest.bodyTouches, 0);
    assert.equal(later.request.bodyTouches, 0);
    assert.equal(secure.destroyed, true);
    raw.destroy();

    const closing = started.owner.close();
    if (deadlines.durations().includes(LIMITS.closeGraceMs)) {
      deadlines.fire(LIMITS.closeGraceMs);
    }
    await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));
    const terminal = started.owner.snapshotMetrics();
    const terminalBytes = JSON.stringify(terminal);
    assert.equal(terminal.closeClean, 0);
    assert.equal(terminal.closeUncertain, 1);
    started.callbacks.request(firstRequest, firstResponse);
    await settle();
    assert.equal(JSON.stringify(started.owner.snapshotMetrics()), terminalBytes);
  });

  await t.test('request during secure listener registration cannot gain later authority',
    async () => {
      let calls = 0;
      const started = await startedOwner({
        downstream: capabilityLifecycle({
          handle(_request, response, _context, completion) {
            calls += 1;
            response.end();
            completion.success();
          },
        }),
      });
      const raw = new SyntheticSocket({ closeOnDestroy: false });
      const secure = new SyntheticSocket();
      const firstRequest = new SyntheticRequest(secure);
      const firstResponse = new SyntheticResponse(secure);
      const nativeOnce = secure.once;
      let reentered = false;
      secure.once = function onceWithRequestReentry(name, callback) {
        const result = Reflect.apply(nativeOnce, this, [name, callback]);
        if (name === 'close' && !reentered) {
          reentered = true;
          started.callbacks.request(firstRequest, firstResponse);
        }
        return result;
      };

      started.callbacks.connection(raw);
      started.callbacks.secureConnection(secure);
      const later = dispatch(started.callbacks, secure);
      assert.equal(reentered, true);
      assert.equal(calls, 0);
      assert.equal(firstRequest.bodyTouches, 0);
      assert.equal(later.request.bodyTouches, 0);
      assert.equal(secure.destroyed, true);
      raw.destroy();
      assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
    });

  await t.test('sealing one setup reservation preserves an unrelated active secure socket',
    async () => {
      let calls = 0;
      const limits = Object.freeze({
        ...LIMITS,
        maxConcurrentSockets: 2,
        maxConcurrentRequests: 2,
      });
      const started = await startedOwner({
        limits,
        downstream: capabilityLifecycle({
          handle(_request, response, _context, completion) {
            calls += 1;
            response.end();
            completion.success();
          },
        }),
      });
      const activeRaw = new SyntheticSocket({ closeOnDestroy: false });
      const activeSecure = new SyntheticSocket();
      started.callbacks.connection(activeRaw);
      started.callbacks.secureConnection(activeSecure);

      const hostileRaw = new SyntheticSocket({ closeOnDestroy: false });
      const hostileSecure = new SyntheticSocket();
      const hostileRequest = new SyntheticRequest(hostileSecure);
      const hostileResponse = new SyntheticResponse(hostileSecure);
      const nativeOnce = hostileSecure.once;
      let reentered = false;
      hostileSecure.once = function onceWithIsolatedRequestReentry(name, callback) {
        const result = Reflect.apply(nativeOnce, this, [name, callback]);
        if (name === 'close' && !reentered) {
          reentered = true;
          started.callbacks.request(hostileRequest, hostileResponse);
        }
        return result;
      };
      started.callbacks.connection(hostileRaw);
      started.callbacks.secureConnection(hostileSecure);

      const activeExchange = dispatch(started.callbacks, activeSecure);
      const hostileLater = dispatch(started.callbacks, hostileSecure);
      await settle();
      assert.equal(reentered, true);
      assert.equal(calls, 1);
      assert.equal(activeExchange.request.bodyTouches, 0);
      assert.equal(hostileRequest.bodyTouches, 0);
      assert.equal(hostileLater.request.bodyTouches, 0);
      assert.equal(activeSecure.destroyed, false);
      assert.equal(hostileSecure.destroyed, true);

      activeSecure.destroy();
      activeRaw.destroy();
      hostileRaw.destroy();
      assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
    });
});

test('global concurrent and lifetime socket/request budgets reject without a queue or body read', async t => {
  await t.test('concurrent sockets', async () => {
    const limits = Object.freeze({ ...LIMITS, maxConcurrentSockets: 1, maxConcurrentRequests: 1 });
    const started = await startedOwner({ limits });
    const first = connect(started.callbacks);
    const second = connect(started.callbacks);
    assert.equal(first.destroyed, false);
    assert.equal(second.destroyed, true);
    first.destroy();
    await started.owner.close();
  });

  await t.test('concurrent requests', async () => {
    let handlerCompletion;
    let calls = 0;
    const limits = Object.freeze({ ...LIMITS, maxConcurrentRequests: 1 });
    const started = await startedOwner({
      limits,
      downstream: capabilityLifecycle({
        handle(_request, _response, _context, completion) {
          calls += 1;
          handlerCompletion = completion;
        },
      }),
    });
    const firstSocket = connect(started.callbacks);
    dispatch(started.callbacks, firstSocket, {}, { finishOnEnd: false });
    const secondSocket = connect(started.callbacks);
    const rejected = dispatch(started.callbacks, secondSocket);
    assert.equal(calls, 1);
    assert.equal(rejected.request.bodyTouches, 0);
    assert.equal(rejected.response.statusCode, 503);
    handlerCompletion.success();
    firstSocket.destroy();
    secondSocket.destroy();
    await settle();
    await started.owner.close();
  });

  await t.test('request lifetime seals acceptance', async () => {
    const limits = Object.freeze({
      ...LIMITS,
      maxConcurrentSockets: 1,
      maxConnectionStarts: 2,
      maxConcurrentRequests: 1,
      maxRequestStarts: 1,
    });
    let calls = 0;
    const started = await startedOwner({
      limits,
      downstream: lifecycle({
        handle(_request, response) {
          calls += 1;
          response.end();
          return Promise.resolve();
        },
      }),
    });
    const first = connect(started.callbacks);
    dispatch(started.callbacks, first);
    first.destroy();
    await settle();
    const second = connect(started.callbacks);
    const rejected = dispatch(started.callbacks, second);
    assert.equal(rejected.request.bodyTouches, 0);
    assert.equal(calls, 1);
    second.destroy();
    const third = connect(started.callbacks);
    assert.equal(third.destroyed, true);
    const metrics = started.owner.snapshotMetrics();
    assert.equal(metrics.connectionStarts, 1);
    assert.equal(metrics.requestStarts, 1);
    await started.owner.close();
  });

  await t.test('connection lifetime accepts no replacement generation', async () => {
    const limits = Object.freeze({
      ...LIMITS,
      maxConcurrentSockets: 1,
      maxConnectionStarts: 2,
      maxConcurrentRequests: 1,
      maxRequestStarts: 2,
    });
    const started = await startedOwner({ limits });
    const first = connect(started.callbacks);
    first.destroy();
    const second = connect(started.callbacks);
    second.destroy();
    const third = connect(started.callbacks);
    assert.equal(third.destroyed, true);
    assert.equal(started.owner.snapshotMetrics().connectionStarts, 2);
    assert.equal(started.factoryHarness.observed.calls, 1);
    await started.owner.close();
  });
});

test('request admission reserves concurrency before response methods', async t => {
  async function runReentrantAdmission(trigger) {
    let handlerCompletion;
    let calls = 0;
    const limits = Object.freeze({ ...LIMITS, maxConcurrentRequests: 1 });
    const started = await startedOwner({
      limits,
      downstream: capabilityLifecycle({
        handle(_request, _response, _context, completion) {
          calls += 1;
          handlerCompletion = completion;
        },
      }),
    });
    const outerSocket = connect(started.callbacks);
    const innerSocket = connect(started.callbacks);
    const outerRequest = new SyntheticRequest(outerSocket);
    const outerResponse = new SyntheticResponse(outerSocket);
    const innerRequest = new SyntheticRequest(innerSocket);
    const innerResponse = new SyntheticResponse(innerSocket, { finishOnEnd: false });
    let reentered = false;
    const reenter = () => {
      if (reentered) return;
      reentered = true;
      started.callbacks.request(innerRequest, innerResponse);
    };

    trigger({ outerRequest, outerResponse, reenter });
    started.callbacks.request(outerRequest, outerResponse);

    assert.equal(reentered, true);
    assert.equal(calls, 1);
    assert.equal(innerRequest.bodyTouches, 0);
    assert.equal(innerResponse.statusCode, 503);
    assert.equal(outerRequest.bodyTouches, 0);
    assert.equal(started.owner.snapshotMetrics().requestsAdmitted, 1);
    assert.equal(started.owner.snapshotMetrics().trackedRequests, 1);
    assert.equal(started.owner.snapshotMetrics().trackedHandlers, 1);

    handlerCompletion.success();
    outerResponse.emit('finish');
    await settle();
    outerSocket.destroy();
    innerSocket.destroy();
    assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
  }

  await t.test('response method reentry', async () => {
    await runReentrantAdmission(({ outerResponse, reenter }) => {
      const nativeSetHeader = outerResponse.setHeader;
      outerResponse.setHeader = function setHeaderWithReentry(name, value) {
        reenter();
        return Reflect.apply(nativeSetHeader, this, [name, value]);
      };
    });
  });
});

test('request reservation bounds tracked work during setHeader reentry', async () => {
  let calls = 0;
  const limits = Object.freeze({ ...LIMITS, maxConcurrentRequests: 1 });
  const started = await startedOwner({
    limits,
    downstream: lifecycle({
      handle(_request, response) {
        calls += 1;
        response.statusCode = 204;
        response.end();
        return Promise.resolve();
      },
    }),
  });
  const outerSocket = connect(started.callbacks);
  const innerSocket = connect(started.callbacks);
  const outerRequest = new SyntheticRequest(outerSocket);
  const outerResponse = new SyntheticResponse(outerSocket);
  const innerRequest = new SyntheticRequest(innerSocket);
  const innerResponse = new SyntheticResponse(innerSocket);
  const nativeSetHeader = outerResponse.setHeader;
  let duringReentry = null;
  let reentered = false;
  outerResponse.setHeader = function setHeaderWithBoundedRequestReentry(name, value) {
    if (!reentered) {
      reentered = true;
      started.callbacks.request(innerRequest, innerResponse);
      duringReentry = started.owner.snapshotMetrics();
    }
    return Reflect.apply(nativeSetHeader, this, [name, value]);
  };

  try {
    started.callbacks.request(outerRequest, outerResponse);
    assert.equal(reentered, true);
    assert.notEqual(duringReentry, null);
    assert.equal(duringReentry.trackedRequests, 1);
    assert.equal(duringReentry.trackedHandlers, 1);
    assert.equal(duringReentry.ownedTimers, 1);
    assert.equal(innerRequest.bodyTouches, 0);
    assert.equal(innerResponse.statusCode, 503);
    assert.equal(outerResponse.statusCode, 204);
    assert.equal(calls, 1);
  } finally {
    await settle();
    outerSocket.destroy();
    innerSocket.destroy();
    await started.owner.close().catch(() => {});
  }
});

test('request reservation is visible during native response-listener registration', async () => {
  let calls = 0;
  const limits = Object.freeze({ ...LIMITS, maxConcurrentRequests: 1 });
  const started = await startedOwner({
    limits,
    downstream: lifecycle({
      handle(_request, response) {
        calls += 1;
        response.statusCode = 204;
        response.end();
        return Promise.resolve();
      },
    }),
  });
  const outerSocket = connect(started.callbacks);
  const innerSocket = connect(started.callbacks);
  const outerRequest = new SyntheticRequest(outerSocket);
  const outerResponse = new SyntheticResponse(outerSocket);
  const innerRequest = new SyntheticRequest(innerSocket);
  const innerResponse = new SyntheticResponse(innerSocket);
  outerResponse.on('finish', () => {});
  outerResponse.on('finish', () => {});
  const finishListeners = outerResponse._events.finish;
  const nativePush = Array.prototype.push;
  let duringRegistration = null;
  let reentered = false;
  Object.defineProperty(finishListeners, 'push', {
    configurable: true,
    enumerable: false,
    writable: true,
    value(callback) {
      if (!reentered) {
        reentered = true;
        started.callbacks.request(innerRequest, innerResponse);
        duringRegistration = started.owner.snapshotMetrics();
      }
      return Reflect.apply(nativePush, this, [callback]);
    },
  });

  try {
    started.callbacks.request(outerRequest, outerResponse);
    assert.equal(reentered, true);
    assert.notEqual(duringRegistration, null);
    assert.equal(duringRegistration.trackedRequests, 1);
    assert.equal(duringRegistration.trackedHandlers, 1);
    assert.equal(duringRegistration.ownedTimers, 1);
    assert.equal(innerRequest.bodyTouches, 0);
    assert.equal(innerResponse.statusCode, 503);
    assert.equal(outerResponse.statusCode, 204);
    assert.equal(calls, 1);
  } finally {
    await settle();
    outerSocket.destroy();
    innerSocket.destroy();
    await started.owner.close().catch(() => {});
  }
});

test('request reservation is visible during deadline scheduling reentry', async () => {
  let calls = 0;
  let owner;
  let callbacks;
  let innerRequest;
  let innerResponse;
  let duringScheduling = null;
  let reentered = false;
  const limits = Object.freeze({ ...LIMITS, maxConcurrentRequests: 1 });
  const deadlines = controlledDeadlineRuntime({
    onSchedule({ milliseconds }) {
      if (milliseconds !== limits.requestResponseDeadlineMs || reentered) return;
      reentered = true;
      callbacks.request(innerRequest, innerResponse);
      duringScheduling = owner.snapshotMetrics();
    },
  });
  const started = await startedOwner({
    limits,
    deadlines,
    downstream: lifecycle({
      handle(_request, response) {
        calls += 1;
        response.statusCode = 204;
        response.end();
        return Promise.resolve();
      },
    }),
  });
  owner = started.owner;
  callbacks = started.callbacks;
  const outerSocket = connect(callbacks);
  const innerSocket = connect(callbacks);
  const outerRequest = new SyntheticRequest(outerSocket);
  const outerResponse = new SyntheticResponse(outerSocket);
  innerRequest = new SyntheticRequest(innerSocket);
  innerResponse = new SyntheticResponse(innerSocket);

  try {
    callbacks.request(outerRequest, outerResponse);
    assert.equal(reentered, true);
    assert.notEqual(duringScheduling, null);
    assert.equal(duringScheduling.trackedRequests, 1);
    assert.equal(duringScheduling.trackedHandlers, 1);
    assert.equal(duringScheduling.ownedTimers, 1);
    assert.equal(innerRequest.bodyTouches, 0);
    assert.equal(innerResponse.statusCode, 503);
    assert.equal(outerResponse.statusCode, 204);
    assert.equal(calls, 1);
  } finally {
    await settle();
    outerSocket.destroy();
    innerSocket.destroy();
    await owner.close().catch(() => {});
  }
});

test('missing handler completion remains bounded by close grace', async () => {
  let retainedCompletion;
  const deadlines = controlledDeadlineRuntime();
  const started = await startedOwner({
    deadlines,
    downstream: capabilityLifecycle({
      handle(_request, _response, _context, completion) {
        retainedCompletion = completion;
      },
    }),
  });
  const socket = connect(started.callbacks, { closeOnDestroy: false });
  const exchange = dispatch(started.callbacks, socket, {}, { finishOnEnd: false });
  const beforeClose = started.owner.snapshotMetrics();
  assert.equal(beforeClose.trackedSockets, 1);
  assert.equal(beforeClose.trackedRequests, 1);
  assert.equal(beforeClose.trackedHandlers, 1);
  assert.equal(beforeClose.handlersSettled, 0);

  const closing = started.owner.close();
  assert.strictEqual(started.owner.close(), closing);
  deadlines.fire(LIMITS.closeGraceMs);
  await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));

  const terminal = started.owner.snapshotMetrics();
  assert.equal(terminal.phase, 'CLOSE_UNCERTAIN');
  assert.equal(terminal.trackedSockets, 0);
  assert.equal(terminal.trackedRequests, 0);
  assert.equal(terminal.trackedHandlers, 0);
  assert.equal(terminal.ownedTimers, 0);
  assert.equal(terminal.handlersSettled, 1);
  assert.equal(terminal.closeClean, 0);
  assert.equal(terminal.closeUncertain, 1);
  assert.equal(socket.listenerCount('close'), 0);
  assert.equal(socket.listenerCount('error'), 0);
  assert.equal(exchange.response.listenerCount('finish'), 0);
  assert.equal(exchange.response.listenerCount('close'), 0);
  assert.equal(exchange.response.listenerCount('error'), 0);
  retainedCompletion.success();
  retainedCompletion.failure();
  assert.deepEqual(started.owner.snapshotMetrics(), terminal);
});

test('close-grace terminal drains pending completion work and ignores late calls', async () => {
  const deadlines = controlledDeadlineRuntime();
  let retainedCompletion;
  const started = await startedOwner({
    deadlines,
    downstream: capabilityLifecycle({
      handle(_request, _response, _context, completion) {
        retainedCompletion = completion;
      },
    }),
  });
  const socket = connect(started.callbacks, { closeOnDestroy: false });
  const exchange = dispatch(started.callbacks, socket, {}, { finishOnEnd: false });
  const closing = started.owner.close();
  assert.strictEqual(started.owner.close(), closing);
  const duringClose = started.owner.snapshotMetrics();
  assert.equal(duringClose.trackedSockets, 1);
  assert.equal(duringClose.trackedRequests, 1);
  assert.equal(duringClose.trackedHandlers, 0);
  assert.equal(duringClose.ownedTimers, 1);

  deadlines.fire(LIMITS.closeGraceMs);
  let terminalError;
  await assert.rejects(closing, error => {
    terminalError = error;
    return exactError(error, CLOSE_UNCERTAIN);
  });
  const terminal = started.owner.snapshotMetrics();
  assert.equal(terminal.phase, 'CLOSE_UNCERTAIN');
  assert.equal(terminal.trackedSockets, 0);
  assert.equal(terminal.trackedRequests, 0);
  assert.equal(terminal.trackedHandlers, 0);
  assert.equal(terminal.ownedTimers, 0);
  assert.equal(terminal.handlersSettled, 1);
  assert.equal(socket.listenerCount('close'), 0);
  assert.equal(socket.listenerCount('error'), 0);
  assert.equal(exchange.response.listenerCount('finish'), 0);
  assert.equal(exchange.response.listenerCount('close'), 0);
  assert.equal(exchange.response.listenerCount('error'), 0);
  const responseState = Object.freeze({
    statusCode: exchange.response.statusCode,
    headersSent: exchange.response.headersSent,
    writableEnded: exchange.response.writableEnded,
    finished: exchange.response.finished,
    destroyed: exchange.response.destroyed,
  });

  retainedCompletion.success();
  retainedCompletion.failure();
  await settle();
  assert.deepEqual(started.owner.snapshotMetrics(), terminal);
  assert.deepEqual({
    statusCode: exchange.response.statusCode,
    headersSent: exchange.response.headersSent,
    writableEnded: exchange.response.writableEnded,
    finished: exchange.response.finished,
    destroyed: exchange.response.destroyed,
  }, responseState);
  assert.strictEqual(started.owner.close(), closing);
  await assert.rejects(closing, error => error === terminalError);
});

test('clean terminal detachment makes retained callbacks and abort exactly inert', async () => {
  let scheduleCalls = 0;
  let cancelCalls = 0;
  const deadlines = controlledDeadlineRuntime({
    onSchedule() { scheduleCalls += 1; },
    onCancel() { cancelCalls += 1; },
  });
  let downstreamCalls = 0;
  let retainedCompletion;
  let retainedAbort;
  const started = await startedOwner({
    deadlines,
    downstream: capabilityLifecycle({
      handle(_request, _response, transportContext, completion) {
        downstreamCalls += 1;
        retainedAbort = transportContext.abort;
        retainedCompletion = completion;
      },
    }),
  });
  const socket = connect(started.callbacks);
  const exchange = dispatch(started.callbacks, socket, {}, { finishOnEnd: false });
  const retainedResponseCallbacks = ['finish', 'close', 'error']
    .flatMap(name => exchange.response.rawListeners(name));
  exchange.response.emit('finish');
  retainedCompletion.success();
  await settle();
  socket.destroy();
  assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));

  const terminal = started.owner.snapshotMetrics();
  const terminalBytes = JSON.stringify(terminal);
  const terminalEffects = Object.freeze({
    downstreamCalls,
    scheduleCalls,
    cancelCalls,
    socketDestroyCalls: socket.destroyCalls,
  });
  const hostile = hostileLateArguments();
  for (const callback of deadlines.retained()) callback();
  for (const callback of retainedResponseCallbacks) {
    Reflect.apply(callback, undefined, [hostile.proxy, hostile.accessor]);
  }
  retainedCompletion.success();
  retainedCompletion.failure();
  for (let index = 0; index < 3; index += 1) retainedAbort();
  invokeEveryServerCallback(started.callbacks, hostile.proxy);
  invokeEveryServerCallback(started.callbacks, hostile.accessor);
  await settle();

  assert.equal(hostile.observations(), 0);
  assert.equal(JSON.stringify(started.owner.snapshotMetrics()), terminalBytes);
  assert.deepEqual(started.owner.snapshotMetrics(), terminal);
  assert.deepEqual({
    downstreamCalls,
    scheduleCalls,
    cancelCalls,
    socketDestroyCalls: socket.destroyCalls,
  }, terminalEffects);
});

test('uncertain terminal detachment makes retained callbacks and abort exactly inert', async () => {
  let scheduleCalls = 0;
  let cancelCalls = 0;
  const deadlines = controlledDeadlineRuntime({
    onSchedule() { scheduleCalls += 1; },
    onCancel() { cancelCalls += 1; },
  });
  let downstreamCalls = 0;
  let retainedCompletion;
  let retainedAbort;
  const started = await startedOwner({
    deadlines,
    downstream: capabilityLifecycle({
      handle(_request, _response, transportContext, completion) {
        downstreamCalls += 1;
        retainedAbort = transportContext.abort;
        retainedCompletion = completion;
      },
    }),
  });
  const socket = connect(started.callbacks, { closeOnDestroy: false });
  const exchange = dispatch(started.callbacks, socket, {}, { finishOnEnd: false });
  const retainedResponseCallbacks = ['finish', 'close', 'error']
    .flatMap(name => exchange.response.rawListeners(name));
  const closing = started.owner.close();
  deadlines.fire(LIMITS.closeGraceMs);
  await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));

  const terminal = started.owner.snapshotMetrics();
  const terminalBytes = JSON.stringify(terminal);
  const terminalEffects = Object.freeze({
    downstreamCalls,
    scheduleCalls,
    cancelCalls,
    socketDestroyCalls: socket.destroyCalls,
  });
  const hostile = hostileLateArguments();
  for (const callback of deadlines.retained()) callback();
  for (const callback of retainedResponseCallbacks) {
    Reflect.apply(callback, undefined, [hostile.proxy, hostile.accessor]);
  }
  retainedCompletion.success();
  retainedCompletion.failure();
  for (let index = 0; index < 3; index += 1) retainedAbort();
  invokeEveryServerCallback(started.callbacks, hostile.proxy);
  invokeEveryServerCallback(started.callbacks, hostile.accessor);
  await settle();

  assert.equal(hostile.observations(), 0);
  assert.equal(JSON.stringify(started.owner.snapshotMetrics()), terminalBytes);
  assert.deepEqual(started.owner.snapshotMetrics(), terminal);
  assert.deepEqual({
    downstreamCalls,
    scheduleCalls,
    cancelCalls,
    socketDestroyCalls: socket.destroyCalls,
  }, terminalEffects);
});

test('caller return values never authorize handler or downstream-close success', async t => {
  const foreignPromiseConstructor = runInNewContext('Promise');
  const foreignOperation = (reject, localPrototype) => {
    const operation = Reflect.construct(
      foreignPromiseConstructor,
      [(_resolve, rejectPromise) => {
        if (reject) rejectPromise(new Error('synthetic foreign rejection'));
        else _resolve(undefined);
      }],
      localPrototype ? Promise : foreignPromiseConstructor,
    );
    if (reject) {
      Reflect.apply(Promise.prototype.then, operation, [undefined, () => {}]);
    }
    assert.strictEqual(
      Object.getPrototypeOf(operation),
      localPrototype ? Promise.prototype : foreignPromiseConstructor.prototype,
    );
    assert.equal(utilTypes.isPromise(operation), true);
    return operation;
  };

  for (const localPrototype of [false, true]) for (const rejected of [false, true]) {
    await t.test(
      `foreign constructed handler Promise local=${localPrototype} rejected=${rejected}`,
      async () => {
      const operation = foreignOperation(rejected, localPrototype);
      const started = await startedOwner({
        downstream: capabilityLifecycle({
          handle(_request, response) {
            response.end();
            return operation;
          },
        }),
      });
      const socket = connect(started.callbacks);
      dispatch(started.callbacks, socket);
      await settle();
      assert.equal(started.owner.snapshotMetrics().handlerFailures, 1);
      assert.equal(socket.destroyed, true);
      await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
      },
    );

    await t.test(
      `foreign constructed close Promise local=${localPrototype} rejected=${rejected}`,
      async () => {
      const operation = foreignOperation(rejected, localPrototype);
      const started = await startedOwner({
        downstream: capabilityLifecycle({ close: () => operation }),
      });
      await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
      assert.equal(started.owner.snapshotMetrics().closeClean, 0);
      },
    );
  }

  const returnCases = [
    ['Promise', Promise.resolve(undefined)],
    ['thenable', Object.defineProperty({}, 'then', {
      get() { throw new Error('returned then must not be read'); },
    })],
    ['object', Object.freeze({})],
  ];
  for (const [name, returned] of returnCases) await t.test(
    `${name} plus handler success is still a contract violation`,
    async () => {
    const started = await startedOwner({
      downstream: capabilityLifecycle({
        handle(_request, response, _transportContext, completion) {
          response.end();
          completion.success();
          return returned;
        },
      }),
    });
    const socket = connect(started.callbacks);
    dispatch(started.callbacks, socket);
    await settle();
    assert.equal(started.owner.snapshotMetrics().handlerFailures, 1);
    assert.equal(socket.destroyed, true);
    await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
    },
  );
  for (const [name, returned] of returnCases) await t.test(
    `${name} plus close success is still a contract violation`,
    async () => {
      const started = await startedOwner({
        downstream: capabilityLifecycle({
          close(completion) {
            completion.success();
            return returned;
          },
        }),
      });
      await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
      assert.equal(started.owner.snapshotMetrics().closeClean, 0);
    },
  );

  const hostileReturnFactories = [
    ['Promise subclass species', () => {
      let observations = 0;
      class HostilePromise extends Promise {
        static get [Symbol.species]() {
          observations += 1;
          throw new Error('returned Promise species must not be read');
        }
      }
      const value = new HostilePromise(resolve => { resolve(undefined); });
      Object.defineProperties(value, {
        then: {
          configurable: true,
          get() {
            observations += 1;
            throw new Error('returned Promise then must not be read');
          },
        },
        constructor: {
          configurable: true,
          get() {
            observations += 1;
            throw new Error('returned Promise constructor must not be read');
          },
        },
      });
      return { value, observations: () => observations };
    }],
    ['accessor-shaped value', () => {
      let observations = 0;
      const fail = () => {
        observations += 1;
        throw new Error('returned accessor must not be read');
      };
      const value = Object.defineProperties({}, {
        then: { configurable: true, get: fail },
        constructor: { configurable: true, get: fail },
        [Symbol.species]: { configurable: true, get: fail },
      });
      return { value, observations: () => observations };
    }],
    ['proxy-shaped value', () => {
      let observations = 0;
      const value = new Proxy(Object.freeze({}), {
        get() {
          observations += 1;
          throw new Error('returned proxy property must not be read');
        },
        getOwnPropertyDescriptor() {
          observations += 1;
          throw new Error('returned proxy descriptor must not be read');
        },
        ownKeys() {
          observations += 1;
          throw new Error('returned proxy keys must not be read');
        },
      });
      return { value, observations: () => observations };
    }],
  ];
  for (const [name, makeReturned] of hostileReturnFactories) {
    await t.test(`${name} handler return is rejected without observation`, async () => {
      const returned = makeReturned();
      const started = await startedOwner({
        downstream: capabilityLifecycle({
          handle(_request, response, _context, completion) {
            response.end();
            completion.success();
            return returned.value;
          },
        }),
      });
      const socket = connect(started.callbacks);
      dispatch(started.callbacks, socket);
      await settle();
      assert.equal(returned.observations(), 0);
      assert.equal(started.owner.snapshotMetrics().handlerFailures, 1);
      await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
      assert.equal(returned.observations(), 0);
    });

    await t.test(`${name} close return is rejected without observation`, async () => {
      const returned = makeReturned();
      const started = await startedOwner({
        downstream: capabilityLifecycle({
          close(completion) {
            completion.success();
            return returned.value;
          },
        }),
      });
      await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
      assert.equal(returned.observations(), 0);
      assert.equal(started.owner.snapshotMetrics().closeClean, 0);
    });
  }
});

test('owner completion capabilities commit only after exact-undefined normal return', async t => {
  for (const [name, handle] of [
    ['success then throw', (_request, response, _context, completion) => {
      response.end();
      completion.success();
      throw new Error('synthetic handler throw');
    }],
    ['success then non-undefined', (_request, response, _context, completion) => {
      response.end();
      completion.success();
      return false;
    }],
  ]) await t.test(name, async () => {
    const started = await startedOwner({
      downstream: capabilityLifecycle({ handle }),
    });
    const socket = connect(started.callbacks);
    dispatch(started.callbacks, socket);
    await settle();
    assert.equal(started.owner.snapshotMetrics().handlerFailures, 1);
    assert.equal(socket.destroyed, true);
    await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  });

  for (const [name, close] of [
    ['close success then throw', completion => {
      completion.success();
      throw new Error('synthetic close throw');
    }],
    ['close success then non-undefined', completion => {
      completion.success();
      return false;
    }],
  ]) await t.test(name, async () => {
    const started = await startedOwner({
      downstream: capabilityLifecycle({ close }),
    });
    await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  });
});

test('asynchronous owner completion capabilities drive valid handler and close paths', async () => {
  let handlerCompletion;
  let closeCompletion;
  const started = await startedOwner({
    downstream: capabilityLifecycle({
      handle(_request, response, _transportContext, completion) {
        handlerCompletion = completion;
        response.end();
      },
      close(completion) { closeCompletion = completion; },
    }),
  });
  const socket = connect(started.callbacks);
  dispatch(started.callbacks, socket);
  assert.equal(started.owner.snapshotMetrics().trackedHandlers, 1);
  handlerCompletion.success();
  await settle();
  assert.equal(started.owner.snapshotMetrics().trackedHandlers, 0);
  socket.destroy();

  let closeSettled = false;
  const closing = started.owner.close();
  closing.then(() => { closeSettled = true; });
  await settle();
  assert.equal(closeSettled, false);
  closeCompletion.success();
  assert.deepEqual(await closing, Object.freeze({ status: 'CLOSED' }));
});

test('asynchronous failure capabilities drive handler and close failure paths', async () => {
  let handlerCompletion;
  let closeCompletion;
  const started = await startedOwner({
    downstream: capabilityLifecycle({
      handle(_request, response, _transportContext, completion) {
        handlerCompletion = completion;
        response.end();
      },
      close(completion) { closeCompletion = completion; },
    }),
  });
  const socket = connect(started.callbacks);
  dispatch(started.callbacks, socket);
  handlerCompletion.failure();
  await settle();
  assert.equal(started.owner.snapshotMetrics().handlerFailures, 1);
  assert.equal(socket.destroyed, true);

  const closing = started.owner.close();
  closeCompletion.failure();
  await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));
});

test('completion capabilities are frozen, one-shot, generation-bound, and inert after detachment',
  async () => {
    const retained = [];
    const started = await startedOwner({
      downstream: capabilityLifecycle({
        handle(_request, response, _transportContext, completion) {
          retained.push(completion);
          assert.deepEqual(Reflect.ownKeys(completion), ['success', 'failure']);
          assert.equal(Object.isFrozen(completion), true);
          assert.equal(Object.isFrozen(completion.success), true);
          assert.equal(Object.isFrozen(completion.failure), true);
          assert.deepEqual(
            Reflect.ownKeys(completion.success),
            ['length', 'name'],
          );
          response.end();
          completion.success();
          completion.success();
        },
        close(completion) {
          retained.push(completion);
          completion.success();
          completion.success();
        },
      }),
    });
    const socket = connect(started.callbacks);
    dispatch(started.callbacks, socket);
    await settle();
    socket.destroy();
    assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
    const terminal = started.owner.snapshotMetrics();

    for (const completion of retained) {
      completion.failure();
      completion.success();
    }
    await settle();
    assert.deepEqual(started.owner.snapshotMetrics(), terminal);
  });

test('conflicting, reentrant, and late completion calls fail closed or become inert', async t => {
  await t.test('synchronous conflicting handler completion fails closed', async () => {
    const started = await startedOwner({
      downstream: capabilityLifecycle({
        handle(_request, response, _context, completion) {
          response.end();
          completion.success();
          completion.failure();
        },
      }),
    });
    const socket = connect(started.callbacks);
    dispatch(started.callbacks, socket);
    await settle();
    assert.equal(socket.destroyed, true);
    assert.equal(started.owner.snapshotMetrics().handlerFailures, 1);
    await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  });

  await t.test('active asynchronous conflict cannot revise prior success to clean state', async () => {
    let completion;
    const started = await startedOwner({
      downstream: capabilityLifecycle({
        handle(_request, _response, _context, value) { completion = value; },
      }),
    });
    const socket = connect(started.callbacks);
    dispatch(started.callbacks, socket, {}, { finishOnEnd: false });
    completion.success();
    completion.failure();
    assert.equal(socket.destroyed, true);
    await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  });

  await t.test('request completion retained past its deadline is inert', async () => {
    let completion;
    const deadlines = controlledDeadlineRuntime();
    const started = await startedOwner({
      deadlines,
      downstream: capabilityLifecycle({
        handle(_request, _response, _context, value) { completion = value; },
      }),
    });
    const socket = connect(started.callbacks);
    dispatch(started.callbacks, socket, {}, { finishOnEnd: false });
    deadlines.fire(LIMITS.requestResponseDeadlineMs);
    const beforeLate = started.owner.snapshotMetrics();
    completion.success();
    completion.failure();
    await settle();
    assert.deepEqual(started.owner.snapshotMetrics(), beforeLate);
    await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  });

  await t.test('request completion retained past owner close is inert', async () => {
    let completion;
    const started = await startedOwner({
      downstream: capabilityLifecycle({
        handle(_request, _response, _context, value) { completion = value; },
      }),
    });
    const socket = connect(started.callbacks);
    dispatch(started.callbacks, socket, {}, { finishOnEnd: false });
    const closing = started.owner.close();
    completion.success();
    completion.failure();
    assert.deepEqual(await closing, Object.freeze({ status: 'CLOSED' }));
  });

  await t.test('active downstream-close conflict cannot claim clean close', async () => {
    let closeCompletion;
    const factoryHarness = serverFactoryHarness({ close: () => {} });
    const started = await startedOwner({
      factoryHarness,
      downstream: capabilityLifecycle({
        close(completion) { closeCompletion = completion; },
      }),
    });
    const closing = started.owner.close();
    closeCompletion.success();
    closeCompletion.failure();
    started.callbacks.close();
    await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));
  });
});

test('reentrant concurrent handlers remain tracked until both completions and responses settle', async () => {
  const completions = [];
  const responses = [];
  let callbacks;
  let reentered = false;
  const downstream = capabilityLifecycle({
    handle(_request, response, _context, completion) {
      responses.push(response);
      completions.push(completion);
      if (!reentered) {
        reentered = true;
        const socket = connect(callbacks);
        dispatch(callbacks, socket, {}, { finishOnEnd: false });
      }
    },
  });
  const started = await startedOwner({ downstream });
  callbacks = started.callbacks;
  const firstSocket = connect(callbacks);
  dispatch(callbacks, firstSocket, {}, { finishOnEnd: false });
  assert.equal(started.owner.snapshotMetrics().trackedHandlers, 2);
  completions[0].success();
  completions[1].success();
  await settle();
  assert.equal(started.owner.snapshotMetrics().trackedHandlers, 0);
  assert.equal(started.owner.snapshotMetrics().trackedRequests, 2);
  responses[0].emit('finish');
  responses[1].emit('finish');
  await settle();
  assert.equal(started.owner.snapshotMetrics().trackedRequests, 0);
  for (const socket of [...new Set(responses.map(response => response.socket))]) socket.destroy();
  await started.owner.close();
});

test('server shutdown calls cannot publish clean close before exact return validation', async t => {
  for (const [operation, outcome] of [
    ['close', 'throw'],
    ['close', 'return'],
    ['closeAllConnections', 'throw'],
    ['closeAllConnections', 'return'],
  ]) await t.test(`${operation} listener close then ${outcome}`, async () => {
    const invoke = callbacks => {
      callbacks.close();
      if (outcome === 'throw') throw new Error('synthetic shutdown failure');
      return false;
    };
    const factoryHarness = serverFactoryHarness({
      close: operation === 'close' ? invoke : () => {},
      closeAllConnections: operation === 'closeAllConnections' ? invoke : () => {},
    });
    const started = await startedOwner({
      downstream: capabilityLifecycle(),
      factoryHarness,
    });

    const closing = started.owner.close();
    await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));
    const terminal = started.owner.snapshotMetrics();
    const terminalBytes = JSON.stringify(terminal);
    assert.equal(terminal.phase, 'CLOSE_UNCERTAIN');
    assert.equal(terminal.closeClean, 0);
    assert.equal(terminal.closeUncertain, 1);

    started.callbacks.close();
    started.callbacks.error(new Error('synthetic late listener failure'));
    await settle();
    assert.strictEqual(started.owner.close(), closing);
    assert.equal(JSON.stringify(started.owner.snapshotMetrics()), terminalBytes);
  });

  for (const outcome of ['throw', 'return']) await t.test(
    `budget exhaustion close listener reentry then ${outcome}`,
    async () => {
      const limits = Object.freeze({
        ...LIMITS,
        maxConcurrentSockets: 1,
        maxConnectionStarts: 1,
        maxConcurrentRequests: 1,
        maxRequestStarts: 1,
      });
      const factoryHarness = serverFactoryHarness({
        close(callbacks) {
          callbacks.close();
          if (outcome === 'throw') throw new Error('synthetic exhausted close failure');
          return false;
        },
      });
      const started = await startedOwner({
        limits,
        downstream: capabilityLifecycle(),
        factoryHarness,
      });
      started.callbacks.connection(new SyntheticSocket({ closeOnDestroy: false }));
      assert.equal(factoryHarness.observed.closes, 1);

      const closing = started.owner.close();
      await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));
      const terminal = started.owner.snapshotMetrics();
      const terminalBytes = JSON.stringify(terminal);
      assert.equal(terminal.closeClean, 0);
      assert.equal(terminal.closeUncertain, 1);
      started.callbacks.close();
      await settle();
      assert.equal(JSON.stringify(started.owner.snapshotMetrics()), terminalBytes);
    },
  );
});

test('close gates admission first, closes downstream before listener, aborts owned work and is idempotent', async () => {
  const order = [];
  let callbacks;
  let downstreamCloseCompletion;
  let handlerCompletion;
  const downstream = capabilityLifecycle({
    handle(_request, _response, _context, completion) {
      handlerCompletion = completion;
    },
    close(completion) {
      downstreamCloseCompletion = completion;
      order.push('downstream');
      const probeSocket = connect(callbacks);
      const probe = dispatch(callbacks, probeSocket);
      assert.equal(probe.response.statusCode, 503);
      assert.equal(probe.request.bodyTouches, 0);
      probeSocket.destroy();
    },
  });
  const factoryHarness = serverFactoryHarness({
    close(eventCallbacks) {
      order.push('listener');
      eventCallbacks.close();
    },
  });
  const started = await startedOwner({ downstream, factoryHarness });
  callbacks = started.callbacks;
  const socket = connect(callbacks);
  dispatch(callbacks, socket, {}, { finishOnEnd: false });
  const first = started.owner.close();
  assert.strictEqual(started.owner.close(), first);
  assert.deepEqual(order, ['downstream', 'listener']);
  assert.equal(socket.destroyed, true);
  handlerCompletion.success();
  downstreamCloseCompletion.success();
  assert.deepEqual(await first, Object.freeze({ status: 'CLOSED' }));
  const metrics = started.owner.snapshotMetrics();
  assert.equal(metrics.closeStarted, 1);
  assert.equal(metrics.closeClean + metrics.closeUncertain, 1);
  assert.equal(metrics.handlersSettled, 1);
  assert.equal(metrics.handlerFailures, 1);
  assert.equal(metrics.trackedHandlers, 0);
});

test('clean close proves downstream, listener, handlers, requests, sockets and timers are quiescent', async () => {
  const started = await startedOwner();
  const socket = connect(started.callbacks);
  const exchange = dispatch(started.callbacks, socket);
  await settle();
  socket.destroy();
  const result = await started.owner.close();
  assert.deepEqual(result, Object.freeze({ status: 'CLOSED' }));
  const metrics = started.owner.snapshotMetrics();
  assert.equal(metrics.phase, 'CLOSED');
  assert.equal(metrics.trackedSockets, 0);
  assert.equal(metrics.trackedRequests, 0);
  assert.equal(metrics.trackedHandlers, 0);
  assert.equal(metrics.ownedTimers, 0);
  assert.equal(metrics.closeClean, 1);
  assert.equal(metrics.closeUncertain, 0);
  assert.equal(started.deadlines.pending(), 0);
  assert.equal(socket.listenerCount('close'), 0);
  assert.equal(socket.listenerCount('error'), 0);
  assert.equal(exchange.response.listenerCount('finish'), 0);
  assert.equal(exchange.response.listenerCount('close'), 0);
  assert.equal(exchange.response.listenerCount('error'), 0);
});

test('a listener error after successful start gates admission and permanently forbids clean close', async () => {
  let calls = 0;
  const started = await startedOwner({
    downstream: lifecycle({ handle() { calls += 1; return Promise.resolve(); } }),
  });
  started.callbacks.error(new Error('synthetic listener failure'));
  const socket = new SyntheticSocket();
  started.callbacks.connection(socket);
  const exchange = dispatch(started.callbacks, socket);
  assert.equal(calls, 0);
  assert.equal(exchange.request.bodyTouches, 0);
  await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
  assert.equal(started.owner.snapshotMetrics().listenerErrors, 1);
});

test('close-ticket cancellation revalidates reentrant terminal and permanent state', async t => {
  await t.test('reentrant listener close commits clean close once', async () => {
    let reentered = false;
    const factoryHarness = serverFactoryHarness();
    const deadlines = controlledDeadlineRuntime({
      onCancel({ milliseconds }) {
        if (milliseconds !== LIMITS.closeGraceMs || reentered) return;
        reentered = true;
        factoryHarness.observed.callbacks.close();
      },
    });
    const started = await startedOwner({ deadlines, factoryHarness });
    assert.deepEqual(await started.owner.close(), Object.freeze({ status: 'CLOSED' }));
    const metrics = started.owner.snapshotMetrics();
    assert.equal(reentered, true);
    assert.equal(metrics.closeClean, 1);
    assert.equal(metrics.closeUncertain, 0);
    assert.equal(metrics.phase, 'CLOSED');
  });

  await t.test('reentrant listener error cannot be overwritten by clean close', async () => {
    let reentered = false;
    const factoryHarness = serverFactoryHarness();
    const deadlines = controlledDeadlineRuntime({
      onCancel({ milliseconds }) {
        if (milliseconds !== LIMITS.closeGraceMs || reentered) return;
        reentered = true;
        factoryHarness.observed.callbacks.error(new Error('synthetic listener failure'));
      },
    });
    const started = await startedOwner({ deadlines, factoryHarness });
    await assert.rejects(started.owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
    const metrics = started.owner.snapshotMetrics();
    assert.equal(reentered, true);
    assert.equal(metrics.closeClean, 0);
    assert.equal(metrics.closeUncertain, 1);
    assert.equal(metrics.phase, 'CLOSE_UNCERTAIN');
  });
});

test('close deadline and cancellation failure produce one permanent privacy-safe uncertain result', async t => {
  await t.test('close deadline', async () => {
    const deadlines = controlledDeadlineRuntime();
    let closeCompletion;
    const started = await startedOwner({
      deadlines,
      downstream: capabilityLifecycle({
        close(completion) { closeCompletion = completion; },
      }),
    });
    const closing = started.owner.close();
    deadlines.fire(LIMITS.closeGraceMs);
    await assert.rejects(closing, error => exactError(error, CLOSE_UNCERTAIN));
    closeCompletion.success();
    await settle();
    assert.equal(started.owner.snapshotMetrics().closeUncertain, 1);
    assert.equal(started.owner.snapshotMetrics().closeClean, 0);
  });

  await t.test('cancellation failure', async () => {
    const deadlines = controlledDeadlineRuntime({ cancelResult: false });
    const configured = configuration({ deadlines });
    const owner = createServiceCreditBoundedHttpsIngressOwner(configured.options);
    await assert.rejects(owner.start(), error => exactError(error, START_UNCERTAIN));
    await assert.rejects(owner.close(), error => exactError(error, CLOSE_UNCERTAIN));
    assert.equal(owner.snapshotMetrics().closeUncertain, 1);
  });
});

test('unavailable responses and telemetry are fixed, aggregate, frozen and privacy-safe', async () => {
  const started = await startedOwner();
  const socket = connect(started.callbacks);
  const rejected = dispatch(started.callbacks, socket, { method: 'GET' });
  assert.equal(rejected.response.statusCode, 503);
  assert.deepEqual({ ...rejected.response.headers }, {
    'cache-control': 'private, no-store, max-age=0',
    connection: 'close',
    'content-length': '23',
    'content-type': 'application/json',
    'x-content-type-options': 'nosniff',
  });
  assert.equal(rejected.response.body.toString('utf8'), '{"error":"unavailable"}');
  socket.destroy();
  await started.owner.close();
  const metrics = started.owner.snapshotMetrics();
  assert.equal(Object.isFrozen(metrics), true);
  for (const [name, value] of Object.entries(metrics)) {
    if (name === 'phase') {
      assert.equal(value, 'CLOSED');
    } else {
      assert.equal(Number.isSafeInteger(value) && value >= 0, true);
    }
  }
  const serialized = JSON.stringify(metrics);
  for (const forbidden of [
    ORIGIN,
    AUTHORITY,
    '/service',
    '192.0.2.10',
    'service.example',
    'synthetic',
    'synthetic failure detail',
  ]) assert.equal(serialized.includes(forbidden), false);
  assert.throws(
    () => started.owner.snapshotMetrics('extra'),
    error => exactError(error, INVALID_INPUT),
  );
});
