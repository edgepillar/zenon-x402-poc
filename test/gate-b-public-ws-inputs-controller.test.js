import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import * as controllerModule from '../src/gate-b-public-ws-inputs-controller.js';
import {
  authorizeAndPreflightGateBPublicWsInputs,
  getGateBPublicWsInputsControllerStatus,
  prepareGateBPublicWsInputsForReview,
  stopGateBPublicWsInputsController,
  waitGateBPublicWsInputsControllerClosed,
} from '../src/gate-b-public-ws-inputs-controller.js';
import {
  GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS,
  GATE_B_PUBLIC_WS_INPUT_LEAVES,
  GATE_B_PUBLIC_WS_INPUT_OPERATIONS,
} from '../src/gate-b-public-ws-inputs-schema.js';
import {
  GATE_B_QUICK_TUNNEL_OPERATIONS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS,
  GATE_B_QUICK_TUNNEL_TELEMETRY_MODES,
} from '../src/gate-b-quick-tunnel-schema.js';

const REVIEW_REQUIRED = 'GATE_B_CONTROLLER_REVIEW_REQUIRED_RUN_NOT_AUTHORIZED';
const PREFLIGHT_VALID = 'GATE_B_CONTROLLER_PREFLIGHT_VALID_RUN_NOT_AUTHORIZED';
const CLOSED = 'GATE_B_CONTROLLER_CLOSED_RUN_NOT_EXECUTED';
const QUARANTINED = 'GATE_B_CONTROLLER_FAILED_WORKSPACE_QUARANTINED';
const WORKSPACE_ROOT = '/private/tmp/gate-b-controller-fixture';
const RUN_NAME = 'public-ws-once-controller-fixture';
const RPC_ENDPOINT = 'ws://8.8.8.8:35998/';

function options(changes = {}) {
  return {
    acknowledgements: {
      live: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.live,
      operatorTrust: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.operatorTrust,
    },
    quickTunnel: {
      cloudflaredExecutable: '/usr/local/bin/cloudflared-fixture',
      sourcePin: 'a'.repeat(64),
      telemetryAcknowledgement:
        GATE_B_QUICK_TUNNEL_TELEMETRY_ACKNOWLEDGEMENTS.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
      telemetryMode:
        GATE_B_QUICK_TUNNEL_TELEMETRY_MODES.ACCEPT_POSSIBLE_ERROR_TELEMETRY,
    },
    rpcEndpoint: RPC_ENDPOINT,
    runName: RUN_NAME,
    schemaVersion: 1,
    workspaceRoot: WORKSPACE_ROOT,
    ...changes,
  };
}

function review(changes = {}) {
  return {
    acknowledgements: {
      payment: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.payment,
      publication: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.publication,
      transportException: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.transportException,
    },
    reviewedConfigDigest: 'b'.repeat(64),
    schemaVersion: 1,
    ...changes,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, reject, resolve };
}

function hostileThenable(counter) {
  const candidate = {};
  Object.defineProperty(candidate, 'then', {
    configurable: true,
    get() {
      counter.count += 1;
      return resolve => {
        counter.calls += 1;
        resolve(undefined);
      };
    },
  });
  return candidate;
}

function harness(changes = {}) {
  const events = [];
  const inputBootstraps = [];
  const tunnelBootstraps = [];
  const preflights = [];
  const lease = Object.freeze(Object.create(null));
  const state = { stopCalls: 0, waitCalls: 0 };
  const injected = {
    async assertQuickTunnelReady(candidate) {
      assert.equal(candidate, lease);
      events.push('ready');
      return true;
    },
    async launchPublicWsInputs(bootstrap) {
      inputBootstraps.push(structuredClone(bootstrap));
      events.push(`inputs:${bootstrap.operation}`);
      if (bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
        return Object.freeze({ status: 'endpoint-provisioned' });
      }
      if (bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE) {
        return Object.freeze({ status: 'prepared' });
      }
      return Object.freeze({ status: 'authorized' });
    },
    async launchQuickTunnel(bootstrap) {
      tunnelBootstraps.push(structuredClone(bootstrap));
      events.push('tunnel:launch');
      return lease;
    },
    async preflightPublicWsOnce(candidate) {
      preflights.push(structuredClone(candidate));
      events.push('preflight');
      return Object.freeze({ valid: true });
    },
    stopQuickTunnel(candidate) {
      assert.equal(candidate, lease);
      state.stopCalls += 1;
      events.push('tunnel:stop');
      return Promise.resolve(true);
    },
    async waitQuickTunnelClosed(candidate) {
      assert.equal(candidate, lease);
      state.waitCalls += 1;
      events.push('tunnel:wait');
      return true;
    },
    ...changes,
  };
  return {
    events,
    injected,
    inputBootstraps,
    lease,
    preflights,
    state,
    tunnelBootstraps,
  };
}

test('controller exposes only the reviewed opaque lifecycle surface', () => {
  assert.deepEqual(Object.keys(controllerModule).sort(), [
    'authorizeAndPreflightGateBPublicWsInputs',
    'getGateBPublicWsInputsControllerStatus',
    'prepareGateBPublicWsInputsForReview',
    'stopGateBPublicWsInputsController',
    'waitGateBPublicWsInputsControllerClosed',
  ]);
});

test('controller enforces the exact two-readiness review and preflight order without RUN',
  async () => {
    const context = harness();
    const capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
    assert.equal(Object.getPrototypeOf(capability), null);
    assert.equal(Object.isFrozen(capability), true);
    assert.deepEqual(Reflect.ownKeys(capability), []);
    assert.equal(getGateBPublicWsInputsControllerStatus(capability), REVIEW_REQUIRED);
    assert.deepEqual(context.events, [
      'inputs:PROVISION_ENDPOINT',
      'tunnel:launch',
      'ready',
      'inputs:PREPARE',
    ]);
    assert.deepEqual(context.tunnelBootstraps, [{
      cloudflaredExecutable: options().quickTunnel.cloudflaredExecutable,
      operation: GATE_B_QUICK_TUNNEL_OPERATIONS.START,
      schemaVersion: 1,
      sourcePin: options().quickTunnel.sourcePin,
      telemetryAcknowledgement: options().quickTunnel.telemetryAcknowledgement,
      telemetryMode: options().quickTunnel.telemetryMode,
      workspaceRoot: WORKSPACE_ROOT,
    }]);

    assert.equal(
      await authorizeAndPreflightGateBPublicWsInputs(capability, review()),
      PREFLIGHT_VALID,
    );
    assert.equal(getGateBPublicWsInputsControllerStatus(capability), PREFLIGHT_VALID);
    assert.deepEqual(context.events, [
      'inputs:PROVISION_ENDPOINT',
      'tunnel:launch',
      'ready',
      'inputs:PREPARE',
      'ready',
      'inputs:AUTHORIZE',
      'preflight',
    ]);
    assert.equal(context.events.filter(value => value === 'ready').length, 2);
    assert.equal(context.inputBootstraps.length, 3);
    assert.equal(context.inputBootstraps[2].runName, RUN_NAME);
    assert.equal(context.inputBootstraps[2].reviewedConfigDigest, review().reviewedConfigDigest);
    assert.deepEqual(context.preflights, [{
      authorizationPath: join(WORKSPACE_ROOT, GATE_B_PUBLIC_WS_INPUT_LEAVES.authorization),
      buyerRpcPath: join(WORKSPACE_ROOT, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerRpc),
      buyerWalletPath: join(WORKSPACE_ROOT, GATE_B_PUBLIC_WS_INPUT_LEAVES.buyerWallet),
      configPath: join(WORKSPACE_ROOT, GATE_B_PUBLIC_WS_INPUT_LEAVES.runConfig),
      facilitatorRpcPath: join(
        WORKSPACE_ROOT,
        GATE_B_PUBLIC_WS_INPUT_LEAVES.facilitatorRpc,
      ),
      runName: RUN_NAME,
      transportException: GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.transportException,
      workspaceRoot: WORKSPACE_ROOT,
    }]);
    assert.equal(await stopGateBPublicWsInputsController(capability), CLOSED);
    assert.equal(await waitGateBPublicWsInputsControllerClosed(capability), CLOSED);
    assert.equal(context.state.stopCalls, 1);
    assert.equal(context.state.waitCalls, 1);
    assert.equal(getGateBPublicWsInputsControllerStatus(capability), CLOSED);
  });

test('initial inputs and dependencies are captured exactly once before the first effect',
  async () => {
    const provision = deferred();
    const context = harness({
      async launchPublicWsInputs(bootstrap) {
        context.inputBootstraps.push(structuredClone(bootstrap));
        context.events.push(`inputs:${bootstrap.operation}`);
        if (bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
          await provision.promise;
          return Object.freeze({ status: 'endpoint-provisioned' });
        }
        return Object.freeze({ status: 'prepared' });
      },
    });
    const supplied = options();
    const pending = prepareGateBPublicWsInputsForReview(supplied, context.injected);
    supplied.runName = 'mutated-after-entry';
    supplied.acknowledgements.live = 'mutated-after-entry';
    supplied.quickTunnel.sourcePin = 'c'.repeat(64);
    context.injected.launchQuickTunnel = async () => { throw new Error('mutated dependency'); };
    provision.resolve(true);
    const capability = await pending;
    assert.equal(getGateBPublicWsInputsControllerStatus(capability), REVIEW_REQUIRED);
    assert.equal(context.inputBootstraps[1].runName, RUN_NAME);
    assert.equal(context.inputBootstraps[1].acknowledgements.live,
      GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.live);
    assert.equal(context.tunnelBootstraps[0].sourcePin, 'a'.repeat(64));
  });

test('review is exact, excludes runName, and is snapshotted before readiness', async () => {
  const readiness = deferred();
  let readinessCalls = 0;
  const context = harness({
    async assertQuickTunnelReady(candidate) {
      assert.equal(candidate, context.lease);
      readinessCalls += 1;
      context.events.push('ready');
      if (readinessCalls === 2) await readiness.promise;
      return true;
    },
  });
  const capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
  const supplied = review();
  const pending = authorizeAndPreflightGateBPublicWsInputs(capability, supplied);
  supplied.reviewedConfigDigest = 'c'.repeat(64);
  supplied.acknowledgements.payment = 'mutated-after-entry';
  readiness.resolve(true);
  assert.equal(await pending, PREFLIGHT_VALID);
  assert.equal(context.inputBootstraps[2].reviewedConfigDigest, 'b'.repeat(64));
  assert.equal(context.inputBootstraps[2].acknowledgements.payment,
    GATE_B_PUBLIC_WS_INPUT_ACKNOWLEDGEMENTS.payment);

  const second = harness();
  const secondCapability = await prepareGateBPublicWsInputsForReview(options(), second.injected);
  assert.equal(await authorizeAndPreflightGateBPublicWsInputs(secondCapability, {
    ...review(),
    runName: RUN_NAME,
  }), CLOSED);
  assert.equal(second.state.stopCalls, 1);
  assert.equal(second.events.includes('inputs:AUTHORIZE'), false);
  assert.equal(second.events.includes('preflight'), false);
});

test('proxies, accessors, symbols, extras, custom prototypes, wrappers, and thenables fail before effects',
  async () => {
    const accessor = options();
    Object.defineProperty(accessor, 'runName', {
      enumerable: true,
      get: () => RUN_NAME,
    });
    const withSymbol = options();
    withSymbol[Symbol('extra')] = true;
    const inherited = Object.create({ schemaVersion: 1 });
    Object.assign(inherited, options());
    for (const candidate of [
      new Proxy(options(), {}),
      accessor,
      withSymbol,
      { ...options(), extra: true },
      inherited,
      new String('wrapped'),
      { ...options(), then() {} },
    ]) {
      const context = harness();
      await assert.rejects(prepareGateBPublicWsInputsForReview(candidate, context.injected));
      assert.deepEqual(context.events, []);
    }
  });

test('dependency capture rejects hostile schemas before the first operation', async () => {
  const baseContext = harness();
  const accessor = { ...baseContext.injected };
  Object.defineProperty(accessor, 'launchQuickTunnel', {
    enumerable: true,
    get: () => baseContext.injected.launchQuickTunnel,
  });
  const withSymbol = { ...baseContext.injected };
  withSymbol[Symbol('extra')] = true;
  const inherited = Object.create({ extra: true });
  Object.assign(inherited, baseContext.injected);
  for (const candidate of [
    new Proxy({ ...baseContext.injected }, {}),
    accessor,
    withSymbol,
    { ...baseContext.injected, extra: true },
    inherited,
    { ...baseContext.injected, then() {} },
  ]) {
    await assert.rejects(prepareGateBPublicWsInputsForReview(options(), candidate));
    assert.deepEqual(baseContext.events, []);
  }
});

test('hostile review schemas close once before readiness or authorization', async () => {
  const accessor = review();
  Object.defineProperty(accessor, 'reviewedConfigDigest', {
    enumerable: true,
    get: () => 'b'.repeat(64),
  });
  const withSymbol = review();
  withSymbol[Symbol('extra')] = true;
  const inherited = Object.create({ extra: true });
  Object.assign(inherited, review());
  for (const candidate of [
    new Proxy(review(), {}),
    accessor,
    withSymbol,
    { ...review(), extra: true },
    inherited,
    new String('wrapped'),
    { ...review(), then() {} },
  ]) {
    const context = harness();
    const capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
    const readyBeforeReview = context.events.filter(value => value === 'ready').length;
    assert.equal(
      await authorizeAndPreflightGateBPublicWsInputs(capability, candidate),
      CLOSED,
    );
    assert.equal(
      context.events.filter(value => value === 'ready').length,
      readyBeforeReview,
    );
    assert.equal(context.events.includes('inputs:AUTHORIZE'), false);
    assert.equal(context.state.stopCalls, 1);
    assert.equal(context.state.waitCalls, 1);
  }
});

test('duplicate authorization and cancellation synchronously disable late actions', async () => {
  const readiness = deferred();
  let readinessCalls = 0;
  const context = harness({
    async assertQuickTunnelReady(candidate) {
      assert.equal(candidate, context.lease);
      readinessCalls += 1;
      context.events.push('ready');
      if (readinessCalls === 2) await readiness.promise;
      return true;
    },
  });
  const capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
  const first = authorizeAndPreflightGateBPublicWsInputs(capability, review());
  const duplicate = authorizeAndPreflightGateBPublicWsInputs(capability, review());
  let duplicateSettled = false;
  void duplicate.then(() => { duplicateSettled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(duplicateSettled, false);
  readiness.resolve(true);
  assert.equal(await duplicate, QUARANTINED);
  assert.equal(await first, QUARANTINED);
  assert.equal(getGateBPublicWsInputsControllerStatus(capability), QUARANTINED);
  assert.equal(context.events.includes('inputs:AUTHORIZE'), false);
  assert.equal(context.events.includes('preflight'), false);
  assert.equal(context.state.stopCalls, 1);
  assert.equal(context.state.waitCalls, 1);
});

test('partial authorization failure quarantines even when the owned tunnel closes', async () => {
  const context = harness({
    async launchPublicWsInputs(bootstrap) {
      context.inputBootstraps.push(structuredClone(bootstrap));
      context.events.push(`inputs:${bootstrap.operation}`);
      if (bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE) {
        throw new Error('synthetic reservation ambiguity');
      }
      return Object.freeze({
        status: bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT
          ? 'endpoint-provisioned'
          : 'prepared',
      });
    },
  });
  const capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
  assert.equal(await authorizeAndPreflightGateBPublicWsInputs(capability, review()), QUARANTINED);
  assert.equal(getGateBPublicWsInputsControllerStatus(capability), QUARANTINED);
  assert.equal(context.state.stopCalls, 1);
  assert.equal(context.state.waitCalls, 1);
  assert.equal(context.events.includes('preflight'), false);
});

test('cancellation during AUTHORIZE exposes no provisional terminal result',
  async () => {
    const authorization = deferred();
    const authorizationEntered = deferred();
    const context = harness({
      async launchPublicWsInputs(bootstrap) {
        context.inputBootstraps.push(structuredClone(bootstrap));
        context.events.push(`inputs:${bootstrap.operation}`);
        if (bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE) {
          authorizationEntered.resolve(true);
          return authorization.promise;
        }
        return Object.freeze({
          status: bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT
            ? 'endpoint-provisioned'
            : 'prepared',
        });
      },
    });
    const capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
    const pendingAuthorization = authorizeAndPreflightGateBPublicWsInputs(
      capability,
      review(),
    );
    await authorizationEntered.promise;
    const stopped = stopGateBPublicWsInputsController(capability);
    assert.equal(stopGateBPublicWsInputsController(capability), stopped);
    const waited = waitGateBPublicWsInputsControllerClosed(capability);
    let terminalVisible = false;
    void stopped.then(() => { terminalVisible = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(terminalVisible, false);
    assert.throws(() => getGateBPublicWsInputsControllerStatus(capability));
    authorization.resolve(Object.freeze({ status: 'authorized' }));
    assert.equal(await pendingAuthorization, QUARANTINED);
    assert.equal(await stopped, QUARANTINED);
    assert.equal(await waited, QUARANTINED);
    assert.equal(getGateBPublicWsInputsControllerStatus(capability), QUARANTINED);
    assert.equal(context.state.stopCalls, 1);
    assert.equal(context.state.waitCalls, 1);
    assert.equal(context.events.includes('preflight'), false);
  });

test('cancellation during filesystem preflight waits and converges once to quarantine',
  async () => {
    const preflight = deferred();
    const preflightEntered = deferred();
    const context = harness({
      preflightPublicWsOnce(candidate) {
        context.preflights.push(structuredClone(candidate));
        context.events.push('preflight');
        preflightEntered.resolve(true);
        return preflight.promise;
      },
    });
    const capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
    const authorization = authorizeAndPreflightGateBPublicWsInputs(capability, review());
    await preflightEntered.promise;
    const stopped = stopGateBPublicWsInputsController(capability);
    const waited = waitGateBPublicWsInputsControllerClosed(capability);
    let terminalVisible = false;
    void stopped.then(() => { terminalVisible = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(terminalVisible, false);
    assert.throws(() => getGateBPublicWsInputsControllerStatus(capability));
    preflight.resolve(Object.freeze({ valid: true }));
    assert.equal(await authorization, QUARANTINED);
    assert.equal(await stopped, QUARANTINED);
    assert.equal(await waited, QUARANTINED);
    assert.equal(getGateBPublicWsInputsControllerStatus(capability), QUARANTINED);
    assert.equal(context.state.stopCalls, 1);
    assert.equal(context.state.waitCalls, 1);
  });

test('synchronous dependency reentrancy sees the active-stage barrier before invocation',
  async t => {
    for (const stage of ['authorize-readiness', 'authorize', 'preflight']) {
      await t.test(stage, async () => {
        const stageResult = deferred();
        const stageEntered = deferred();
        const stoppedTunnel = deferred();
        const waitedTunnel = deferred();
        let capability;
        let readinessCalls = 0;
        let stopResult;
        let duplicateStopResult;
        let waitResult;
        const context = harness({
          assertQuickTunnelReady(candidate) {
            assert.equal(candidate, context.lease);
            readinessCalls += 1;
            context.events.push('ready');
            if (stage === 'authorize-readiness' && readinessCalls === 2) {
              stopResult = stopGateBPublicWsInputsController(capability);
              duplicateStopResult = stopGateBPublicWsInputsController(capability);
              waitResult = waitGateBPublicWsInputsControllerClosed(capability);
              stageEntered.resolve(true);
              return stageResult.promise;
            }
            return Promise.resolve(true);
          },
          launchPublicWsInputs(bootstrap) {
            context.inputBootstraps.push(structuredClone(bootstrap));
            context.events.push(`inputs:${bootstrap.operation}`);
            if (stage === 'authorize' &&
                bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE) {
              stopResult = stopGateBPublicWsInputsController(capability);
              duplicateStopResult = stopGateBPublicWsInputsController(capability);
              waitResult = waitGateBPublicWsInputsControllerClosed(capability);
              stageEntered.resolve(true);
              return stageResult.promise;
            }
            return Promise.resolve(Object.freeze({
              status: bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT
                ? 'endpoint-provisioned'
                : bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE
                  ? 'prepared'
                  : 'authorized',
            }));
          },
          preflightPublicWsOnce(candidate) {
            context.preflights.push(structuredClone(candidate));
            context.events.push('preflight');
            if (stage === 'preflight') {
              stopResult = stopGateBPublicWsInputsController(capability);
              duplicateStopResult = stopGateBPublicWsInputsController(capability);
              waitResult = waitGateBPublicWsInputsControllerClosed(capability);
              stageEntered.resolve(true);
              return stageResult.promise;
            }
            return Promise.resolve(Object.freeze({ valid: true }));
          },
          stopQuickTunnel(candidate) {
            assert.equal(candidate, context.lease);
            context.state.stopCalls += 1;
            return stoppedTunnel.promise;
          },
          waitQuickTunnelClosed(candidate) {
            assert.equal(candidate, context.lease);
            context.state.waitCalls += 1;
            return waitedTunnel.promise;
          },
        });
        capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
        const authorization = authorizeAndPreflightGateBPublicWsInputs(capability, review());
        await stageEntered.promise;
        assert.equal(duplicateStopResult, stopResult);
        let terminalVisible = false;
        void stopResult.then(() => { terminalVisible = true; });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(terminalVisible, false);
        assert.throws(() => getGateBPublicWsInputsControllerStatus(capability));
        stageResult.resolve(Object.freeze(
          stage === 'authorize-readiness'
            ? true
            : stage === 'authorize'
              ? { status: 'authorized' }
              : { valid: true },
        ));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(terminalVisible, false);
        assert.equal(context.state.stopCalls, 1);
        assert.equal(context.state.waitCalls, 1);
        stoppedTunnel.resolve(true);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(terminalVisible, false);
        waitedTunnel.resolve(true);
        assert.equal(await authorization, QUARANTINED);
        assert.equal(await stopResult, QUARANTINED);
        assert.equal(await waitResult, QUARANTINED);
        assert.equal(getGateBPublicWsInputsControllerStatus(capability), QUARANTINED);
        assert.equal(context.events.includes('preflight'), stage === 'preflight');
      });
    }
  });

test('prepare exposes no cancellation capability before its bounded review transition settles',
  async () => {
    const provision = deferred();
    const context = harness({
      launchPublicWsInputs(bootstrap) {
        context.inputBootstraps.push(structuredClone(bootstrap));
        context.events.push(`inputs:${bootstrap.operation}`);
        if (bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
          return provision.promise;
        }
        return Promise.resolve(Object.freeze({ status: 'prepared' }));
      },
    });
    const pending = prepareGateBPublicWsInputsForReview(options(), context.injected);
    let exposed = false;
    void pending.then(() => { exposed = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(exposed, false);
    provision.resolve(Object.freeze({ status: 'endpoint-provisioned' }));
    const capability = await pending;
    assert.equal(getGateBPublicWsInputsControllerStatus(capability), REVIEW_REQUIRED);
  });

test('controller rejects hostile dependency thenables without reading or invoking then',
  async t => {
    const prepareCases = [
      ['provision', context => ({
        launchPublicWsInputs(bootstrap) {
          if (bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT) {
            return hostileThenable(context.counter);
          }
          return Promise.resolve(Object.freeze({ status: 'prepared' }));
        },
      })],
      ['tunnel', context => ({
        launchQuickTunnel() { return hostileThenable(context.counter); },
      })],
      ['readiness', context => ({
        assertQuickTunnelReady() { return hostileThenable(context.counter); },
      })],
      ['prepare', context => ({
        launchPublicWsInputs(bootstrap) {
          if (bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE) {
            return hostileThenable(context.counter);
          }
          return Promise.resolve(Object.freeze({ status: 'endpoint-provisioned' }));
        },
      })],
    ];
    for (const [name, makeChanges] of prepareCases) {
      await t.test(name, async () => {
        const state = { counter: { calls: 0, count: 0 } };
        const context = harness(makeChanges(state));
        const capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
        assert.equal(getGateBPublicWsInputsControllerStatus(capability), QUARANTINED);
        assert.deepEqual(state.counter, { calls: 0, count: 0 });
      });
    }

    for (const name of ['authorize-readiness', 'authorize', 'preflight']) {
      await t.test(name, async () => {
        const counter = { calls: 0, count: 0 };
        let readinessCalls = 0;
        const context = harness({
          assertQuickTunnelReady(candidate) {
            assert.equal(candidate, context.lease);
            readinessCalls += 1;
            if (name === 'authorize-readiness' && readinessCalls === 2) {
              return hostileThenable(counter);
            }
            return Promise.resolve(true);
          },
          launchPublicWsInputs(bootstrap) {
            if (name === 'authorize' &&
                bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.AUTHORIZE) {
              return hostileThenable(counter);
            }
            return Promise.resolve(Object.freeze({
              status: bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PROVISION_ENDPOINT
                ? 'endpoint-provisioned'
                : bootstrap.operation === GATE_B_PUBLIC_WS_INPUT_OPERATIONS.PREPARE
                  ? 'prepared'
                  : 'authorized',
            }));
          },
          preflightPublicWsOnce() {
            if (name === 'preflight') return hostileThenable(counter);
            return Promise.resolve(Object.freeze({ valid: true }));
          },
        });
        const capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
        assert.equal(
          await authorizeAndPreflightGateBPublicWsInputs(capability, review()),
          QUARANTINED,
        );
        assert.deepEqual(counter, { calls: 0, count: 0 });
      });
    }

    for (const name of ['stop', 'wait']) {
      await t.test(name, async () => {
        const counter = { calls: 0, count: 0 };
        const context = harness({
          stopQuickTunnel() {
            context.state.stopCalls += 1;
            return name === 'stop' ? hostileThenable(counter) : Promise.resolve(true);
          },
          waitQuickTunnelClosed() {
            context.state.waitCalls += 1;
            return name === 'wait' ? hostileThenable(counter) : Promise.resolve(true);
          },
        });
        const capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
        assert.equal(await stopGateBPublicWsInputsController(capability), QUARANTINED);
        assert.deepEqual(counter, { calls: 0, count: 0 });
        assert.equal(context.state.stopCalls, 1);
        assert.equal(context.state.waitCalls, 1);
      });
    }
  });

test('unproved owned-group closure yields quarantine and never retries', async () => {
  const context = harness({
    stopQuickTunnel() {
      context.state.stopCalls += 1;
      return Promise.reject(new Error('synthetic group uncertainty'));
    },
    async waitQuickTunnelClosed() {
      context.state.waitCalls += 1;
      throw new Error('synthetic group uncertainty');
    },
  });
  const capability = await prepareGateBPublicWsInputsForReview(options(), context.injected);
  assert.equal(await stopGateBPublicWsInputsController(capability), QUARANTINED);
  assert.equal(await waitGateBPublicWsInputsControllerClosed(capability), QUARANTINED);
  assert.equal(context.state.stopCalls, 1);
  assert.equal(context.state.waitCalls, 1);
  assert.equal(getGateBPublicWsInputsControllerStatus(capability), QUARANTINED);
});

test('controller source has no run, wallet-read, funding, publication, or network execution seam',
  async () => {
    const source = await readFile(
      new URL('../src/gate-b-public-ws-inputs-controller.js', import.meta.url),
      'utf8',
    );
    for (const token of [
      'runPublicWsOnce', 'executePublicWsOnce', 'paidFetch', 'publishRawTransaction',
      'randomBytes', 'KeyStore', 'readFile(', 'fetch(', 'WebSocket', 'node:http',
      'node:https', 'node:net', 'node:dns',
    ]) assert.equal(source.includes(token), false);
  });
