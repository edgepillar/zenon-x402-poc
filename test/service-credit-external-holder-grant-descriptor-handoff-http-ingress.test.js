import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import * as ingressModule from '../src/service-credit-external-holder-grant-descriptor-handoff-http-ingress.js';
import {
  SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
  createServiceCreditExternalHolderGrantDescriptorSigningBytes,
} from '../src/service-credit-external-holder-grant-descriptor-handoff.js';
import { deriveServiceCreditCapabilityCommitment } from '../src/service-credit-capability.js';

const { createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress } = ingressModule;

const ORIGIN = 'https://service.example';
const CHALLENGE_TARGET = '/service-credit/external-holder/challenge';
const REDEMPTION_TARGET = '/service-credit/external-holder/redeem';
const NOW = 2_000_000_000_000;
const LIFETIME_MS = 1_000;
const BODY_DEADLINE_MS = 11;
const RESPONSE_DEADLINE_MS = 13;
const CLOSE_GRACE_MS = 17;
const FAILURE_BODY = '{"error":"unavailable"}';
const INVALID_CONFIGURATION =
  'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_INGRESS_INVALID_CONFIGURATION';
const INVALID_INPUT =
  'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_INGRESS_INVALID_INPUT';
const CLOSE_UNCERTAIN =
  'SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_HTTP_INGRESS_CLOSE_UNCERTAIN';
const ORDERING_CASES = 144;

const EVENT_ENUMS = Object.freeze([
  'REQUEST_REJECTED',
  'REQUEST_ADMITTED',
  'BODY_ABORTED',
  'RESPONSE_FINISHED',
  'RESPONSE_FAILED',
  'CLOSE_STARTED',
  'CLOSE_CLEAN',
  'CLOSE_UNCERTAIN',
]);

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function keyMaterial() {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' });
  return Object.freeze({
    privateKey: pair.privateKey,
    publicKey: spki.subarray(-32).toString('base64url'),
  });
}

const SHARED_KEYS = keyMaterial();
const SHARED_SELECTION = Object.freeze({
  offerId: 'offer.external-holder.ingress',
  offerVersion: 1,
  holderId: 'holder.external.ingress',
  capabilityCommitment: deriveServiceCreditCapabilityCommitment({
    publicKey: SHARED_KEYS.publicKey,
  }),
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, resolve, reject });
}

function deterministicRuntime({
  failingSchedule = Object.freeze(() => false),
  synchronousSchedule = Object.freeze(() => false),
  cancelFailure = Object.freeze(() => false),
  onSchedule = Object.freeze(() => undefined),
} = {}) {
  const handles = new Set();
  const state = { schedules: 0, cancels: 0 };
  const runtime = Object.freeze({
    schedule: Object.freeze((callback, milliseconds) => {
      state.schedules += 1;
      onSchedule(milliseconds);
      if (failingSchedule(milliseconds)) throw new Error('SYNTHETIC_SCHEDULE_FAILURE');
      const handle = { callback, milliseconds, active: true };
      handles.add(handle);
      if (synchronousSchedule(milliseconds)) Reflect.apply(callback, undefined, []);
      return handle;
    }),
    cancel: Object.freeze(handle => {
      state.cancels += 1;
      if (handle !== null && typeof handle === 'object') handle.active = false;
      handles.delete(handle);
      if (cancelFailure(handle)) throw new Error('SYNTHETIC_CANCEL_FAILURE');
    }),
  });
  const active = milliseconds => [...handles].filter(
    handle => handle.active && (milliseconds === undefined || handle.milliseconds === milliseconds),
  );
  return Object.freeze({
    runtime,
    state,
    activeCount(milliseconds = undefined) { return active(milliseconds).length; },
    fire(milliseconds) {
      const candidates = active(milliseconds);
      assert.equal(candidates.length > 0, true);
      const handle = candidates[0];
      handle.active = false;
      handles.delete(handle);
      Reflect.apply(handle.callback, undefined, []);
    },
    fireIfActive(milliseconds) {
      const candidates = active(milliseconds);
      if (candidates.length === 0) return false;
      const handle = candidates[0];
      handle.active = false;
      handles.delete(handle);
      Reflect.apply(handle.callback, undefined, []);
      return true;
    },
  });
}

async function eventLoopTurn() {
  await new Promise(resolve => setImmediate(resolve));
}

async function settlementState(promise) {
  let state = 'PENDING';
  promise.then(
    () => { state = 'FULFILLED'; },
    () => { state = 'REJECTED'; },
  );
  await Promise.resolve();
  return state;
}

async function assertNoUnhandledRejection(run) {
  const observed = [];
  const onUnhandledRejection = () => { observed.push(true); };
  process.on('unhandledRejection', onUnhandledRejection);
  try {
    await run();
    await eventLoopTurn();
    assert.deepEqual(observed, []);
  } finally {
    process.removeListener('unhandledRejection', onUnhandledRejection);
  }
}

function challengeHeaders(extra = []) {
  return ['Content-Length', '0', 'Connection', 'close', ...extra];
}

function redemptionHeaders(length, extra = []) {
  return [
    'Content-Length',
    String(length),
    'Content-Type',
    'application/json',
    'Connection',
    'close',
    ...extra,
  ];
}

function requestFixture({
  target = CHALLENGE_TARGET,
  method = 'POST',
  httpVersion = '1.1',
  rawHeaders = challengeHeaders(),
  chunks = [],
  complete = false,
  aborted = false,
} = {}) {
  const request = new EventEmitter();
  const state = { iteratorAccesses: 0, nextCalls: 0, endEvents: 0 };
  Object.assign(request, { method, url: target, httpVersion, rawHeaders, complete, aborted });
  Object.defineProperty(request, Symbol.asyncIterator, {
    configurable: true,
    enumerable: true,
    value: Object.freeze(function requestIterator() {
      state.iteratorAccesses += 1;
      let index = 0;
      return {
        [Symbol.asyncIterator]() { return this; },
        next() {
          state.nextCalls += 1;
          if (index < chunks.length) {
            const value = chunks[index];
            index += 1;
            return Promise.resolve({ done: false, value });
          }
          request.complete = true;
          request.aborted = false;
          state.endEvents += 1;
          request.emit('end');
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    }),
  });
  return Object.freeze({ request, state });
}

function controlledRequest({ body, stallAbort = false }) {
  const waiting = deferred();
  let pending = null;
  const request = new EventEmitter();
  const state = { iteratorAccesses: 0, nextCalls: 0, aborts: 0 };
  Object.assign(request, {
    method: 'POST',
    url: REDEMPTION_TARGET,
    httpVersion: '1.1',
    rawHeaders: redemptionHeaders(body.length),
    complete: false,
    aborted: false,
  });
  Object.defineProperty(request, Symbol.asyncIterator, {
    configurable: true,
    enumerable: true,
    value: Object.freeze(function requestIterator() {
      state.iteratorAccesses += 1;
      let stage = 0;
      return {
        [Symbol.asyncIterator]() { return this; },
        next() {
          state.nextCalls += 1;
          if (stage === 0) {
            stage = 1;
            return Promise.resolve({ done: false, value: body });
          }
          if (stage === 1) {
            stage = 2;
            pending = deferred();
            waiting.resolve();
            return pending.promise;
          }
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    }),
  });
  const finish = () => {
    request.complete = true;
    request.aborted = false;
    request.emit('end');
    pending?.resolve({ done: true, value: undefined });
  };
  const abort = Object.freeze(() => {
    state.aborts += 1;
    request.aborted = true;
    request.emit('aborted');
    if (!stallAbort) pending?.reject(new Error('SYNTHETIC_STREAM_ABORT'));
  });
  return Object.freeze({ request, state, waiting: waiting.promise, finish, abort });
}

function responseFixture(mode = 'finish') {
  const response = new EventEmitter();
  const headers = Object.create(null);
  const state = { body: null, endCalls: 0, setHeaderCalls: 0 };
  const endObserved = deferred();
  Object.assign(response, {
    statusCode: 0,
    headersSent: false,
    writableEnded: false,
    writableFinished: false,
    destroyed: false,
  });
  response.setHeader = Object.freeze((name, value) => {
    state.setHeaderCalls += 1;
    headers[String(name).toLowerCase()] = String(value);
  });
  response.end = Object.freeze(body => {
    state.endCalls += 1;
    state.body = Buffer.from(body);
    response.headersSent = true;
    response.writableEnded = true;
    endObserved.resolve();
    if (mode === 'throw') throw new Error('SYNTHETIC_SEND_FAILURE');
    if (mode === 'finish') {
      queueMicrotask(() => {
        response.writableFinished = true;
        response.emit('finish');
      });
    } else if (mode === 'close') {
      queueMicrotask(() => {
        response.destroyed = true;
        response.emit('close');
      });
    } else if (mode === 'error') {
      queueMicrotask(() => response.emit('error', new Error('SYNTHETIC_RESPONSE_FAILURE')));
    }
  });
  return Object.freeze({ response, headers, state, endObserved: endObserved.promise });
}

function transportContext(abort = Object.freeze(() => undefined), peerToken = Symbol('peer')) {
  return Object.freeze({ peerToken, abort });
}

function makeConfiguration(overrides = {}) {
  const runtime = overrides.runtime ?? deterministicRuntime();
  const state = overrides.state ?? {
    now: NOW,
    admissions: [],
    ownerReads: 0,
    nowReads: 0,
  };
  const selection = overrides.selection ?? SHARED_SELECTION;
  const descriptor = overrides.descriptor ?? Object.freeze({
    grantId: 'grant.external-holder.ingress',
    capabilityCommitment: selection.capabilityCommitment,
  });
  const configuration = {
    origin: overrides.origin ?? ORIGIN,
    selection,
    challengeLifetimeMs: overrides.challengeLifetimeMs ?? LIFETIME_MS,
    now: overrides.now ?? Object.freeze(() => {
      state.nowReads += 1;
      return state.now;
    }),
    getActiveGrantDescriptorForSelection:
      overrides.getActiveGrantDescriptorForSelection ?? Object.freeze(requestedSelection => {
        state.ownerReads += 1;
        if (overrides.ownerHook !== undefined) overrides.ownerHook(requestedSelection);
        return descriptor;
      }),
    challengeRequestTarget: overrides.challengeRequestTarget ?? CHALLENGE_TARGET,
    redemptionRequestTarget: overrides.redemptionRequestTarget ?? REDEMPTION_TARGET,
    admitRequest: overrides.admitRequest ?? Object.freeze(admission => {
      state.admissions.push(admission);
      return true;
    }),
    deadlineRuntime: runtime.runtime,
    bodyDeadlineMs: overrides.bodyDeadlineMs ?? BODY_DEADLINE_MS,
    responseDeadlineMs: overrides.responseDeadlineMs ?? RESPONSE_DEADLINE_MS,
    closeGraceMs: overrides.closeGraceMs ?? CLOSE_GRACE_MS,
    metricsCounterLimit: overrides.metricsCounterLimit ?? Number.MAX_SAFE_INTEGER,
    ...(Object.hasOwn(overrides, 'eventSink') ? { eventSink: overrides.eventSink } : {}),
  };
  return { configuration, runtime, state, selection, descriptor };
}

function fixture(overrides = {}) {
  const context = makeConfiguration(overrides);
  context.controller = createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress(
    context.configuration,
  );
  return context;
}

async function exchange(controller, request, options = {}) {
  const responseMode = options.responseMode ?? 'finish';
  const context = Object.hasOwn(options, 'context')
    ? options.context
    : transportContext();
  const output = responseFixture(responseMode);
  const returned = await controller.handle(request, output.response, context);
  return Object.freeze({ returned, ...output });
}

function assertUnavailable(result) {
  assert.equal(result.returned, undefined);
  assert.equal(result.response.statusCode, 503);
  assert.equal(result.state.endCalls, 1);
  assert.equal(result.state.body.toString('utf8'), FAILURE_BODY);
  assert.deepEqual({ ...result.headers }, {
    'cache-control': 'private, no-store, max-age=0',
    connection: 'close',
    'content-length': String(Buffer.byteLength(FAILURE_BODY)),
    'content-type': 'application/json',
    'x-content-type-options': 'nosniff',
  });
}

function assertSuccess(result) {
  assert.equal(result.returned, undefined);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.state.endCalls, 1);
  assert.equal(Buffer.isBuffer(result.state.body), true);
}

function signedRedemption(challenge, context, overrides = {}) {
  const selection = overrides.selection ?? context.selection;
  const origin = overrides.origin ?? ORIGIN;
  return {
    challenge,
    publicKey: SHARED_KEYS.publicKey,
    signature: sign(
      null,
      createServiceCreditExternalHolderGrantDescriptorSigningBytes({
        ...challenge,
        origin,
        selection,
      }),
      SHARED_KEYS.privateKey,
    ).toString('base64url'),
  };
}

async function issueChallenge(context) {
  const request = requestFixture();
  const result = await exchange(context.controller, request.request);
  assertSuccess(result);
  return JSON.parse(result.state.body.toString('utf8'));
}

async function redeem(context, redemption, options = {}) {
  const body = Buffer.from(canonicalJson(redemption), 'utf8');
  const input = requestFixture({
    target: REDEMPTION_TARGET,
    rawHeaders: redemptionHeaders(body.length),
    chunks: [body],
  });
  return exchange(context.controller, input.request, options);
}

async function expectCloseUncertain(promise) {
  await assert.rejects(promise, error => (
    error?.code === CLOSE_UNCERTAIN
    && error?.message === CLOSE_UNCERTAIN
    && error?.stack === `TypeError: ${CLOSE_UNCERTAIN}`
  ));
}

test('import and construction are inert with one exact configuration and frozen narrow surface', async t => {
  assert.deepEqual(Object.keys(ingressModule), [
    'createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress',
  ]);
  const source = readFileSync(
    new URL('../src/service-credit-external-holder-grant-descriptor-handoff-http-ingress.js', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'node:http', 'node:https', 'node:http2', 'node:net', 'node:tls', 'node:fs',
    'createServer(', '.listen(', 'process.env', 'globalThis', 'console.', 'fetch(',
    'setTimeout(', 'setInterval(', '.socket', '.headers', 'forwarded', 'x-forwarded',
  ]) assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false);
  assert.equal(
    source.includes("from './service-credit-external-holder-grant-descriptor-handoff-http.js'"),
    true,
  );

  const context = fixture();
  t.after(() => context.controller.close());
  assert.deepEqual(Reflect.ownKeys(context.controller), ['handle', 'close', 'snapshotMetrics']);
  assert.equal(Object.isFrozen(context.controller), true);
  assert.equal(Object.isFrozen(context.controller.handle), true);
  assert.equal(Object.isFrozen(context.controller.close), true);
  assert.equal(Object.isFrozen(context.controller.snapshotMetrics), true);
  assert.equal(context.runtime.state.schedules, 0);
  assert.equal(context.state.nowReads, 0);
  assert.equal(context.state.ownerReads, 0);
  assert.deepEqual(context.state.admissions, []);

  const base = makeConfiguration().configuration;
  for (const invalid of [
    { ...base, unexpected: true },
    Object.assign(Object.create(null), base),
    new Proxy(base, {}),
    { ...base, deadlineRuntime: { ...base.deadlineRuntime } },
    { ...base, deadlineRuntime: new Proxy(base.deadlineRuntime, {}) },
    { ...base, metricsCounterLimit: 0 },
    { ...base, metricsCounterLimit: Number.MAX_SAFE_INTEGER + 1 },
    { ...base, bodyDeadlineMs: 0 },
    { ...base, responseDeadlineMs: 0 },
    { ...base, closeGraceMs: 0 },
    { ...base, admitRequest: new Proxy(() => true, {}) },
    { ...base, eventSink: Promise.resolve() },
  ]) {
    assert.throws(
      () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress(invalid),
      error => error?.code === INVALID_CONFIGURATION,
    );
  }
  const accessor = { ...base };
  let getterReads = 0;
  Object.defineProperty(accessor, 'admitRequest', {
    enumerable: true,
    get() { getterReads += 1; return () => true; },
  });
  assert.throws(
    () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress(accessor),
    error => error?.code === INVALID_CONFIGURATION,
  );
  assert.equal(getterReads, 0);
  assert.throws(
    () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress(),
    error => error?.code === INVALID_CONFIGURATION,
  );
  assert.throws(
    () => createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress(base, base),
    error => error?.code === INVALID_CONFIGURATION,
  );
});

test('the dormant ingress has no package export or active import reachability', () => {
  const name = 'service-credit-external-holder-grant-descriptor-handoff-http-ingress.js';
  const packageText = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const packageJson = JSON.parse(packageText);
  assert.equal(packageText.includes(name), false);
  assert.equal(packageJson.exports, undefined);
  assert.equal(packageJson.bin, undefined);
  for (const entry of readdirSync(new URL('../src/', import.meta.url))) {
    if (!entry.endsWith('.js') || entry === name) continue;
    const source = readFileSync(new URL(`../src/${entry}`, import.meta.url), 'utf8');
    assert.equal(source.includes(name), false);
  }
});

test('exact HTTP/1.1 and exact context gates precede adapter admission and body access', async t => {
  const context = fixture();
  t.after(() => context.controller.close());
  const invalidVersions = ['1.0', '2.0', '1.1 ', '', 1.1, null];
  for (const httpVersion of invalidVersions) {
    const input = requestFixture({ httpVersion });
    assertUnavailable(await exchange(context.controller, input.request));
    assert.equal(input.state.iteratorAccesses, 0);
  }
  const missingVersion = requestFixture();
  missingVersion.request.httpVersion = undefined;
  assertUnavailable(await exchange(context.controller, missingVersion.request));
  assert.equal(missingVersion.state.iteratorAccesses, 0);
  assert.equal(context.state.admissions.length, 0);

  const contexts = [
    undefined,
    null,
    {},
    Object.freeze({ peerToken: 'derived-address', abort: Object.freeze(() => undefined) }),
    Object.freeze({ peerToken: Symbol('peer') }),
    Object.freeze({ peerToken: Symbol('peer'), abort: () => undefined, extra: true }),
    Object.freeze({ peerToken: Symbol('peer'), abort: new Proxy(() => undefined, {}) }),
    new Proxy(transportContext(), {}),
  ];
  for (const candidate of contexts) {
    const input = requestFixture();
    assertUnavailable(await exchange(context.controller, input.request, { context: candidate }));
    assert.equal(input.state.iteratorAccesses, 0);
  }
  assert.equal(context.state.admissions.length, 0);

  const invalidFraming = requestFixture({
    rawHeaders: challengeHeaders(['Content-Length', '0']),
    chunks: [Buffer.from('must-not-be-read', 'utf8')],
  });
  assertUnavailable(await exchange(context.controller, invalidFraming.request));
  assert.equal(context.state.admissions.length, 0);
  assert.equal(invalidFraming.state.iteratorAccesses, 0);

  let normalizedHeaderReads = 0;
  let socketReads = 0;
  const denied = fixture({ admitRequest: Object.freeze(() => false) });
  t.after(() => denied.controller.close());
  const deniedInput = requestFixture();
  Object.defineProperty(deniedInput.request, 'headers', {
    get() { normalizedHeaderReads += 1; throw new Error('SYNTHETIC_HEADER_READ'); },
  });
  Object.defineProperty(deniedInput.request, 'socket', {
    get() { socketReads += 1; throw new Error('SYNTHETIC_SOCKET_READ'); },
  });
  assertUnavailable(await exchange(denied.controller, deniedInput.request));
  assert.equal(deniedInput.state.iteratorAccesses, 0);
  assert.equal(normalizedHeaderReads, 0);
  assert.equal(socketReads, 0);
});

test('opaque peer tokens remain isolated across requests and admission reentrancy has no queue', async t => {
  const tokenA = Symbol('opaque-a');
  const tokenB = Symbol('opaque-b');
  const admissions = [];
  let controller;
  let nested = null;
  const context = makeConfiguration({
    admitRequest: Object.freeze(admission => {
      admissions.push(admission);
      if (admissions.length === 1) {
        const input = requestFixture();
        nested = exchange(controller, input.request, { context: transportContext(undefined, tokenB) });
      }
      return true;
    }),
  });
  controller = createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress(
    context.configuration,
  );
  t.after(() => controller.close());
  assertSuccess(await exchange(controller, requestFixture().request, {
    context: transportContext(undefined, tokenA),
  }));
  assertUnavailable(await nested);
  assert.equal(admissions.length, 1);
  assert.deepEqual(Reflect.ownKeys(admissions[0]), [
    'peerToken', 'operation', 'declaredBodyBytes',
  ]);
  assert.equal(admissions[0].peerToken, tokenA);
  assert.equal(admissions[0].operation, 'CHALLENGE');
  assert.equal(admissions[0].declaredBodyBytes, 0);
  assert.equal(Object.isFrozen(admissions[0]), true);
  assert.equal(Object.hasOwn(admissions[0], 'request'), false);
  assert.equal(Object.hasOwn(admissions[0], 'abort'), false);
  assertUnavailable(await exchange(controller, requestFixture().request, {
    context: transportContext(undefined, tokenB),
  }));
  assert.equal(admissions.length, 2);
  assert.equal(admissions[1].peerToken, tokenB);
  assert.notStrictEqual(admissions[0], admissions[1]);
});

test('only primitive true admits without thenable, proxy, or throw assimilation', async t => {
  let thenReads = 0;
  let thenCalls = 0;
  let proxyReads = 0;
  const accessorThenable = {};
  Object.defineProperty(accessorThenable, 'then', {
    get() { thenReads += 1; return () => undefined; },
  });
  const cases = [
    false,
    { then() { thenCalls += 1; } },
    accessorThenable,
    new Proxy({}, { get() { proxyReads += 1; return true; } }),
    new Boolean(true),
    1,
    'true',
    null,
    undefined,
    Symbol('throw'),
  ];
  for (const returned of cases) {
    const context = fixture({
      admitRequest: Object.freeze(() => {
        if (typeof returned === 'symbol') throw new Error('SYNTHETIC_ADMISSION_FAILURE');
        return returned;
      }),
    });
    t.after(() => context.controller.close());
    const input = requestFixture();
    assertUnavailable(await exchange(context.controller, input.request));
    assert.equal(input.state.iteratorAccesses, 0);
    assert.equal(context.state.ownerReads, 0);
  }
  assert.equal(thenReads, 0);
  assert.equal(thenCalls, 0);
  assert.equal(proxyReads, 0);

  const active = fixture();
  t.after(() => active.controller.close());
  const stalled = controlledRequest({ body: Buffer.from('{', 'utf8') });
  const first = exchange(active.controller, stalled.request, {
    context: transportContext(stalled.abort),
  });
  await stalled.waiting;
  const secondInput = requestFixture();
  assertUnavailable(await exchange(active.controller, secondInput.request));
  assert.equal(secondInput.state.iteratorAccesses, 0);
  assert.equal(active.state.admissions.length, 1);
  stalled.abort();
  assertUnavailable(await first);
});

test('pending native Promise admission work is denied, held, and grace-closes uncertain', async () => {
  const unexpected = deferred();
  const events = [];
  const context = fixture({
    admitRequest: Object.freeze(() => unexpected.promise),
    eventSink: Object.freeze(event => { events.push(event); }),
  });
  const input = requestFixture();
  assertUnavailable(await exchange(context.controller, input.request));
  assert.equal(input.state.iteratorAccesses, 0);
  assert.equal(context.controller.snapshotMetrics().phase, 'QUARANTINED');
  const closePromise = context.controller.close();
  assert.strictEqual(context.controller.close(), closePromise);
  assert.equal(await settlementState(closePromise), 'PENDING');
  assert.equal(context.runtime.activeCount(CLOSE_GRACE_MS), 1);
  context.runtime.fire(CLOSE_GRACE_MS);
  await expectCloseUncertain(closePromise);
  unexpected.resolve(true);
  await eventLoopTurn();
  const metrics = context.controller.snapshotMetrics();
  assert.equal(metrics.closeClean, 0);
  assert.equal(metrics.closeUncertain, 1);
  assert.equal(events.includes('CLOSE_CLEAN'), false);
  assert.equal(events.filter(event => event === 'CLOSE_UNCERTAIN').length, 1);
  assert.equal(context.runtime.activeCount(), 0);
});

test('native Promise observation bypasses hostile constructor and species access safely', async t => {
  await t.test('a configurable own constructor getter is never invoked and is restored', async () => {
    await assertNoUnhandledRejection(async () => {
      const unexpected = deferred();
      let constructorReads = 0;
      const constructorGetter = Object.freeze(() => {
        constructorReads += 1;
        throw new Error('SYNTHETIC_CONSTRUCTOR_READ');
      });
      Object.defineProperty(unexpected.promise, 'constructor', {
        configurable: true,
        enumerable: true,
        get: constructorGetter,
      });
      const originalDescriptor = Reflect.getOwnPropertyDescriptor(
        unexpected.promise,
        'constructor',
      );
      const context = fixture({
        admitRequest: Object.freeze(() => unexpected.promise),
      });

      const input = requestFixture();
      const output = responseFixture();
      const operation = context.controller.handle(
        input.request,
        output.response,
        transportContext(),
      );
      assert.equal(constructorReads, 0);
      assert.deepEqual(
        Reflect.getOwnPropertyDescriptor(unexpected.promise, 'constructor'),
        originalDescriptor,
      );
      assert.equal(await operation, undefined);
      assertUnavailable({ returned: undefined, ...output });
      const closePromise = context.controller.close();
      assert.equal(await settlementState(closePromise), 'PENDING');
      unexpected.reject(new Error('SYNTHETIC_UNEXPECTED_REJECTION'));
      await expectCloseUncertain(closePromise);
      await eventLoopTurn();
      assert.equal(context.controller.snapshotMetrics().closeClean, 0);
    });
  });

  await t.test('a configurable hostile species route is never invoked and is restored', async () => {
    await assertNoUnhandledRejection(async () => {
      const unexpected = deferred();
      let speciesReads = 0;
      const hostileConstructor = {};
      Object.defineProperty(hostileConstructor, Symbol.species, {
        configurable: false,
        enumerable: false,
        get() {
          speciesReads += 1;
          throw new Error('SYNTHETIC_SPECIES_READ');
        },
      });
      Object.freeze(hostileConstructor);
      Object.defineProperty(unexpected.promise, 'constructor', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: hostileConstructor,
      });
      const originalDescriptor = Reflect.getOwnPropertyDescriptor(
        unexpected.promise,
        'constructor',
      );
      const context = fixture({
        admitRequest: Object.freeze(() => unexpected.promise),
      });

      const input = requestFixture();
      const output = responseFixture();
      const operation = context.controller.handle(
        input.request,
        output.response,
        transportContext(),
      );
      assert.equal(speciesReads, 0);
      assert.deepEqual(
        Reflect.getOwnPropertyDescriptor(unexpected.promise, 'constructor'),
        originalDescriptor,
      );
      assert.equal(await operation, undefined);
      assertUnavailable({ returned: undefined, ...output });
      const closePromise = context.controller.close();
      assert.equal(await settlementState(closePromise), 'PENDING');
      unexpected.reject(new Error('SYNTHETIC_UNEXPECTED_REJECTION'));
      await expectCloseUncertain(closePromise);
      await eventLoopTurn();
      assert.equal(context.controller.snapshotMetrics().closeClean, 0);
    });
  });
});

test('a non-extensible exact native Promise remains safely observable on rejection', async () => {
  await assertNoUnhandledRejection(async () => {
    const unexpected = deferred();
    Object.preventExtensions(unexpected.promise);
    const context = fixture({
      admitRequest: Object.freeze(() => unexpected.promise),
    });

    assertUnavailable(await exchange(context.controller, requestFixture().request));
    assert.equal(
      Reflect.getOwnPropertyDescriptor(unexpected.promise, 'constructor'),
      undefined,
    );
    const closePromise = context.controller.close();
    assert.equal(await settlementState(closePromise), 'PENDING');
    unexpected.reject(new Error('SYNTHETIC_UNEXPECTED_REJECTION'));
    await expectCloseUncertain(closePromise);
    await eventLoopTurn();
    assert.equal(context.controller.snapshotMetrics().closeClean, 0);
  });
});

test('an unobservable hardened native Promise remains held until uncertain grace', async () => {
  const unexpected = deferred();
  let constructorReads = 0;
  Object.defineProperty(unexpected.promise, 'constructor', {
    configurable: false,
    enumerable: false,
    get() {
      constructorReads += 1;
      throw new Error('SYNTHETIC_CONSTRUCTOR_READ');
    },
  });
  const context = fixture({
    admitRequest: Object.freeze(() => unexpected.promise),
  });

  assertUnavailable(await exchange(context.controller, requestFixture().request));
  assert.equal(constructorReads, 0);
  assert.equal(context.controller.snapshotMetrics().phase, 'QUARANTINED');
  const closePromise = context.controller.close();
  assert.equal(await settlementState(closePromise), 'PENDING');
  unexpected.resolve(true);
  await eventLoopTurn();
  assert.equal(await settlementState(closePromise), 'PENDING');
  assert.equal(context.runtime.activeCount(CLOSE_GRACE_MS), 1);
  context.runtime.fire(CLOSE_GRACE_MS);
  await expectCloseUncertain(closePromise);
  const metrics = context.controller.snapshotMetrics();
  assert.equal(metrics.closeClean, 0);
  assert.equal(metrics.closeUncertain, 1);
  assert.equal(context.runtime.activeCount(), 0);
});

test('pending native Promise descriptor work holds close until settlement and stays uncertain', async () => {
  const unexpected = deferred();
  const events = [];
  const context = fixture({
    getActiveGrantDescriptorForSelection: Object.freeze(() => unexpected.promise),
    eventSink: Object.freeze(event => { events.push(event); }),
  });
  const challenge = await issueChallenge(context);
  assertUnavailable(await redeem(context, signedRedemption(challenge, context)));
  assert.equal(context.state.ownerReads, 0);
  assert.equal(context.controller.snapshotMetrics().phase, 'QUARANTINED');
  const closePromise = context.controller.close();
  assert.equal(await settlementState(closePromise), 'PENDING');
  unexpected.resolve(context.descriptor);
  await expectCloseUncertain(closePromise);
  const metrics = context.controller.snapshotMetrics();
  assert.equal(metrics.closeClean, 0);
  assert.equal(metrics.closeUncertain, 1);
  assert.deepEqual(
    events.filter(event => event === 'CLOSE_CLEAN' || event === 'CLOSE_UNCERTAIN'),
    ['CLOSE_UNCERTAIN'],
  );
  assert.equal(context.runtime.activeCount(), 0);
});

test('rejecting native Promises from every observed callback cannot escape unhandled', async t => {
  await t.test('admission', async () => {
    await assertNoUnhandledRejection(async () => {
      const context = fixture({
        admitRequest: Object.freeze(() => Promise.reject()),
      });
      assertUnavailable(await exchange(context.controller, requestFixture().request));
      await eventLoopTurn();
      await expectCloseUncertain(context.controller.close());
    });
  });

  await t.test('clock', async () => {
    await assertNoUnhandledRejection(async () => {
      const context = fixture({ now: Object.freeze(() => Promise.reject()) });
      assertUnavailable(await exchange(context.controller, requestFixture().request));
      await eventLoopTurn();
      await expectCloseUncertain(context.controller.close());
    });
  });

  await t.test('descriptor', async () => {
    await assertNoUnhandledRejection(async () => {
      const context = fixture({
        getActiveGrantDescriptorForSelection: Object.freeze(() => Promise.reject()),
      });
      const challenge = await issueChallenge(context);
      assertUnavailable(await redeem(context, signedRedemption(challenge, context)));
      await eventLoopTurn();
      await expectCloseUncertain(context.controller.close());
    });
  });

  await t.test('abort', async () => {
    await assertNoUnhandledRejection(async () => {
      const context = fixture();
      const controlled = controlledRequest({ body: Buffer.from('{', 'utf8') });
      const operation = exchange(context.controller, controlled.request, {
        context: transportContext(Object.freeze(() => {
          controlled.abort();
          return Promise.reject();
        })),
      });
      await controlled.waiting;
      context.runtime.fire(BODY_DEADLINE_MS);
      assertUnavailable(await operation);
      await eventLoopTurn();
      await expectCloseUncertain(context.controller.close());
    });
  });

  await t.test('cancel', async () => {
    await assertNoUnhandledRejection(async () => {
      const base = deterministicRuntime();
      let returnedUnexpected = false;
      const runtime = Object.freeze({
        runtime: Object.freeze({
          schedule: base.runtime.schedule,
          cancel: Object.freeze(handle => {
            base.runtime.cancel(handle);
            if (returnedUnexpected) return undefined;
            returnedUnexpected = true;
            return Promise.reject();
          }),
        }),
        state: base.state,
        activeCount: base.activeCount,
        fire: base.fire,
        fireIfActive: base.fireIfActive,
      });
      const context = fixture({ runtime });
      const result = await exchange(context.controller, requestFixture().request);
      assert.equal(result.state.endCalls, 1);
      await eventLoopTurn();
      await expectCloseUncertain(context.controller.close());
      assert.equal(runtime.activeCount(), 0);
    });
  });

  await t.test('schedule handle', async () => {
    await assertNoUnhandledRejection(async () => {
      const base = deterministicRuntime();
      let returnedUnexpected = false;
      const runtime = Object.freeze({
        runtime: Object.freeze({
          schedule: Object.freeze((callback, milliseconds) => {
            if (!returnedUnexpected) {
              returnedUnexpected = true;
              return Promise.reject();
            }
            return base.runtime.schedule(callback, milliseconds);
          }),
          cancel: base.runtime.cancel,
        }),
        state: base.state,
        activeCount: base.activeCount,
        fire: base.fire,
        fireIfActive: base.fireIfActive,
      });
      const input = requestFixture();
      const context = fixture({ runtime });
      assertUnavailable(await exchange(context.controller, input.request));
      assert.equal(input.state.iteratorAccesses, 0);
      await eventLoopTurn();
      await expectCloseUncertain(context.controller.close());
      assert.equal(runtime.activeCount(), 0);
    });
  });
});

test('generic thenable, accessor, and proxy returns are never assimilated or then-inspected', async t => {
  let thenReads = 0;
  let thenCalls = 0;
  let proxyReads = 0;
  const thenable = Object.freeze({ then() { thenCalls += 1; } });
  const accessorThenable = {};
  Object.defineProperty(accessorThenable, 'then', {
    enumerable: true,
    get() { thenReads += 1; return () => undefined; },
  });
  const proxy = new Proxy({}, { get() { proxyReads += 1; return undefined; } });

  for (const [label, returned] of [
    ['thenable', thenable],
    ['accessor', accessorThenable],
    ['proxy', proxy],
  ]) {
    await t.test(`clock denial ${label}`, async () => {
      const context = fixture({ now: Object.freeze(() => returned) });
      assertUnavailable(await exchange(context.controller, requestFixture().request));
      await context.controller.close();
      assert.equal(context.controller.snapshotMetrics().phase, 'CLOSED');
    });
  }

  for (const returned of [thenable, accessorThenable, proxy]) {
    const context = fixture({
      getActiveGrantDescriptorForSelection: Object.freeze(() => returned),
    });
    const challenge = await issueChallenge(context);
    assertUnavailable(await redeem(context, signedRedemption(challenge, context)));
    await context.controller.close();
    assert.equal(context.controller.snapshotMetrics().phase, 'CLOSED');
  }

  const abortContext = fixture();
  const controlled = controlledRequest({ body: Buffer.from('{', 'utf8') });
  const aborted = exchange(abortContext.controller, controlled.request, {
    context: transportContext(Object.freeze(() => {
      controlled.abort();
      return accessorThenable;
    })),
  });
  await controlled.waiting;
  abortContext.runtime.fire(BODY_DEADLINE_MS);
  assertUnavailable(await aborted);
  await abortContext.controller.close();

  const opaqueRuntime = Object.freeze({
    runtime: Object.freeze({
      schedule: Object.freeze(() => proxy),
      cancel: Object.freeze(() => accessorThenable),
    }),
    state: Object.freeze({ schedules: 0, cancels: 0 }),
    activeCount: Object.freeze(() => 0),
    fire: Object.freeze(() => undefined),
    fireIfActive: Object.freeze(() => false),
  });
  const opaqueContext = fixture({ runtime: opaqueRuntime });
  assertSuccess(await exchange(opaqueContext.controller, requestFixture().request));
  await opaqueContext.controller.close();
  assert.equal(opaqueContext.controller.snapshotMetrics().phase, 'CLOSED');

  assert.equal(thenReads, 0);
  assert.equal(thenCalls, 0);
  assert.equal(proxyReads, 0);
});

test('close-grace scheduling failure settles uncertain immediately with uncooperative work', async () => {
  const runtime = deterministicRuntime({
    failingSchedule: Object.freeze(milliseconds => milliseconds === CLOSE_GRACE_MS),
  });
  const context = fixture({ runtime });
  const controlled = controlledRequest({ body: Buffer.from('{', 'utf8'), stallAbort: true });
  const operation = context.controller.handle(
    controlled.request,
    responseFixture().response,
    transportContext(controlled.abort),
  );
  await controlled.waiting;
  const closePromise = context.controller.close();
  const immediate = closePromise.then(
    () => 'CLEAN',
    () => 'UNCERTAIN',
  );
  await Promise.resolve();
  assert.equal(await settlementState(immediate), 'FULFILLED');
  assert.equal(await immediate, 'UNCERTAIN');
  await expectCloseUncertain(closePromise);
  assert.equal(context.controller.snapshotMetrics().closeUncertain, 1);
  assert.equal(runtime.activeCount(CLOSE_GRACE_MS), 0);
  controlled.finish();
  assert.equal(await operation, undefined);
});

test('synchronously firing body, response, and close schedules leave no active deadline', async t => {
  await t.test('body', async () => {
    const runtime = deterministicRuntime({
      synchronousSchedule: Object.freeze(milliseconds => milliseconds === BODY_DEADLINE_MS),
    });
    let aborts = 0;
    const context = fixture({ runtime });
    const input = requestFixture();
    assertUnavailable(await exchange(context.controller, input.request, {
      context: transportContext(Object.freeze(() => { aborts += 1; })),
    }));
    assert.equal(aborts, 1);
    assert.equal(input.state.iteratorAccesses, 0);
    assert.equal(runtime.activeCount(), 0);
    await context.controller.close();
  });

  await t.test('response', async () => {
    const runtime = deterministicRuntime({
      synchronousSchedule: Object.freeze(milliseconds => milliseconds === RESPONSE_DEADLINE_MS),
    });
    const context = fixture({ runtime });
    const output = responseFixture('manual');
    assert.equal(await context.controller.handle(
      requestFixture().request,
      output.response,
      transportContext(),
    ), undefined);
    assert.equal(context.controller.snapshotMetrics().responsesFailed, 1);
    assert.equal(runtime.activeCount(), 0);
    await expectCloseUncertain(context.controller.close());
  });

  await t.test('close', async () => {
    const runtime = deterministicRuntime({
      synchronousSchedule: Object.freeze(milliseconds => milliseconds === CLOSE_GRACE_MS),
    });
    const context = fixture({ runtime });
    const closePromise = context.controller.close();
    assert.strictEqual(context.controller.close(), closePromise);
    await expectCloseUncertain(closePromise);
    assert.equal(runtime.activeCount(), 0);
    assert.equal(context.controller.snapshotMetrics().closeUncertain, 1);
  });
});

test('close cancellation throw emits and counts only the uncertain terminal', async () => {
  const events = [];
  const runtime = deterministicRuntime({
    cancelFailure: Object.freeze(handle => handle?.milliseconds === CLOSE_GRACE_MS),
  });
  const context = fixture({
    runtime,
    eventSink: Object.freeze(event => { events.push(event); }),
  });
  await expectCloseUncertain(context.controller.close());
  const metrics = context.controller.snapshotMetrics();
  assert.equal(metrics.closeClean, 0);
  assert.equal(metrics.closeUncertain, 1);
  assert.deepEqual(
    events.filter(event => event === 'CLOSE_CLEAN' || event === 'CLOSE_UNCERTAIN'),
    ['CLOSE_UNCERTAIN'],
  );
  assert.equal(runtime.activeCount(), 0);
});

test('native Promise close cancellation is contained and cannot emit clean', async () => {
  await assertNoUnhandledRejection(async () => {
    const events = [];
    const base = deterministicRuntime();
    const runtime = Object.freeze({
      runtime: Object.freeze({
        schedule: base.runtime.schedule,
        cancel: Object.freeze(handle => {
          base.runtime.cancel(handle);
          return handle?.milliseconds === CLOSE_GRACE_MS ? Promise.reject() : undefined;
        }),
      }),
      state: base.state,
      activeCount: base.activeCount,
      fire: base.fire,
      fireIfActive: base.fireIfActive,
    });
    const context = fixture({
      runtime,
      eventSink: Object.freeze(event => { events.push(event); }),
    });
    await expectCloseUncertain(context.controller.close());
    await eventLoopTurn();
    const metrics = context.controller.snapshotMetrics();
    assert.equal(metrics.closeClean, 0);
    assert.equal(metrics.closeUncertain, 1);
    assert.deepEqual(
      events.filter(event => event === 'CLOSE_CLEAN' || event === 'CLOSE_UNCERTAIN'),
      ['CLOSE_UNCERTAIN'],
    );
    assert.equal(runtime.activeCount(), 0);
  });
});

test('body deadline aborts the exact stalled request deterministically', async () => {
  const context = fixture();
  const controlled = controlledRequest({ body: Buffer.from('{', 'utf8') });
  const pending = exchange(context.controller, controlled.request, {
    context: transportContext(controlled.abort),
  });
  await controlled.waiting;
  assert.equal(context.runtime.activeCount(BODY_DEADLINE_MS), 1);
  context.runtime.fire(BODY_DEADLINE_MS);
  assertUnavailable(await pending);
  assert.equal(controlled.state.aborts, 1);
  assert.equal(context.runtime.activeCount(), 0);
  const metrics = context.controller.snapshotMetrics();
  assert.equal(metrics.bodyAborted, 1);
  assert.equal(metrics.responsesFinished, 1);
  await context.controller.close();
});

test('response finish, close, error, and send failure have one terminal disposition', async t => {
  for (const [mode, finished, failed] of [
    ['finish', 1, 0],
    ['close', 0, 1],
    ['error', 0, 1],
  ]) {
    const context = fixture();
    t.after(() => context.controller.close());
    const result = await exchange(context.controller, requestFixture().request, {
      responseMode: mode,
    });
    assert.equal(result.state.endCalls, 1);
    const metrics = context.controller.snapshotMetrics();
    assert.equal(metrics.responsesAttempted, 1);
    assert.equal(metrics.responsesFinished, finished);
    assert.equal(metrics.responsesFailed, failed);
  }

  const failed = fixture();
  const challenge = await issueChallenge(failed);
  const redemption = signedRedemption(challenge, failed);
  const redemptionBody = Buffer.from(canonicalJson(redemption), 'utf8');
  const input = requestFixture({
    target: REDEMPTION_TARGET,
    rawHeaders: redemptionHeaders(redemptionBody.length),
    chunks: [redemptionBody],
  });
  const output = responseFixture('throw');
  let aborts = 0;
  const operation = failed.controller.handle(
    input.request,
    output.response,
    transportContext(Object.freeze(() => { aborts += 1; })),
  );
  await output.endObserved;
  assert.equal(output.state.endCalls, 1);
  assert.equal(failed.runtime.activeCount(RESPONSE_DEADLINE_MS), 1);
  failed.runtime.fire(RESPONSE_DEADLINE_MS);
  assert.equal(await operation, undefined);
  assert.equal(aborts, 1);
  assert.equal(output.state.endCalls, 1);
  assert.equal(failed.controller.snapshotMetrics().responsesFailed, 1);
  assert.equal(failed.state.ownerReads, 1);
  assert.equal(failed.state.admissions.length, 2);
  assertUnavailable(await redeem(failed, redemption));
  assert.equal(failed.state.ownerReads, 1);
  await expectCloseUncertain(failed.controller.close());
});

test('close gates synchronously, shares one native Promise, and covers active lifecycle phases', async t => {
  await t.test('before use and simultaneous callers', async () => {
    const context = fixture();
    const invalid = context.controller.close('unexpected');
    await assert.rejects(invalid, error => error?.code === INVALID_INPUT);
    const first = context.controller.close();
    assert.notStrictEqual(first, invalid);
    assert.strictEqual(context.controller.close(), first);
    assert.equal(Object.getPrototypeOf(first), Promise.prototype);
    await first;
    assert.equal(context.controller.snapshotMetrics().phase, 'CLOSED');
    const input = requestFixture();
    assertUnavailable(await exchange(context.controller, input.request));
    assert.equal(input.state.iteratorAccesses, 0);
  });

  await t.test('during admission', async () => {
    let controller;
    let closePromise;
    const base = makeConfiguration({
      admitRequest: Object.freeze(() => {
        closePromise = controller.close();
        return true;
      }),
    });
    controller = createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress(
      base.configuration,
    );
    assertUnavailable(await exchange(controller, requestFixture().request));
    assert.strictEqual(controller.close(), closePromise);
    await closePromise;
  });

  await t.test('during body', async () => {
    const context = fixture();
    const controlled = controlledRequest({ body: Buffer.from('{', 'utf8') });
    const operation = exchange(context.controller, controlled.request, {
      context: transportContext(controlled.abort),
    });
    await controlled.waiting;
    const closePromise = context.controller.close();
    assert.equal(controlled.state.aborts, 1);
    assertUnavailable(await operation);
    await closePromise;
    assert.equal(context.controller.snapshotMetrics().phase, 'CLOSED');
  });

  await t.test('during response', async () => {
    const context = fixture();
    const input = requestFixture();
    const output = responseFixture('manual');
    const abort = Object.freeze(() => {
      output.response.destroyed = true;
      output.response.emit('close');
    });
    const operation = context.controller.handle(
      input.request,
      output.response,
      transportContext(abort),
    );
    await output.endObserved;
    assert.equal(output.state.endCalls, 1);
    const closePromise = context.controller.close();
    assert.equal(await operation, undefined);
    await closePromise;
    assert.equal(context.controller.snapshotMetrics().responsesFailed, 1);
  });
});

test('close grace produces one fixed terminal uncertainty when abort cannot end admitted work', async () => {
  const context = fixture();
  const controlled = controlledRequest({ body: Buffer.from('{', 'utf8'), stallAbort: true });
  void context.controller.handle(
    controlled.request,
    responseFixture().response,
    transportContext(controlled.abort),
  );
  await controlled.waiting;
  const closePromise = context.controller.close();
  assert.strictEqual(context.controller.close(), closePromise);
  assert.equal(controlled.state.aborts, 1);
  assert.equal(context.runtime.activeCount(CLOSE_GRACE_MS), 1);
  context.runtime.fire(CLOSE_GRACE_MS);
  await expectCloseUncertain(closePromise);
  assert.strictEqual(context.controller.close(), closePromise);
  assert.equal(context.controller.snapshotMetrics().phase, 'CLOSE_UNCERTAIN');
  assert.equal(context.controller.snapshotMetrics().closeUncertain, 1);
});

test('event sink receives only fixed enums and metrics stay frozen and aggregate-only', async () => {
  const events = [];
  let thenReads = 0;
  let constructorReads = 0;
  const sinkResult = {};
  Object.defineProperty(sinkResult, 'then', {
    get() { thenReads += 1; throw new Error('SYNTHETIC_THENABLE_READ'); },
  });
  const nativeSinkResult = Promise.resolve();
  Object.defineProperty(nativeSinkResult, 'constructor', {
    configurable: true,
    get() {
      constructorReads += 1;
      throw new Error('SYNTHETIC_CONSTRUCTOR_READ');
    },
  });
  let sinkCalls = 0;
  const eventSink = Object.freeze(function eventSink(event, ...extra) {
    assert.equal(this, undefined);
    assert.equal(extra.length, 0);
    assert.equal(typeof event, 'string');
    assert.equal(EVENT_ENUMS.includes(event), true);
    events.push(event);
    sinkCalls += 1;
    return sinkCalls % 2 === 0 ? sinkResult : nativeSinkResult;
  });
  const context = fixture({ eventSink });
  assertSuccess(await exchange(context.controller, requestFixture().request));
  await context.controller.close();
  assert.equal(thenReads, 0);
  assert.equal(constructorReads, 0);
  assert.equal(context.controller.snapshotMetrics().phase, 'CLOSED');
  assert.deepEqual(events, [
    'REQUEST_ADMITTED', 'RESPONSE_FINISHED', 'CLOSE_STARTED', 'CLOSE_CLEAN',
  ]);
  const metrics = context.controller.snapshotMetrics();
  assert.equal(Object.isFrozen(metrics), true);
  assert.deepEqual(Reflect.ownKeys(metrics), [
    'phase',
    'requests',
    'requestsRejected',
    'requestsAdmitted',
    'bodyAborted',
    'responsesAttempted',
    'responsesFinished',
    'responsesFailed',
    'telemetryFailures',
    'closeStarted',
    'closeClean',
    'closeUncertain',
  ]);
  for (const [key, value] of Object.entries(metrics)) {
    if (key === 'phase') assert.equal(typeof value, 'string');
    else assert.equal(Number.isSafeInteger(value) && value >= 0, true);
  }
  for (const forbidden of [
    'peerToken', 'peer', 'header', 'body', 'method', 'target', 'origin', 'sni',
    'certificate', 'capability', 'grantId', 'requestId', 'timestamp', 'error',
  ]) assert.equal(Object.hasOwn(metrics, forbidden), false);
});

test('sink throws are swallowed and counter saturation gates future work fail-closed', async () => {
  const throwing = fixture({
    eventSink: Object.freeze(() => { throw new Error('SYNTHETIC_SINK_FAILURE'); }),
  });
  assertSuccess(await exchange(throwing.controller, requestFixture().request));
  assert.equal(throwing.controller.snapshotMetrics().telemetryFailures, 2);
  await throwing.controller.close();

  const saturated = fixture({ metricsCounterLimit: 2 });
  for (let index = 0; index < 2; index += 1) {
    assertUnavailable(await exchange(
      saturated.controller,
      requestFixture({ httpVersion: '1.0' }).request,
    ));
  }
  const third = requestFixture({ httpVersion: '1.0' });
  assertUnavailable(await exchange(saturated.controller, third.request));
  assert.equal(third.state.iteratorAccesses, 0);
  const metrics = saturated.controller.snapshotMetrics();
  assert.equal(metrics.requests, 2);
  assert.equal(metrics.phase, 'QUARANTINED');
  await expectCloseUncertain(saturated.controller.close());
});

test('configuration and invocation values are captured once with no completed retention', async () => {
  const admissions = [];
  const context = makeConfiguration({
    admitRequest: Object.freeze(value => { admissions.push(value); return true; }),
  });
  const originalRuntime = context.configuration.deadlineRuntime;
  const controller = createServiceCreditExternalHolderGrantDescriptorHandoffHttpIngress(
    context.configuration,
  );
  context.configuration.admitRequest = () => false;
  context.configuration.challengeRequestTarget = '/changed';
  context.configuration.deadlineRuntime = Object.freeze({
    schedule: () => { throw new Error('SYNTHETIC_MUTATED_RUNTIME'); },
    cancel: () => undefined,
  });
  const input = requestFixture();
  const output = responseFixture();
  const peerToken = Symbol('captured-peer');
  assert.equal(await controller.handle(
    input.request,
    output.response,
    transportContext(undefined, peerToken),
  ), undefined);
  assert.equal(admissions.length, 1);
  assert.equal(admissions[0].peerToken, peerToken);
  assert.equal(context.configuration.deadlineRuntime === originalRuntime, false);
  assert.equal(context.runtime.activeCount(), 0);
  assert.equal(input.request.listenerCount('end'), 0);
  assert.equal(input.request.listenerCount('aborted'), 0);
  assert.equal(input.request.listenerCount('error'), 0);
  assert.equal(output.response.listenerCount('finish'), 0);
  assert.equal(output.response.listenerCount('close'), 0);
  assert.equal(output.response.listenerCount('error'), 0);
  const metrics = controller.snapshotMetrics();
  assert.equal(Object.values(metrics).includes(peerToken), false);
  await controller.close();
});

test('real adapter and handoff success, expiry, replay, and selection mismatch remain intact', async t => {
  await t.test('success and replay', async () => {
    const context = fixture();
    const challenge = await issueChallenge(context);
    assert.equal(
      challenge.handoffVersion,
      SERVICE_CREDIT_EXTERNAL_HOLDER_GRANT_DESCRIPTOR_HANDOFF_VERSION,
    );
    const redemption = signedRedemption(challenge, context);
    const first = await redeem(context, redemption);
    assertSuccess(first);
    assert.deepEqual(JSON.parse(first.state.body.toString('utf8')), context.descriptor);
    assertUnavailable(await redeem(context, redemption));
    assert.equal(context.state.ownerReads, 1);
    await context.controller.close();
  });

  await t.test('expiry', async () => {
    const context = fixture();
    const challenge = await issueChallenge(context);
    const redemption = signedRedemption(challenge, context);
    context.state.now = challenge.expiresAtMs;
    assertUnavailable(await redeem(context, redemption));
    assertUnavailable(await redeem(context, redemption));
    assert.equal(context.state.ownerReads, 0);
    await context.controller.close();
  });

  await t.test('signed selection mismatch', async () => {
    const context = fixture();
    const challenge = await issueChallenge(context);
    const wrongSelection = Object.freeze({
      ...context.selection,
      holderId: 'holder.external.other',
    });
    assertUnavailable(await redeem(context, signedRedemption(challenge, context, {
      selection: wrongSelection,
    })));
    assert.equal(context.state.ownerReads, 0);
    await context.controller.close();
  });

  await t.test('privileged descriptor mismatch', async () => {
    const context = fixture({
      descriptor: Object.freeze({
        grantId: 'grant.external-holder.other',
        capabilityCommitment: `sha256:${'0'.repeat(64)}`,
      }),
    });
    const challenge = await issueChallenge(context);
    assertUnavailable(await redeem(context, signedRedemption(challenge, context)));
    assert.equal(context.state.ownerReads, 1);
    await context.controller.close();
  });
});

test(`${ORDERING_CASES} distinct deterministic ingress event permutations settle exactly`, async () => {
  const requestOrderings = Object.freeze([
    Object.freeze(['body-complete', 'body-deadline', 'close']),
    Object.freeze(['body-complete', 'close', 'body-deadline']),
    Object.freeze(['body-deadline', 'body-complete', 'close']),
    Object.freeze(['body-deadline', 'close', 'body-complete']),
    Object.freeze(['close', 'body-complete', 'body-deadline']),
    Object.freeze(['close', 'body-deadline', 'body-complete']),
  ]);
  const adapterTimings = Object.freeze(['eager-turns', 'deferred-turn']);
  const responseOrderings = Object.freeze([
    'finish-before-deadline',
    'close-before-deadline',
    'error-before-deadline',
    'deadline-before-finish',
  ]);
  const closeSchedules = Object.freeze(['synchronous', 'normal', 'failing']);
  const matrix = [];
  for (const requestOrdering of requestOrderings) {
    for (const adapterTiming of adapterTimings) {
      for (const responseOrdering of responseOrderings) {
        for (const closeSchedule of closeSchedules) {
          matrix.push(Object.freeze({
            requestOrdering,
            adapterTiming,
            responseOrdering,
            closeSchedule,
          }));
        }
      }
    }
  }
  assert.equal(matrix.length, ORDERING_CASES);
  assert.equal(new Set(matrix.map(entry => JSON.stringify(entry))).size, ORDERING_CASES);

  const executedTraces = new Set();
  for (const entry of matrix) {
    const trace = [];
    const events = [];
    const runtime = deterministicRuntime({
      failingSchedule: Object.freeze(milliseconds => (
        milliseconds === CLOSE_GRACE_MS && entry.closeSchedule === 'failing'
      )),
      synchronousSchedule: Object.freeze(milliseconds => (
        milliseconds === CLOSE_GRACE_MS && entry.closeSchedule === 'synchronous'
      )),
      onSchedule: Object.freeze(milliseconds => {
        if (milliseconds === CLOSE_GRACE_MS) {
          trace.push(`close-schedule:${entry.closeSchedule}`);
        }
      }),
    });
    const context = fixture({
      runtime,
      eventSink: Object.freeze(event => { events.push(event); }),
      ownerHook: Object.freeze(() => { trace.push('owner-read'); }),
    });
    const challenge = await issueChallenge(context);
    const baselineMetrics = context.controller.snapshotMetrics();
    const baselineAdmissions = context.state.admissions.length;
    const baselineOwnerReads = context.state.ownerReads;
    const baselineEventCount = events.length;
    const redemption = signedRedemption(challenge, context);
    const body = Buffer.from(canonicalJson(redemption), 'utf8');
    const controlled = controlledRequest({ body });
    const output = responseFixture('manual');
    const operation = context.controller.handle(
      controlled.request,
      output.response,
      transportContext(controlled.abort),
    );
    await controlled.waiting;

    const queued = requestFixture();
    assertUnavailable(await exchange(context.controller, queued.request));
    assert.equal(queued.state.iteratorAccesses, 0);
    assert.equal(context.state.admissions.length, baselineAdmissions + 1);

    let closePromise = null;
    let closeOutcome = null;
    for (const action of entry.requestOrdering) {
      trace.push(`request:${action}`);
      if (action === 'body-complete') controlled.finish();
      else if (action === 'body-deadline') runtime.fireIfActive(BODY_DEADLINE_MS);
      else {
        closePromise = context.controller.close();
        assert.strictEqual(context.controller.close(), closePromise);
        closeOutcome = closePromise.then(
          () => 'CLEAN',
          () => 'UNCERTAIN',
        );
      }
      if (entry.adapterTiming === 'eager-turns') {
        trace.push('adapter-turn:eager');
        await eventLoopTurn();
      }
    }
    if (entry.adapterTiming === 'deferred-turn') {
      trace.push('adapter-turn:deferred');
      await eventLoopTurn();
    }
    await eventLoopTurn();
    assert.equal(output.state.endCalls, 1);

    trace.push(`response:${entry.responseOrdering}`);
    if (entry.responseOrdering === 'deadline-before-finish') {
      assert.equal(runtime.fireIfActive(RESPONSE_DEADLINE_MS), true);
      output.response.writableFinished = true;
      output.response.emit('finish');
    } else {
      if (entry.responseOrdering === 'finish-before-deadline') {
        output.response.writableFinished = true;
        output.response.emit('finish');
      } else if (entry.responseOrdering === 'close-before-deadline') {
        output.response.destroyed = true;
        output.response.emit('close');
      } else {
        output.response.emit('error', new Error('SYNTHETIC_RESPONSE_FAILURE'));
      }
      assert.equal(runtime.fireIfActive(RESPONSE_DEADLINE_MS), false);
    }

    assert.equal(await operation, undefined);
    await eventLoopTurn();
    const expectedOutcome = entry.closeSchedule === 'normal'
      && entry.responseOrdering !== 'deadline-before-finish'
      ? 'CLEAN'
      : 'UNCERTAIN';
    assert.equal(await closeOutcome, expectedOutcome);
    if (expectedOutcome === 'CLEAN') await closePromise;
    else await expectCloseUncertain(closePromise);

    const bodyCompletionIndex = entry.requestOrdering.indexOf('body-complete');
    const firstAbortIndex = Math.min(
      entry.requestOrdering.indexOf('body-deadline'),
      entry.requestOrdering.indexOf('close'),
    );
    const expectedOwnerReads = entry.adapterTiming === 'eager-turns'
      && bodyCompletionIndex < firstAbortIndex
      ? 1
      : 0;
    const metrics = context.controller.snapshotMetrics();
    assert.equal(context.state.ownerReads - baselineOwnerReads, expectedOwnerReads);
    assert.equal(context.state.admissions.length, baselineAdmissions + 1);
    assert.equal(metrics.bodyAborted - baselineMetrics.bodyAborted, 1);
    assert.equal(
      metrics.responsesFinished - baselineMetrics.responsesFinished,
      1 + (entry.responseOrdering === 'finish-before-deadline' ? 1 : 0),
    );
    assert.equal(
      metrics.responsesFailed - baselineMetrics.responsesFailed,
      entry.responseOrdering === 'finish-before-deadline' ? 0 : 1,
    );
    assert.equal(metrics.closeClean, expectedOutcome === 'CLEAN' ? 1 : 0);
    assert.equal(metrics.closeUncertain, expectedOutcome === 'UNCERTAIN' ? 1 : 0);
    const caseEvents = events.slice(baselineEventCount);
    assert.equal(caseEvents.filter(event => event === 'BODY_ABORTED').length, 1);
    assert.equal(caseEvents.filter(event => event === 'CLOSE_STARTED').length, 1);
    assert.deepEqual(
      caseEvents.filter(event => event === 'CLOSE_CLEAN' || event === 'CLOSE_UNCERTAIN'),
      [expectedOutcome === 'CLEAN' ? 'CLOSE_CLEAN' : 'CLOSE_UNCERTAIN'],
    );
    assert.equal(runtime.activeCount(), 0);
    executedTraces.add(trace.join('|'));
  }
  assert.equal(executedTraces.size, ORDERING_CASES);
});
