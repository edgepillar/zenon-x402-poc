import test from 'node:test';
import {
  equal as q, deepEqual as same, notEqual as ne,
  rejects, throws, ok,
} from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { types as utilTypes } from 'node:util';

const selector = process.argv[2] ?? 'all';
if (process.argv.length > 3
  || !['all','1','2','3','4','5','6','7'].includes(selector)
) throw new Error('INVALID_SCENARIO_SELECTOR');

const specs = [
  [new URL('../src/service-credit-durable-session-close.js', import.meta.url),
    2470, '5aae36a7da39ce5b7b9a8da8e9fbda88465cb1e4853dc791520a1df0ab87ede7'],
  [new URL('../src/service-credit-durable-http-session.js', import.meta.url),
    13596, '1108d78981dddd3bfeba79d5fc235ff57f87ad8e72eb73681b3d274c9b36d1de'],
];
const pins = Object.freeze(specs.map(([url, bytes, sha]) => {
  const raw = readFileSync(url);
  q(raw.length, bytes);
  q(createHash('sha256').update(raw).digest('hex'), sha);
  const text = raw.toString('utf8');
  q(/[^\x00-\x7f]/.test(text), false);
  q(Buffer.byteLength(text, 'utf8'), bytes);
  ok(text.endsWith('\n'));
  return Object.freeze({ url: url.href, text });
}));

// Parent source is DATA ONLY; never import its SQL/owner graph.
const parent = pins[1].text;
q(parent.split("} from './service-credit-durable-session-close.js';\n").length, 2);
q(parent.split(
  'const CREATE_DURABLE_SESSION_CLOSE = createServiceCreditDurableSessionClose;\n',
).length, 2);
const wiring = `  const close = OBJECT_FREEZE(REFLECT_APPLY(
    CREATE_DURABLE_SESSION_CLOSE,
    undefined,
    [{
      ownerClose,
      REFLECT_APPLY,
      GET_OWN_PROPERTY_DESCRIPTOR,
      IS_PROXY,
      PROMISE_THEN,
      nativePromiseCapability,
      nativeRejected,
      failure,
      INVALID_INPUT,
      CLOSE_FAILED,
      closeAdmission: () => { admissionClosed = true; },
    }],
  ));
`;
q(parent.split(wiring).length, 2);
for (const absent of [
  '  let pendingCloses = null;',
  '  let completedClose = null;',
  '  let completedOwnerClose = null;',
  '  function findPendingClose(',
  '  function removePendingClose(',
  '  const close = OBJECT_FREEZE((...args) => {',
]) q(parent.includes(absent), false);
q(parent.split('  let admissionClosed = false;\n').length, 2);
q(parent.split('!admissionClosed').length, 3);
q(parent.split('  return OBJECT_FREEZE({ handle, close });\n').length, 2);
q(/^\s*import\b/m.test(pins[0].text), false);

const NATIVE_PROMISE = Promise;
const PROMISE_THEN = NATIVE_PROMISE.prototype.then;
const REFLECT_APPLY = Reflect.apply;
const GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const IS_PROXY = utilTypes.isProxy;
const TYPE_ERROR = TypeError;
const OBJECT_FREEZE = Object.freeze;
const INVALID_INPUT = 'SERVICE_CREDIT_DURABLE_HTTP_SESSION_INVALID_INPUT';
const CLOSE_FAILED = 'SERVICE_CREDIT_DURABLE_HTTP_SESSION_CLOSE_FAILED';

const { createServiceCreditDurableSessionClose } = await import(pins[0].url);

function failure(code) {
  const error = new TYPE_ERROR(code);
  Object.defineProperty(error, 'stack', {
    value: 'TypeError: ' + code,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return OBJECT_FREEZE(error);
}
const isFailure = code => error =>
  error instanceof TYPE_ERROR
  && error.name === 'TypeError'
  && error.message === code
  && error.stack === 'TypeError: ' + code
  && Object.isFrozen(error);

function fixture(t) {
  const capabilities = [], sinks = [], log = [];
  const state = { calls: 0, assignments: 0, closed: false, wrappers: 0 };
  let action = () => { throw new Error('UNCONFIGURED_OWNER'); };

  function cap() {
    let resolve, reject;
    const promise = new NATIVE_PROMISE((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const capability = OBJECT_FREEZE({ promise, resolve, reject });
    capabilities.push(capability);
    sinks.push(REFLECT_APPLY(PROMISE_THEN, promise, [
      () => undefined, () => undefined,
    ]));
    return capability;
  }
  function nativePromiseCapability() {
    state.wrappers++;
    return cap();
  }
  function nativeRejected(error) {
    const capability = nativePromiseCapability();
    capability.reject(error);
    return capability.promise;
  }
  function ownerClose(...args) {
    q(this, undefined);
    q(args.length, 0);
    state.calls++;
    log.push('owner');
    return action();
  }
  const rawClose = createServiceCreditDurableSessionClose({
    ownerClose,
    REFLECT_APPLY,
    GET_OWN_PROPERTY_DESCRIPTOR,
    IS_PROXY,
    PROMISE_THEN,
    nativePromiseCapability,
    nativeRejected,
    failure,
    INVALID_INPUT,
    CLOSE_FAILED,
    closeAdmission() {
      state.assignments++;
      state.closed = true;
      log.push('admission');
    },
  });
  const close = OBJECT_FREEZE(rawClose);

  function observe(promise, yes, no) {
    const result = REFLECT_APPLY(PROMISE_THEN, promise, [yes, no]);
    sinks.push(REFLECT_APPLY(PROMISE_THEN, result, [
      () => undefined, () => undefined,
    ]));
    return result;
  }

  // Fixture settlement only; this is not resource or store cleanup evidence.
  t.after(async () => {
    for (const capability of capabilities) capability.resolve(undefined);
    await NATIVE_PROMISE.all(sinks);
  });
  return {
    rawClose, close, cap, state, log, observe,
    setOwner(callback) { action = callback; },
  };
}

const scenarios = [
  ['factory is inert and preserves anonymous rest-arrow rejection surface', async t => {
    const f = fixture(t);
    same(f.state, { calls: 0, assignments: 0, closed: false, wrappers: 0 });
    same(f.log, []);
    q(f.rawClose, f.close);
    q(typeof f.close, 'function');
    q(f.close.name, '');
    q(f.close.length, 0);
    q(Object.hasOwn(f.close, 'prototype'), false);
    q(Object.getPrototypeOf(f.close), Function.prototype);
    ok(Object.isFrozen(f.close));
    same(Object.getOwnPropertyDescriptor(f.close, 'name'), {
      value: '', writable: false, enumerable: false, configurable: false,
    });
    same(Object.getOwnPropertyDescriptor(f.close, 'length'), {
      value: 0, writable: false, enumerable: false, configurable: false,
    });
    throws(() => new f.close(), TYPE_ERROR);
    q(f.state.calls, 0);
    const denied = [];
    for (const args of [[undefined], [null], [1], [undefined, undefined]]) {
      const promise = f.close(...args);
      for (const previous of denied) ne(promise, previous);
      denied.push(promise);
      await rejects(promise, isFailure(INVALID_INPUT));
      q(f.state.calls, 0);
      q(f.state.assignments, 0);
      q(f.state.closed, false);
      same(f.log, []);
    }
    q(f.state.wrappers, denied.length);
  }],
  ['owner calls precede pending and completed identity reuse', async t => {
    const f = fixture(t), drain = f.cap();
    f.setOwner(() => drain.promise);
    const first = f.close(), second = f.close();
    ne(first, drain.promise);
    q(second, first);
    q(f.state.calls, 2);
    q(f.state.wrappers, 1);
    q(f.state.assignments, 0);
    q(f.state.closed, false);
    same(f.log, ['owner', 'owner']);
    let settled = false;
    const observed = f.observe(first,
      () => { settled = true; }, () => { settled = true; });
    await NATIVE_PROMISE.resolve();
    q(settled, false);
    q(f.state.closed, false);
    drain.resolve(OBJECT_FREEZE({ declared: 'drained' }));
    q(await first, undefined);
    await observed;
    q(settled, true);
    q(f.state.closed, true);
    q(f.state.assignments, 1);
    same(f.log, ['owner', 'owner', 'admission']);
    const completed = f.close();
    q(completed, first);
    q(await completed, undefined);
    q(f.state.calls, 3);
    q(f.state.wrappers, 1);
    q(f.state.assignments, 1);
    same(f.log, ['owner', 'owner', 'admission', 'owner']);
  }],
  ['throws and native brand failures do not close admission', async t => {
    const f = fixture(t);
    for (const value of [new Error('DECLARED_OWNER_THROW'), undefined, null]) {
      const calls = f.state.calls, wrappers = f.state.wrappers;
      f.setOwner(() => { throw value; });
      await rejects(f.close(), isFailure(CLOSE_FAILED));
      q(f.state.calls, calls + 1);
      q(f.state.wrappers, wrappers + 1);
      q(f.state.assignments, 0);
      q(f.state.closed, false);
    }
    let touches = 0;
    const trap = () => { touches++; throw new Error('UNREACHED_THEN_OR_PROXY'); };
    const plain = {};
    Object.defineProperty(plain, 'then', { get: trap });
    const fake = Object.create(NATIVE_PROMISE.prototype);
    Object.defineProperty(fake, 'then', { get: trap });
    const target = f.cap();
    const traps = { get: trap, getPrototypeOf: trap, ownKeys: trap };
    const variants = [
      undefined, null, 0, false, 'plain', 1n, Symbol('declared'), {},
      plain, fake, new Proxy({}, traps), new Proxy(target.promise, traps),
    ];
    for (const value of variants) {
      const calls = f.state.calls, wrappers = f.state.wrappers;
      f.setOwner(() => value);
      const first = f.close(), second = f.close();
      ne(first, second);
      await rejects(first, isFailure(CLOSE_FAILED));
      await rejects(second, isFailure(CLOSE_FAILED));
      q(f.state.calls, calls + 2);
      q(f.state.wrappers, wrappers + 2);
      q(f.state.assignments, 0);
      q(f.state.closed, false);
      q(touches, 0);
    }
    const drain = f.cap();
    f.setOwner(() => drain.promise);
    const success = f.close();
    ne(success, drain.promise);
    q(f.state.closed, false);
    drain.resolve('declared success');
    q(await success, undefined);
    q(f.state.closed, true);
    q(f.state.assignments, 1);
    q(touches, 0);
  }],
  ['native rejection stays retryable without reopening closed admission', async t => {
    const f = fixture(t), rejectedOwner = f.cap();
    f.setOwner(() => rejectedOwner.promise);
    const first = f.close();
    q(f.close(), first);
    q(f.state.calls, 2);
    rejectedOwner.reject(new Error('DECLARED_OWNER_REJECTION'));
    await rejects(first, isFailure(CLOSE_FAILED));
    q(f.state.closed, false);
    q(f.state.assignments, 0);
    const retry = f.close();
    ne(retry, first);
    await rejects(retry, isFailure(CLOSE_FAILED));
    q(f.state.closed, false);
    q(f.state.assignments, 0);

    const good = f.cap();
    f.setOwner(() => good.promise);
    const success = f.close();
    good.resolve('declared success');
    q(await success, undefined);
    q(f.state.closed, true);
    q(f.state.assignments, 1);

    const later = f.cap();
    f.setOwner(() => later.promise);
    const failed = f.close();
    q(f.close(), failed);
    q(f.state.closed, true);
    later.reject(new Error('DECLARED_LATER_REJECTION'));
    await rejects(failed, isFailure(CLOSE_FAILED));
    q(f.state.closed, true);
    q(f.state.assignments, 1);
    const failedAgain = f.close();
    ne(failedAgain, failed);
    await rejects(failedAgain, isFailure(CLOSE_FAILED));
    q(f.state.closed, true);
    q(f.state.assignments, 1);
    f.setOwner(() => { throw new Error('DECLARED_LATER_THROW'); });
    await rejects(f.close(), isFailure(CLOSE_FAILED));
    q(f.state.closed, true);
    q(f.state.assignments, 1);
    f.setOwner(() => good.promise);
    const calls = f.state.calls;
    q(f.close(), success);
    q(f.state.calls, calls + 1);
    q(f.state.assignments, 1);
  }],
  ['interleaved pending records survive head and non-head removal', async t => {
    for (const [head, rejected] of [
      [true, true], [false, true], [true, false], [false, false],
    ]) {
      const f = fixture(t), a = f.cap(), b = f.cap(), c = f.cap();
      f.setOwner(() => a.promise);
      const pa = f.close();
      f.setOwner(() => b.promise);
      const pb = f.close();
      f.setOwner(() => c.promise);
      const pc = f.close();
      ne(pa, a.promise);
      ne(pb, b.promise);
      ne(pc, c.promise);
      ne(pa, pb);
      ne(pa, pc);
      ne(pb, pc);
      q(f.state.calls, 3);
      q(f.state.wrappers, 3);
      q(f.state.closed, false);
      q(f.state.assignments, 0);

      const target = head ? c : b, targetP = head ? pc : pb;
      const other = head ? b : c, otherP = head ? pb : pc;
      let settled = 0;
      const mark = () => { settled++; };
      const seenOther = f.observe(otherP, mark, mark);
      const seenTail = f.observe(pa, mark, mark);
      if (rejected) {
        target.reject(new Error('DECLARED_INTERLEAVED_REJECTION'));
        await rejects(targetP, isFailure(CLOSE_FAILED));
      } else {
        target.resolve('declared target');
        q(await targetP, undefined);
      }
      await NATIVE_PROMISE.resolve();
      q(settled, 0);
      q(f.state.closed, !rejected);
      q(f.state.assignments, rejected ? 0 : 1);

      f.setOwner(() => target.promise);
      if (rejected) {
        const retry = f.close();
        ne(retry, targetP);
        await rejects(retry, isFailure(CLOSE_FAILED));
      } else {
        q(f.close(), targetP);
      }
      f.setOwner(() => other.promise);
      q(f.close(), otherP);
      f.setOwner(() => a.promise);
      q(f.close(), pa);
      q(f.state.wrappers, rejected ? 4 : 3);
      q(settled, 0);

      other.resolve('declared other');
      q(await otherP, undefined);
      await seenOther;
      q(settled, 1);
      f.setOwner(() => a.promise);
      q(f.close(), pa);
      a.resolve('declared tail');
      q(await pa, undefined);
      await seenTail;
      q(settled, 2);
      q(f.state.assignments, rejected ? 2 : 3);
      q(f.state.closed, true);
      q(f.state.wrappers, rejected ? 4 : 3);
    }
  }],
  ['completion reuse follows only the last successful owner result', async t => {
    const f = fixture(t), a = f.cap(), b = f.cap();
    f.setOwner(() => a.promise);
    const a1 = f.close();
    a.resolve('declared A');
    q(await a1, undefined);
    q(f.state.assignments, 1);
    q(f.close(), a1);

    f.setOwner(() => b.promise);
    const b1 = f.close();
    ne(b1, a1);
    b.resolve('declared B');
    q(await b1, undefined);
    q(f.state.assignments, 2);
    q(f.close(), b1);

    f.setOwner(() => a.promise);
    const a2 = f.close();
    ne(a2, a1);
    ne(a2, b1);
    q(f.state.assignments, 2);
    q(f.close(), a2);
    q(await a2, undefined);
    q(f.state.assignments, 3);
    q(f.close(), a2);

    f.setOwner(() => b.promise);
    const b2 = f.close();
    ne(b2, b1);
    ne(b2, a2);
    q(f.state.assignments, 3);
    q(f.close(), b2);
    q(await b2, undefined);
    q(f.state.assignments, 4);
    q(f.state.closed, true);

    f.setOwner(() => { throw new Error('DECLARED_AFTER_SUCCESS_THROW'); });
    const thrown = f.close();
    ne(thrown, b2);
    await rejects(thrown, isFailure(CLOSE_FAILED));
    q(f.state.closed, true);
    q(f.state.assignments, 4);

    f.setOwner(() => ({}));
    const invalid = f.close();
    ne(invalid, b2);
    await rejects(invalid, isFailure(CLOSE_FAILED));
    q(f.state.closed, true);
    q(f.state.assignments, 4);

    const bad = f.cap();
    f.setOwner(() => bad.promise);
    const failed = f.close();
    ne(failed, b2);
    bad.reject(new Error('DECLARED_AFTER_SUCCESS_REJECTION'));
    await rejects(failed, isFailure(CLOSE_FAILED));
    q(f.state.closed, true);
    q(f.state.assignments, 4);

    f.setOwner(() => b.promise);
    const calls = f.state.calls;
    q(f.close(), b2);
    q(f.state.calls, calls + 1);
    q(f.state.wrappers, 7);
    q(f.state.assignments, 4);
  }],
  ['fresh attachment rejects own constructors while identity reuse stays unchanged', async t => {
    for (const kind of ['getter-native', 'data-native', 'data-undefined']) {
      const f = fixture(t), owner = f.cap();
      owner.resolve(undefined);
      await owner.promise;
      let constructorTouches = 0, thenTouches = 0;
      Object.defineProperty(owner.promise, 'constructor', kind === 'getter-native' ? {
        get() { constructorTouches++; return NATIVE_PROMISE; },
        configurable: true,
      } : {
        value: kind === 'data-native' ? NATIVE_PROMISE : undefined,
        enumerable: true, writable: true, configurable: true,
      });
      Object.defineProperty(owner.promise, 'then', {
        get() { thenTouches++; throw new Error('UNREACHED_OWN_THEN'); },
      });
      const descriptor = REFLECT_APPLY(
        GET_OWN_PROPERTY_DESCRIPTOR, undefined, [owner.promise, 'constructor'],
      );
      f.setOwner(() => owner.promise);
      const first = f.close();
      // Old code reaches SpeciesConstructor here. The returning native
      // constructor getter must produce an authored zero-touch assertion red.
      q(constructorTouches, 0, 'own constructor getter must not be evaluated');
      q(thenTouches, 0);
      await rejects(first, isFailure(CLOSE_FAILED));
      q(f.state.closed, false);
      q(f.state.assignments, 0);
      same(REFLECT_APPLY(
        GET_OWN_PROPERTY_DESCRIPTOR, undefined, [owner.promise, 'constructor'],
      ), descriptor);
      const retry = f.close();
      ne(retry, first);
      await rejects(retry, isFailure(CLOSE_FAILED));
      q(f.state.calls, 2);
      q(f.state.wrappers, 2);
      q(f.state.assignments, 0);
      q(f.state.closed, false);
      q(constructorTouches, 0);
      q(thenTouches, 0);

      // Restore only this owned fixture property. Rejected fresh records must
      // have been removed; this is not a production reset or mutation helper.
      q(delete owner.promise.constructor, true);
      const fresh = f.close();
      ne(fresh, first);
      ne(fresh, retry);
      q(f.state.closed, false);
      q(await fresh, undefined);
      q(f.state.closed, true);
      q(f.state.assignments, 1);
      q(f.close(), fresh);
      q(f.state.calls, 4);
      q(f.state.wrappers, 3);
      q(f.state.assignments, 1);
      // The remaining own then getter is bypassed on ordinary native success.
      q(constructorTouches, 0);
      q(thenTouches, 0);
    }

    const pending = fixture(t), owner = pending.cap();
    owner.resolve(undefined);
    await owner.promise;
    pending.setOwner(() => owner.promise);
    const attached = pending.close();
    q(pending.state.closed, false);
    let reuseConstructorTouches = 0, reuseThenTouches = 0;
    Object.defineProperty(owner.promise, 'constructor', {
      get() { reuseConstructorTouches++; return NATIVE_PROMISE; },
    });
    Object.defineProperty(owner.promise, 'then', {
      get() { reuseThenTouches++; throw new Error('UNREACHED_REUSE_THEN'); },
    });
    // Owner is already observed/resolved, but its attached record is pending
    // until the queued fulfillment callback runs. No poisoned owner is awaited.
    q(pending.close(), attached);
    q(pending.state.calls, 2);
    q(pending.state.wrappers, 1);
    q(pending.state.assignments, 0);
    q(reuseConstructorTouches, 0);
    q(reuseThenTouches, 0);
    q(await attached, undefined);
    q(pending.state.closed, true);
    q(pending.state.assignments, 1);
    const completed = pending.close();
    q(completed, attached);
    q(await completed, undefined);
    q(pending.state.calls, 3);
    q(pending.state.wrappers, 1);
    q(pending.state.assignments, 1);
    q(reuseConstructorTouches, 0);
    q(reuseThenTouches, 0);

    const closed = fixture(t), good = closed.cap();
    good.resolve(undefined);
    await good.promise;
    closed.setOwner(() => good.promise);
    const success = closed.close();
    q(await success, undefined);
    let goodTouches = 0;
    Object.defineProperty(good.promise, 'constructor', {
      get() { goodTouches++; return NATIVE_PROMISE; },
    });
    const forbidden = closed.cap();
    forbidden.resolve(undefined);
    await forbidden.promise;
    let forbiddenThenTouches = 0;
    Object.defineProperty(forbidden.promise, 'constructor', {
      value: NATIVE_PROMISE,
    });
    Object.defineProperty(forbidden.promise, 'then', {
      get() { forbiddenThenTouches++; throw new Error('UNREACHED_FORBIDDEN_THEN'); },
    });
    closed.setOwner(() => forbidden.promise);
    const invalid = closed.close();
    ne(invalid, success);
    await rejects(invalid, isFailure(CLOSE_FAILED));
    q(closed.state.closed, true);
    q(closed.state.assignments, 1);
    const invalidAgain = closed.close();
    ne(invalidAgain, invalid);
    await rejects(invalidAgain, isFailure(CLOSE_FAILED));
    q(closed.state.closed, true);
    q(closed.state.assignments, 1);
    closed.setOwner(() => good.promise);
    q(closed.close(), success);
    q(closed.state.calls, 4);
    q(closed.state.wrappers, 3);
    q(closed.state.assignments, 1);
    q(goodTouches, 0);
    q(forbiddenThenTouches, 0);

    const proxied = fixture(t), target = proxied.cap();
    target.resolve(undefined);
    await target.promise;
    let proxyTouches = 0;
    const trap = () => { proxyTouches++; throw new Error('UNREACHED_PROXY_HOOK'); };
    const proxy = new Proxy(target.promise, {
      get: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap,
    });
    proxied.setOwner(() => proxy);
    const first = proxied.close(), second = proxied.close();
    ne(first, second);
    await rejects(first, isFailure(CLOSE_FAILED));
    await rejects(second, isFailure(CLOSE_FAILED));
    q(proxyTouches, 0);
    q(proxied.state.calls, 2);
    q(proxied.state.wrappers, 2);
    q(proxied.state.assignments, 0);
    q(proxied.state.closed, false);
  }],
];

q(scenarios.length, 7);
for (let index = 0; index < scenarios.length; index++) {
  if (selector === 'all' || selector === String(index + 1)) {
    const [name, run] = scenarios[index];
    test(name, { timeout: 5000 }, run);
  }
}
