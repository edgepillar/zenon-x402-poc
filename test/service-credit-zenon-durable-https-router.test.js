import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createServiceCreditZenonDurableHttpsRouter,
} from '../src/service-credit-zenon-durable-https-router.js';

const NATIVE_OBJECT = Object;
const OBJECT_DEFINE_PROPERTY = NATIVE_OBJECT.defineProperty;
const OBJECT_FREEZE = NATIVE_OBJECT.freeze;
const NATIVE_PROMISE = Promise;
const PROMISE_RESOLVE = NATIVE_PROMISE.resolve.bind(NATIVE_PROMISE);
const PROMISE_REJECT = NATIVE_PROMISE.reject.bind(NATIVE_PROMISE);
const ORIGINAL_PROMISE_THEN = NATIVE_PROMISE.prototype.then;
const NATIVE_REFLECT = Reflect;

const SERVICE_TARGET = '/service-credit/execute';
const HANDOFF_CHALLENGE_TARGET = '/service-credit/handoff/challenge';
const HANDOFF_REDEMPTION_TARGET = '/service-credit/handoff/redeem';
const PAYMENT_REQUIRED_HEADER = 'payment-required';

function deferred() {
  let resolve;
  let reject;
  const promise = new NATIVE_PROMISE((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function completionLog(hooks = {}) {
  const events = [];
  const success = OBJECT_FREEZE(() => {
    events.push('success');
    hooks.success?.();
  });
  const failure = OBJECT_FREEZE(() => {
    events.push('failure');
    hooks.failure?.();
  });
  return { capability: OBJECT_FREEZE({ success, failure }), events };
}

function responseDouble(hooks = {}) {
  const headers = NATIVE_OBJECT.create(null);
  const response = {
    statusCode: 0,
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    body: Buffer.alloc(0),
    writeHead(statusCode, values = undefined) {
      hooks.writeHead?.(statusCode, values);
      this.statusCode = statusCode;
      this.headersSent = true;
      if (values !== undefined) {
        for (const [name, value] of NATIVE_OBJECT.entries(values)) {
          headers[name.toLowerCase()] = String(value);
        }
      }
      return this;
    },
    setHeader(name, value) {
      hooks.setHeader?.(name, value);
      headers[String(name).toLowerCase()] = String(value);
    },
    end(value = undefined) {
      hooks.end?.(value);
      this.headersSent = true;
      this.writableEnded = true;
      this.body = value === undefined ? Buffer.alloc(0) : Buffer.from(value);
      return this;
    },
    destroy() {
      hooks.destroy?.();
      this.destroyed = true;
      return this;
    },
  };
  return { response, headers };
}

function request(target) {
  return OBJECT_FREEZE({ url: target });
}

function frozenOperation(operation) {
  return OBJECT_FREEZE(operation);
}

function validConfiguration(overrides = {}) {
  const state = {
    phase: 'UNAVAILABLE',
    fundingCalls: 0,
    durableCalls: 0,
    handoffCalls: 0,
    handoffCloseCalls: 0,
    durableOperation: () => PROMISE_RESOLVE(undefined),
    handoffOperation: () => PROMISE_RESOLVE(undefined),
    handoffCloseOperation: () => PROMISE_RESOLVE(undefined),
    phaseOperation: null,
    fundingOperation: () => OBJECT_FREEZE({
      activationIntent: OBJECT_FREEZE({ intent: 'synthetic' }),
      fundingCommitment: 'funding.synthetic',
      paymentRequired: OBJECT_FREEZE({ scheme: 'exact', network: 'synthetic' }),
    }),
    ...overrides,
  };
  const getPhase = frozenOperation(() => (
    state.phaseOperation === null ? state.phase : state.phaseOperation()
  ));
  const createFundingResource = frozenOperation(input => {
    state.fundingCalls += 1;
    state.lastFundingInput = input;
    return state.fundingOperation(input);
  });
  const durableHandle = frozenOperation((incomingRequest, response) => {
    state.durableCalls += 1;
    state.lastDurableArguments = [incomingRequest, response];
    return state.durableOperation(incomingRequest, response);
  });
  const handoffHandle = frozenOperation((incomingRequest, response, transportContext) => {
    state.handoffCalls += 1;
    state.lastHandoffArguments = [incomingRequest, response, transportContext];
    return state.handoffOperation(incomingRequest, response, transportContext);
  });
  const handoffClose = frozenOperation(() => {
    state.handoffCloseCalls += 1;
    return state.handoffCloseOperation();
  });
  const configuration = OBJECT_FREEZE({
    requestTargets: OBJECT_FREEZE({
      serviceCredit: SERVICE_TARGET,
      handoffChallenge: HANDOFF_CHALLENGE_TARGET,
      handoffRedemption: HANDOFF_REDEMPTION_TARGET,
    }),
    getPhase,
    fundingComposition: OBJECT_FREEZE({ createFundingResource }),
    fundingResource: OBJECT_FREEZE({
      selection: OBJECT_FREEZE({
        offerId: 'offer.synthetic',
        offerVersion: 1,
        holderId: 'holder.synthetic',
        capabilityCommitment: 'capability.synthetic',
      }),
      resourceUrl: 'https://service.invalid/service-credit/execute',
    }),
    durableComposition: OBJECT_FREEZE({ handle: durableHandle }),
    handoffController: OBJECT_FREEZE({
      handle: handoffHandle,
      close: handoffClose,
    }),
  });
  return { configuration, state };
}

function createRouter(overrides = {}) {
  const fixture = validConfiguration(overrides);
  return {
    ...fixture,
    router: createServiceCreditZenonDurableHttpsRouter(fixture.configuration),
  };
}

async function settleMicrotasks() {
  await PROMISE_RESOLVE();
  await PROMISE_RESOLVE();
}

test('configuration and returned lifecycle are exact and frozen', () => {
  const { configuration } = validConfiguration();
  const router = createServiceCreditZenonDurableHttpsRouter(configuration);
  assert.deepEqual(Reflect.ownKeys(router), ['handle', 'close']);
  assert.equal(Object.isFrozen(router), true);
  assert.equal(Object.isFrozen(router.handle), true);
  assert.equal(Object.isFrozen(router.close), true);
  assert.equal(router.handle.length, 4);
  assert.equal(router.close.length, 1);

  assert.throws(
    () => createServiceCreditZenonDurableHttpsRouter({ ...configuration }),
    error => error?.code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTPS_ROUTER_INVALID_CONFIGURATION',
  );
  assert.throws(
    () => createServiceCreditZenonDurableHttpsRouter(OBJECT_FREEZE({
      ...configuration,
      extra: true,
    })),
    error => error?.code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTPS_ROUTER_INVALID_CONFIGURATION',
  );
  assert.throws(
    () => createServiceCreditZenonDurableHttpsRouter(OBJECT_FREEZE({
      ...configuration,
      requestTargets: { ...configuration.requestTargets },
    })),
    error => error?.code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTPS_ROUTER_INVALID_CONFIGURATION',
  );
  assert.throws(
    () => createServiceCreditZenonDurableHttpsRouter(OBJECT_FREEZE({
      ...configuration,
      durableComposition: OBJECT_FREEZE({
        handle: configuration.durableComposition.handle,
        close: frozenOperation(() => PROMISE_RESOLVE()),
      }),
    })),
    error => error?.code === 'SERVICE_CREDIT_ZENON_DURABLE_HTTPS_ROUTER_INVALID_CONFIGURATION',
  );
});

test('construction is inert and invokes no captured owner operation', () => {
  const { configuration, state } = validConfiguration();
  createServiceCreditZenonDurableHttpsRouter(configuration);
  assert.equal(state.fundingCalls, 0);
  assert.equal(state.durableCalls, 0);
  assert.equal(state.handoffCalls, 0);
  assert.equal(state.handoffCloseCalls, 0);
});

test('fixed phase and route policy preserves unavailable, challenge, active, and handoff behavior', async () => {
  const { router, state, configuration } = createRouter();
  const transportContext = OBJECT_FREEZE({
    peerToken: Symbol(),
    abort: OBJECT_FREEZE(() => {}),
  });

  for (const target of [
    SERVICE_TARGET,
    HANDOFF_CHALLENGE_TARGET,
    HANDOFF_REDEMPTION_TARGET,
  ]) {
    const output = responseDouble();
    const completion = completionLog();
    assert.equal(router.handle(request(target), output.response, transportContext, completion.capability), undefined);
    assert.deepEqual(completion.events, ['success']);
    assert.equal(output.response.statusCode, 503);
  }
  assert.equal(state.fundingCalls, 0);
  assert.equal(state.durableCalls, 0);
  assert.equal(state.handoffCalls, 0);

  state.phase = 'CHALLENGE';
  const challengeOutput = responseDouble();
  const challengeCompletion = completionLog();
  router.handle(request(SERVICE_TARGET), challengeOutput.response, transportContext, challengeCompletion.capability);
  assert.deepEqual(challengeCompletion.events, ['success']);
  assert.equal(challengeOutput.response.statusCode, 402);
  assert.equal(typeof challengeOutput.headers[PAYMENT_REQUIRED_HEADER], 'string');
  assert.equal(state.fundingCalls, 1);
  assert.notEqual(state.lastFundingInput, configuration.fundingResource);
  assert.deepEqual(state.lastFundingInput, configuration.fundingResource);

  const unavailableHandoff = responseDouble();
  const unavailableHandoffCompletion = completionLog();
  router.handle(
    request(HANDOFF_CHALLENGE_TARGET),
    unavailableHandoff.response,
    transportContext,
    unavailableHandoffCompletion.capability,
  );
  assert.deepEqual(unavailableHandoffCompletion.events, ['success']);
  assert.equal(unavailableHandoff.response.statusCode, 503);
  assert.equal(state.handoffCalls, 0);

  state.phase = 'ACTIVE';
  const serviceOutput = responseDouble();
  const serviceCompletion = completionLog();
  router.handle(request(SERVICE_TARGET), serviceOutput.response, transportContext, serviceCompletion.capability);
  await settleMicrotasks();
  assert.deepEqual(serviceCompletion.events, ['success']);
  assert.equal(state.durableCalls, 1);

  for (const target of [HANDOFF_CHALLENGE_TARGET, HANDOFF_REDEMPTION_TARGET]) {
    const output = responseDouble();
    const completion = completionLog();
    router.handle(request(target), output.response, transportContext, completion.capability);
    await settleMicrotasks();
    assert.deepEqual(completion.events, ['success']);
    assert.equal(state.lastHandoffArguments[2], transportContext);
  }
  assert.equal(state.handoffCalls, 2);

  const unknown = createRouter({ phase: 'ACTIVE' });
  const unknownOutput = responseDouble();
  const unknownCompletion = completionLog();
  unknown.router.handle(
    request('/service-credit/not-routed'),
    unknownOutput.response,
    transportContext,
    unknownCompletion.capability,
  );
  assert.deepEqual(unknownCompletion.events, ['failure']);
  assert.equal(unknownOutput.response.statusCode, 503);
  assert.equal(unknown.state.durableCalls, 0);
  assert.equal(unknown.state.handoffCalls, 0);
});

test('native fulfillment and rejection bridge without reading an own then property', async () => {
  let thenReads = 0;
  const fulfilled = PROMISE_RESOLVE(undefined);
  OBJECT_DEFINE_PROPERTY(fulfilled, 'then', {
    configurable: true,
    enumerable: false,
    get() { thenReads += 1; throw new Error('must not run'); },
  });
  const successFixture = createRouter({
    phase: 'ACTIVE',
    durableOperation: () => fulfilled,
  });
  const success = completionLog();
  successFixture.router.handle(
    request(SERVICE_TARGET),
    responseDouble().response,
    OBJECT_FREEZE({}),
    success.capability,
  );
  await settleMicrotasks();
  assert.deepEqual(success.events, ['success']);
  assert.equal(thenReads, 0);

  const failureFixture = createRouter({
    phase: 'ACTIVE',
    handoffOperation: () => PROMISE_REJECT(new Error('synthetic rejection')),
  });
  const output = responseDouble();
  const failure = completionLog();
  failureFixture.router.handle(
    request(HANDOFF_CHALLENGE_TARGET),
    output.response,
    OBJECT_FREEZE({}),
    failure.capability,
  );
  await settleMicrotasks();
  assert.deepEqual(failure.events, ['failure']);
  assert.equal(output.response.statusCode, 503);
  assert.equal(output.response.body.toString('utf8'), '{"error":"unavailable"}');
});

test('invalid asynchronous phase and funding results are safely observed but never gain authority', async t => {
  for (const [name, overrides] of [
    ['phase rejection', { phase: PROMISE_REJECT(new Error('synthetic phase rejection')) }],
    ['funding rejection', {
      phase: 'CHALLENGE',
      fundingOperation: () => PROMISE_REJECT(new Error('synthetic funding rejection')),
    }],
  ]) await t.test(name, async () => {
    const { router } = createRouter(overrides);
    const output = responseDouble();
    const completion = completionLog();
    router.handle(
      request(SERVICE_TARGET),
      output.response,
      OBJECT_FREEZE({}),
      completion.capability,
    );
    await settleMicrotasks();
    assert.deepEqual(completion.events, ['failure']);
    assert.equal(output.response.statusCode, 503);
    const closeCompletion = completionLog();
    router.close(closeCompletion.capability);
    await settleMicrotasks();
    assert.deepEqual(closeCompletion.events, ['failure']);
  });
});

test('throws and non-native return shapes fail closed without thenable assimilation', async t => {
  const cases = [
    ['throw', () => { throw new Error('synthetic'); }],
    ['undefined', () => undefined],
    ['object', () => ({})],
    ['thenable', reads => () => ({ get then() { reads.count += 1; return () => {}; } })],
    ['proxy', reads => () => new Proxy({}, { get() { reads.count += 1; return undefined; } })],
    ['subclass with hostile species', reads => {
      class DerivedPromise extends NATIVE_PROMISE {
        static get [Symbol.species]() {
          reads.count += 1;
          throw new Error('must not run');
        }
      }
      return () => new DerivedPromise(resolve => resolve(undefined));
    }],
    ['hostile constructor species', reads => () => {
      const promise = PROMISE_RESOLVE(undefined);
      const constructor = {};
      OBJECT_DEFINE_PROPERTY(constructor, Symbol.species, {
        configurable: true,
        get() { reads.count += 1; throw new Error('must not run'); },
      });
      OBJECT_DEFINE_PROPERTY(promise, 'constructor', {
        configurable: false,
        enumerable: false,
        value: constructor,
        writable: false,
      });
      return promise;
    }],
    ['unobservable native', reads => () => {
      const promise = PROMISE_RESOLVE(undefined);
      OBJECT_DEFINE_PROPERTY(promise, 'constructor', {
        configurable: false,
        enumerable: false,
        get() { reads.count += 1; return NATIVE_PROMISE; },
      });
      return promise;
    }],
  ];
  for (const [name, makeOperation] of cases) await t.test(name, async () => {
    const reads = { count: 0 };
    const operation = makeOperation.length === 1 ? makeOperation(reads) : makeOperation;
    const { router } = createRouter({ phase: 'ACTIVE', durableOperation: operation });
    const output = responseDouble();
    const completion = completionLog();
    router.handle(request(SERVICE_TARGET), output.response, OBJECT_FREEZE({}), completion.capability);
    await settleMicrotasks();
    assert.deepEqual(completion.events, ['failure']);
    assert.equal(output.response.statusCode, 503);
    assert.equal(reads.count, 0);
  });
});

test('hostile constructor descriptors are not invoked and proven-unobservable promises fail closed', async () => {
  let constructorReads = 0;
  const operation = PROMISE_RESOLVE(undefined);
  OBJECT_DEFINE_PROPERTY(operation, 'constructor', {
    configurable: false,
    enumerable: false,
    get() { constructorReads += 1; return NATIVE_PROMISE; },
  });
  const { router } = createRouter({ phase: 'ACTIVE', durableOperation: () => operation });
  const output = responseDouble();
  const completion = completionLog();
  router.handle(request(SERVICE_TARGET), output.response, OBJECT_FREEZE({}), completion.capability);
  await settleMicrotasks();
  assert.deepEqual(completion.events, ['failure']);
  assert.equal(output.response.statusCode, 503);
  assert.equal(constructorReads, 0);
});

test('non-extensible native promises remain safely observable', async () => {
  const operation = NATIVE_OBJECT.preventExtensions(PROMISE_RESOLVE(undefined));
  const { router } = createRouter({ phase: 'ACTIVE', durableOperation: () => operation });
  const completion = completionLog();
  router.handle(
    request(SERVICE_TARGET),
    responseDouble().response,
    OBJECT_FREEZE({}),
    completion.capability,
  );
  await settleMicrotasks();
  assert.deepEqual(completion.events, ['success']);
});

test('duplicate, conflicting, and late native settlement attempts cannot revise one-shot completion', async () => {
  const operation = deferred();
  const { router } = createRouter({ phase: 'ACTIVE', durableOperation: () => operation.promise });
  const completion = completionLog();
  router.handle(
    request(SERVICE_TARGET),
    responseDouble().response,
    OBJECT_FREEZE({}),
    completion.capability,
  );
  operation.resolve(undefined);
  operation.reject(new Error('late conflict'));
  operation.resolve(undefined);
  await settleMicrotasks();
  assert.deepEqual(completion.events, ['success']);
  await settleMicrotasks();
  assert.deepEqual(completion.events, ['success']);
});

test('close gates new work, begins handoff close first, drains in-flight work, and is idempotent', async () => {
  const order = [];
  const active = deferred();
  const handoffClose = deferred();
  const { router, state } = createRouter({
    phase: 'ACTIVE',
    durableOperation: () => active.promise,
    handoffCloseOperation: () => {
      order.push('handoff-close');
      return handoffClose.promise;
    },
  });
  const activeCompletion = completionLog();
  router.handle(
    request(SERVICE_TARGET),
    responseDouble().response,
    OBJECT_FREEZE({}),
    activeCompletion.capability,
  );
  const closeA = completionLog();
  const closeB = completionLog();
  assert.equal(router.close(closeA.capability), undefined);
  assert.equal(router.close(closeB.capability), undefined);
  assert.deepEqual(order, ['handoff-close']);
  assert.equal(state.handoffCloseCalls, 1);

  handoffClose.resolve(undefined);
  await settleMicrotasks();
  assert.deepEqual(closeA.events, []);
  assert.deepEqual(closeB.events, []);
  active.resolve(undefined);
  await settleMicrotasks();
  assert.deepEqual(activeCompletion.events, ['success']);
  assert.deepEqual(closeA.events, ['success']);
  assert.deepEqual(closeB.events, ['success']);

  router.close(closeA.capability);
  assert.deepEqual(closeA.events, ['success']);
  const closeC = completionLog();
  router.close(closeC.capability);
  assert.deepEqual(closeC.events, ['success']);
});

test('handle during close is denied and makes the close result uncertain', async () => {
  const handoffClose = deferred();
  const { router } = createRouter({
    phase: 'ACTIVE',
    handoffCloseOperation: () => handoffClose.promise,
  });
  const closeCompletion = completionLog();
  router.close(closeCompletion.capability);
  const denied = completionLog();
  const deniedResponse = responseDouble();
  router.handle(
    request(SERVICE_TARGET),
    deniedResponse.response,
    OBJECT_FREEZE({}),
    denied.capability,
  );
  assert.deepEqual(denied.events, ['failure']);
  assert.equal(deniedResponse.response.statusCode, 503);
  handoffClose.resolve(undefined);
  await settleMicrotasks();
  assert.deepEqual(closeCompletion.events, ['failure']);
});

test('a handle completion reused for close cannot claim clean authority', async () => {
  const operation = deferred();
  const { router } = createRouter({
    phase: 'ACTIVE',
    durableOperation: () => operation.promise,
  });
  const reused = completionLog();
  router.handle(
    request(SERVICE_TARGET),
    responseDouble().response,
    OBJECT_FREEZE({}),
    reused.capability,
  );
  router.close(reused.capability);
  operation.resolve(undefined);
  await settleMicrotasks();
  assert.deepEqual(reused.events, ['success']);
  const observer = completionLog();
  router.close(observer.capability);
  assert.deepEqual(observer.events, ['failure']);
});

test('rejected or unobservable work propagates uncertainty and forbids false clean close', async t => {
  for (const [name, operation] of [
    ['rejected', () => PROMISE_REJECT(new Error('synthetic'))],
    ['unobservable', () => {
      const promise = PROMISE_RESOLVE(undefined);
      OBJECT_DEFINE_PROPERTY(promise, 'constructor', {
        configurable: false,
        enumerable: false,
        value: {},
        writable: false,
      });
      return promise;
    }],
  ]) await t.test(name, async () => {
    const { router } = createRouter({
      phase: 'ACTIVE',
      durableOperation: operation,
    });
    const handleCompletion = completionLog();
    router.handle(
      request(SERVICE_TARGET),
      responseDouble().response,
      OBJECT_FREEZE({}),
      handleCompletion.capability,
    );
    await settleMicrotasks();
    assert.deepEqual(handleCompletion.events, ['failure']);
    const closeCompletion = completionLog();
    router.close(closeCompletion.capability);
    await settleMicrotasks();
    assert.deepEqual(closeCompletion.events, ['failure']);
  });
});

test('handoff close rejection fails every valid concurrent close completion exactly once', async () => {
  const closeOperation = deferred();
  const { router } = createRouter({
    handoffCloseOperation: () => closeOperation.promise,
  });
  const closeA = completionLog();
  const closeB = completionLog();
  router.close(closeA.capability);
  router.close(closeB.capability);
  closeOperation.reject(new Error('synthetic close rejection'));
  await settleMicrotasks();
  assert.deepEqual(closeA.events, ['failure']);
  assert.deepEqual(closeB.events, ['failure']);
  await settleMicrotasks();
  assert.deepEqual(closeA.events, ['failure']);
  assert.deepEqual(closeB.events, ['failure']);
});

test('a non-extensible native handoff close Promise can prove clean closure', async () => {
  const operation = NATIVE_OBJECT.preventExtensions(PROMISE_RESOLVE(undefined));
  const { router } = createRouter({ handoffCloseOperation: () => operation });
  const completion = completionLog();
  router.close(completion.capability);
  await settleMicrotasks();
  assert.deepEqual(completion.events, ['success']);
});

test('handoff close throw and invalid return shapes cannot authorize clean closure', async t => {
  const cases = [
    ['throw', () => { throw new Error('synthetic'); }],
    ['undefined', () => undefined],
    ['object', () => ({})],
    ['thenable', reads => () => ({ get then() { reads.count += 1; return () => {}; } })],
    ['proxy', reads => () => new Proxy({}, { get() { reads.count += 1; return undefined; } })],
    ['subclass with hostile species', reads => {
      class DerivedPromise extends NATIVE_PROMISE {
        static get [Symbol.species]() {
          reads.count += 1;
          throw new Error('must not run');
        }
      }
      return () => new DerivedPromise(resolve => resolve(undefined));
    }],
    ['hostile constructor species', reads => () => {
      const promise = PROMISE_RESOLVE(undefined);
      const constructor = {};
      OBJECT_DEFINE_PROPERTY(constructor, Symbol.species, {
        configurable: true,
        get() { reads.count += 1; throw new Error('must not run'); },
      });
      OBJECT_DEFINE_PROPERTY(promise, 'constructor', {
        configurable: false,
        enumerable: false,
        value: constructor,
        writable: false,
      });
      return promise;
    }],
    ['unobservable native', reads => () => {
      const promise = PROMISE_RESOLVE(undefined);
      OBJECT_DEFINE_PROPERTY(promise, 'constructor', {
        configurable: false,
        enumerable: false,
        get() { reads.count += 1; return NATIVE_PROMISE; },
      });
      return promise;
    }],
  ];
  for (const [name, makeOperation] of cases) await t.test(name, async () => {
    const reads = { count: 0 };
    const operation = makeOperation.length === 1 ? makeOperation(reads) : makeOperation;
    const { router } = createRouter({ handoffCloseOperation: operation });
    const completion = completionLog();
    router.close(completion.capability);
    await settleMicrotasks();
    assert.deepEqual(completion.events, ['failure']);
    assert.equal(reads.count, 0);
  });
});

test('callback-triggered reentry cannot duplicate completion or publish close before callback return', async () => {
  let router;
  const closeCompletion = completionLog();
  const requestCompletion = completionLog({
    success() {
      assert.deepEqual(closeCompletion.events, []);
      router.close(closeCompletion.capability);
      assert.deepEqual(closeCompletion.events, []);
    },
  });
  ({ router } = createRouter({ phase: 'ACTIVE' }));
  router.handle(
    request(SERVICE_TARGET),
    responseDouble().response,
    OBJECT_FREEZE({}),
    requestCompletion.capability,
  );
  await settleMicrotasks();
  assert.deepEqual(requestCompletion.events, ['success']);
  assert.deepEqual(closeCompletion.events, ['success']);
});

test('response-triggered close during synchronous challenge handling drains before clean close', async () => {
  let router;
  const closeCompletion = completionLog();
  const output = responseDouble({
    writeHead() {
      router.close(closeCompletion.capability);
      assert.deepEqual(closeCompletion.events, []);
    },
  });
  ({ router } = createRouter({ phase: 'CHALLENGE' }));
  const handleCompletion = completionLog();
  router.handle(
    request(SERVICE_TARGET),
    output.response,
    OBJECT_FREEZE({}),
    handleCompletion.capability,
  );
  await settleMicrotasks();
  assert.deepEqual(handleCompletion.events, ['success']);
  assert.deepEqual(closeCompletion.events, ['success']);
});

test('post-import poisoning of Promise, Reflect, and Object routes does not affect safe observation', async () => {
  const operation = PROMISE_RESOLVE(undefined);
  const { router } = createRouter({ phase: 'ACTIVE', durableOperation: () => operation });
  const completion = completionLog();
  const closeCompletion = completionLog();
  const incomingRequest = request(SERVICE_TARGET);
  const output = responseDouble();
  const transportContext = OBJECT_FREEZE({});
  const originalGlobalPromise = globalThis.Promise;
  const originalReflectApply = NATIVE_REFLECT.apply;
  const originalReflectDescriptor = NATIVE_REFLECT.getOwnPropertyDescriptor;
  const originalObjectDescriptor = NATIVE_OBJECT.getOwnPropertyDescriptor;
  const originalObjectFreeze = NATIVE_OBJECT.freeze;
  const originalSpecies = originalObjectDescriptor(NATIVE_PROMISE, Symbol.species);
  let poisonedThenCalls = 0;
  try {
    globalThis.Promise = function PoisonedPromise() { throw new Error('poisoned'); };
    NATIVE_PROMISE.prototype.then = function poisonedThen(onFulfilled, onRejected) {
      poisonedThenCalls += 1;
      onFulfilled(undefined);
      onRejected(new Error('poisoned'));
      throw new Error('poisoned');
    };
    NATIVE_REFLECT.apply = () => { throw new Error('poisoned'); };
    NATIVE_REFLECT.getOwnPropertyDescriptor = () => { throw new Error('poisoned'); };
    NATIVE_OBJECT.getOwnPropertyDescriptor = () => { throw new Error('poisoned'); };
    NATIVE_OBJECT.freeze = () => { throw new Error('poisoned'); };
    OBJECT_DEFINE_PROPERTY(NATIVE_PROMISE, Symbol.species, {
      configurable: true,
      get() { throw new Error('poisoned'); },
    });
    router.handle(
      incomingRequest,
      output.response,
      transportContext,
      completion.capability,
    );
    router.close(closeCompletion.capability);
  } finally {
    globalThis.Promise = originalGlobalPromise;
    NATIVE_PROMISE.prototype.then = ORIGINAL_PROMISE_THEN;
    NATIVE_REFLECT.apply = originalReflectApply;
    NATIVE_REFLECT.getOwnPropertyDescriptor = originalReflectDescriptor;
    NATIVE_OBJECT.getOwnPropertyDescriptor = originalObjectDescriptor;
    NATIVE_OBJECT.freeze = originalObjectFreeze;
    OBJECT_DEFINE_PROPERTY(NATIVE_PROMISE, Symbol.species, originalSpecies);
  }
  await settleMicrotasks();
  assert.deepEqual(completion.events, ['success']);
  assert.deepEqual(closeCompletion.events, ['success']);
  assert.equal(poisonedThenCalls, 0);
});

test('invalid completion surfaces and phase violations fail closed without route authority', async () => {
  const { router, state } = createRouter({ phase: 'ACTIVE' });
  const output = responseDouble();
  const invalidCompletion = OBJECT_FREEZE({
    get success() { throw new Error('must not run'); },
    failure: frozenOperation(() => {}),
  });
  assert.equal(
    router.handle(request(SERVICE_TARGET), output.response, OBJECT_FREEZE({}), invalidCompletion),
    undefined,
  );
  assert.equal(state.durableCalls, 0);
  assert.equal(output.response.statusCode, 503);

  const shared = frozenOperation(() => {});
  const sameCallbackCompletion = OBJECT_FREEZE({ success: shared, failure: shared });
  const sameCallbackOutput = responseDouble();
  router.handle(
    request(SERVICE_TARGET),
    sameCallbackOutput.response,
    OBJECT_FREEZE({}),
    sameCallbackCompletion,
  );
  assert.equal(state.durableCalls, 0);
  assert.equal(sameCallbackOutput.response.statusCode, 503);

  const invalidPhase = createRouter({ phase: 'INVALID' });
  const completion = completionLog();
  invalidPhase.router.handle(
    request(SERVICE_TARGET),
    responseDouble().response,
    OBJECT_FREEZE({}),
    completion.capability,
  );
  await settleMicrotasks();
  assert.deepEqual(completion.events, ['failure']);
});

test('phase-reader mutation cannot redirect one request across fixed owners', () => {
  const mutableRequest = { url: SERVICE_TARGET };
  const { router, state } = createRouter({
    phase: 'ACTIVE',
    phaseOperation() {
      mutableRequest.url = HANDOFF_CHALLENGE_TARGET;
      return 'ACTIVE';
    },
  });
  const output = responseDouble();
  const completion = completionLog();
  router.handle(
    mutableRequest,
    output.response,
    OBJECT_FREEZE({}),
    completion.capability,
  );
  assert.deepEqual(completion.events, ['failure']);
  assert.equal(output.response.statusCode, 503);
  assert.equal(state.durableCalls, 0);
  assert.equal(state.handoffCalls, 0);
});

test('challenge creation mutation and malformed challenge data fail before response authority', () => {
  const mutableRequest = { url: SERVICE_TARGET };
  const mutation = createRouter({
    phase: 'CHALLENGE',
    fundingOperation() {
      mutableRequest.url = HANDOFF_REDEMPTION_TARGET;
      return OBJECT_FREEZE({
        activationIntent: OBJECT_FREEZE({ intent: 'synthetic' }),
        fundingCommitment: 'funding.synthetic',
        paymentRequired: OBJECT_FREEZE({ scheme: 'exact', network: 'synthetic' }),
      });
    },
  });
  const mutationOutput = responseDouble();
  const mutationCompletion = completionLog();
  mutation.router.handle(
    mutableRequest,
    mutationOutput.response,
    OBJECT_FREEZE({}),
    mutationCompletion.capability,
  );
  assert.deepEqual(mutationCompletion.events, ['failure']);
  assert.equal(mutationOutput.response.statusCode, 503);
  assert.equal(mutation.state.durableCalls, 0);
  assert.equal(mutation.state.handoffCalls, 0);

  const malformed = createRouter({
    phase: 'CHALLENGE',
    fundingOperation: () => OBJECT_FREEZE({
      activationIntent: OBJECT_FREEZE({ intent: 'synthetic' }),
      fundingCommitment: 'funding.synthetic',
      paymentRequired: undefined,
    }),
  });
  const malformedOutput = responseDouble();
  const malformedCompletion = completionLog();
  malformed.router.handle(
    request(SERVICE_TARGET),
    malformedOutput.response,
    OBJECT_FREEZE({}),
    malformedCompletion.capability,
  );
  assert.deepEqual(malformedCompletion.events, ['failure']);
  assert.equal(malformedOutput.response.statusCode, 503);
});
