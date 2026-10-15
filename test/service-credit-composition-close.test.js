import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { types as utilTypes } from 'node:util';
import { AsyncLocalStorage } from 'node:async_hooks';

const { equal: eq, deepEqual: de, notEqual: ne, rejects: rej, ok } = assert;
const selector = process.argv[2] ?? 'all';
if (process.argv.length > 3
  || !['all', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(selector)
) throw new Error('INVALID_SCENARIO_SELECTOR');

const specs = [
  [new URL('../src/service-credit-composition-close.js', import.meta.url),
    4901, 'c2041ab37eee8de1897c11640c41818e690063e8cd2329bfb8318534485a741a'],
  [new URL('../src/service-credit-zenon-durable-http-composition.js', import.meta.url),
    36282, '8d15135baa4a767bcfac395d6ad5fa70da0924dc62599e7f52cb78a4247796e9'],
];
const pins = Object.freeze(specs.map(([url, bytes, sha]) => {
  const text = readFileSync(url, 'utf8');
  eq(/[^\x00-\x7f]/.test(text), false);
  ok(text.endsWith('\n'));
  eq(Buffer.byteLength(text, 'utf8'), bytes);
  eq(createHash('sha256').update(text, 'utf8').digest('hex'), sha);
  return Object.freeze({ url: url.href, text, bytes, sha });
}));

const parent = pins[1].text;
eq(parent.split("} from './service-credit-composition-close.js';\n").length, 2);
eq(parent.split(
  'const CREATE_COMPOSITION_CLOSE = createServiceCreditCompositionClose;\n',
).length, 2);
eq(parent.split('  const { close, finishClose } = REFLECT_APPLY(\n').length, 2);
for (const removed of [
  '  let scopeDisableAttempted = false;',
  '  let scopeDisableReturned = false;',
  '  function closeStores() {',
  '  function finishClose() {',
  '  function close(...args) {',
]) eq(parent.includes(removed), false);
eq(parent.split('    close: OBJECT_FREEZE(close),\n').length, 2);
eq(parent.split(
  '      isNativePromise,\n      REFLECT_APPLY,\n      REFLECT_GET_OWN_PROPERTY_DESCRIPTOR,\n      PROMISE_THEN,\n',
).length, 2);
eq(/^\s*import\b/m.test(pins[0].text), false);

// Parent composition is DATA ONLY; never import its excluded SQL graph.
const { createServiceCreditCompositionClose } = await import(pins[0].url);

const NATIVE_PROMISE = Promise;
const PROMISE_PROTOTYPE = NATIVE_PROMISE.prototype;
const PROMISE_THEN = PROMISE_PROTOTYPE.then;
const REFLECT_APPLY = Reflect.apply;
const REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const GET_PROTOTYPE_OF = Reflect.getPrototypeOf;
const IS_PROXY = utilTypes.isProxy;
const ALS_RUN = AsyncLocalStorage.prototype.run;
const ALS_GET = AsyncLocalStorage.prototype.getStore;
const ALS_DISABLE = AsyncLocalStorage.prototype.disable;

const PHASE = Object.freeze(Object.fromEntries([
  'NEW', 'STARTING', 'ACTIVE', 'CLOSING', 'CLOSED',
  'PRE_ACTIVATION_UNAVAILABLE', 'RECOVERY_REQUIRED', 'ACTIVATED_UNAVAILABLE',
].map(value => [value, value])));
const prefix = 'SERVICE_CREDIT_ZENON_DURABLE_HTTP_COMPOSITION_';
const CODE = Object.freeze({
  invalidInput: prefix + 'INVALID_INPUT',
  closeFailed: prefix + 'CLOSE_FAILED',
  preActivationUnavailable: prefix + 'PRE_ACTIVATION_UNAVAILABLE',
  recoveryRequired: prefix + 'RECOVERY_REQUIRED',
  activatedUnavailable: prefix + 'ACTIVATED_UNAVAILABLE',
});

class DeclaredCompositionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ZenonDurableHttpCompositionError';
    this.code = code;
    this.stack = 'ZenonDurableHttpCompositionError: ' + code;
  }
}
const failure = code => Object.freeze(new DeclaredCompositionError(code));
const hasCode = code => error =>
  error instanceof DeclaredCompositionError
  && error.name === 'ZenonDurableHttpCompositionError'
  && error.message === code
  && error.code === code;
const terminalPhase = code => code === CODE.recoveryRequired
  ? PHASE.RECOVERY_REQUIRED
  : code === CODE.activatedUnavailable
    ? PHASE.ACTIVATED_UNAVAILABLE : PHASE.PRE_ACTIVATION_UNAVAILABLE;

function isNativePromise(value) {
  try {
    return value !== null && typeof value === 'object'
      && !REFLECT_APPLY(IS_PROXY, undefined, [value])
      && REFLECT_APPLY(GET_PROTOTYPE_OF, Reflect, [value]) === PROMISE_PROTOTYPE;
  } catch {
    return false;
  }
}

function fixture(t, initial = {}) {
  const scope = new AsyncLocalStorage();
  const log = [];
  const count = { origin: 0, bound: 0, observer: 0, service: 0, disable: 0, session: 0 };
  const faults = { bound: null, observer: null, service: null, disable: null };
  const capabilities = [], sinks = [];
  const state = {
    phase: PHASE.NEW,
    startFingerprint: null,
    startPromise: null,
    startupPending: false,
    activationCompleted: false,
    terminalCode: null,
    session: null,
    activeGrantBinding: null,
    closePromise: null,
    closeCapability: null,
    callbackActive: false,
    ...initial,
  };
  function nativePromiseCapability() {
    let resolve, reject;
    const promise = new NATIVE_PROMISE((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const capability = Object.freeze({ promise, resolve, reject });
    capabilities.push(capability);
    sinks.push(REFLECT_APPLY(PROMISE_THEN, promise, [
      () => undefined, () => undefined,
    ]));
    return capability;
  }
  function nativeRejected(error) {
    const capability = nativePromiseCapability();
    capability.reject(error);
    return capability.promise;
  }
  function nativeResolved(value) {
    const capability = nativePromiseCapability();
    capability.resolve(value);
    return capability.promise;
  }
  const component = createServiceCreditCompositionClose({
    state, PHASE, CODE, failure, terminalPhase,
    nativePromiseCapability, nativeRejected, nativeResolved, isNativePromise,
    REFLECT_APPLY, REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, PROMISE_THEN,
    originActive() {
      count.origin++;
      return REFLECT_APPLY(ALS_GET, scope, [])?.active === true;
    },
    assertBoundStores(code) {
      count.bound++;
      log.push('bound');
      eq(code, CODE.closeFailed);
      if (faults.bound) throw faults.bound;
    },
    observerClose() {
      count.observer++;
      log.push('observer');
      if (faults.observer) throw faults.observer;
    },
    serviceClose() {
      count.service++;
      log.push('service');
      if (faults.service) throw faults.service;
    },
    scopeDisable() {
      count.disable++;
      log.push('disable');
      if (faults.disable) throw faults.disable;
      REFLECT_APPLY(ALS_DISABLE, scope, []);
    },
  });
  function session(callback) {
    state.session = Object.freeze({
      close(...args) {
        eq(this, undefined);
        eq(args.length, 0);
        count.session++;
        log.push('session');
        return callback();
      },
    });
  }
  // Resolve fixture capabilities; direct ALS cleanup is outside the observed thunk.
  t.after(async () => {
    for (const capability of capabilities) capability.resolve(undefined);
    await NATIVE_PROMISE.all(sinks);
    REFLECT_APPLY(ALS_DISABLE, scope, []);
  });
  return {
    s: state, c: component, scope, log, n: count, x: faults, session,
    cap: nativePromiseCapability, nr: nativeRejected,
  };
}

function disposalCounts(f) {
  return {
    bound: f.n.bound, observer: f.n.observer, service: f.n.service,
    disable: f.n.disable, session: f.n.session,
  };
}

const scenarios = [
  ['close factory is inert and invalid arguments do not drain', async t => {
    const binding = Object.freeze({ declared: 'binding' });
    const f = fixture(t, {
      phase: PHASE.ACTIVE, activeGrantBinding: binding, callbackActive: true,
    });
    de(Object.keys(f.c), ['close', 'finishClose']);
    eq(typeof f.c.close, 'function');
    eq(typeof f.c.finishClose, 'function');
    de(f.log, []);
    de(f.n, {
      origin: 0, bound: 0, observer: 0, service: 0, disable: 0, session: 0,
    });
    await rej(f.c.close(undefined), hasCode(CODE.invalidInput));
    eq(f.s.phase, PHASE.ACTIVE);
    eq(f.s.activeGrantBinding, binding);
    eq(f.s.closePromise, null);
    eq(f.s.closeCapability, null);
    eq(f.s.terminalCode, null);
    eq(f.n.origin, 0);
    de(f.log, []);
  }],
  ['close before startup disposes once and reuses its settled promise', async t => {
    const f = fixture(t);
    const promise = f.c.close();
    eq(isNativePromise(promise), true);
    eq(f.s.phase, PHASE.CLOSED);
    eq(f.s.closeCapability, null);
    eq(f.s.closePromise, promise);
    eq(f.s.activeGrantBinding, null);
    eq(f.c.close(), promise);
    eq(await promise, undefined);
    eq(f.c.close(), promise);
    f.c.finishClose();
    de(f.log, ['bound', 'observer', 'service', 'disable']);
    eq(f.n.observer, 1);
    eq(f.n.service, 1);
    eq(f.n.disable, 1);
    eq(f.s.terminalCode, null);
  }],
  ['native session drain precedes stores and external close calls coalesce', async t => {
    const binding = Object.freeze({ declared: 'active' });
    const f = fixture(t, {
      phase: PHASE.ACTIVE, activationCompleted: true, activeGrantBinding: binding,
    });
    const drain = f.cap();
    const marked = REFLECT_APPLY(PROMISE_THEN, drain.promise, [
      () => { f.log.push('session-settled'); },
    ]);
    f.session(() => drain.promise);
    const promise = f.c.close();
    let settled = false;
    const watched = REFLECT_APPLY(PROMISE_THEN, promise, [
      () => { settled = true; }, () => { settled = true; },
    ]);
    eq(f.c.close(), promise);
    eq(f.s.phase, PHASE.CLOSING);
    eq(f.s.activeGrantBinding, null);
    eq(f.n.session, 1);
    de(f.log, ['session']);
    await NATIVE_PROMISE.resolve();
    eq(settled, false);
    eq(f.n.observer, 0);
    drain.resolve(undefined);
    await promise;
    await marked;
    await watched;
    de(f.log, [
      'session', 'session-settled', 'bound', 'observer', 'service', 'disable',
    ]);
    eq(f.s.phase, PHASE.CLOSED);
    eq(f.c.close(), promise);
  }],
  ['startupPending defers disposal until the same private finish hook', async t => {
    const f = fixture(t, {
      phase: PHASE.STARTING,
      startupPending: true,
      activeGrantBinding: Object.freeze({ declared: 'startup-binding' }),
    });
    const promise = f.c.close();
    eq(f.s.phase, PHASE.CLOSING);
    eq(f.s.activeGrantBinding, null);
    eq(f.c.close(), promise);
    f.c.finishClose();
    de(f.log, []);
    eq(f.s.closePromise, promise);
    ne(f.s.closeCapability, null);
    f.s.startupPending = false;
    f.c.finishClose();
    await promise;
    de(f.log, ['bound', 'observer', 'service', 'disable']);
    eq(f.s.phase, PHASE.CLOSED);
    f.c.finishClose();
    eq(f.n.disable, 1);
  }],
  ['sync and native ALS callback origins cannot await their pending external close', async t => {
    const f = fixture(t, {
      phase: PHASE.ACTIVE,
      activationCompleted: true,
      activeGrantBinding: Object.freeze({ declared: 'active' }),
    });
    const drain = f.cap(), gate = f.cap();
    f.session(() => drain.promise);
    const external = f.c.close();
    f.s.callbackActive = true;
    const origins = f.n.origin;
    const sync = f.c.close();
    ne(sync, external);
    await rej(sync, hasCode(CODE.closeFailed));
    eq(f.n.origin, origins);
    f.s.callbackActive = false;
    eq(f.s.closePromise, external);
    de(f.log, ['session']);

    const marker = { active: true };
    f.s.callbackActive = true;
    const asynchronous = REFLECT_APPLY(ALS_RUN, f.scope, [
      marker,
      async () => {
        await gate.promise;
        eq(f.s.callbackActive, false);
        const ownClose = f.c.close();
        ne(ownClose, external);
        await rej(ownClose, hasCode(CODE.closeFailed));
        eq(f.s.closePromise, external);
        eq(f.s.phase, PHASE.CLOSING);
        eq(f.s.activeGrantBinding, null);
      },
    ]);
    f.s.callbackActive = false;
    gate.resolve(undefined);
    await asynchronous;
    marker.active = false;
    de(f.log, ['session']);
    eq(f.c.close(), external);
    drain.resolve(undefined);
    await external;
    eq(f.s.phase, PHASE.CLOSED);
    eq(f.n.session, 1);
    eq(f.n.disable, 1);
  }],
  ['session failures retain distinct phase and terminalCode behavior without store calls', async t => {
    for (const activationCompleted of [false, true]) {
      for (const kind of ['throw', 'nonpromise', 'fake-shape', 'rejection']) {
        const f = fixture(t, { phase: PHASE.ACTIVE, activationCompleted });
        let touches = 0;
        const fake = Object.create(PROMISE_PROTOTYPE);
        Object.defineProperty(fake, 'then', {
          get() { touches++; throw new Error('UNREACHED_FAKE_THEN'); },
        });
        eq(isNativePromise(fake), true);
        f.session(() => {
          if (kind === 'throw') throw new Error('DECLARED_SESSION_THROW');
          if (kind === 'nonpromise') return { then() { touches++; } };
          if (kind === 'fake-shape') return fake;
          return f.nr(new Error('DECLARED_SESSION_REJECTION'));
        });
        const promise = f.c.close();
        await rej(promise, hasCode(CODE.closeFailed));
        de(f.log, ['session']);
        eq(f.n.bound, 0);
        eq(f.n.observer, 0);
        eq(f.n.service, 0);
        eq(f.n.disable, 0);
        eq(touches, 0);
        eq(f.s.closePromise, promise);
        eq(f.s.closeCapability, null);
        if (kind === 'throw' || kind === 'nonpromise') {
          eq(f.s.terminalCode, null);
          eq(f.s.phase, PHASE.ACTIVATED_UNAVAILABLE);
        } else {
          const code = activationCompleted
            ? CODE.activatedUnavailable : CODE.preActivationUnavailable;
          eq(f.s.terminalCode, code);
          eq(f.s.phase, terminalPhase(code));
        }
        const phase = f.s.phase, terminalCode = f.s.terminalCode;
        const before = disposalCounts(f);
        const cleared = f.cap();
        cleared.resolve(undefined);
        f.session(() => cleared.promise);
        const repeated = f.c.close();
        const repeatedOutcome = await REFLECT_APPLY(PROMISE_THEN, repeated, [
          () => 'FULFILLED', () => 'REJECTED',
        ]);
        de(disposalCounts(f), before, 'failed session close must not drain again');
        eq(repeated, promise);
        eq(f.s.closePromise, promise);
        eq(repeatedOutcome, 'REJECTED');
        await rej(repeated, hasCode(CODE.closeFailed));
        eq(f.c.close(), promise);
        f.c.finishClose();
        de(disposalCounts(f), before);
        de(f.log, ['session']);
        eq(f.s.phase, phase);
        eq(f.s.terminalCode, terminalCode);
        eq(f.s.closeCapability, null);
        eq(touches, 0);
      }
    }
  }],
  ['store and scope failures preserve disposal order and disable-attempt latching', async t => {
    for (const kind of ['observer', 'service', 'both', 'bound']) {
      const f = fixture(t);
      const fault = new Error('DECLARED_DISPOSAL_FAILURE');
      if (kind === 'both') {
        f.x.observer = fault;
        f.x.service = fault;
      } else f.x[kind] = fault;
      const promise = f.c.close();
      await rej(promise, hasCode(CODE.closeFailed));
      de(f.log, kind === 'bound' ? ['bound'] : ['bound', 'observer', 'service']);
      eq(f.n.disable, 0);
      eq(f.s.closeCapability, null);
      eq(f.s.terminalCode, CODE.preActivationUnavailable);
      eq(f.s.phase, PHASE.PRE_ACTIVATION_UNAVAILABLE);
      const before = disposalCounts(f), log = f.log.slice();
      f.x.bound = null;
      f.x.observer = null;
      f.x.service = null;
      f.x.disable = null;
      // The old helper retries these owned callbacks after the fault is gone.
      // Observe either old result before asserting, so expected red is safe.
      const repeated = f.c.close();
      const repeatedOutcome = await REFLECT_APPLY(PROMISE_THEN, repeated, [
        () => 'FULFILLED', () => 'REJECTED',
      ]);
      de(disposalCounts(f), before, 'cached failure must not repeat disposal');
      eq(repeated, promise);
      eq(f.s.closePromise, promise);
      eq(repeatedOutcome, 'REJECTED');
      await rej(repeated, hasCode(CODE.closeFailed));
      eq(f.c.close(), promise);
      f.c.finishClose();
      de(disposalCounts(f), before);
      de(f.log, log);
      eq(f.s.phase, PHASE.PRE_ACTIVATION_UNAVAILABLE);
      eq(f.s.terminalCode, CODE.preActivationUnavailable);
      eq(f.s.closeCapability, null);
    }

    const f = fixture(t);
    f.x.disable = new Error('DECLARED_DISABLE_FAILURE');
    const promise = f.c.close();
    await rej(promise, hasCode(CODE.closeFailed));
    de(f.log, ['bound', 'observer', 'service', 'disable']);
    eq(f.n.disable, 1);
    const before = disposalCounts(f), log = f.log.slice();
    f.x.disable = null;
    const repeated = f.c.close();
    const repeatedOutcome = await REFLECT_APPLY(PROMISE_THEN, repeated, [
      () => 'FULFILLED', () => 'REJECTED',
    ]);
    de(disposalCounts(f), before, 'failed scope close must not repeat disposal');
    eq(repeated, promise);
    eq(f.s.closePromise, promise);
    eq(repeatedOutcome, 'REJECTED');
    await rej(repeated, hasCode(CODE.closeFailed));
    eq(f.c.close(), promise);
    f.c.finishClose();
    de(disposalCounts(f), before);
    de(f.log, log);
    eq(f.n.disable, 1);
    eq(f.n.observer, 1);
    eq(f.n.service, 1);
    eq(f.s.phase, PHASE.PRE_ACTIVATION_UNAVAILABLE);
    eq(f.s.terminalCode, CODE.preActivationUnavailable);
    eq(f.s.closeCapability, null);
  }],
  ['successful disposal preserves recovery and activated-unavailable terminal outcomes', async t => {
    for (const [phase, code] of [
      [PHASE.RECOVERY_REQUIRED, CODE.recoveryRequired],
      [PHASE.ACTIVATED_UNAVAILABLE, CODE.activatedUnavailable],
    ]) {
      const binding = Object.freeze({ declared: 'unavailable' });
      const f = fixture(t, {
        phase, activationCompleted: true, activeGrantBinding: binding,
      });
      const promise = f.c.close();
      await rej(promise, hasCode(code));
      de(f.log, ['bound', 'observer', 'service', 'disable']);
      eq(f.s.phase, phase);
      eq(f.s.terminalCode, code);
      eq(f.s.activationCompleted, true);
      eq(f.s.activeGrantBinding, null);
      eq(f.s.closeCapability, null);
      eq(f.s.closePromise, promise);
      eq(f.c.close(), promise);
      await rej(promise, hasCode(code));
      eq(f.n.observer, 1);
      eq(f.n.service, 1);
      eq(f.n.disable, 1);
    }
  }],
  ['unsafe native promise constructor surfaces fail without hooks or disposal', async t => {
    const ordinary = fixture(t, { phase: PHASE.ACTIVE, activationCompleted: true });
    const ready = ordinary.cap();
    ready.resolve(undefined);
    await ready.promise;
    let ownThenTouches = 0;
    Object.defineProperty(ready.promise, 'then', {
      get() { ownThenTouches++; throw new Error('UNREACHED_NATIVE_THEN'); },
    });
    ordinary.session(() => ready.promise);
    const success = ordinary.c.close();
    await success;
    eq(ownThenTouches, 0);
    eq(ordinary.s.phase, PHASE.CLOSED);
    eq(ordinary.c.close(), success);
    de(ordinary.log, ['session', 'bound', 'observer', 'service', 'disable']);

    for (const kind of ['getter-native', 'data-native', 'data-undefined']) {
      const f = fixture(t, { phase: PHASE.ACTIVE, activationCompleted: true });
      const resolved = f.cap();
      resolved.resolve(undefined);
      // Observe and fulfill before installing constructor surfaces. Cleanup
      // awaits only existing unpoisoned sinks, never this modified promise.
      await resolved.promise;
      let constructorTouches = 0, thenTouches = 0;
      const descriptor = kind === 'getter-native' ? {
        get() { constructorTouches++; return NATIVE_PROMISE; },
        configurable: true,
      } : {
        value: kind === 'data-native' ? NATIVE_PROMISE : undefined,
        enumerable: true,
        writable: true,
        configurable: true,
      };
      Object.defineProperty(resolved.promise, 'constructor', descriptor);
      Object.defineProperty(resolved.promise, 'then', {
        get() { thenTouches++; throw new Error('UNREACHED_OWN_THEN'); },
      });
      const before = REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, undefined,
        [resolved.promise, 'constructor'],
      );
      f.session(() => resolved.promise);
      const promise = f.c.close();
      // With old pins, getter-native reaches SpeciesConstructor and touches
      // the returning getter. This assertion is the intended red control.
      eq(constructorTouches, 0, 'own constructor getter must not be evaluated');
      eq(thenTouches, 0);
      await rej(promise, hasCode(CODE.closeFailed));
      de(f.log, ['session']);
      de(disposalCounts(f), {
        bound: 0, observer: 0, service: 0, disable: 0, session: 1,
      });
      de(REFLECT_APPLY(
        REFLECT_GET_OWN_PROPERTY_DESCRIPTOR, undefined,
        [resolved.promise, 'constructor'],
      ), before);
      eq(f.s.closePromise, promise);
      eq(f.s.closeCapability, null);
      eq(f.s.phase, PHASE.ACTIVATED_UNAVAILABLE);
      eq(f.s.terminalCode, null);
      eq(f.c.close(), promise);
      await rej(promise, hasCode(CODE.closeFailed));
      eq(f.n.session, 1);
      eq(constructorTouches, 0);
      eq(thenTouches, 0);
    }

    const f = fixture(t, { phase: PHASE.ACTIVE, activationCompleted: true });
    const resolved = f.cap();
    resolved.resolve(undefined);
    await resolved.promise;
    let proxyTouches = 0;
    const trap = () => { proxyTouches++; throw new Error('UNREACHED_PROXY_HOOK'); };
    const proxy = new Proxy(resolved.promise, {
      get: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap,
    });
    f.session(() => proxy);
    const promise = f.c.close();
    await rej(promise, hasCode(CODE.closeFailed));
    eq(proxyTouches, 0);
    de(f.log, ['session']);
    de(disposalCounts(f), {
      bound: 0, observer: 0, service: 0, disable: 0, session: 1,
    });
    eq(f.s.closePromise, promise);
    eq(f.c.close(), promise);
    eq(proxyTouches, 0);
  }],
];

eq(scenarios.length, 9);
for (let index = 0; index < scenarios.length; index++) {
  if (selector === 'all' || selector === String(index + 1)) {
    const [name, run] = scenarios[index];
    test(name, { timeout: 5000 }, run);
  }
}
