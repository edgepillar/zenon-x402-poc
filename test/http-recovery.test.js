import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as sdk from 'znn-typescript-sdk';
import { paidFetch, PaymentSubmissionOutcomeUnknownError, reconcilePayment } from '../src/buyer.js';
import { paymentIntentDigest, sha256Hex } from '../src/canonical.js';
import { createResourceServer } from '../src/resource-server.js';
import { MockExactZenonClient, MockExactZenonFacilitator } from '../src/mock-payment.js';
import { buildRequirement } from '../src/config.js';
import {
  createPaymentCapabilities,
  decodeB64Json,
  encodeB64Json,
  HEADERS,
} from '../src/x402-wire.js';

async function isolatePrototypeSensitiveTest(name, flag) {
  if (process.env[flag] === '1') return false;
  const isolatedEnvironment = { ...process.env, [flag]: '1' };
  delete isolatedEnvironment.NODE_TEST_CONTEXT;
  const isolated = spawn(process.execPath, [
    '--test',
    '--test-reporter=tap',
    '--test-name-pattern',
    `^${name}$`,
    process.argv[1],
  ], {
    env: isolatedEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  isolated.stdout.setEncoding('utf8');
  isolated.stderr.setEncoding('utf8');
  isolated.stdout.on('data', chunk => { stdout += chunk; });
  isolated.stderr.on('data', chunk => { stderr += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    isolated.once('error', reject);
    isolated.once('close', resolve);
  });
  assert.equal(exitCode, 0, 'isolated prototype-sensitive child failed');
  assert.match(stdout, /^# tests 1$/m, 'isolated child count missing');
  assert.match(stdout, /^# pass 1$/m, 'isolated child pass missing');
  assert.match(stdout, /^# fail 0$/m, 'isolated child failure count missing');
  assert.equal(stderr, '', 'isolated child wrote diagnostics');
  return true;
}

function assertPaidResponseIsPrivate(response) {
  assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*private\b/i);
  assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*no-store\b/i);
  assert.ok((response.headers.get('vary') ?? '').toLowerCase().split(',').map(value => value.trim())
    .includes(HEADERS.PAYMENT_SIGNATURE));
}

async function signedPayment(url, buyer = new MockExactZenonClient()) {
  const response = await fetch(`${url}/paid`);
  assert.equal(response.status, 402);
  assertPaidResponseIsPrivate(response);
  const paymentRequired = decodeB64Json(response.headers.get(HEADERS.PAYMENT_REQUIRED));
  const paymentPayload = await buyer.createPaymentPayload(paymentRequired, paymentRequired.accepts[0]);
  return { buyer, paymentPayload, paymentRequired };
}

function submitPayment(url, paymentPayload) {
  return fetch(`${url}/paid`, {
    headers: { [HEADERS.PAYMENT_SIGNATURE]: encodeB64Json(paymentPayload) },
  });
}

function reverseMemberOrder(value) {
  if (Array.isArray(value)) return value.map(reverseMemberOrder);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverseMemberOrder(value[key])]));
}

async function observePaidSubmission(response) {
  assertPaidResponseIsPrivate(response);
  const settlementHeader = response.headers.get(HEADERS.PAYMENT_RESPONSE);
  return {
    status: response.status,
    hasPaymentRequired: response.headers.has(HEADERS.PAYMENT_REQUIRED),
    body: await response.json(),
    settlement: settlementHeader === null ? null : decodeB64Json(settlementHeader),
  };
}

function assertSubmittedIdentityRecovery(observation, paymentPayload, {
  state,
  reason,
  forbiddenValues = [],
}) {
  assert.equal(observation.status, 409);
  assert.equal(observation.hasPaymentRequired, false);
  assert.deepEqual(Object.keys(observation.body).sort(), ['action', 'error', 'transaction']);
  assert.equal(observation.body.error, reason);
  assert.equal(observation.body.action, 'reuse_and_reconcile_same_payment');
  assert.equal(observation.body.transaction === paymentPayload.payload.transaction.hash, true);
  assert.notEqual(observation.settlement, null);
  assert.deepEqual(Object.keys(observation.settlement).sort(), [
    'errorReason', 'network', 'payer', 'retrySamePayment', 'state', 'success', 'transaction',
  ]);
  assert.equal(observation.settlement.success, false);
  assert.equal(observation.settlement.state, state);
  assert.equal(observation.settlement.errorReason, reason);
  assert.equal(observation.settlement.retrySamePayment, true);
  assert.equal(observation.settlement.network === paymentPayload.accepted.network, true);
  assert.equal(observation.settlement.transaction === paymentPayload.payload.transaction.hash, true);
  assert.equal(observation.settlement.payer === paymentPayload.payload.transaction.address, true);
  const publicResponse = JSON.stringify({
    body: observation.body,
    settlement: observation.settlement,
  });
  for (const internalValue of [
    'authorizationKey',
    'cachedResponse',
    'deliveryClaimed',
    'deliveryState',
    'transactionHash',
    'momentumEvidence',
    'protectedCallbacks',
    'unverified-cache',
    'delivery transition must not be attempted',
    ...forbiddenValues,
  ]) {
    assert.equal(publicResponse.includes(internalValue), false);
  }
}

function mismatchIdentityField(value, {
  field,
  operation = 'mismatch',
  transactionField = 'transaction',
  onAccessorRead = () => {},
}) {
  const changed = { ...value };
  if (transactionField === 'transactionHash' && Object.hasOwn(changed, 'transaction')) {
    changed.transactionHash = changed.transaction;
    delete changed.transaction;
  }
  if (transactionField === 'both' && Object.hasOwn(changed, 'transaction')) {
    changed.transactionHash = changed.transaction;
  }
  const targetField = field === 'transaction' ? transactionField : field;
  if (operation === 'missing') {
    delete changed[targetField];
    return changed;
  }
  let replacement;
  if (field === 'network') replacement = 'zenon:identity-mismatch';
  if (field === 'transaction') replacement = 'b'.repeat(64);
  if (field === 'payer') replacement = `mock-${'c'.repeat(32)}`;
  if (field === 'authorizationKey') replacement = 'd'.repeat(64);
  if (operation === 'conflict') {
    changed.transactionHash = replacement;
    return changed;
  }
  if (operation === 'accessor') {
    delete changed[targetField];
    Object.defineProperty(changed, targetField, {
      enumerable: true,
      configurable: true,
      get() {
        onAccessorRead();
        return replacement;
      },
    });
    return changed;
  }
  changed[targetField] = replacement;
  return changed;
}

function terminalAuthorizationKey(paymentPayload, requirement, paymentRequired) {
  return sha256Hex({
    domain: 'zenon-x402-authorization-v1',
    chainProfile: requirement.extra.zenonChain,
    intentDigest: paymentIntentDigest(paymentRequired, requirement),
    resourceDigest: sha256Hex(paymentRequired.resource),
    transactionHash: paymentPayload.payload.transaction.hash,
  });
}

function terminalInternalEvidence(paymentPayload, requirement, paymentRequired, state) {
  return {
    success: false,
    network: requirement.network,
    transaction: paymentPayload.payload.transaction.hash,
    payer: paymentPayload.payload.transaction.address,
    state,
    authorizationKey: terminalAuthorizationKey(paymentPayload, requirement, paymentRequired),
    deliveryState: 'NONE',
    retrySamePayment: false,
    errorReason: 'payment_reconciliation_terminal',
  };
}

function terminalPublicEvidence(paymentPayload, requirement, state) {
  return {
    success: false,
    network: requirement.network,
    transaction: paymentPayload.payload.transaction.hash,
    payer: paymentPayload.payload.transaction.address,
    state,
    errorReason: 'payment_reconciliation_terminal',
  };
}

test('resource server listen result ignores inherited then assimilation',
  { concurrency: false, timeout: 30_000 }, async () => {
    if (await isolatePrototypeSensitiveTest(
      'resource server listen result ignores inherited then assimilation',
      'X402_LISTEN_RESULT_ISOLATED',
    )) return;

    const requirement = await buildRequirement('mock');
    const app = createResourceServer({
      facilitator: new MockExactZenonFacilitator(),
      requirement,
      port: 0,
    });
    const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const defineProperty = Object.defineProperty;
    const hasOwn = Object.hasOwn;
    const ownKeys = Reflect.ownKeys;
    const previousThen = getOwnPropertyDescriptor(Object.prototype, 'then');
    const controlledRejection = Symbol('controlled listen result rejection');
    let inheritedThenObservations = 0;
    let listenShapeObserved = false;
    let listenerActiveWhenObserved = false;
    let prototypeRestored = false;
    let listenerClosed = false;
    let outcome;

    const descriptorsEqual = (left, right) => {
      if (left === undefined || right === undefined) return left === right;
      return left.value === right.value &&
        left.get === right.get &&
        left.set === right.set &&
        left.writable === right.writable &&
        left.enumerable === right.enumerable &&
        left.configurable === right.configurable;
    };

    try {
      defineProperty(Object.prototype, 'then', {
        configurable: true,
        get() {
          if ((typeof this !== 'object' && typeof this !== 'function') || this === null) {
            return undefined;
          }
          const keys = ownKeys(this);
          const hostDescriptor = getOwnPropertyDescriptor(this, 'host');
          const portDescriptor = getOwnPropertyDescriptor(this, 'port');
          const urlDescriptor = getOwnPropertyDescriptor(this, 'url');
          const isEnumerableData = descriptor => descriptor !== undefined &&
            hasOwn(descriptor, 'value') &&
            descriptor.enumerable === true &&
            descriptor.writable === true &&
            descriptor.configurable === true;
          const isListenResult = keys.length === 3 &&
            keys[0] === 'host' && keys[1] === 'port' && keys[2] === 'url' &&
            isEnumerableData(hostDescriptor) &&
            isEnumerableData(portDescriptor) &&
            isEnumerableData(urlDescriptor) &&
            typeof hostDescriptor.value === 'string' &&
            Number.isInteger(portDescriptor.value) &&
            typeof urlDescriptor.value === 'string';
          if (!isListenResult) return undefined;
          inheritedThenObservations += 1;
          listenShapeObserved = true;
          listenerActiveWhenObserved = app.server.listening;
          return (_resolve, reject) => reject(controlledRejection);
        },
      });
      outcome = await app.listen().then(
        value => ({ status: 'fulfilled', value, listenerActive: app.server.listening }),
        error => ({
          status: 'rejected',
          controlled: error === controlledRejection,
          listenerActive: app.server.listening,
        }),
      );
    } finally {
      if (previousThen) defineProperty(Object.prototype, 'then', previousThen);
      else delete Object.prototype.then;
      prototypeRestored = descriptorsEqual(
        getOwnPropertyDescriptor(Object.prototype, 'then'),
        previousThen,
      );
      if (app.server.listening) await app.close();
      listenerClosed = app.server.listening === false;
    }

    assert.equal(prototypeRestored, true, 'Object.prototype.then must be restored exactly');
    assert.equal(listenerClosed, true, 'the ephemeral listener must close');
    assert.equal(outcome.listenerActive, true, 'the listener must be active when listen settles');
    const baselineFailure = outcome.status === 'rejected' &&
      outcome.controlled === true &&
      inheritedThenObservations === 1 &&
      listenShapeObserved === true &&
      listenerActiveWhenObserved === true;
    const protectedFulfillment = outcome.status === 'fulfilled' &&
      inheritedThenObservations === 0;
    assert.equal(
      protectedFulfillment,
      true,
      baselineFailure
        ? 'listen result inherited-then assimilation reproduced'
        : 'listen result outcome did not match the protected boundary',
    );

    const result = outcome.value;
    const enumerableKeys = Object.keys(result);
    assert.equal(
      enumerableKeys.length === 3 &&
        enumerableKeys[0] === 'host' &&
        enumerableKeys[1] === 'port' &&
        enumerableKeys[2] === 'url',
      true,
      'listen result enumerable keys must remain exact',
    );
    assert.equal(
      typeof result.host === 'string' &&
        Number.isInteger(result.port) &&
        result.url === `http://${result.host}:${result.port}`,
      true,
      'listen result enumerable values must remain consistent',
    );
    const thenDescriptor = getOwnPropertyDescriptor(result, 'then');
    assert.equal(
      thenDescriptor !== undefined &&
        hasOwn(thenDescriptor, 'value') &&
        thenDescriptor.value === undefined &&
        thenDescriptor.enumerable === false &&
        thenDescriptor.writable === false &&
        thenDescriptor.configurable === false,
      true,
      'listen result must own the immutable hidden then descriptor',
    );
  });

test('recoverable non-positive settlement evidence is descriptor-safe and submitted-identity-only', async () => {
  const variants = ['mismatch', 'accessor'].flatMap(operation =>
    ['network', 'transaction', 'payer', 'authorizationKey']
      .map(field => ({ field, operation })));
  variants.push({ field: 'transaction', operation: 'accessor', throws: true });
  variants.push({ operation: 'proxy' });
  variants.push({
    operation: 'state',
    state: 'SUBMISSION_ACKNOWLEDGED',
    expectedReason: 'payment_reconciliation_required',
  });
  variants.push({
    operation: 'state',
    state: 'VALIDATED',
    expectedReason: 'payment_reconciliation_required',
  });
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    let settleCalls = 0;
    let deliveryTransitionCalls = 0;
    let protectedCallbacks = 0;
    let accessorReads = 0;
    let proxyTraps = 0;
    const facilitator = {
      async settle(paymentPayload) {
        settleCalls += 1;
        const recoverable = {
          success: false,
          network: requirement.network,
          transaction: paymentPayload.payload.transaction.hash,
          payer: paymentPayload.payload.transaction.address,
          authorizationKey: 'e'.repeat(64),
          state: 'SUBMISSION_OUTCOME_UNKNOWN',
          errorReason: 'private-recovery-detail',
          retrySamePayment: true,
          deliveryState: 'NONE',
          cachedResponse: { body: 'private-cached-detail' },
          cause: { detail: 'private-cause-detail' },
        };
        if (variant.operation === 'state') recoverable.state = variant.state;
        if (variant.operation === 'proxy') {
          return new Proxy(recoverable, {
            getOwnPropertyDescriptor(target, field) {
              if (field === 'network') {
                proxyTraps += 1;
                throw new Error('private proxy detail');
              }
              return Reflect.getOwnPropertyDescriptor(target, field);
            },
          });
        }
        if (variant.operation === 'state') return recoverable;
        return mismatchIdentityField(recoverable, {
          ...variant,
          onAccessorRead: () => {
            accessorReads += 1;
            if (variant.throws) throw new Error('private accessor detail');
          },
        });
      },
      async markDeliveryPending() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
      async markDelivered() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      observations.push({
        variant,
        paymentPayload,
        response: await observePaidSubmission(response),
        settleCalls,
        deliveryTransitionCalls,
        protectedCallbacks,
        accessorReads,
        proxyTraps,
        cachedResponseReleases: response.status === 200 ? 1 : 0,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.accessorReads, 0);
    if (observation.variant.operation === 'proxy') assert.equal(observation.proxyTraps > 0, true);
    assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
      state: observation.variant.state ?? 'SUBMISSION_OUTCOME_UNKNOWN',
      reason: observation.variant.expectedReason ?? 'payment_outcome_unknown',
      forbiddenValues: [
        'private-recovery-detail',
        'private-cached-detail',
        'private-cause-detail',
        'private proxy detail',
        'private accessor detail',
      ],
    });
    assert.equal(observation.settleCalls, 1);
    assert.equal(observation.deliveryTransitionCalls, 0);
    assert.equal(observation.protectedCallbacks, 0);
    assert.equal(observation.cachedResponseReleases, 0);
  }
});

test('cached delivered responses are snapshotted once before release', async () => {
  const variants = [
    { field: 'status' },
    { field: 'headers' },
    { field: 'header-member' },
    { field: 'body' },
    { field: 'body-member' },
    { field: 'stateful-body' },
    { field: 'stateful-proxy', accepted: true },
    { field: 'proxy' },
  ];
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let accessorReads = 0;
    let proxyTraps = 0;
    let proxyReads = 0;
    let deliveryTransitionCalls = 0;
    let protectedCallbacks = 0;
    const cachedResponse = {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: { ok: true, marker: 'unchecked-cached-content' },
    };
    if (variant.field === 'status' || variant.field === 'headers' || variant.field === 'body') {
      const retained = cachedResponse[variant.field];
      delete cachedResponse[variant.field];
      Object.defineProperty(cachedResponse, variant.field, {
        enumerable: true,
        get() {
          accessorReads += 1;
          return retained;
        },
      });
    }
    if (variant.field === 'header-member') {
      delete cachedResponse.headers['content-type'];
      Object.defineProperty(cachedResponse.headers, 'content-type', {
        enumerable: true,
        get() {
          accessorReads += 1;
          return 'application/json; charset=utf-8';
        },
      });
    }
    if (variant.field === 'body-member') {
      delete cachedResponse.body.marker;
      Object.defineProperty(cachedResponse.body, 'marker', {
        enumerable: true,
        get() {
          accessorReads += 1;
          return 'unchecked-cached-content';
        },
      });
    }
    if (variant.field === 'stateful-body') {
      delete cachedResponse.body;
      Object.defineProperty(cachedResponse, 'body', {
        enumerable: true,
        get() {
          accessorReads += 1;
          return accessorReads === 1
            ? { ok: true }
            : { ok: true, marker: 'unchecked-stateful-content' };
        },
      });
    }
    if (variant.field === 'stateful-proxy') {
      cachedResponse.body = { ok: true, marker: 'verified-snapshot-content' };
    }
    const suppliedCache = ['proxy', 'stateful-proxy'].includes(variant.field)
      ? new Proxy(cachedResponse, variant.field === 'proxy' ? {
          ownKeys() {
            proxyTraps += 1;
            throw new Error('private cached proxy detail');
          },
        } : {
          get(target, field, receiver) {
            if (field === 'body') {
              proxyReads += 1;
              return proxyReads === 1
                ? Reflect.get(target, field, receiver)
                : { ok: true, marker: 'unchecked-stateful-content' };
            }
            return Reflect.get(target, field, receiver);
          },
        })
      : cachedResponse;
    const facilitator = {
      async settle(...args) {
        const settlement = await honest.settle(...args);
        return { ...settlement, deliveryState: 'DELIVERED', cachedResponse: suppliedCache };
      },
      async markDeliveryPending() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
      async markDelivered() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      const observed = variant.accepted
        ? { status: response.status, body: await response.json() }
        : await observePaidSubmission(response);
      observations.push({
        variant,
        paymentPayload,
        response: observed,
        accessorReads,
        proxyTraps,
        proxyReads,
        deliveryTransitionCalls,
        protectedCallbacks,
        cachedResponseReleases: response.status === 200 ? 1 : 0,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    if (observation.variant.accepted) {
      assert.equal(observation.response.status, 200);
      assert.deepEqual(observation.response.body, {
        ok: true,
        marker: 'verified-snapshot-content',
      });
      assert.equal(observation.proxyReads, 0);
      assert.equal(observation.deliveryTransitionCalls, 0);
      assert.equal(observation.protectedCallbacks, 0);
      assert.equal(observation.cachedResponseReleases, 1);
      continue;
    }
    if (observation.variant.field === 'proxy') assert.equal(observation.proxyTraps > 0, true);
    else assert.equal(observation.accessorReads, 0);
    assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
      state: 'DELIVERY_PENDING',
      reason: 'resource_delivery_outcome_unknown',
      forbiddenValues: [
        'unchecked-cached-content',
        'unchecked-stateful-content',
        'private cached proxy detail',
      ],
    });
    assert.equal(observation.deliveryTransitionCalls, 0);
    assert.equal(observation.protectedCallbacks, 0);
    assert.equal(observation.cachedResponseReleases, 0);
  }
});

test('positive settlement transaction aliases must agree before delivery', async () => {
  const variants = [
    { alias: 'missing', accepted: true },
    { alias: 'equal', accepted: true },
    { alias: 'conflict', accepted: false },
    { alias: 'accessor', accepted: false },
  ];
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let accessorReads = 0;
    let protectedCallbacks = 0;
    let pendingCalls = 0;
    let deliveredCalls = 0;
    const facilitator = {
      async settle(...args) {
        const settlement = await honest.settle(...args);
        if (variant.alias === 'equal') settlement.transactionHash = settlement.transaction;
        if (variant.alias === 'conflict') settlement.transactionHash = 'b'.repeat(64);
        if (variant.alias === 'accessor') {
          Object.defineProperty(settlement, 'transactionHash', {
            enumerable: true,
            get() {
              accessorReads += 1;
              return settlement.transaction;
            },
          });
        }
        return settlement;
      },
      async markDeliveryPending(settlement) {
        pendingCalls += 1;
        return honest.markDeliveryPending(settlement);
      },
      async markDelivered(settlement, cachedResponse) {
        deliveredCalls += 1;
        return honest.markDelivered(settlement, cachedResponse);
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      const observed = variant.accepted
        ? { status: response.status, body: await response.json() }
        : await observePaidSubmission(response);
      observations.push({
        variant,
        paymentPayload,
        response: observed,
        accessorReads,
        protectedCallbacks,
        pendingCalls,
        deliveredCalls,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.accessorReads, 0);
    if (observation.variant.accepted) {
      assert.equal(observation.response.status, 200);
      assert.equal(observation.response.body.ok, true);
      assert.equal(observation.protectedCallbacks, 1);
      assert.equal(observation.pendingCalls, 1);
      assert.equal(observation.deliveredCalls, 1);
    } else {
      assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
        state: 'SUBMISSION_OUTCOME_UNKNOWN',
        reason: 'payment_outcome_unknown',
      });
      assert.equal(observation.protectedCallbacks, 0);
      assert.equal(observation.pendingCalls, 0);
      assert.equal(observation.deliveredCalls, 0);
    }
  }
});

test('already-delivered pending transition requires an exact unclaimed compound state', async () => {
  const variants = [
    { claim: 'false', accepted: true },
    { claim: 'missing', accepted: false },
    { claim: 'true', accepted: false },
    { claim: 'non-boolean', accepted: false },
    { claim: 'accessor', accepted: false },
  ];
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let pendingCalls = 0;
    let deliveredCalls = 0;
    let protectedCallbacks = 0;
    let accessorReads = 0;
    const cachedResponse = {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: { ok: true, marker: 'verified-cached-content' },
    };
    const facilitator = {
      async settle(...args) {
        return honest.settle(...args);
      },
      async markDeliveryPending(settlement) {
        pendingCalls += 1;
        const claim = {
          ...settlement,
          deliveryState: 'DELIVERED',
          deliveryClaimed: false,
          cachedResponse,
        };
        if (variant.claim === 'missing') delete claim.deliveryClaimed;
        if (variant.claim === 'true') claim.deliveryClaimed = true;
        if (variant.claim === 'non-boolean') claim.deliveryClaimed = 'false';
        if (variant.claim === 'accessor') {
          delete claim.deliveryClaimed;
          Object.defineProperty(claim, 'deliveryClaimed', {
            enumerable: true,
            get() {
              accessorReads += 1;
              return false;
            },
          });
        }
        return claim;
      },
      async markDelivered() {
        deliveredCalls += 1;
        throw new Error('markDelivered must not be called');
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      const observed = variant.accepted
        ? { status: response.status, body: await response.json() }
        : await observePaidSubmission(response);
      observations.push({
        variant,
        paymentPayload,
        response: observed,
        pendingCalls,
        deliveredCalls,
        protectedCallbacks,
        accessorReads,
        cachedResponseReleases: response.status === 200 ? 1 : 0,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.accessorReads, 0);
    assert.equal(observation.pendingCalls, 1);
    assert.equal(observation.deliveredCalls, 0);
    assert.equal(observation.protectedCallbacks, 0);
    if (observation.variant.accepted) {
      assert.equal(observation.response.status, 200);
      assert.deepEqual(observation.response.body, { ok: true, marker: 'verified-cached-content' });
      assert.equal(observation.cachedResponseReleases, 1);
    } else {
      assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
        state: 'DELIVERY_PENDING',
        reason: 'resource_delivery_outcome_unknown',
        forbiddenValues: ['verified-cached-content'],
      });
      assert.equal(observation.cachedResponseReleases, 0);
    }
  }
});

test('delivery capabilities are captured once with their receiver before delivery', async () => {
  const variants = ['markDeliveryPending', 'markDelivered'].flatMap(method => [
    { method, behavior: 'throwing-getter', accepted: false },
    { method, behavior: 'proxy-throw', accepted: false },
    { method, behavior: 'stateful-getter', accepted: true },
  ]);
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let capabilityReads = 0;
    let pendingCalls = 0;
    let deliveredCalls = 0;
    let protectedCallbacks = 0;
    let receiverMatches = true;
    let exposedFacilitator;
    const pendingMethod = async function pendingMethod(settlement) {
      receiverMatches = receiverMatches && this === exposedFacilitator;
      pendingCalls += 1;
      return honest.markDeliveryPending(settlement);
    };
    const deliveredMethod = async function deliveredMethod(settlement, cachedResponse) {
      receiverMatches = receiverMatches && this === exposedFacilitator;
      deliveredCalls += 1;
      return honest.markDelivered(settlement, cachedResponse);
    };
    const target = {
      async settle(...args) {
        return honest.settle(...args);
      },
      markDeliveryPending: pendingMethod,
      markDelivered: deliveredMethod,
    };
    if (variant.behavior !== 'proxy-throw') {
      const retainedMethod = variant.method === 'markDeliveryPending' ? pendingMethod : deliveredMethod;
      Object.defineProperty(target, variant.method, {
        enumerable: true,
        configurable: true,
        get() {
          capabilityReads += 1;
          if (variant.behavior === 'throwing-getter') {
            throw new Error('private delivery capability detail');
          }
          if (capabilityReads === 1) return retainedMethod;
          return async () => {
            throw new Error('private repeated capability detail');
          };
        },
      });
      exposedFacilitator = target;
    } else {
      exposedFacilitator = new Proxy(target, {
        get(value, field, receiver) {
          if (field === variant.method) {
            capabilityReads += 1;
            throw new Error('private delivery proxy detail');
          }
          return Reflect.get(value, field, receiver);
        },
      });
    }
    const app = createResourceServer({
      facilitator: exposedFacilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      assertPaidResponseIsPrivate(response);
      const observed = variant.accepted
        ? { status: response.status, body: await response.json() }
        : await observePaidSubmission(response);
      observations.push({
        variant,
        paymentPayload,
        response: observed,
        capabilityReads,
        pendingCalls,
        deliveredCalls,
        protectedCallbacks,
        receiverMatches,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.capabilityReads, 1);
    if (observation.variant.accepted) {
      assert.equal(observation.response.status, 200);
      assert.equal(observation.response.body.ok, true);
      assert.equal(observation.pendingCalls, 1);
      assert.equal(observation.deliveredCalls, 1);
      assert.equal(observation.protectedCallbacks, 1);
      assert.equal(observation.receiverMatches, true);
    } else {
      assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
        state: 'DELIVERY_PENDING',
        reason: 'resource_delivery_outcome_unknown',
        forbiddenValues: [
          'private delivery capability detail',
          'private repeated capability detail',
          'private delivery proxy detail',
        ],
      });
      assert.equal(observation.pendingCalls, 0);
      assert.equal(observation.deliveredCalls, 0);
      assert.equal(observation.protectedCallbacks, 0);
    }
  }
});

test('definite rejection binds an optional transaction alias before authorizing a new payment', async () => {
  const variants = [
    { alias: 'absent', accepted: true },
    { alias: 'equal', accepted: true },
    { alias: 'conflict', accepted: false },
    { alias: 'accessor', accepted: false },
    { alias: 'throwing-accessor', accepted: false },
  ];
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    let accessorReads = 0;
    let deliveryTransitionCalls = 0;
    let protectedCallbacks = 0;
    const facilitator = {
      async settle(paymentPayload) {
        const rejection = {
          success: false,
          network: requirement.network,
          transaction: paymentPayload.payload.transaction.hash,
          payer: paymentPayload.payload.transaction.address,
          state: 'VALIDATED',
          errorReason: 'private rejection detail',
          retrySamePayment: false,
          deliveryState: 'NONE',
        };
        if (variant.alias === 'equal') rejection.transactionHash = rejection.transaction;
        if (variant.alias === 'conflict') rejection.transactionHash = 'b'.repeat(64);
        if (['accessor', 'throwing-accessor'].includes(variant.alias)) {
          Object.defineProperty(rejection, 'transactionHash', {
            enumerable: true,
            get() {
              accessorReads += 1;
              if (variant.alias === 'throwing-accessor') {
                throw new Error('private rejection accessor detail');
              }
              return rejection.transaction;
            },
          });
        }
        return rejection;
      },
      async markDeliveryPending() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
      async markDelivered() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      assertPaidResponseIsPrivate(response);
      if (variant.accepted) {
        const settlement = decodeB64Json(response.headers.get(HEADERS.PAYMENT_RESPONSE));
        observations.push({
          variant,
          status: response.status,
          hasPaymentRequired: response.headers.has(HEADERS.PAYMENT_REQUIRED),
          body: await response.json(),
          settlement,
          accessorReads,
          deliveryTransitionCalls,
          protectedCallbacks,
        });
      } else {
        observations.push({
          variant,
          paymentPayload,
          response: await observePaidSubmission(response),
          accessorReads,
          deliveryTransitionCalls,
          protectedCallbacks,
        });
      }
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.accessorReads, 0);
    assert.equal(observation.deliveryTransitionCalls, 0);
    assert.equal(observation.protectedCallbacks, 0);
    if (observation.variant.accepted) {
      assert.equal(observation.status, 402);
      assert.equal(observation.hasPaymentRequired, true);
      assert.deepEqual(observation.body, { error: 'payment_settlement_failed' });
      assert.equal(observation.settlement.state, 'VALIDATED');
      assert.equal(observation.settlement.errorReason, 'payment_settlement_failed');
      assert.equal(Object.hasOwn(observation.settlement, 'transactionHash'), false);
    } else {
      assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
        state: 'SUBMISSION_OUTCOME_UNKNOWN',
        reason: 'payment_outcome_unknown',
        forbiddenValues: [
          'private rejection detail',
          'private rejection accessor detail',
        ],
      });
    }
  }
});

test('cached response snapshot enforces incremental member and byte budgets', async () => {
  const maximumBytes = 64 * 1024;
  const exactCache = {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: { value: '' },
  };
  const fixedBytes = Buffer.byteLength(JSON.stringify(exactCache), 'utf8');
  exactCache.body.value = 'x'.repeat(maximumBytes - fixedBytes);
  assert.equal(Buffer.byteLength(JSON.stringify(exactCache), 'utf8'), maximumBytes);

  const variants = [
    { kind: 'wide-object' },
    { kind: 'oversized-string' },
    { kind: 'oversized-keys' },
    { kind: 'sparse-array' },
    { kind: 'descriptor-failure' },
    { kind: 'exact-limit', accepted: true },
  ];
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let descriptorReads = 0;
    let afterBudgetReads = 0;
    let proxyFailures = 0;
    let deliveryTransitionCalls = 0;
    let protectedCallbacks = 0;
    let cachedResponse;

    if (variant.kind === 'exact-limit') {
      cachedResponse = exactCache;
    } else {
      let body;
      if (variant.kind === 'wide-object') {
        const target = Object.fromEntries(Array.from({ length: 4097 }, (_, index) => [`k${index}`, 0]));
        body = new Proxy(target, {
          getOwnPropertyDescriptor(value, field) {
            descriptorReads += 1;
            return Reflect.getOwnPropertyDescriptor(value, field);
          },
        });
      }
      if (variant.kind === 'oversized-string') {
        const target = { large: 'x'.repeat(maximumBytes + 1), after: true };
        body = new Proxy(target, {
          getOwnPropertyDescriptor(value, field) {
            descriptorReads += 1;
            if (field === 'after') afterBudgetReads += 1;
            return Reflect.getOwnPropertyDescriptor(value, field);
          },
        });
      }
      if (variant.kind === 'oversized-keys') {
        const target = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
          `k${index}-${'x'.repeat(700)}`,
          0,
        ]));
        body = new Proxy(target, {
          getOwnPropertyDescriptor(value, field) {
            descriptorReads += 1;
            return Reflect.getOwnPropertyDescriptor(value, field);
          },
        });
      }
      if (variant.kind === 'sparse-array') {
        const target = [];
        target.length = 4097;
        target[4096] = 0;
        body = new Proxy(target, {
          getOwnPropertyDescriptor(value, field) {
            descriptorReads += 1;
            if (field === '4096') afterBudgetReads += 1;
            return Reflect.getOwnPropertyDescriptor(value, field);
          },
        });
      }
      if (variant.kind === 'descriptor-failure') {
        body = new Proxy({ value: true }, {
          getOwnPropertyDescriptor() {
            proxyFailures += 1;
            throw new Error('private descriptor detail');
          },
        });
      }
      cachedResponse = {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body,
      };
    }

    const facilitator = {
      async settle(...args) {
        const settlement = await honest.settle(...args);
        return { ...settlement, deliveryState: 'DELIVERED', cachedResponse };
      },
      async markDeliveryPending() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
      async markDelivered() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      assertPaidResponseIsPrivate(response);
      const observed = variant.accepted
        ? { status: response.status, body: await response.json() }
        : await observePaidSubmission(response);
      observations.push({
        variant,
        paymentPayload,
        response: observed,
        descriptorReads,
        afterBudgetReads,
        proxyFailures,
        deliveryTransitionCalls,
        protectedCallbacks,
        cachedResponseReleases: response.status === 200 ? 1 : 0,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.deliveryTransitionCalls, 0);
    assert.equal(observation.protectedCallbacks, 0);
    if (observation.variant.accepted) {
      assert.equal(observation.response.status, 200);
      assert.equal(observation.response.body.value.length, maximumBytes - fixedBytes);
      assert.equal(observation.cachedResponseReleases, 1);
      continue;
    }
    assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
      state: 'DELIVERY_PENDING',
      reason: 'resource_delivery_outcome_unknown',
      forbiddenValues: ['private descriptor detail'],
    });
    assert.equal(observation.cachedResponseReleases, 0);
    if (['wide-object', 'oversized-keys'].includes(observation.variant.kind)) {
      assert.equal(observation.descriptorReads, 0);
    }
    if (['oversized-string', 'sparse-array'].includes(observation.variant.kind)) {
      assert.equal(observation.afterBudgetReads, 0);
    }
    if (observation.variant.kind === 'descriptor-failure') {
      assert.equal(observation.proxyFailures, 1);
    }
  }
});

test('live included non-positive evidence preserves delivery recovery', async () => {
  const variants = [
    { kind: 'delivery-state', deliveryState: 'DELIVERY_PENDING' },
    { kind: 'delivery-state', deliveryState: 'NONE' },
    ...['mismatch', 'accessor'].flatMap(operation =>
      ['network', 'transaction', 'payer', 'authorizationKey']
        .map(field => ({ kind: 'identity', field, operation, deliveryState: 'DELIVERY_PENDING' }))),
    { kind: 'delivery-missing' },
    { kind: 'delivery-wrong', deliveryState: 'DELIVERED' },
    { kind: 'delivery-accessor', deliveryState: 'DELIVERY_PENDING' },
    { kind: 'delivery-throwing-accessor', deliveryState: 'DELIVERY_PENDING' },
    { kind: 'delivery-proxy', deliveryState: 'DELIVERY_PENDING' },
  ];
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    let settleCalls = 0;
    let pendingCalls = 0;
    let deliveredCalls = 0;
    let protectedCallbacks = 0;
    let accessorReads = 0;
    let proxyTraps = 0;
    const facilitator = {
      async settle(paymentPayload) {
        settleCalls += 1;
        let recovery = {
          success: false,
          network: requirement.network,
          transaction: paymentPayload.payload.transaction.hash,
          payer: paymentPayload.payload.transaction.address,
          authorizationKey: 'e'.repeat(64),
          state: 'MOMENTUM_INCLUDED',
          errorReason: 'private live recovery detail',
          retrySamePayment: true,
          deliveryState: variant.deliveryState,
          journalRecord: { detail: 'private journal detail' },
        };
        if (variant.kind === 'identity') {
          recovery = mismatchIdentityField(recovery, {
            ...variant,
            onAccessorRead: () => { accessorReads += 1; },
          });
        }
        if (variant.kind === 'delivery-missing') delete recovery.deliveryState;
        if (['delivery-accessor', 'delivery-throwing-accessor'].includes(variant.kind)) {
          delete recovery.deliveryState;
          Object.defineProperty(recovery, 'deliveryState', {
            enumerable: true,
            get() {
              accessorReads += 1;
              if (variant.kind === 'delivery-throwing-accessor') {
                throw new Error('private delivery-state detail');
              }
              return variant.deliveryState;
            },
          });
        }
        if (variant.kind === 'delivery-proxy') {
          recovery = new Proxy(recovery, {
            getOwnPropertyDescriptor(value, field) {
              if (field === 'deliveryState') {
                proxyTraps += 1;
                throw new Error('private delivery-state proxy detail');
              }
              return Reflect.getOwnPropertyDescriptor(value, field);
            },
          });
        }
        return recovery;
      },
      async markDeliveryPending() {
        pendingCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
      async markDelivered() {
        deliveredCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      observations.push({
        variant,
        paymentPayload,
        response: await observePaidSubmission(response),
        settleCalls,
        pendingCalls,
        deliveredCalls,
        protectedCallbacks,
        accessorReads,
        proxyTraps,
        cachedResponseReleases: response.status === 200 ? 1 : 0,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.accessorReads, 0);
    if (observation.variant.kind === 'delivery-proxy') assert.equal(observation.proxyTraps, 1);
    assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
      state: 'DELIVERY_PENDING',
      reason: 'resource_delivery_outcome_unknown',
      forbiddenValues: [
        'private live recovery detail',
        'private journal detail',
        'private delivery-state detail',
        'private delivery-state proxy detail',
      ],
    });
    assert.notEqual(observation.response.body.error, 'payment_outcome_unknown');
    assert.notEqual(observation.response.settlement.state, 'SUBMISSION_OUTCOME_UNKNOWN');
    assert.equal(observation.settleCalls, 1);
    assert.equal(observation.pendingCalls, 0);
    assert.equal(observation.deliveredCalls, 0);
    assert.equal(observation.protectedCallbacks, 0);
    assert.equal(observation.cachedResponseReleases, 0);
  }
});

test('cached snapshots ignore inherited object and array toJSON hooks', { concurrency: false, timeout: 30_000 }, async () => {
  if (await isolatePrototypeSensitiveTest(
    'cached snapshots ignore inherited object and array toJSON hooks',
    'X402_TOJSON_ISOLATED',
  )) return;

  const variants = [
    {
      kind: 'object',
      prototype: Object.prototype,
      body: { cacheHookMarker: true, value: 'verified-object-content' },
    },
    {
      kind: 'nested-object',
      prototype: Object.prototype,
      body: { stable: true, nested: { cacheHookMarker: true, value: 'verified-nested-content' } },
    },
    {
      kind: 'array',
      prototype: Array.prototype,
      body: ['cache-array-marker', { value: 'verified-array-content' }],
    },
  ];
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let hookReads = 0;
    let deliveryTransitionCalls = 0;
    let protectedCallbacks = 0;
    const cachedResponse = {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: variant.body,
    };
    const facilitator = {
      async settle(...args) {
        const settlement = await honest.settle(...args);
        return { ...settlement, deliveryState: 'DELIVERED', cachedResponse };
      },
      async markDeliveryPending() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
      async markDelivered() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    let phase = 'payment setup';
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const encodedPayment = encodeB64Json(paymentPayload);
      const priorToJson = Object.getOwnPropertyDescriptor(variant.prototype, 'toJSON');
      let response;
      try {
        phase = 'prototype hook request';
        Object.defineProperty(variant.prototype, 'toJSON', {
          configurable: true,
          writable: true,
          value() {
            const markedObject = Object.hasOwn(this, 'cacheHookMarker');
            const markedArray = Array.isArray(this) && this[0] === 'cache-array-marker';
            if (!markedObject && !markedArray) return this;
            hookReads += 1;
            return { uncheckedHookContent: hookReads };
          },
        });
        response = await fetch(`${listening.url}/paid`, {
          headers: { [HEADERS.PAYMENT_SIGNATURE]: encodedPayment },
        });
      } finally {
        if (priorToJson) Object.defineProperty(variant.prototype, 'toJSON', priorToJson);
        else delete variant.prototype.toJSON;
      }
      assertPaidResponseIsPrivate(response);
      phase = 'response parsing';
      observations.push({
        variant,
        status: response.status,
        body: await response.json(),
        hookReads,
        deliveryTransitionCalls,
        protectedCallbacks,
      });
    } catch {
      assert.fail(`serialization hook regression failed during ${phase}`);
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.hookReads, 0, 'inherited toJSON hook executed');
    assert.equal(observation.status, 200, 'cached response was not released');
    assert.deepEqual(observation.body, observation.variant.body, 'cached response content changed');
    assert.equal(JSON.stringify(observation.body).includes('uncheckedHookContent'), false,
      'unchecked hook content was released');
    assert.equal(observation.deliveryTransitionCalls, 0, 'unexpected delivery transition');
    assert.equal(observation.protectedCallbacks, 0, 'unexpected protected callback');
  }
});

test('evidence snapshots ignore inherited identity setters during population',
  { concurrency: false, timeout: 30_000 }, async () => {
    if (await isolatePrototypeSensitiveTest(
      'evidence snapshots ignore inherited identity setters during population',
      'X402_EVIDENCE_SETTER_ISOLATED',
    )) return;

    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let inheritedSetterCalls = 0;
    let pendingCalls = 0;
    let deliveredCalls = 0;
    let protectedCallbacks = 0;
    const facilitator = {
      async settle(...args) {
        const settlement = await honest.settle(...args);
        return mismatchIdentityField(settlement, { field: 'transaction' });
      },
      async markDeliveryPending(...args) {
        pendingCalls += 1;
        return honest.markDeliveryPending(...args);
      },
      async markDelivered(...args) {
        deliveredCalls += 1;
        return honest.markDelivered(...args);
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const priorDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'authorizationKey');
      let response;
      try {
        Object.defineProperty(Object.prototype, 'authorizationKey', {
          configurable: true,
          set() {
            inheritedSetterCalls += 1;
          },
        });
        response = await submitPayment(listening.url, paymentPayload);
      } finally {
        if (priorDescriptor) Object.defineProperty(Object.prototype, 'authorizationKey', priorDescriptor);
        else delete Object.prototype.authorizationKey;
      }
      const observation = await observePaidSubmission(response);
      assert.equal(inheritedSetterCalls, 0);
      assertSubmittedIdentityRecovery(observation, paymentPayload, {
        state: 'SUBMISSION_OUTCOME_UNKNOWN',
        reason: 'payment_outcome_unknown',
      });
      assert.equal(pendingCalls, 0);
      assert.equal(deliveredCalls, 0);
      assert.equal(protectedCallbacks, 0);
    } finally {
      await app.close();
    }
  });

test('cached array snapshots ignore inherited numeric setters during population',
  { concurrency: false, timeout: 30_000 }, async () => {
    if (await isolatePrototypeSensitiveTest(
      'cached array snapshots ignore inherited numeric setters during population',
      'X402_ARRAY_SETTER_ISOLATED',
    )) return;

    const inheritedIndex = 1023;
    const inheritedIndexKey = String(inheritedIndex);
    const firstSentinel = 'array-probe-first';
    const penultimateSentinel = 'array-probe-penultimate';
    const finalSentinel = 'array-probe-final';
    const validBody = Array.from({ length: inheritedIndex + 1 }, (_, index) => index);
    validBody[0] = firstSentinel;
    validBody[inheritedIndex - 1] = penultimateSentinel;
    validBody[inheritedIndex] = finalSentinel;
    let invalidAccessorReads = 0;
    const invalidBody = Array.from({ length: inheritedIndex + 1 }, (_, index) => index);
    Object.defineProperty(invalidBody, inheritedIndexKey, {
      configurable: true,
      enumerable: true,
      get() {
        invalidAccessorReads += 1;
        return inheritedIndex;
      },
    });
    const variants = [
      { kind: 'valid', body: validBody },
      { kind: 'invalid-accessor', body: invalidBody },
    ];
    let inheritedSetterCalls = 0;
    const observations = [];

    for (const variant of variants) {
      const requirement = await buildRequirement('mock');
      const honest = new MockExactZenonFacilitator();
      let pendingCalls = 0;
      let deliveredCalls = 0;
      let protectedCallbacks = 0;
      const facilitator = {
        async settle(...args) {
          const settlement = await honest.settle(...args);
          return {
            ...settlement,
            deliveryState: 'DELIVERED',
            cachedResponse: {
              status: 200,
              headers: { 'content-type': 'application/json; charset=utf-8' },
              body: variant.body,
            },
          };
        },
        async markDeliveryPending() {
          pendingCalls += 1;
          throw new Error('unexpected pending transition');
        },
        async markDelivered() {
          deliveredCalls += 1;
          throw new Error('unexpected delivered transition');
        },
      };
      const app = createResourceServer({
        facilitator,
        requirement,
        resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
      });
      const listening = await app.listen();
      try {
        const { paymentPayload } = await signedPayment(listening.url);
        const priorDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, inheritedIndexKey);
        let response;
        try {
          Object.defineProperty(Array.prototype, inheritedIndexKey, {
            configurable: true,
            set(value) {
              const firstMember = Object.getOwnPropertyDescriptor(this, '0');
              const penultimateMember = Object.getOwnPropertyDescriptor(
                this,
                String(inheritedIndex - 1),
              );
              const productionSnapshotShaped = Array.isArray(this)
                && this.length === inheritedIndex
                && firstMember?.value === firstSentinel
                && penultimateMember?.value === penultimateSentinel
                && value === finalSentinel;
              Object.defineProperty(this, inheritedIndexKey, {
                configurable: true,
                enumerable: true,
                value,
                writable: true,
              });
              if (productionSnapshotShaped) inheritedSetterCalls += 1;
            },
          });
          const unrelatedArray = [];
          const unrelatedValue = 'unrelated-array-value';
          unrelatedArray[inheritedIndex] = unrelatedValue;
          assert.equal(Object.hasOwn(unrelatedArray, inheritedIndexKey), true);
          assert.equal(unrelatedArray[inheritedIndex], unrelatedValue);
          assert.equal(inheritedSetterCalls, 0);
          response = await submitPayment(listening.url, paymentPayload);
        } finally {
          if (priorDescriptor) Object.defineProperty(Array.prototype, inheritedIndexKey, priorDescriptor);
          else delete Array.prototype[inheritedIndexKey];
        }
        observations.push({
          variant,
          paymentPayload,
          response: await observePaidSubmission(response),
          pendingCalls,
          deliveredCalls,
          protectedCallbacks,
        });
      } finally {
        await app.close();
      }
    }

    assert.equal(inheritedSetterCalls, 0);
    assert.equal(invalidAccessorReads, 0);
    for (const observation of observations) {
      assert.equal(observation.pendingCalls, 0);
      assert.equal(observation.deliveredCalls, 0);
      assert.equal(observation.protectedCallbacks, 0);
      if (observation.variant.kind === 'valid') {
        assert.equal(observation.response.status, 200);
        assert.equal(observation.response.body.length, validBody.length);
        assert.equal(observation.response.body[inheritedIndex], validBody[inheritedIndex]);
        assert.equal(observation.response.body.every((value, index) => value === validBody[index]), true);
        const firstSerialization = JSON.stringify(observation.response.body);
        const secondSerialization = JSON.stringify(observation.response.body);
        assert.equal(firstSerialization === secondSerialization, true);
      } else {
        assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
          state: 'DELIVERY_PENDING',
          reason: 'resource_delivery_outcome_unknown',
        });
      }
    }
  });

test('transition state cache and identity evidence fail closed on every malformed shape', async () => {
  const pendingVariants = [
    { field: 'deliveryState', operation: 'missing' },
    { field: 'deliveryState', operation: 'accessor' },
    { field: 'deliveryState', operation: 'throwing-accessor' },
    { field: 'deliveryState', operation: 'wrong' },
    { field: 'deliveryClaimed', operation: 'missing' },
    { field: 'deliveryClaimed', operation: 'accessor' },
    { field: 'deliveryClaimed', operation: 'throwing-accessor' },
    { field: 'deliveryClaimed', operation: 'non-boolean' },
    { field: 'deliveryClaimed', operation: 'wrong' },
    { field: 'compound', operation: 'wrong' },
  ];
  const deliveredVariants = [
    { field: 'deliveryState', operation: 'missing' },
    { field: 'deliveryState', operation: 'accessor' },
    { field: 'deliveryState', operation: 'throwing-accessor' },
    { field: 'deliveryState', operation: 'wrong' },
    { field: 'cachedResponse', operation: 'missing' },
    { field: 'cachedResponse', operation: 'accessor' },
    { field: 'cachedResponse', operation: 'throwing-accessor' },
    { field: 'cachedResponse', operation: 'invalid' },
    { field: 'authorizationKey', operation: 'missing' },
    { field: 'payer', operation: 'missing' },
    { field: 'transaction', operation: 'missing' },
    { field: 'transaction', operation: 'conflict' },
  ];
  const observations = [];

  for (const variant of pendingVariants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let pendingCalls = 0;
    let deliveredCalls = 0;
    let protectedCallbacks = 0;
    let accessorReads = 0;
    const facilitator = {
      async settle(...args) {
        return honest.settle(...args);
      },
      async markDeliveryPending(settlement) {
        pendingCalls += 1;
        const claim = await honest.markDeliveryPending(settlement);
        if (variant.field === 'compound') {
          claim.deliveryState = 'DELIVERED';
          claim.deliveryClaimed = true;
          return claim;
        }
        if (variant.operation === 'missing') delete claim[variant.field];
        if (variant.operation === 'wrong' && variant.field === 'deliveryState') claim.deliveryState = 'NONE';
        if (variant.operation === 'wrong' && variant.field === 'deliveryClaimed') claim.deliveryClaimed = false;
        if (variant.operation === 'non-boolean') claim.deliveryClaimed = 'true';
        if (['accessor', 'throwing-accessor'].includes(variant.operation)) {
          const retained = claim[variant.field];
          delete claim[variant.field];
          Object.defineProperty(claim, variant.field, {
            enumerable: true,
            get() {
              accessorReads += 1;
              if (variant.operation === 'throwing-accessor') {
                throw new Error('private pending accessor detail');
              }
              return retained;
            },
          });
        }
        return claim;
      },
      async markDelivered() {
        deliveredCalls += 1;
        throw new Error('markDelivered must not be called');
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      observations.push({
        stage: 'pending',
        paymentPayload,
        response: await observePaidSubmission(response),
        pendingCalls,
        deliveredCalls,
        protectedCallbacks,
        accessorReads,
        cachedResponseReleases: response.status === 200 ? 1 : 0,
      });
    } finally {
      await app.close();
    }
  }

  for (const variant of deliveredVariants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let pendingCalls = 0;
    let deliveredCalls = 0;
    let protectedCallbacks = 0;
    let accessorReads = 0;
    const facilitator = {
      async settle(...args) {
        return honest.settle(...args);
      },
      async markDeliveryPending(settlement) {
        pendingCalls += 1;
        return honest.markDeliveryPending(settlement);
      },
      async markDelivered(settlement, cachedResponse) {
        deliveredCalls += 1;
        const delivered = await honest.markDelivered(settlement, cachedResponse);
        if (variant.operation === 'missing') {
          if (variant.field === 'transaction') {
            delete delivered.transaction;
            delete delivered.transactionHash;
          } else {
            delete delivered[variant.field];
          }
        }
        if (variant.operation === 'wrong') delivered.deliveryState = 'DELIVERY_PENDING';
        if (variant.operation === 'invalid') {
          delivered.cachedResponse = {
            status: 201,
            headers: { 'content-type': 'application/json; charset=utf-8' },
            body: { uncheckedCacheContent: true },
          };
        }
        if (variant.operation === 'conflict') {
          const transaction = delivered.transaction ?? delivered.transactionHash;
          delivered.transaction = transaction;
          delivered.transactionHash = 'b'.repeat(64);
        }
        if (['accessor', 'throwing-accessor'].includes(variant.operation)) {
          const retained = delivered[variant.field];
          delete delivered[variant.field];
          Object.defineProperty(delivered, variant.field, {
            enumerable: true,
            get() {
              accessorReads += 1;
              if (variant.operation === 'throwing-accessor') {
                throw new Error('private delivered accessor detail');
              }
              return retained;
            },
          });
        }
        return delivered;
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      observations.push({
        stage: 'delivered',
        paymentPayload,
        response: await observePaidSubmission(response),
        pendingCalls,
        deliveredCalls,
        protectedCallbacks,
        accessorReads,
        cachedResponseReleases: response.status === 200 ? 1 : 0,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.accessorReads, 0);
    assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
      state: 'DELIVERY_PENDING',
      reason: 'resource_delivery_outcome_unknown',
      forbiddenValues: [
        'private pending accessor detail',
        'private delivered accessor detail',
        'uncheckedCacheContent',
      ],
    });
    assert.equal(observation.pendingCalls, 1);
    assert.equal(observation.deliveredCalls, observation.stage === 'delivered' ? 1 : 0);
    assert.equal(observation.protectedCallbacks, observation.stage === 'delivered' ? 1 : 0);
    assert.equal(observation.cachedResponseReleases, 0);
  }
});

test('positive settlement evidence identity mismatch fails closed before delivery', async () => {
  const identityFields = ['network', 'transaction', 'payer', 'authorizationKey'];
  const variants = ['accessor', 'missing', 'mismatch']
    .flatMap(operation => identityFields.map(field => ({ field, operation })));
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let settleCalls = 0;
    let deliveryTransitionCalls = 0;
    let protectedCallbacks = 0;
    let accessorReads = 0;
    const facilitator = {
      async settle(...args) {
        settleCalls += 1;
        const settlement = await honest.settle(...args);
        return mismatchIdentityField(settlement, {
          ...variant,
          onAccessorRead: () => { accessorReads += 1; },
        });
      },
      async markDeliveryPending(settlement) {
        deliveryTransitionCalls += 1;
        return { ...settlement, deliveryState: 'DELIVERY_PENDING', deliveryClaimed: true };
      },
      async markDelivered(settlement, cachedResponse) {
        deliveryTransitionCalls += 1;
        return { ...settlement, deliveryState: 'DELIVERED', cachedResponse };
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      observations.push({
        variant,
        paymentPayload,
        response: await observePaidSubmission(response),
        settleCalls,
        deliveryTransitionCalls,
        protectedCallbacks,
        accessorReads,
        cachedResponseReleases: response.status === 200 ? 1 : 0,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.accessorReads, 0, `${observation.variant.field} must be an own data property`);
    assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
      state: 'SUBMISSION_OUTCOME_UNKNOWN',
      reason: 'payment_outcome_unknown',
    });
    assert.equal(observation.settleCalls, 1);
    assert.equal(observation.deliveryTransitionCalls, 0);
    assert.equal(observation.protectedCallbacks, 0);
    assert.equal(observation.cachedResponseReleases, 0);
  }
});

test('cached delivered settlement identity mismatch never releases the protected response', async () => {
  const variants = ['missing', 'mismatch'].flatMap(operation =>
    ['network', 'transaction', 'payer', 'authorizationKey']
      .map(field => ({ field, operation })));
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let settleCalls = 0;
    let deliveryTransitionCalls = 0;
    let protectedCallbacks = 0;
    const cachedResponse = {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: { ok: true, entitlement: 'unverified-cache' },
    };
    const facilitator = {
      async settle(...args) {
        settleCalls += 1;
        const settlement = mismatchIdentityField(await honest.settle(...args), variant);
        return { ...settlement, deliveryState: 'DELIVERED', cachedResponse };
      },
      async markDeliveryPending() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
      async markDelivered() {
        deliveryTransitionCalls += 1;
        throw new Error('delivery transition must not be attempted');
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      observations.push({
        paymentPayload,
        response: await observePaidSubmission(response),
        settleCalls,
        deliveryTransitionCalls,
        protectedCallbacks,
        cachedResponseReleases: response.status === 200 ? 1 : 0,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
      state: 'SUBMISSION_OUTCOME_UNKNOWN',
      reason: 'payment_outcome_unknown',
    });
    assert.equal(observation.settleCalls, 1);
    assert.equal(observation.deliveryTransitionCalls, 0);
    assert.equal(observation.protectedCallbacks, 0);
    assert.equal(observation.cachedResponseReleases, 0);
  }
});

test('pending delivery transition identity mismatch fails closed before the protected callback', async () => {
  const variants = ['transaction', 'transactionHash'].flatMap(transactionField =>
    ['accessor', 'missing', 'mismatch'].flatMap(operation =>
      ['authorizationKey', 'payer', 'transaction']
        .map(field => ({ field, operation, transactionField }))));
  variants.push({ field: 'transaction', operation: 'conflict', transactionField: 'both' });
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let settleCalls = 0;
    let pendingCalls = 0;
    let deliveredCalls = 0;
    let protectedCallbacks = 0;
    let accessorReads = 0;
    const facilitator = {
      async settle(...args) {
        settleCalls += 1;
        return honest.settle(...args);
      },
      async markDeliveryPending(settlement) {
        pendingCalls += 1;
        const claim = await honest.markDeliveryPending(settlement);
        return mismatchIdentityField(claim, {
          ...variant,
          onAccessorRead: () => { accessorReads += 1; },
        });
      },
      async markDelivered(settlement, cachedResponse) {
        deliveredCalls += 1;
        return honest.markDelivered(settlement, cachedResponse);
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      observations.push({
        paymentPayload,
        response: await observePaidSubmission(response),
        settleCalls,
        pendingCalls,
        deliveredCalls,
        protectedCallbacks,
        accessorReads,
        cachedResponseReleases: response.status === 200 ? 1 : 0,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.accessorReads, 0);
    assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
      state: 'DELIVERY_PENDING',
      reason: 'resource_delivery_outcome_unknown',
    });
    assert.equal(observation.settleCalls, 1);
    assert.equal(observation.pendingCalls, 1);
    assert.equal(observation.deliveredCalls, 0);
    assert.equal(observation.protectedCallbacks, 0);
    assert.equal(observation.cachedResponseReleases, 0);
  }
});

test('delivered transition identity mismatch fails closed after one protected callback', async () => {
  const variants = ['transaction', 'transactionHash'].flatMap(transactionField =>
    ['accessor', 'mismatch'].flatMap(operation =>
      ['authorizationKey', 'payer', 'transaction']
        .map(field => ({ field, operation, transactionField }))));
  const observations = [];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let settleCalls = 0;
    let pendingCalls = 0;
    let deliveredCalls = 0;
    let protectedCallbacks = 0;
    let accessorReads = 0;
    const facilitator = {
      async settle(...args) {
        settleCalls += 1;
        return honest.settle(...args);
      },
      async markDeliveryPending(settlement) {
        pendingCalls += 1;
        return honest.markDeliveryPending(settlement);
      },
      async markDelivered(settlement, cachedResponse) {
        deliveredCalls += 1;
        const delivered = await honest.markDelivered(settlement, cachedResponse);
        return mismatchIdentityField(delivered, {
          ...variant,
          onAccessorRead: () => { accessorReads += 1; },
        });
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => ({ ok: true, protectedCallbacks: ++protectedCallbacks }),
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      observations.push({
        paymentPayload,
        response: await observePaidSubmission(response),
        settleCalls,
        pendingCalls,
        deliveredCalls,
        protectedCallbacks,
        accessorReads,
        cachedResponseReleases: response.status === 200 ? 1 : 0,
      });
    } finally {
      await app.close();
    }
  }

  for (const observation of observations) {
    assert.equal(observation.accessorReads, 0);
    assertSubmittedIdentityRecovery(observation.response, observation.paymentPayload, {
      state: 'DELIVERY_PENDING',
      reason: 'resource_delivery_outcome_unknown',
    });
    assert.equal(observation.settleCalls, 1);
    assert.equal(observation.pendingCalls, 1);
    assert.equal(observation.deliveredCalls, 1);
    assert.equal(observation.protectedCallbacks, 1);
    assert.equal(observation.cachedResponseReleases, 0);
  }
});

test('safe HTTP retry returns the cached protected response without rerunning delivery', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  let deliveries = 0;
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => ({ ok: true, entitlement: 'deterministic-result', deliveries: ++deliveries }),
  });
  const listening = await app.listen();
  try {
    const { paymentPayload } = await signedPayment(listening.url);
    paymentPayload.extensions = {};
    const first = await submitPayment(listening.url, paymentPayload);
    const firstText = await first.text();
    const second = await submitPayment(listening.url, paymentPayload);
    const secondText = await second.text();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assertPaidResponseIsPrivate(first);
    assertPaidResponseIsPrivate(second);
    assert.equal(secondText, firstText);
    assert.equal(deliveries, 1);
    assert.equal(facilitator.records.size, 1);

    const firstSettlement = decodeB64Json(first.headers.get(HEADERS.PAYMENT_RESPONSE));
    const secondSettlement = decodeB64Json(second.headers.get(HEADERS.PAYMENT_RESPONSE));
    assert.equal(firstSettlement.transaction, secondSettlement.transaction);
    assert.equal(firstSettlement.state, 'MOMENTUM_INCLUDED');
    assert.equal(secondSettlement.state, 'MOMENTUM_INCLUDED');
  } finally {
    await app.close();
  }
});

test('resource authorization outcomes ignore inherited then after durable delivery',
  { concurrency: false, timeout: 30_000 }, async () => {
    if (await isolatePrototypeSensitiveTest(
      'resource authorization outcomes ignore inherited then after durable delivery',
      'X402_RESOURCE_OUTCOME_THEN_ISOLATED',
    )) return;

    const facilitator = new MockExactZenonFacilitator();
    const requirement = await buildRequirement('mock');
    let handlerExecutions = 0;
    let handlerResult;
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => {
        handlerExecutions += 1;
        handlerResult = { ok: true, entitlement: 'stable-result' };
        return handlerResult;
      },
    });
    const listening = await app.listen();
    let first;
    let second;
    let recordAfterFirst;
    let recordAfterReplay;
    let hookObservations = 0;
    const priorDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const encodedPayment = encodeB64Json(paymentPayload);
      try {
        Object.defineProperty(Object.prototype, 'then', {
          configurable: true,
          get() {
            try {
              const kind = Object.getOwnPropertyDescriptor(this, 'kind');
              const settlement = Object.getOwnPropertyDescriptor(this, 'settlement');
              const cached = Object.getOwnPropertyDescriptor(this, 'cached');
              const isDeliveredOutcome = kind?.value === 'delivered' &&
                Object.hasOwn(settlement ?? {}, 'value') &&
                Object.hasOwn(cached ?? {}, 'value');
              if (!isDeliveredOutcome) return undefined;
            } catch {
              return undefined;
            }
            hookObservations += 1;
            throw new Error('authorization outcome then hook');
          },
        });
        first = await fetch(`${listening.url}/paid`, {
          headers: { [HEADERS.PAYMENT_SIGNATURE]: encodedPayment },
        });
        recordAfterFirst = facilitator.records.values().next().value;
        second = await fetch(`${listening.url}/paid`, {
          headers: { [HEADERS.PAYMENT_SIGNATURE]: encodedPayment },
        });
        recordAfterReplay = facilitator.records.values().next().value;
      } finally {
        if (priorDescriptor) Object.defineProperty(Object.prototype, 'then', priorDescriptor);
        else delete Object.prototype.then;
      }

      assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype, 'then'), priorDescriptor);
      const firstSettlementHeader = first.headers.get(HEADERS.PAYMENT_RESPONSE);
      const replaySettlementHeader = second.headers.get(HEADERS.PAYMENT_RESPONSE);
      assert.equal(typeof firstSettlementHeader, 'string', 'first payment response header missing');
      assert.equal(typeof replaySettlementHeader, 'string', 'replay payment response header missing');
      const firstSettlement = decodeB64Json(firstSettlementHeader);
      const replaySettlement = decodeB64Json(replaySettlementHeader);
      const expectedSettlementFields = ['network', 'payer', 'state', 'success', 'transaction'];
      const settlementEvidence = settlement => ({
        fields: Object.keys(settlement).sort(),
        success: settlement.success,
        state: settlement.state,
        networkMatches: settlement.network === paymentPayload.accepted.network,
        transactionMatches: settlement.transaction === paymentPayload.payload.transaction.hash,
        payerMatches: settlement.payer === paymentPayload.payload.transaction.address,
      });
      const expectedSettlementEvidence = {
        fields: expectedSettlementFields,
        success: true,
        state: 'MOMENTUM_INCLUDED',
        networkMatches: true,
        transactionMatches: true,
        payerMatches: true,
      };
      const firstSettlementEvidence = settlementEvidence(firstSettlement);
      const replaySettlementEvidence = settlementEvidence(replaySettlement);
      assert.deepEqual(firstSettlementEvidence, expectedSettlementEvidence);
      assert.deepEqual(replaySettlementEvidence, expectedSettlementEvidence);
      assert.deepEqual(replaySettlementEvidence, firstSettlementEvidence);
      assert.equal(recordAfterFirst?.deliveryState, 'DELIVERED');
      assert.notEqual(recordAfterFirst?.cachedResponse, null);
      assert.notEqual(recordAfterFirst?.cachedResponse?.body, handlerResult);
      assert.equal(recordAfterReplay, recordAfterFirst);
      assert.equal(recordAfterReplay?.cachedResponse, recordAfterFirst?.cachedResponse);
      assert.equal(handlerExecutions, 1);
      assert.equal(hookObservations, 0, 'post-delivery authorization outcome assimilation observed');
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assertPaidResponseIsPrivate(first);
      assertPaidResponseIsPrivate(second);
      assert.equal(await second.text(), await first.text());
    } finally {
      await app.close();
    }
  });

test('paidFetch terminal outcomes ignore inherited then assimilation',
  { concurrency: false, timeout: 30_000 }, async () => {
    if (await isolatePrototypeSensitiveTest(
      'paidFetch terminal outcomes ignore inherited then assimilation',
      'X402_PAIDFETCH_OUTCOME_THEN_ISOLATED',
    )) return;

    const facilitator = new MockExactZenonFacilitator();
    const requirement = await buildRequirement('mock');
    let handlerExecutions = 0;
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => {
        handlerExecutions += 1;
        return { ok: true, entitlement: 'stable-result' };
      },
    });
    const listening = await app.listen();
    try {
      const { paymentPayload: retainedPayment } = await signedPayment(listening.url);
      const retainedClient = {
        async createPaymentPayload() {
          return retainedPayment;
        },
      };
      const passthroughResponse = new Response(null, { status: 204 });
      const outcomeFields = ['response', 'paymentRequired', 'paymentPayload', 'settlement'];
      const inheritedThenFailure = new Error('controlled paidFetch outcome assimilation');
      const captureOutcome = promise => promise.then(
        value => ({ status: 'fulfilled', value }),
        reason => ({ status: 'rejected', controlled: reason === inheritedThenFailure }),
      );
      const priorDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
      let hookObservations = 0;
      let passthrough;
      let first;
      let replay;
      let recordAfterFirst;
      let recordAfterReplay;
      try {
        Object.defineProperty(Object.prototype, 'then', {
          configurable: true,
          get() {
            try {
              const isTerminalOutcome = outcomeFields.every(field => {
                const descriptor = Object.getOwnPropertyDescriptor(this, field);
                return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
              });
              if (!isTerminalOutcome) return undefined;
            } catch {
              return undefined;
            }
            hookObservations += 1;
            throw inheritedThenFailure;
          },
        });

        passthrough = await captureOutcome(paidFetch(
          `${listening.url}/passthrough`,
          retainedClient,
          async () => passthroughResponse,
        ));
        first = await captureOutcome(paidFetch(`${listening.url}/paid`, retainedClient));
        recordAfterFirst = facilitator.records.values().next().value;
        replay = await captureOutcome(paidFetch(`${listening.url}/paid`, retainedClient));
        recordAfterReplay = facilitator.records.values().next().value;
      } finally {
        if (priorDescriptor) Object.defineProperty(Object.prototype, 'then', priorDescriptor);
        else delete Object.prototype.then;
      }

      assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype, 'then'), priorDescriptor);
      assert.equal(facilitator.records.size, 1);
      assert.equal(handlerExecutions, 1);
      assert.equal(recordAfterFirst?.deliveryState, 'DELIVERED');
      assert.notEqual(recordAfterFirst?.cachedResponse, null);
      assert.equal(recordAfterReplay, recordAfterFirst);
      assert.equal(recordAfterReplay?.cachedResponse, recordAfterFirst?.cachedResponse);
      assert.deepEqual(
        [passthrough.status, first.status, replay.status],
        ['fulfilled', 'fulfilled', 'fulfilled'],
        'paidFetch terminal outcomes must fulfill without inherited then assimilation',
      );

      const outcomes = [passthrough.value, first.value, replay.value];
      for (const outcome of outcomes) {
        assert.deepEqual(Object.keys(outcome).sort(), [...outcomeFields].sort());
        const thenDescriptor = Object.getOwnPropertyDescriptor(outcome, 'then');
        assert.deepEqual({
          value: thenDescriptor?.value,
          enumerable: thenDescriptor?.enumerable,
          writable: thenDescriptor?.writable,
          configurable: thenDescriptor?.configurable,
        }, {
          value: undefined,
          enumerable: false,
          writable: false,
          configurable: false,
        });
      }

      assert.equal(passthrough.value.response === passthroughResponse, true);
      assert.equal(passthrough.value.paymentRequired, null);
      assert.equal(passthrough.value.paymentPayload, null);
      assert.equal(passthrough.value.settlement, null);
      assert.equal(first.value.paymentPayload === retainedPayment, true);
      assert.equal(replay.value.paymentPayload === retainedPayment, true);
      assert.deepEqual({
        success: first.value.settlement.success === true && replay.value.settlement.success === true,
        state: first.value.settlement.state === 'MOMENTUM_INCLUDED' &&
          replay.value.settlement.state === 'MOMENTUM_INCLUDED',
        network: first.value.settlement.network === replay.value.settlement.network,
        transaction: first.value.settlement.transaction === replay.value.settlement.transaction,
        payer: first.value.settlement.payer === replay.value.settlement.payer,
      }, {
        success: true,
        state: true,
        network: true,
        transaction: true,
        payer: true,
      });
      assert.equal(first.value.response.status, 200);
      assert.equal(replay.value.response.status, 200);
      assertPaidResponseIsPrivate(first.value.response);
      assertPaidResponseIsPrivate(replay.value.response);
      assert.equal(await replay.value.response.text() === await first.value.response.text(), true);
      assert.equal(hookObservations, 0, 'inherited paidFetch outcome then hook observed');
    } finally {
      await app.close();
    }
  });

test('concurrent duplicate HTTP requests converge on one protected-resource callback', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  let deliveries = 0;
  let releaseDelivery;
  let deliveryStarted;
  const started = new Promise(resolve => { deliveryStarted = resolve; });
  const deliveryGate = new Promise(resolve => { releaseDelivery = resolve; });
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => {
      deliveries += 1;
      deliveryStarted();
      await deliveryGate;
      return { ok: true, entitlement: 'shared-result' };
    },
  });
  const listening = await app.listen();
  try {
    const { paymentPayload } = await signedPayment(listening.url);
    const firstPending = submitPayment(listening.url, paymentPayload);
    await started;
    const secondPending = submitPayment(listening.url, paymentPayload);

    await new Promise(resolve => setImmediate(resolve));
    releaseDelivery();
    const [first, second] = await Promise.all([firstPending, secondPending]);
    const [firstText, secondText] = await Promise.all([first.text(), second.text()]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(firstText, secondText);
    assert.equal(deliveries, 1);
  } finally {
    releaseDelivery?.();
    await app.close();
  }
});

test('reordered JSON for the same payment converges on the same in-flight delivery', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  let deliveries = 0;
  let releaseDelivery;
  let deliveryStarted;
  const started = new Promise(resolve => { deliveryStarted = resolve; });
  const gate = new Promise(resolve => { releaseDelivery = resolve; });
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => {
      deliveries += 1;
      deliveryStarted();
      await gate;
      return { ok: true, entitlement: 'canonical-in-flight-key' };
    },
  });
  const listening = await app.listen();
  try {
    const { paymentPayload } = await signedPayment(listening.url);
    const reordered = reverseMemberOrder(paymentPayload);
    assert.deepEqual(reordered, paymentPayload);
    assert.notEqual(encodeB64Json(reordered), encodeB64Json(paymentPayload));

    const firstPending = submitPayment(listening.url, paymentPayload);
    await started;
    const secondPending = submitPayment(listening.url, reordered);
    await new Promise(resolve => setImmediate(resolve));
    releaseDelivery();

    const [first, second] = await Promise.all([firstPending, secondPending]);
    const [firstText, secondText] = await Promise.all([first.text(), second.text()]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(firstText, secondText);
    assert.equal(deliveries, 1);
  } finally {
    releaseDelivery?.();
    await app.close();
  }
});

test('journal-scope delivery claim prevents duplicate callbacks across server instances', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  let deliveries = 0;
  let releaseDelivery;
  let deliveryStarted;
  const started = new Promise(resolve => { deliveryStarted = resolve; });
  const gate = new Promise(resolve => { releaseDelivery = resolve; });
  const handler = async () => {
    deliveries += 1;
    deliveryStarted();
    await gate;
    return { ok: true, entitlement: 'one-claim' };
  };
  const options = {
    facilitator,
    requirement,
    advertisedBaseUrl: 'http://resource.example',
    resourceHandler: handler,
  };
  const firstApp = createResourceServer(options);
  const secondApp = createResourceServer(options);
  const firstListening = await firstApp.listen();
  const secondListening = await secondApp.listen();
  try {
    const initial = await fetch(`${firstListening.url}/paid`);
    const required = decodeB64Json(initial.headers.get(HEADERS.PAYMENT_REQUIRED));
    const buyer = new MockExactZenonClient();
    const payload = await buyer.createPaymentPayload(required, required.accepts[0]);
    const firstPending = submitPayment(firstListening.url, payload);
    await started;
    const second = await submitPayment(secondListening.url, payload);
    assert.equal(second.status, 409);
    assert.equal((await second.json()).error, 'resource_delivery_outcome_unknown');
    releaseDelivery();
    const first = await firstPending;
    assert.equal(first.status, 200);
    assert.equal(deliveries, 1);
  } finally {
    releaseDelivery?.();
    await Promise.all([firstApp.close(), secondApp.close()]);
  }
});

test('unknown publication outcome returns a distinct retry-same-payment response and does not deliver', async () => {
  const requirement = await buildRequirement('mock');
  let deliveries = 0;
  let settleCalls = 0;
  const facilitator = {
    async settle(paymentPayload) {
      settleCalls += 1;
      return {
        success: false,
        network: requirement.network,
        transaction: paymentPayload.payload.transaction.hash,
        payer: paymentPayload.payload.transaction.address,
        state: 'SUBMISSION_OUTCOME_UNKNOWN',
        errorReason: 'submission_outcome_unknown',
        retrySamePayment: true,
      };
    },
  };
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => {
      deliveries += 1;
      return { ok: true };
    },
  });
  const listening = await app.listen();
  try {
    const { paymentPayload } = await signedPayment(listening.url);
    const response = await submitPayment(listening.url, paymentPayload);
    const body = await response.json();
    const publicSettlement = decodeB64Json(response.headers.get(HEADERS.PAYMENT_RESPONSE));

    assert.equal(response.status, 409);
    assertPaidResponseIsPrivate(response);
    assert.equal(body.error, 'payment_outcome_unknown');
    assert.equal(body.action, 'reuse_and_reconcile_same_payment');
    assert.equal(publicSettlement.success, false);
    assert.equal(publicSettlement.state, 'SUBMISSION_OUTCOME_UNKNOWN');
    assert.equal(publicSettlement.retrySamePayment, true);
    assert.equal(deliveries, 0);
    assert.equal(settleCalls, 1);
  } finally {
    await app.close();
  }
});

test('definite rejection evidence requires exact pre-publication settlement state', async () => {
  const requirement = await buildRequirement('mock');
  let deliveries = 0;
  let settleCalls = 0;
  let transformSettlement = value => value;
  let mutateInputs = () => {};
  const facilitator = {
    async settle(paymentPayload, selectedRequirement) {
      settleCalls += 1;
      mutateInputs(paymentPayload, selectedRequirement);
      return transformSettlement({
        success: false,
        network: selectedRequirement.network,
        transaction: paymentPayload.payload.transaction.hash,
        payer: paymentPayload.payload.transaction.address,
        state: 'VALIDATED',
        errorReason: 'sensitive_frontier_detail',
        cause: new Error('sensitive facilitator cause'),
        retrySamePayment: false,
        deliveryState: 'NONE',
      });
    },
  };
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => ({ ok: true, deliveries: ++deliveries }),
  });
  const listening = await app.listen();
  try {
    const { paymentPayload, paymentRequired } = await signedPayment(listening.url);
    const definite = await submitPayment(listening.url, paymentPayload);
    const publicSettlement = decodeB64Json(definite.headers.get(HEADERS.PAYMENT_RESPONSE));

    assert.equal(definite.status, 402);
    assertPaidResponseIsPrivate(definite);
    assert.deepEqual(decodeB64Json(definite.headers.get(HEADERS.PAYMENT_REQUIRED)), paymentRequired);
    assert.deepEqual(publicSettlement, {
      success: false,
      network: requirement.network,
      transaction: paymentPayload.payload.transaction.hash,
      payer: paymentPayload.payload.transaction.address,
      state: 'VALIDATED',
      errorReason: 'payment_settlement_failed',
    });
    assert.equal(Object.hasOwn(publicSettlement, 'retrySamePayment'), false);
    const definiteText = await definite.text();
    assert.match(definiteText, /payment_settlement_failed/);
    assert.doesNotMatch(definiteText, /sensitive_frontier_detail|sensitive facilitator cause/);

    const variants = [
      { transform: value => { delete value.success; return value; }, status: 402 },
      { transform: value => ({ ...value, success: 0 }), status: 402 },
      { transform: value => { delete value.retrySamePayment; return value; }, status: 402 },
      { transform: value => ({ ...value, retrySamePayment: true }), status: 409 },
      { transform: value => ({ ...value, retrySamePayment: 0 }), status: 402 },
      { transform: value => { delete value.deliveryState; return value; }, status: 402 },
      { transform: value => ({ ...value, deliveryState: 'DELIVERY_PENDING' }), status: 402 },
      {
        transform: value => {
          Object.defineProperty(value, 'deliveryState', { enumerable: true, get: () => 'NONE' });
          return value;
        },
        status: 402,
      },
      { transform: value => ({ ...value, network: 'zenon:testnet' }), status: 402 },
      { transform: value => ({ ...value, transaction: '0'.repeat(64) }), status: 402 },
      { transform: value => ({ ...value, payer: `mock-${'f'.repeat(32)}` }), status: 402 },
      { transform: value => ({ ...value, payer: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f' }), status: 402 },
      { transform: value => ({ ...value, state: 'SUBMISSION_OUTCOME_UNKNOWN' }), status: 409 },
      { transform: () => null, status: 402 },
      { transform: () => [], status: 402 },
    ];
    for (const { transform, status } of variants) {
      transformSettlement = transform;
      const response = await submitPayment(listening.url, paymentPayload);
      assert.equal(response.status, status);
      assertPaidResponseIsPrivate(response);
      if (response.status === 409) {
        const recovery = decodeB64Json(response.headers.get(HEADERS.PAYMENT_RESPONSE));
        assert.equal(recovery.retrySamePayment, true);
      } else {
        assert.equal(response.headers.get(HEADERS.PAYMENT_RESPONSE), null);
      }
      assert.match(await response.text(), /payment_|resource_/);
    }

    transformSettlement = value => value;
    mutateInputs = (submittedPayload, selectedRequirement) => {
      selectedRequirement.network = 'zenon:testnet';
      submittedPayload.accepted.network = 'zenon:testnet';
      submittedPayload.payload.transaction.hash = 'a'.repeat(64);
      submittedPayload.payload.transaction.address = `mock-${'e'.repeat(32)}`;
    };
    const mutatedInput = await submitPayment(listening.url, paymentPayload);
    assert.equal(mutatedInput.status, 402);
    assert.equal(mutatedInput.headers.get(HEADERS.PAYMENT_RESPONSE), null);

    mutateInputs = () => {};
    transformSettlement = () => { throw new Error('sensitive facilitator failure'); };
    const unexpected = await submitPayment(listening.url, paymentPayload);
    const unexpectedText = await unexpected.text();
    assert.equal(unexpected.status, 500);
    assert.equal(unexpected.headers.get(HEADERS.PAYMENT_RESPONSE), null);
    assert.match(unexpectedText, /internal_error/);
    assert.doesNotMatch(unexpectedText, /sensitive facilitator failure/);
    assertPaidResponseIsPrivate(unexpected);

    assert.equal(deliveries, 0);
    assert.equal(settleCalls, variants.length + 3);
  } finally {
    await app.close();
  }
});

test('definite rejection rejects a checksum-invalid live payer before exposing evidence', async () => {
  const mockRequirement = await buildRequirement('mock');
  const requirement = {
    ...structuredClone(mockRequirement),
    network: 'zenon:testnet',
    asset: 'zts1qqqqqqqqqqqqtq587y',
    payTo: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
    extra: {
      ...structuredClone(mockRequirement.extra),
      zenonChain: {
        version: 1,
        chainIdentifier: '7',
        genesisMomentumHash: '7'.repeat(64),
      },
    },
  };
  const invalidPayer = 'z1qpqc8a473rn25e7fn9qs7eswkdl240d4c742qq';
  const transaction = '1'.repeat(64);
  const facilitator = {
    async settle() {
      return {
        success: false,
        network: requirement.network,
        transaction,
        payer: invalidPayer,
        state: 'VALIDATED',
        retrySamePayment: false,
        deliveryState: 'NONE',
      };
    },
  };
  const app = createResourceServer({
    facilitator,
    requirement,
    advertisedBaseUrl: 'https://resource.example',
  });
  const listening = await app.listen();
  try {
    const response = await submitPayment(listening.url, {
      x402Version: 2,
      resource: {
        url: 'https://resource.example/paid',
        description: 'Zenon x402 PoC protected resource',
        mimeType: 'application/json',
      },
      accepted: structuredClone(requirement),
      payload: {
        transaction: { hash: transaction, address: invalidPayer },
        intentDigest: '2'.repeat(64),
      },
    });
    assert.equal(response.status, 402);
    assert.equal(response.headers.get(HEADERS.PAYMENT_RESPONSE), null);
    assert.deepEqual(await response.json(), { error: 'payment_settlement_failed' });
    assertPaidResponseIsPrivate(response);
  } finally {
    await app.close();
  }
});

test('a known transaction cannot authorize a different protected resource', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  let firstDeliveries = 0;
  let secondDeliveries = 0;
  const firstApp = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => ({ ok: true, source: 'first', deliveries: ++firstDeliveries }),
  });
  const secondApp = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => ({ ok: true, source: 'second', deliveries: ++secondDeliveries }),
  });
  const firstListening = await firstApp.listen();
  const secondListening = await secondApp.listen();
  try {
    const { paymentPayload } = await signedPayment(firstListening.url);
    const authorized = await submitPayment(firstListening.url, paymentPayload);
    assert.equal(authorized.status, 200);
    await authorized.arrayBuffer();

    const replay = await submitPayment(secondListening.url, paymentPayload);
    assert.equal(replay.status, 402);
    assert.equal(replay.headers.get(HEADERS.PAYMENT_RESPONSE), null);
    assert.equal(firstDeliveries, 1);
    assert.equal(secondDeliveries, 0);
    assert.equal(facilitator.records.size, 1);
  } finally {
    await Promise.all([firstApp.close(), secondApp.close()]);
  }
});

test('malformed payment header returns a private 400 without payment response headers', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  const app = createResourceServer({ facilitator, requirement });
  const listening = await app.listen();
  try {
    const response = await fetch(`${listening.url}/paid`, {
      headers: { [HEADERS.PAYMENT_SIGNATURE]: 'not canonical base64!' },
    });
    assert.equal(response.status, 400);
    assertPaidResponseIsPrivate(response);
    assert.deepEqual(await response.json(), { error: 'invalid_payment' });
    assert.equal(response.headers.get(HEADERS.PAYMENT_REQUIRED), null);
    assert.equal(response.headers.get(HEADERS.PAYMENT_RESPONSE), null);
  } finally {
    await app.close();
  }
});

test('resource server snapshots its validated requirement at construction', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  const app = createResourceServer({ facilitator, requirement });
  requirement.amount = '101';
  const listening = await app.listen();
  try {
    const response = await fetch(`${listening.url}/paid`);
    const paymentRequired = decodeB64Json(response.headers.get(HEADERS.PAYMENT_REQUIRED));
    assert.equal(paymentRequired.accepts[0].amount, '100');
  } finally {
    await app.close();
  }
});

test('resource server rejects configured non-function resource handlers before server creation', async () => {
  const invalidHandlers = [null, false, 0, '', {}, [], 'configured'];

  for (const resourceHandler of invalidHandlers) {
    const requirement = await buildRequirement('mock');
    const effects = {
      settlement: 0,
      publication: 0,
      journal: 0,
      pending: 0,
      delivered: 0,
      callback: 0,
    };
    const facilitator = {
      async settle() {
        effects.settlement += 1;
        effects.publication += 1;
        effects.journal += 1;
        throw new Error('unexpected settlement');
      },
      async markDeliveryPending() {
        effects.pending += 1;
        throw new Error('unexpected pending transition');
      },
      async markDelivered() {
        effects.delivered += 1;
        throw new Error('unexpected delivered transition');
      },
    };
    let app;

    assert.throws(
      () => {
        app = createResourceServer({ facilitator, requirement, resourceHandler });
      },
      { name: 'Error', message: 'resourceHandler must be a function' },
      'non-function resource handler must fail at construction',
    );
    await Promise.resolve();
    assert.equal(app, undefined, 'invalid configuration must not return a server handle');
    assert.deepEqual(effects, {
      settlement: 0,
      publication: 0,
      journal: 0,
      pending: 0,
      delivered: 0,
      callback: 0,
    }, 'invalid configuration must have zero downstream effects');
  }
});

test('omitted or undefined resource handler preserves the default protected response', async () => {
  for (const explicitUndefined of [false, true]) {
    const facilitator = new MockExactZenonFacilitator();
    const requirement = await buildRequirement('mock');
    const options = { facilitator, requirement };
    if (explicitUndefined) options.resourceHandler = undefined;
    const app = createResourceServer(options);
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(body).sort(), [
        'generatedAt',
        'message',
        'network',
        'ok',
        'payer',
        'transaction',
      ]);
      assert.equal(body.ok, true);
      assert.equal(body.message, 'paid resource unlocked');
      assert.equal(typeof body.generatedAt, 'string');
    } finally {
      await app.close();
    }
  }
});

test('valid resource handler runs only after settlement and durable delivery claim', async () => {
  const honest = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  const events = [];
  let callbacks = 0;
  const facilitator = {
    async settle(...args) {
      const result = await honest.settle(...args);
      events.push('settled');
      return result;
    },
    async markDeliveryPending(...args) {
      const result = await honest.markDeliveryPending(...args);
      events.push('claimed');
      return result;
    },
    async markDelivered(...args) {
      events.push('delivered');
      return honest.markDelivered(...args);
    },
  };
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => {
      callbacks += 1;
      events.push('handler');
      return { ok: true, source: 'configured-handler' };
    },
  });
  const listening = await app.listen();
  try {
    const { paymentPayload } = await signedPayment(listening.url);
    const response = await submitPayment(listening.url, paymentPayload);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, source: 'configured-handler' });
    assert.equal(callbacks, 1);
    assert.deepEqual(events, ['settled', 'claimed', 'handler', 'delivered']);
  } finally {
    await app.close();
  }
});

test('paid resource fails closed without a positive durable delivery claim', async () => {
  const requirement = await buildRequirement('mock');
  const honest = new MockExactZenonFacilitator();
  let deliveries = 0;
  let pendingCalls = 0;
  let deliveredCalls = 0;
  const facilitator = {
    async settle(...args) {
      return honest.settle(...args);
    },
    async markDeliveryPending(settlement) {
      pendingCalls += 1;
      return {
        ...settlement,
        deliveryState: 'DELIVERY_PENDING',
        deliveryClaimed: false,
      };
    },
    async markDelivered() {
      deliveredCalls += 1;
      throw new Error('must not be called');
    },
  };
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => ({ ok: true, deliveries: ++deliveries }),
  });
  const listening = await app.listen();
  try {
    const { paymentPayload } = await signedPayment(listening.url);
    const response = await submitPayment(listening.url, paymentPayload);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).action, 'reuse_and_reconcile_same_payment');
    assert.equal(deliveries, 0);
    assert.equal(pendingCalls, 1);
    assert.equal(deliveredCalls, 0);
    assertPaidResponseIsPrivate(response);
  } finally {
    await app.close();
  }
});

test('delivery callback failure remains recoverable and is never executed again', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  let deliveries = 0;
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => {
      deliveries += 1;
      throw new Error('private callback detail');
    },
  });
  const listening = await app.listen();
  try {
    const { paymentPayload } = await signedPayment(listening.url);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await submitPayment(listening.url, paymentPayload);
      const text = await response.text();
      assert.equal(response.status, 409);
      assert.match(text, /reuse_and_reconcile_same_payment/);
      assert.doesNotMatch(text, /private callback detail/);
      assertPaidResponseIsPrivate(response);
    }
    assert.equal(deliveries, 1);
  } finally {
    await app.close();
  }
});

test('non-JSON protected responses fail closed after one delivery claim', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  let deliveries = 0;
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => {
      deliveries += 1;
      return { unsupported: 1n };
    },
  });
  const listening = await app.listen();
  try {
    const { paymentPayload } = await signedPayment(listening.url);
    const response = await submitPayment(listening.url, paymentPayload);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, 'resource_delivery_outcome_unknown');
    assert.equal(deliveries, 1);
  } finally {
    await app.close();
  }
});

test('in-flight canonicalization rejects deeply nested unvalidated transactions safely', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  const app = createResourceServer({ facilitator, requirement });
  const listening = await app.listen();
  try {
    const { paymentPayload } = await signedPayment(listening.url);
    let nested = null;
    for (let depth = 0; depth < 1_000; depth += 1) nested = [nested];
    paymentPayload.payload.transaction = { nested };
    const response = await submitPayment(listening.url, paymentPayload);
    assert.equal(response.status, 400);
    assertPaidResponseIsPrivate(response);
    assert.deepEqual(await response.json(), { error: 'invalid_payment' });
    assert.equal(response.headers.get(HEADERS.PAYMENT_REQUIRED), null);
    assert.equal(response.headers.get(HEADERS.PAYMENT_RESPONSE), null);
  } finally {
    await app.close();
  }
});

async function buyerChallenge(resourceUrl, requirement) {
  requirement ??= await buildRequirement('mock');
  return {
    requirement,
    paymentRequired: {
      x402Version: 2,
      resource: { url: resourceUrl, description: 'buyer test', mimeType: 'application/json' },
      accepts: [requirement],
    },
  };
}

function encodedJsonAtByteLength(value, decodedBytes) {
  const json = JSON.stringify(value);
  const currentBytes = Buffer.byteLength(json, 'utf8');
  assert.ok(currentBytes <= decodedBytes, 'encoded JSON fixture must fit the target size');
  const encoded = Buffer.from(`${json}${' '.repeat(decodedBytes - currentBytes)}`, 'utf8').toString('base64');
  assert.equal(Buffer.from(encoded, 'base64').toString('base64'), encoded, 'fixture Base64 must be canonical');
  return encoded;
}

function challengeResponse(paymentRequired) {
  return {
    status: 402,
    url: paymentRequired.resource.url,
    headers: new Headers({ [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(paymentRequired) }),
  };
}

function nonCanonicalBase64Alias(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  assert.notEqual(padding, 0);
  const index = value.length - padding - 1;
  const replacement = alphabet[alphabet.indexOf(value[index]) ^ 1];
  const alias = `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
  assert.deepEqual(Buffer.from(alias, 'base64'), Buffer.from(value, 'base64'));
  return alias;
}

function buyerSettlementAttempt(paymentRequired, requirement, {
  status = 402,
  transform = value => value,
  header = 'encoded',
} = {}) {
  let calls = 0;
  return paidFetch(paymentRequired.resource.url, new MockExactZenonClient(), async (_url, options) => {
    calls += 1;
    if (calls === 1) return challengeResponse(paymentRequired);
    const paymentPayload = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
    const settlement = transform({
      success: false,
      network: requirement.network,
      transaction: paymentPayload.payload.transaction.hash,
      payer: paymentPayload.payload.transaction.address,
      state: 'VALIDATED',
      errorReason: 'payment_settlement_failed',
    });
    const headers = new Headers();
    if (header === 'encoded') headers.set(HEADERS.PAYMENT_RESPONSE, encodeB64Json(settlement));
    if (header === 'malformed') headers.set(HEADERS.PAYMENT_RESPONSE, 'not canonical base64!');
    if (header === 'noncanonical') {
      let json = JSON.stringify(settlement);
      while (Buffer.byteLength(json, 'utf8') % 3 === 0) json += ' ';
      headers.set(HEADERS.PAYMENT_RESPONSE, nonCanonicalBase64Alias(Buffer.from(json).toString('base64')));
    }
    if (header === 'oversized') {
      const json = `${' '.repeat((8 * 1024) + 1)}${JSON.stringify(settlement)}`;
      headers.set(HEADERS.PAYMENT_RESPONSE, Buffer.from(json, 'utf8').toString('base64'));
    }
    return { status, headers };
  });
}

const BUYER_OBSERVATION_RESOURCE = 'http://buyer-observation.invalid/paid';

function settlementEvidenceForStatus(status, requirement, paymentPayload) {
  const identity = {
    network: requirement.network,
    transaction: paymentPayload.payload.transaction.hash,
    payer: paymentPayload.payload.transaction.address,
  };
  if (status >= 200 && status < 300) {
    return { success: true, ...identity, state: 'MOMENTUM_INCLUDED' };
  }
  if (status === 402) {
    return {
      success: false,
      ...identity,
      state: 'VALIDATED',
      errorReason: 'payment_settlement_failed',
    };
  }
  if (status === 409) {
    return {
      success: false,
      ...identity,
      state: 'SUBMISSION_OUTCOME_UNKNOWN',
      errorReason: 'payment_outcome_unknown',
      retrySamePayment: true,
    };
  }
  throw new Error('unsupported test settlement status');
}

async function runAcceptedObservedResponse(status, makeResponse) {
  const { paymentRequired, requirement } = await buyerChallenge(BUYER_OBSERVATION_RESOURCE);
  const originalChallenge = structuredClone(paymentRequired);
  const exactClient = new MockExactZenonClient();
  let constructions = 0;
  let fetches = 0;
  let submittedPayment;
  let observedResponse;
  const result = await paidFetch(paymentRequired.resource.url, {
    async createPaymentPayload(...args) {
      constructions += 1;
      return exactClient.createPaymentPayload(...args);
    },
  }, async (_url, options) => {
    fetches += 1;
    if (fetches === 1) return challengeResponse(paymentRequired);
    if (fetches > 2) throw new Error('third request must not run');
    submittedPayment = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
    const settlementHeader = encodeB64Json(
      settlementEvidenceForStatus(status, requirement, submittedPayment),
    );
    observedResponse = makeResponse({ settlementHeader, submittedPayment });
    return observedResponse;
  });

  assert.equal(constructions, 1, 'accepted response must construct one payment');
  assert.equal(fetches, 2, 'accepted response must use exactly two fetches');
  assert.equal(result.response, observedResponse, 'accepted response identity must be preserved');
  assert.deepEqual(paymentRequired, originalChallenge, 'accepted response must preserve the original challenge');
  return { result, response: observedResponse, submittedPayment };
}

async function expectObservedOutcomeUnknown(makeResponse, {
  httpStatus,
  forbiddenValues = [],
} = {}) {
  const { paymentRequired, requirement } = await buyerChallenge(BUYER_OBSERVATION_RESOURCE);
  const originalChallenge = structuredClone(paymentRequired);
  const exactClient = new MockExactZenonClient();
  let constructions = 0;
  let fetches = 0;
  let submittedPayment;
  let settlementHeader;
  let observedError;

  try {
    await paidFetch(paymentRequired.resource.url, {
      async createPaymentPayload(...args) {
        constructions += 1;
        return exactClient.createPaymentPayload(...args);
      },
    }, async (_url, options) => {
      fetches += 1;
      if (fetches === 1) return challengeResponse(paymentRequired);
      if (fetches > 2) throw new Error('third request must not run');
      submittedPayment = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
      settlementHeader = encodeB64Json(
        settlementEvidenceForStatus(200, requirement, submittedPayment),
      );
      return makeResponse({ settlementHeader, submittedPayment });
    });
  } catch (error) {
    observedError = error;
  }

  assert.ok(observedError instanceof PaymentSubmissionOutcomeUnknownError,
    'invalid observed response must use outcome-unknown recovery');
  assert.equal(observedError.name, 'PaymentSubmissionOutcomeUnknownError',
    'outcome-unknown name must remain fixed');
  assert.equal(observedError.message, 'payment_submission_outcome_unknown',
    'outcome-unknown message must remain fixed');
  assert.equal(observedError.code, 'payment_submission_outcome_unknown',
    'outcome-unknown code must remain fixed');
  assert.equal(observedError.retrySamePayment, true,
    'outcome-unknown recovery must reuse the same payment');
  assert.equal(observedError.action, 'reuse_and_reconcile_same_payment',
    'outcome-unknown action must remain fixed');
  assert.deepEqual(observedError.paymentPayload, submittedPayment,
    'outcome-unknown recovery must retain the submitted payment');
  assert.notEqual(observedError.paymentPayload, submittedPayment,
    'outcome-unknown payment must be detached');
  assert.notEqual(observedError.paymentPayload.payload, submittedPayment.payload,
    'outcome-unknown nested payment payload must be detached');
  assert.notEqual(observedError.paymentPayload.payload.transaction, submittedPayment.payload.transaction,
    'outcome-unknown nested payment transaction must be detached');
  assert.deepEqual(observedError.paymentRequired, originalChallenge,
    'outcome-unknown recovery must retain the original challenge');
  assert.notEqual(observedError.paymentRequired, paymentRequired,
    'outcome-unknown challenge must be detached');
  assert.notEqual(observedError.paymentRequired.accepts, paymentRequired.accepts,
    'outcome-unknown challenge offers must be detached');
  assert.notEqual(observedError.paymentRequired.accepts[0], paymentRequired.accepts[0],
    'outcome-unknown nested challenge offer must be detached');
  assert.notEqual(observedError.paymentRequired.resource, paymentRequired.resource,
    'outcome-unknown nested challenge resource must be detached');
  assert.deepEqual(paymentRequired, originalChallenge,
    'response observation must not mutate the challenge');
  assert.equal(Object.getOwnPropertyDescriptor(observedError, 'paymentPayload')?.enumerable, false,
    'submitted payment recovery must remain non-enumerable');
  assert.equal(Object.getOwnPropertyDescriptor(observedError, 'paymentRequired')?.enumerable, false,
    'challenge recovery must remain non-enumerable');
  assert.equal(Object.hasOwn(observedError, 'cause'), false,
    'outcome-unknown recovery must not expose a cause');
  assert.equal(Object.hasOwn(observedError, 'response'), false,
    'outcome-unknown recovery must not retain the response');
  assert.equal(Object.hasOwn(observedError, 'headers'), false,
    'outcome-unknown recovery must not retain headers');

  const expectedKeys = ['action', 'code', 'name', 'retrySamePayment'];
  if (httpStatus === undefined) {
    assert.equal(Object.hasOwn(observedError, 'httpStatus'), false,
      'invalid status must not be attached');
  } else {
    expectedKeys.push('httpStatus');
    assert.equal(observedError.httpStatus, httpStatus,
      'validated status must be attached exactly');
  }
  assert.deepEqual(Object.keys(observedError).sort(), expectedKeys.sort(),
    'outcome-unknown public fields must remain exact');

  const publicError = JSON.stringify(observedError);
  for (const forbiddenValue of [settlementHeader, ...forbiddenValues].filter(value =>
    typeof value === 'string' && value.length > 0)) {
    assert.equal(String(observedError).includes(forbiddenValue), false,
      'outcome-unknown text must not expose private observation data');
    assert.equal(publicError.includes(forbiddenValue), false,
      'outcome-unknown fields must not expose private observation data');
  }
  assert.equal(constructions, 1, 'outcome-unknown recovery must construct one payment');
  assert.equal(fetches, 2, 'outcome-unknown recovery must use exactly two fetches');
  return { error: observedError, submittedPayment };
}

function makeSingleReadSettlementResponse(status, settlementHeader) {
  const counts = { status: 0, headers: 0, get: 0, invocation: 0, receiver: 0 };
  const headers = Object.create({
    get(name) {
      counts.invocation += 1;
      if (counts.invocation > 2) throw new Error();
      if (this === headers) counts.receiver += 1;
      else throw new Error();
      return name === HEADERS.PAYMENT_RESPONSE ? settlementHeader : null;
    },
  });
  const response = {};
  Object.defineProperties(response, {
    status: {
      configurable: true,
      get() {
        counts.status += 1;
        if (counts.status > 1) throw new Error();
        return status;
      },
    },
    headers: {
      configurable: true,
      get() {
        counts.headers += 1;
        if (counts.headers > 1) throw new Error();
        return headers;
      },
    },
  });
  return { response, counts };
}

function makeHeaderFailureResponse(kind, marker, result) {
  const counts = { status: 0, headers: 0, get: 0, invocation: 0 };
  if (kind === 'response-proxy') {
    return {
      counts,
      response: new Proxy({}, {
        get(_target, field) {
          if (field === 'status') {
            counts.status += 1;
            return 200;
          }
          if (field === 'headers') {
            counts.headers += 1;
            throw new Error(marker);
          }
          return undefined;
        },
      }),
    };
  }

  let headers;
  if (kind === 'null-headers') {
    headers = null;
  } else if (kind === 'get-proxy') {
    headers = new Proxy({}, {
      get(_target, field) {
        if (field === 'get') {
          counts.get += 1;
          throw new Error(marker);
        }
        return undefined;
      },
    });
  } else {
    headers = {};
    if (kind === 'get-accessor') {
      Object.defineProperty(headers, 'get', {
        configurable: true,
        get() {
          counts.get += 1;
          throw new Error(marker);
        },
      });
    } else {
      const get = kind === 'non-function-get'
        ? 0
        : kind === 'callable-proxy'
          ? new Proxy(function getHeader() {}, {
              apply() {
                counts.invocation += 1;
                throw new Error(marker);
              },
            })
          : function getHeader() {
          counts.invocation += 1;
          if (kind === 'throwing-invocation') throw new Error(marker);
          return result;
        };
      Object.defineProperty(headers, 'get', {
        configurable: true,
        value: get,
      });
    }
  }

  const response = {};
  Object.defineProperties(response, {
    status: {
      configurable: true,
      get() {
        counts.status += 1;
        if (counts.status > 1) throw new Error(marker);
        return 200;
      },
    },
    headers: {
      configurable: true,
      get() {
        counts.headers += 1;
        if (kind === 'headers-accessor') throw new Error(marker);
        return headers;
      },
    },
  });
  return { response, counts };
}

test('PaymentSubmissionOutcomeUnknownError attaches only usable final HTTP statuses', () => {
  const paymentRequired = {
    accepts: [{ policy: { modes: [true, false] } }],
    resource: { metadata: [{ available: true }] },
  };
  const paymentPayload = {
    payload: { transaction: { metadata: [{ submitted: true }] } },
  };

  const representative = new PaymentSubmissionOutcomeUnknownError({
    paymentRequired,
    paymentPayload,
    httpStatus: 200,
  });
  assert.equal(representative.name, 'PaymentSubmissionOutcomeUnknownError');
  assert.equal(representative.message, 'payment_submission_outcome_unknown');
  assert.equal(representative.code, 'payment_submission_outcome_unknown');
  assert.equal(representative.retrySamePayment, true);
  assert.equal(representative.action, 'reuse_and_reconcile_same_payment');
  assert.deepEqual(representative.paymentRequired, paymentRequired);
  assert.deepEqual(representative.paymentPayload, paymentPayload);
  assert.notEqual(representative.paymentRequired.accepts, paymentRequired.accepts);
  assert.notEqual(representative.paymentRequired.accepts[0], paymentRequired.accepts[0]);
  assert.notEqual(representative.paymentPayload.payload, paymentPayload.payload);
  assert.notEqual(representative.paymentPayload.payload.transaction, paymentPayload.payload.transaction);
  assert.equal(Object.getOwnPropertyDescriptor(representative, 'paymentRequired')?.enumerable, false);
  assert.equal(Object.getOwnPropertyDescriptor(representative, 'paymentPayload')?.enumerable, false);

  for (const httpStatus of [200, 299, 300, 409, 599]) {
    const error = new PaymentSubmissionOutcomeUnknownError({
      paymentRequired,
      paymentPayload,
      httpStatus,
    });
    assert.equal(error.httpStatus, httpStatus,
      'usable final HTTP status must be attached');
  }

  for (const httpStatus of [199, 600, -1, 200.5, Number.NaN, Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY, '200', null, undefined, 200n, Symbol('invalid-status')]) {
    const error = new PaymentSubmissionOutcomeUnknownError({
      paymentRequired,
      paymentPayload,
      httpStatus,
    });
    assert.equal(Object.hasOwn(error, 'httpStatus'), false,
      'unusable HTTP status must not be attached');
  }
});

const BUYER_RECONCILIATION_RESOURCE = 'https://buyer-reconciliation.invalid/paid';

async function loadReconcilePayment() {
  const buyerModule = await import('../src/buyer.js');
  assert.equal(typeof buyerModule.reconcilePayment, 'function',
    'buyer must export the single-shot reconcilePayment primitive');
  return buyerModule.reconcilePayment;
}

function reconciliationResponse(status, encodedPayment, transform = value => value) {
  const paymentPayload = decodeB64Json(encodedPayment);
  const settlement = transform(
    settlementEvidenceForStatus(status, paymentPayload.accepted, paymentPayload),
  );
  return {
    status,
    headers: new Headers({
      [HEADERS.PAYMENT_RESPONSE]: encodeB64Json(settlement),
    }),
  };
}

async function buyerRecoveryFixture({
  onSubmitted,
  paidFetchImpl = paidFetch,
  resource = BUYER_RECONCILIATION_RESOURCE,
  responseUrl,
  status = 409,
  transportFailure = false,
} = {}) {
  const { paymentRequired } = await buyerChallenge(resource);
  const exactClient = new MockExactZenonClient();
  let constructions = 0;
  let createdPaymentPayload;
  let fetches = 0;
  let encodedPayment;
  let outcome;
  let observedError;
  let paidResponse;

  try {
    outcome = await paidFetchImpl(paymentRequired.resource.url, {
      async createPaymentPayload(...args) {
        constructions += 1;
        createdPaymentPayload = await exactClient.createPaymentPayload(...args);
        return createdPaymentPayload;
      },
    }, async (target, options) => {
      fetches += 1;
      if (!options) {
        assert.equal(target, resource);
        const response = challengeResponse(paymentRequired);
        if (responseUrl !== undefined) response.url = responseUrl;
        return response;
      }
      assert.equal(target, resource);
      assert.equal(options.redirect, 'manual');
      encodedPayment = options.headers[HEADERS.PAYMENT_SIGNATURE];
      assert.equal(typeof encodedPayment, 'string');
      if (onSubmitted) await onSubmitted(encodedPayment);
      if (transportFailure) throw new Error('synthetic reconciliation transport failure');
      paidResponse = reconciliationResponse(status, encodedPayment);
      return paidResponse;
    });
  } catch (error) {
    observedError = error;
  }

  assert.equal(constructions, 1, 'initial attempt must construct exactly one payment');
  assert.equal(fetches, 2, 'initial attempt must perform one challenge and one submission');
  assert.equal(typeof encodedPayment, 'string', 'initial submission bytes must be captured');
  if (transportFailure) {
    assert.ok(observedError instanceof PaymentSubmissionOutcomeUnknownError,
      'transport uncertainty must expose the recovery error');
  } else {
    assert.equal(observedError, undefined, 'valid recovery evidence must return normally');
    if (status === 409) {
      assert.equal(outcome.settlement.state, 'SUBMISSION_OUTCOME_UNKNOWN');
      assert.equal(outcome.settlement.retrySamePayment, true);
    }
  }

  return {
    constructions: () => constructions,
    createdPaymentPayload,
    encodedPayment,
    fetches: () => fetches,
    observedError,
    outcome,
    paidResponse,
    paymentRequired,
    target: resource,
  };
}

function assertRecoveryHandleOwner(owner, expectedHandle = owner.recoveryHandle) {
  const descriptor = Object.getOwnPropertyDescriptor(owner, 'recoveryHandle');
  assert.ok(descriptor && Object.hasOwn(descriptor, 'value'),
    'recoveryHandle must be an own data property');
  assert.equal(typeof descriptor.value, 'string', 'recoveryHandle must be a primitive string');
  assert.equal(descriptor.value === expectedHandle, true,
    'recoveryHandle value must remain stable');
  assert.equal(descriptor.enumerable, false, 'recoveryHandle must not be enumerable');
  assert.equal(descriptor.writable, false, 'recoveryHandle must not be writable');
  assert.equal(descriptor.configurable, false, 'recoveryHandle must not be configurable');
  assert.equal(JSON.stringify(owner).includes('recoveryHandle'), false,
    'recoveryHandle must not leak through JSON');
  return descriptor.value;
}

function assertStringRecoveryHandle(handle, encodedPayment) {
  assert.equal(typeof handle, 'string', 'recovery handle must be a primitive string');
  assert.equal(handle === encodedPayment, true,
    'recovery handle must equal the exact submitted payment bytes');
}

function assertNoRecoveryHandle(owner) {
  assert.equal(Object.hasOwn(owner, 'recoveryHandle'), false,
    'terminal result must not expose a recovery handle');
  assert.deepEqual(Object.keys(owner).sort(), [
    'paymentPayload', 'paymentRequired', 'response', 'settlement',
  ]);
  assert.equal(JSON.stringify(owner).includes('recoveryHandle'), false,
    'terminal JSON must not expose a recovery handle');
}

function assertBoundReconciliationRequest(target, options, fixture) {
  assert.equal(target, fixture.target, 'reconciliation must reuse the bound target');
  assert.equal(options?.redirect, 'manual', 'reconciliation must retain manual redirect handling');
  assert.deepEqual(Object.keys(options?.headers ?? {}), [HEADERS.PAYMENT_SIGNATURE]);
  assert.equal(options.headers[HEADERS.PAYMENT_SIGNATURE] === fixture.encodedPayment, true,
    'reconciliation must resend the exact encoded payment bytes');
}

test('buyer exports a single-shot payment reconciliation primitive', async () => {
  await loadReconcilePayment();
});

test('valid recovery evidence reuses bound bytes without another challenge or payment construction', async () => {
  const reconcilePayment = await loadReconcilePayment();
  let responseUrlObservations = 0;
  const responseUrl = {
    toString() {
      responseUrlObservations += 1;
      return responseUrlObservations === 1
        ? BUYER_RECONCILIATION_RESOURCE
        : 'https://later-url-observation.invalid/paid';
    },
  };
  let reentrantFetches = 0;
  let reentrantResult;
  const capture = promise => promise.then(
    value => ({ status: 'fulfilled', value }),
    error => ({ status: 'rejected', error }),
  );
  const fixture = await buyerRecoveryFixture({
    responseUrl,
    async onSubmitted(candidate) {
      reentrantResult = await capture(reconcilePayment(candidate, async () => {
        reentrantFetches += 1;
        throw new Error('unregistered recovery must not reach fetch');
      }));
    },
  });
  const handle = assertRecoveryHandleOwner(fixture.outcome);
  assertStringRecoveryHandle(handle, fixture.encodedPayment);
  assert.equal(reentrantResult.status, 'rejected');
  assert.equal(reentrantResult.error?.message, 'invalid payment recovery owner');
  assert.equal(reentrantFetches, 0,
    'the submitted string must remain unusable until recovery is exposed');
  assert.equal(responseUrlObservations, 1, 'the response URL must be normalized exactly once');
  assert.strictEqual(fixture.outcome.response, fixture.paidResponse,
    'initial recovery must preserve the exact paid response');
  assert.strictEqual(fixture.outcome.paymentPayload, fixture.createdPaymentPayload,
    'initial recovery must preserve the exact client payment payload');
  responseUrl.toString = () => 'https://mutated-url-like.invalid/paid';

  fixture.outcome.paymentPayload.resource.url = 'https://mutated.invalid/paid';
  fixture.outcome.paymentPayload.payload.transaction.hash = 'f'.repeat(64);
  fixture.outcome.paymentRequired.resource.url = 'https://changed.invalid/paid';
  fixture.outcome.paymentRequired.accepts[0].amount = '999';
  fixture.paymentRequired.resource.url = 'https://source-mutated.invalid/paid';

  let recoveryFetches = 0;
  const recovered = await reconcilePayment(fixture.outcome, async (target, options) => {
    recoveryFetches += 1;
    assertBoundReconciliationRequest(target, options, fixture);
    return reconciliationResponse(200, fixture.encodedPayment);
  });

  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.settlement.success, true);
  assert.equal(recovered.settlement.state, 'MOMENTUM_INCLUDED');
  assert.equal(recoveryFetches, 1, 'reconciliation must perform exactly one paid request');
  assert.equal(fixture.constructions(), 1, 'reconciliation must not construct a second payment');
  assert.equal(fixture.fetches(), 2, 'reconciliation must not rerun the initial challenge');
});

test('transport uncertainty exposes the exact submitted string and can reconcile successfully', async () => {
  const reconcilePayment = await loadReconcilePayment();
  const fixture = await buyerRecoveryFixture({ transportFailure: true });
  const handle = assertRecoveryHandleOwner(fixture.observedError);
  assertStringRecoveryHandle(handle, fixture.encodedPayment);

  fixture.observedError.paymentPayload.resource.url = 'https://mutated.invalid/paid';
  fixture.observedError.paymentPayload.payload.transaction.address = 'mutated-payer';
  fixture.observedError.paymentRequired.resource.url = 'https://changed.invalid/paid';
  fixture.observedError.paymentRequired.accepts[0].amount = '999';

  let recoveryFetches = 0;
  const recovered = await reconcilePayment(fixture.observedError, async (target, options) => {
    recoveryFetches += 1;
    assertBoundReconciliationRequest(target, options, fixture);
    return reconciliationResponse(200, fixture.encodedPayment);
  });

  assert.equal(recovered.response.status, 200);
  assert.equal(recovered.settlement.success, true);
  assert.equal(recoveryFetches, 1);
  assert.equal(fixture.constructions(), 1, 'uncertain recovery must not construct another payment');
});

test('repeated recoverable results and errors preserve one recovery string value', async () => {
  const reconcilePayment = await loadReconcilePayment();
  const fixture = await buyerRecoveryFixture();
  const handle = assertRecoveryHandleOwner(fixture.outcome);

  let repeatedResponse;
  const repeated = await reconcilePayment(fixture.outcome, async (target, options) => {
    assertBoundReconciliationRequest(target, options, fixture);
    repeatedResponse = reconciliationResponse(409, fixture.encodedPayment);
    return repeatedResponse;
  });
  assertRecoveryHandleOwner(repeated, handle);
  assert.strictEqual(repeated.response, repeatedResponse);
  assert.equal(repeated.settlement.state, 'SUBMISSION_OUTCOME_UNKNOWN');
  const expectedPaymentRequired = structuredClone(repeated.paymentRequired);
  const expectedPaymentPayload = structuredClone(repeated.paymentPayload);
  repeated.paymentRequired.resource.url = 'https://mutated-recovery-result.invalid/paid';
  repeated.paymentPayload.payload.transaction.address = 'mutated-recovery-payer';

  const requestOptions = [];
  const secondResponse = reconciliationResponse(409, fixture.encodedPayment);
  const second = await reconcilePayment(repeated, async (target, options) => {
    assertBoundReconciliationRequest(target, options, fixture);
    requestOptions.push(options);
    options.redirect = 'follow';
    options.headers[HEADERS.PAYMENT_SIGNATURE] = 'mutated-request-local-copy';
    return secondResponse;
  });
  const thirdResponse = reconciliationResponse(409, fixture.encodedPayment);
  const third = await reconcilePayment(second, async (target, options) => {
    assertBoundReconciliationRequest(target, options, fixture);
    requestOptions.push(options);
    return thirdResponse;
  });
  assert.notStrictEqual(requestOptions[0], requestOptions[1]);
  assert.notStrictEqual(requestOptions[0].headers, requestOptions[1].headers);
  for (const [response, result] of [
    [secondResponse, second],
    [thirdResponse, third],
  ]) {
    assertRecoveryHandleOwner(result, handle);
    assert.strictEqual(result.response, response);
    assert.deepEqual(result.paymentRequired, expectedPaymentRequired);
    assert.deepEqual(result.paymentPayload, expectedPaymentPayload);
    assert.notStrictEqual(result.paymentRequired, repeated.paymentRequired);
    assert.notStrictEqual(result.paymentRequired.resource, repeated.paymentRequired.resource);
    assert.notStrictEqual(result.paymentPayload, repeated.paymentPayload);
    assert.notStrictEqual(result.paymentPayload.payload, repeated.paymentPayload.payload);
  }
  assert.notStrictEqual(second.paymentRequired, third.paymentRequired);
  assert.notStrictEqual(second.paymentPayload, third.paymentPayload);

  let observedError;
  try {
    await reconcilePayment(third, async (target, options) => {
      assertBoundReconciliationRequest(target, options, fixture);
      throw new Error('synthetic repeated reconciliation failure');
    });
  } catch (error) {
    observedError = error;
  }
  assert.ok(observedError instanceof PaymentSubmissionOutcomeUnknownError);
  assertRecoveryHandleOwner(observedError, handle);
  const expectedErrorRequired = structuredClone(observedError.paymentRequired);
  const expectedErrorPayload = structuredClone(observedError.paymentPayload);
  observedError.paymentRequired.resource.url = 'https://mutated-recovery-error.invalid/paid';
  observedError.paymentPayload.payload.transaction.address = 'mutated-error-payer';

  let nextError;
  try {
    await reconcilePayment(observedError, async (target, options) => {
      assertBoundReconciliationRequest(target, options, fixture);
      throw new Error('synthetic next reconciliation failure');
    });
  } catch (error) {
    nextError = error;
  }
  assert.ok(nextError instanceof PaymentSubmissionOutcomeUnknownError);
  assertRecoveryHandleOwner(nextError, handle);
  assert.deepEqual(nextError.paymentRequired, expectedErrorRequired);
  assert.deepEqual(nextError.paymentPayload, expectedErrorPayload);
  assert.notStrictEqual(nextError.paymentRequired, observedError.paymentRequired);
  assert.notStrictEqual(nextError.paymentPayload, observedError.paymentPayload);
  assertStringRecoveryHandle(handle, fixture.encodedPayment);
  assert.equal(fixture.constructions(), 1, 'repeated recovery must never construct another payment');
});

test('only exact live recovery owners authorize reconciliation', async () => {
  const reconcilePayment = await loadReconcilePayment();
  const fixture = await buyerRecoveryFixture();
  const handle = assertRecoveryHandleOwner(fixture.outcome);
  assertStringRecoveryHandle(handle, fixture.encodedPayment);

  const successor = await reconcilePayment(fixture.outcome, async (target, options) => {
    assertBoundReconciliationRequest(target, options, fixture);
    return reconciliationResponse(409, fixture.encodedPayment);
  });
  assertRecoveryHandleOwner(successor, handle);

  const forgedOwner = {};
  Object.defineProperty(forgedOwner, 'recoveryHandle', {
    value: handle,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  const serializedOwnerCopy = JSON.parse(JSON.stringify(successor));
  const structuredOwnerCopy = structuredClone(serializedOwnerCopy);
  for (const candidate of [
    undefined,
    null,
    handle,
    handle.slice(0),
    JSON.parse(JSON.stringify(handle)),
    structuredClone(handle),
    {},
    new String(handle),
    forgedOwner,
    serializedOwnerCopy,
    structuredOwnerCopy,
    Object.create(successor),
    new Proxy(successor, {}),
    fixture.outcome,
    new PaymentSubmissionOutcomeUnknownError(),
  ]) {
    let fetches = 0;
    await assert.rejects(
      async () => reconcilePayment(candidate, async () => {
        fetches += 1;
        throw new Error('invalid owner must not reach fetch');
      }),
      error => error instanceof Error && error.message === 'invalid payment recovery owner',
    );
    assert.equal(fetches, 0, 'invalid recovery owner must fail before fetch');
  }

  const foreignBuyer = await import('../src/buyer.js?foreign-recovery-owner');
  const foreignFixture = await buyerRecoveryFixture({
    paidFetchImpl: foreignBuyer.paidFetch,
    resource: new URL('/foreign-owner', BUYER_RECONCILIATION_RESOURCE).href,
  });
  for (const [implementation, owner] of [
    [reconcilePayment, foreignFixture.outcome],
    [foreignBuyer.reconcilePayment, successor],
  ]) {
    let fetches = 0;
    await assert.rejects(
      async () => implementation(owner, async () => {
        fetches += 1;
        throw new Error('foreign owner must not reach fetch');
      }),
      error => error instanceof Error && error.message === 'invalid payment recovery owner',
    );
    assert.equal(fetches, 0, 'a foreign-module owner must fail before fetch');
  }

  let successorFetches = 0;
  const nextOwner = await reconcilePayment(successor, async (target, options) => {
    successorFetches += 1;
    assertBoundReconciliationRequest(target, options, fixture);
    return reconciliationResponse(409, fixture.encodedPayment);
  });
  assertRecoveryHandleOwner(nextOwner, handle);
  assert.equal(successorFetches, 1,
    'invalid owner attempts must not consume the exact registered successor');
});

test('N recoverable payments register only weak owner keys',
  { concurrency: false, timeout: 30_000 }, async () => {
    if (await isolatePrototypeSensitiveTest(
      'N recoverable payments register only weak owner keys',
      'X402_BUYER_RECOVERY_LIFETIME_ISOLATED',
    )) return;

    const priorMapSet = Object.getOwnPropertyDescriptor(Map.prototype, 'set');
    const priorWeakMapSet = Object.getOwnPropertyDescriptor(WeakMap.prototype, 'set');
    const nativeApply = Reflect.apply;
    const nativeHasOwn = Object.hasOwn;
    const ownerCount = 24;
    let strongWrites = 0;
    let weakWrites = 0;
    const isRecoveryState = value => value && typeof value === 'object' &&
      nativeHasOwn(value, 'target') && nativeHasOwn(value, 'encodedPayment') &&
      nativeHasOwn(value, 'paymentRequired') && nativeHasOwn(value, 'accepted');
    let freshBuyer;

    try {
      Object.defineProperty(Map.prototype, 'set', {
        ...priorMapSet,
        value(key, value) {
          if (isRecoveryState(value)) strongWrites += 1;
          return nativeApply(priorMapSet.value, this, [key, value]);
        },
      });
      Object.defineProperty(WeakMap.prototype, 'set', {
        ...priorWeakMapSet,
        value(key, value) {
          if (isRecoveryState(value)) weakWrites += 1;
          return nativeApply(priorWeakMapSet.value, this, [key, value]);
        },
      });
      freshBuyer = await import('../src/buyer.js?owner-lifetime-registry');
    } finally {
      Object.defineProperty(Map.prototype, 'set', priorMapSet);
      Object.defineProperty(WeakMap.prototype, 'set', priorWeakMapSet);
    }

    assert.deepEqual(Object.getOwnPropertyDescriptor(Map.prototype, 'set'), priorMapSet);
    assert.deepEqual(Object.getOwnPropertyDescriptor(WeakMap.prototype, 'set'), priorWeakMapSet);
    const owners = [];
    const handles = [];
    for (let index = 0; index < ownerCount; index += 1) {
      const fixture = await buyerRecoveryFixture({
        paidFetchImpl: freshBuyer.paidFetch,
        resource: new URL(`/owner-lifetime-${index}`, BUYER_RECONCILIATION_RESOURCE).href,
      });
      owners.push(fixture.outcome);
      handles.push(assertRecoveryHandleOwner(fixture.outcome));
    }

    assert.equal(owners.length, ownerCount,
      'the deterministic probe must retain every observed owner until assertions complete');
    assert.equal(strongWrites, 0,
      'recovery registration must not use a strong Map registry');
    assert.equal(weakWrites, ownerCount,
      'each exposed owner must receive one weak registry entry');

    let fetches = 0;
    for (const handle of handles) {
      await assert.rejects(
        async () => freshBuyer.reconcilePayment(handle, async () => {
          fetches += 1;
          throw new Error('a primitive handle must not reach fetch');
        }),
        error => error instanceof Error && error.message === 'invalid payment recovery owner',
      );
    }
    assert.equal(fetches, 0, 'weak owner registration must not authorize primitive handles');
  });

test('buyer recovery owner registry ignores post-import intrinsic replacement',
  { concurrency: false, timeout: 30_000 }, async () => {
    if (await isolatePrototypeSensitiveTest(
      'buyer recovery owner registry ignores post-import intrinsic replacement',
      'X402_BUYER_RECOVERY_INTRINSICS_ISOLATED',
    )) return;

    const reconcilePayment = await loadReconcilePayment();
    const fixture = await buyerRecoveryFixture();
    const handle = assertRecoveryHandleOwner(fixture.outcome);
    const forgedState = {
      target: fixture.target,
      encodedPayment: handle,
      paymentRequired: fixture.paymentRequired,
      accepted: fixture.paymentRequired.accepts[0],
    };
    const forgedOwner = {};
    Object.defineProperty(forgedOwner, 'recoveryHandle', {
      value: handle,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    const priorGet = Object.getOwnPropertyDescriptor(WeakMap.prototype, 'get');
    const priorSet = Object.getOwnPropertyDescriptor(WeakMap.prototype, 'set');
    const priorDelete = Object.getOwnPropertyDescriptor(WeakMap.prototype, 'delete');
    const priorClone = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
    const nativeApply = Reflect.apply;
    const nativeHasOwn = Object.hasOwn;
    const observations = {
      clone: 0,
      delete: 0,
      get: 0,
      set: 0,
    };
    let legitimate;
    let reused;
    let reusedFetches = 0;
    let forged;
    let forgedFetches = 0;

    const isRecoveryState = value => value && typeof value === 'object' &&
      nativeHasOwn(value, 'target') && nativeHasOwn(value, 'encodedPayment') &&
      nativeHasOwn(value, 'paymentRequired');
    const capture = promise => promise.then(
      value => ({ status: 'fulfilled', value }),
      error => ({ status: 'rejected', error }),
    );

    try {
      Object.defineProperty(WeakMap.prototype, 'get', {
        ...priorGet,
        value(key) {
          if (key === fixture.outcome || key === forgedOwner) observations.get += 1;
          if (key === forgedOwner) return forgedState;
          return nativeApply(priorGet.value, this, [key]);
        },
      });
      Object.defineProperty(WeakMap.prototype, 'set', {
        ...priorSet,
        value(key, value) {
          if (isRecoveryState(value)) observations.set += 1;
          return nativeApply(priorSet.value, this, [key, value]);
        },
      });
      Object.defineProperty(WeakMap.prototype, 'delete', {
        ...priorDelete,
        value(key) {
          if (key === fixture.outcome || key === forgedOwner) observations.delete += 1;
          if (key === forgedOwner) return true;
          return nativeApply(priorDelete.value, this, [key]);
        },
      });
      Object.defineProperty(globalThis, 'structuredClone', {
        ...priorClone,
        value(value, options) {
          observations.clone += 1;
          return nativeApply(priorClone.value, globalThis, [value, options]);
        },
      });

      legitimate = await capture(reconcilePayment(fixture.outcome, async () =>
        reconciliationResponse(409, fixture.encodedPayment)));
      reused = await capture(reconcilePayment(fixture.outcome, async () => {
        reusedFetches += 1;
        return reconciliationResponse(409, fixture.encodedPayment);
      }));
      forged = await capture(reconcilePayment(forgedOwner, async () => {
        forgedFetches += 1;
        return reconciliationResponse(409, fixture.encodedPayment);
      }));
    } finally {
      Object.defineProperty(WeakMap.prototype, 'get', priorGet);
      Object.defineProperty(WeakMap.prototype, 'set', priorSet);
      Object.defineProperty(WeakMap.prototype, 'delete', priorDelete);
      Object.defineProperty(globalThis, 'structuredClone', priorClone);
    }

    assert.deepEqual(Object.getOwnPropertyDescriptor(WeakMap.prototype, 'get'), priorGet);
    assert.deepEqual(Object.getOwnPropertyDescriptor(WeakMap.prototype, 'set'), priorSet);
    assert.deepEqual(Object.getOwnPropertyDescriptor(WeakMap.prototype, 'delete'), priorDelete);
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'structuredClone'), priorClone);
    assert.deepEqual(observations, {
      clone: 0,
      delete: 0,
      get: 0,
      set: 0,
    });
    assert.equal(legitimate.status, 'fulfilled');
    assertRecoveryHandleOwner(legitimate.value, handle);
    assert.equal(reused.status, 'rejected');
    assert.equal(reused.error?.message, 'invalid payment recovery owner');
    assert.equal(reusedFetches, 0);
    assert.equal(forged.status, 'rejected');
    assert.equal(forged.error?.message, 'invalid payment recovery owner');
    assert.equal(forgedFetches, 0);

    const preserved = await reconcilePayment(legitimate.value, async (target, options) => {
      assertBoundReconciliationRequest(target, options, fixture);
      return reconciliationResponse(409, fixture.encodedPayment);
    });
    assertRecoveryHandleOwner(preserved, handle);
  });

test('recovery handles stay confined to own recoverable retry evidence',
  { concurrency: false, timeout: 30_000 }, async () => {
    if (await isolatePrototypeSensitiveTest(
      'recovery handles stay confined to own recoverable retry evidence',
      'X402_BUYER_RECOVERY_RETRY_ISOLATED',
    )) return;

    const reconcilePayment = await loadReconcilePayment();
    const existingFixture = await buyerRecoveryFixture();
    const existingHandle = assertRecoveryHandleOwner(existingFixture.outcome);
    const failureFixture = await buyerRecoveryFixture({
      resource: new URL('/terminal-failure', BUYER_RECONCILIATION_RESOURCE).href,
    });
    const failureHandle = assertRecoveryHandleOwner(failureFixture.outcome);
    const recoverableFixture = await buyerRecoveryFixture({
      resource: new URL('/retained-recovery', BUYER_RECONCILIATION_RESOURCE).href,
    });
    const recoverableHandle = assertRecoveryHandleOwner(recoverableFixture.outcome);
    const terminalFields = ['response', 'paymentRequired', 'paymentPayload', 'settlement'];
    const priorThen = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
    const priorRetry = Object.getOwnPropertyDescriptor(Object.prototype, 'retrySamePayment');
    let thenObservations = 0;
    let retryGetterObservations = 0;
    let initialSuccess;
    let initialFailure;
    let initialRecoverable;
    let reconciledSuccess;
    let reconciledFailure;
    let reconciledRecoverable;
    let reconciledSuccessResponse;
    let reconciledFailureResponse;
    let reconciledRecoverableResponse;
    const capture = promise => promise.then(
      value => ({ status: 'fulfilled', value }),
      error => ({ status: 'rejected', error }),
    );
    try {
      Object.defineProperty(Object.prototype, 'then', {
        configurable: true,
        get() {
          try {
            const terminal = terminalFields.every(field => {
              const descriptor = Object.getOwnPropertyDescriptor(this, field);
              return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
            });
            if (!terminal) return undefined;
          } catch {
            return undefined;
          }
          thenObservations += 1;
          throw new Error('controlled terminal assimilation');
        },
      });
      Object.defineProperty(Object.prototype, 'retrySamePayment', {
        configurable: true,
        value: true,
      });
      initialSuccess = await capture(buyerRecoveryFixture({
        resource: 'https://buyer-reconciliation-terminal-success.invalid/paid',
        status: 200,
      }));
      initialFailure = await capture(buyerRecoveryFixture({
        resource: 'https://buyer-reconciliation-terminal-failure.invalid/paid',
        status: 402,
      }));

      Object.defineProperty(Object.prototype, 'retrySamePayment', {
        configurable: true,
        get() {
          retryGetterObservations += 1;
          throw new Error('controlled inherited retry observation');
        },
      });
      initialRecoverable = await capture(buyerRecoveryFixture());
      reconciledSuccess = await capture(reconcilePayment(existingFixture.outcome, async () => {
        reconciledSuccessResponse = reconciliationResponse(200, existingFixture.encodedPayment);
        return reconciledSuccessResponse;
      }));
      reconciledFailure = await capture(reconcilePayment(failureFixture.outcome, async () => {
        reconciledFailureResponse = reconciliationResponse(402, failureFixture.encodedPayment);
        return reconciledFailureResponse;
      }));
      reconciledRecoverable = await capture(reconcilePayment(recoverableFixture.outcome, async () => {
        reconciledRecoverableResponse = reconciliationResponse(409, recoverableFixture.encodedPayment);
        return reconciledRecoverableResponse;
      }));
    } finally {
      if (priorThen) Object.defineProperty(Object.prototype, 'then', priorThen);
      else delete Object.prototype.then;
      if (priorRetry) Object.defineProperty(Object.prototype, 'retrySamePayment', priorRetry);
      else delete Object.prototype.retrySamePayment;
    }

    assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype, 'then'), priorThen);
    assert.deepEqual(Object.getOwnPropertyDescriptor(Object.prototype, 'retrySamePayment'), priorRetry);
    assert.equal(thenObservations, 0);
    assert.equal(retryGetterObservations, 0);
    for (const observed of [
      initialSuccess,
      initialFailure,
      initialRecoverable,
      reconciledSuccess,
      reconciledFailure,
      reconciledRecoverable,
    ]) assert.equal(observed.status, 'fulfilled');

    const initialSuccessOutcome = initialSuccess.value.outcome;
    const initialFailureOutcome = initialFailure.value.outcome;
    assertNoRecoveryHandle(initialSuccessOutcome);
    assertNoRecoveryHandle(initialFailureOutcome);
    assertNoRecoveryHandle(reconciledSuccess.value);
    assertNoRecoveryHandle(reconciledFailure.value);
    assert.strictEqual(reconciledSuccess.value.response, reconciledSuccessResponse);
    assert.strictEqual(reconciledFailure.value.response, reconciledFailureResponse);

    const initialRecoverableOutcome = initialRecoverable.value.outcome;
    const initialHandle = assertRecoveryHandleOwner(initialRecoverableOutcome);
    assert.strictEqual(initialRecoverableOutcome.response, initialRecoverable.value.paidResponse);
    assertRecoveryHandleOwner(reconciledRecoverable.value, recoverableHandle);
    assert.strictEqual(reconciledRecoverable.value.response, reconciledRecoverableResponse);
    assertStringRecoveryHandle(initialHandle, initialRecoverable.value.encodedPayment);
    assertStringRecoveryHandle(existingHandle, existingFixture.encodedPayment);
    assertStringRecoveryHandle(failureHandle, failureFixture.encodedPayment);
    assertStringRecoveryHandle(recoverableHandle, recoverableFixture.encodedPayment);
    for (const outcome of [initialRecoverableOutcome, reconciledRecoverable.value]) {
      const descriptor = Object.getOwnPropertyDescriptor(outcome, 'then');
      assert.deepEqual({
        value: descriptor?.value,
        enumerable: descriptor?.enumerable,
        writable: descriptor?.writable,
        configurable: descriptor?.configurable,
      }, {
        value: undefined,
        enumerable: false,
        writable: false,
        configurable: false,
      });
    }

    for (const terminalFixture of [initialSuccess.value, initialFailure.value]) {
      let fetches = 0;
      await assert.rejects(
        async () => reconcilePayment(terminalFixture.outcome, async () => {
          fetches += 1;
          throw new Error('unexposed terminal owner must not reach fetch');
        }),
        error => error instanceof Error && error.message === 'invalid payment recovery owner',
      );
      assert.equal(fetches, 0,
        'an unexposed terminal outcome must remain unauthorized for reconciliation');
    }

    for (const [consumedOwner, fixture] of [
      [existingFixture.outcome, existingFixture],
      [failureFixture.outcome, failureFixture],
    ]) {
      let fetches = 0;
      const consumed = await capture(reconcilePayment(consumedOwner, async () => {
        fetches += 1;
        return reconciliationResponse(409, fixture.encodedPayment);
      }));
      assert.equal(consumed.status, 'rejected',
        'a reconciliation owner must be consumed before its request');
      assert.equal(consumed.error?.message, 'invalid payment recovery owner');
      assert.equal(fetches, 0, 'a consumed owner must fail before fetch');
    }

    let retainedFetches = 0;
    const retained = await reconcilePayment(reconciledRecoverable.value, async (target, options) => {
      retainedFetches += 1;
      assertBoundReconciliationRequest(target, options, recoverableFixture);
      return reconciliationResponse(409, recoverableFixture.encodedPayment);
    });
    assertRecoveryHandleOwner(retained, recoverableHandle);
    assert.equal(retainedFetches, 1);
    assert.equal(existingFixture.constructions(), 1);
    assert.equal(failureFixture.constructions(), 1);
    assert.equal(recoverableFixture.constructions(), 1);
  });

test('reconciliation owners are linear single-use capabilities', async () => {
  const reconcilePayment = await loadReconcilePayment();
  const capture = promise => promise.then(
    value => ({ status: 'fulfilled', value }),
    error => ({ status: 'rejected', error }),
  );

  const fixture = await buyerRecoveryFixture();
  const handle = assertRecoveryHandleOwner(fixture.outcome);
  let releaseFirst;
  const firstResponse = new Promise(resolve => { releaseFirst = resolve; });
  let firstEntered;
  const entered = new Promise(resolve => { firstEntered = resolve; });
  let firstFetches = 0;
  const first = capture(reconcilePayment(fixture.outcome, async (target, options) => {
    firstFetches += 1;
    assertBoundReconciliationRequest(target, options, fixture);
    firstEntered();
    return firstResponse;
  }));
  await entered;

  let concurrentFetches = 0;
  const concurrent = await capture(reconcilePayment(fixture.outcome, async () => {
    concurrentFetches += 1;
    return reconciliationResponse(409, fixture.encodedPayment);
  }));
  assert.equal(concurrent.status, 'rejected');
  assert.equal(concurrent.error?.message, 'invalid payment recovery owner');
  assert.equal(concurrentFetches, 0,
    'a concurrent second use must reject before invoking fetch');

  releaseFirst(reconciliationResponse(409, fixture.encodedPayment));
  const firstResult = await first;
  assert.equal(firstResult.status, 'fulfilled');
  const successor = firstResult.value;
  assertRecoveryHandleOwner(successor, handle);
  assert.equal(firstFetches, 1);

  let nestedResult;
  let nestedFetches = 0;
  let reentrantFetches = 0;
  const nextOwner = await reconcilePayment(successor, async (target, options) => {
    reentrantFetches += 1;
    assertBoundReconciliationRequest(target, options, fixture);
    nestedResult = await capture(reconcilePayment(successor, async () => {
      nestedFetches += 1;
      return reconciliationResponse(409, fixture.encodedPayment);
    }));
    return reconciliationResponse(409, fixture.encodedPayment);
  });
  assert.equal(nestedResult.status, 'rejected');
  assert.equal(nestedResult.error?.message, 'invalid payment recovery owner');
  assert.equal(nestedFetches, 0, 'reentrant owner reuse must reject before fetch');
  assert.equal(reentrantFetches, 1);
  assertRecoveryHandleOwner(nextOwner, handle);

  const terminal = await reconcilePayment(nextOwner, async (target, options) => {
    assertBoundReconciliationRequest(target, options, fixture);
    return reconciliationResponse(200, fixture.encodedPayment);
  });
  assertNoRecoveryHandle(terminal);
  for (const consumed of [fixture.outcome, successor, nextOwner, terminal]) {
    let fetches = 0;
    await assert.rejects(
      async () => reconcilePayment(consumed, async () => {
        fetches += 1;
        return reconciliationResponse(409, fixture.encodedPayment);
      }),
      error => error instanceof Error && error.message === 'invalid payment recovery owner',
    );
    assert.equal(fetches, 0, 'consumed or terminal owners must reject before fetch');
  }
  assert.equal(fixture.constructions(), 1,
    'linear reconciliation must not construct another payment');

  const identityFixture = await buyerRecoveryFixture({
    resource: new URL('/independent-owner-lineage', BUYER_RECONCILIATION_RESOURCE).href,
  });
  const identityHandle = assertRecoveryHandleOwner(identityFixture.outcome);
  let duplicateFetches = 0;
  const duplicateOwner = await paidFetch(identityFixture.target, {
    async createPaymentPayload() {
      return identityFixture.createdPaymentPayload;
    },
  }, async (_target, options) => {
    duplicateFetches += 1;
    if (!options) return challengeResponse(identityFixture.paymentRequired);
    assert.equal(options.headers[HEADERS.PAYMENT_SIGNATURE] === identityHandle, true,
      'the duplicate attempt must reproduce the registered string');
    return reconciliationResponse(409, identityFixture.encodedPayment);
  });
  assertRecoveryHandleOwner(duplicateOwner, identityHandle);
  const duplicateTerminal = await reconcilePayment(duplicateOwner, async (target, options) => {
    assertBoundReconciliationRequest(target, options, identityFixture);
    return reconciliationResponse(200, identityFixture.encodedPayment);
  });
  assertNoRecoveryHandle(duplicateTerminal);
  assert.equal(duplicateFetches, 2);

  let retainedFetches = 0;
  const retained = await reconcilePayment(identityFixture.outcome, async (target, options) => {
    retainedFetches += 1;
    assertBoundReconciliationRequest(target, options, identityFixture);
    return reconciliationResponse(409, identityFixture.encodedPayment);
  });
  assertRecoveryHandleOwner(retained, identityHandle);
  assert.equal(retainedFetches, 1,
    'an independently produced owner with equal bytes must remain a separate lineage');
});

test('reconciliation response failures reuse the existing uncertainty boundary and handle', async () => {
  const reconcilePayment = await loadReconcilePayment();
  const fixture = await buyerRecoveryFixture();
  const handle = assertRecoveryHandleOwner(fixture.outcome);
  let owner = fixture.outcome;
  const cases = [
    {
      name: 'redirect',
      response: () => ({
        status: 302,
        headers: new Headers({ location: 'https://redirect.invalid/paid' }),
      }),
    },
    {
      name: 'missing settlement evidence',
      response: () => ({ status: 200, headers: new Headers() }),
    },
    {
      name: 'malformed settlement evidence',
      response: () => ({
        status: 200,
        headers: new Headers({ [HEADERS.PAYMENT_RESPONSE]: 'not-canonical-base64' }),
      }),
    },
    {
      name: 'mismatched settlement evidence',
      response: () => reconciliationResponse(200, fixture.encodedPayment, settlement => ({
        ...settlement,
        transaction: '0'.repeat(64),
      })),
    },
    {
      name: 'transport failure',
      response: () => { throw new Error('synthetic reconciliation transport failure'); },
    },
  ];

  for (const scenario of cases) {
    let fetches = 0;
    let observedError;
    try {
      await reconcilePayment(owner, async (target, options) => {
        fetches += 1;
        assertBoundReconciliationRequest(target, options, fixture);
        return scenario.response();
      });
    } catch (error) {
      observedError = error;
    }
    assert.ok(observedError instanceof PaymentSubmissionOutcomeUnknownError,
      `${scenario.name} must preserve outcome-unknown recovery`);
    assert.equal(observedError.code, 'payment_submission_outcome_unknown');
    assert.equal(observedError.retrySamePayment, true);
    assert.equal(observedError.action, 'reuse_and_reconcile_same_payment');
    assertRecoveryHandleOwner(observedError, handle);
    assert.equal(fetches, 1, `${scenario.name} must use one reconciliation request`);
    owner = observedError;
  }

  assertStringRecoveryHandle(handle, fixture.encodedPayment);
  assert.equal(fixture.constructions(), 1,
    'response validation failures must never construct another payment');
});

test('buyer snapshots native plain function and prototype-backed successful responses once', async () => {
  let nativeResponse;
  const nativeResult = await runAcceptedObservedResponse(200, ({ settlementHeader }) => {
    nativeResponse = new Response(null, {
      status: 200,
      headers: { [HEADERS.PAYMENT_RESPONSE]: settlementHeader },
    });
    return nativeResponse;
  });
  assert.equal(nativeResult.result.response, nativeResponse,
    'native response identity must remain unchanged');

  let plainResponse;
  const plainResult = await runAcceptedObservedResponse(299, ({ settlementHeader }) => {
    plainResponse = {
      status: 299,
      headers: { get: name => name === HEADERS.PAYMENT_RESPONSE ? settlementHeader : null },
    };
    return plainResponse;
  });
  assert.equal(plainResult.result.response, plainResponse,
    'plain response identity must remain unchanged');

  let functionResponse;
  const functionResult = await runAcceptedObservedResponse(298, ({ settlementHeader }) => {
    functionResponse = function responseFunction() {};
    functionResponse.status = 298;
    functionResponse.headers = {
      get: name => name === HEADERS.PAYMENT_RESPONSE ? settlementHeader : null,
    };
    return functionResponse;
  });
  assert.equal(functionResult.result.response, functionResponse,
    'function response identity must remain unchanged');

  let singleRead;
  const statefulResult = await runAcceptedObservedResponse(200, ({ settlementHeader }) => {
    singleRead = makeSingleReadSettlementResponse(200, settlementHeader);
    return singleRead.response;
  });
  assert.equal(statefulResult.result.response, singleRead.response,
    'prototype-backed response identity must remain unchanged');
  assert.deepEqual(singleRead.counts, {
    status: 1,
    headers: 1,
    get: 0,
    invocation: 2,
    receiver: 2,
  }, 'successful response members must each be observed once');
});

test('buyer rejects every unusable post-submission status before observing headers', async () => {
  const privateMarker = ['private', 'status', 'detail'].join('_');
  let coercions = 0;
  const throwingCoercion = {
    [Symbol.toPrimitive]() {
      coercions += 1;
      throw new Error(privateMarker);
    },
  };
  const cases = [
    { missing: true },
    { value: undefined },
    { value: null },
    { value: '200' },
    { value: new Number(200) },
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
    { value: 0 },
    { value: 199 },
    { value: 600 },
    { value: 200.5 },
    { value: 200n },
    { value: Symbol('invalid-status') },
    { value: throwingCoercion },
  ];

  for (const entry of cases) {
    let statusReads = 0;
    let headerReads = 0;
    await expectObservedOutcomeUnknown(() => {
      const response = {};
      if (!entry.missing) {
        Object.defineProperty(response, 'status', {
          get() {
            statusReads += 1;
            return entry.value;
          },
        });
      }
      Object.defineProperty(response, 'headers', {
        get() {
          headerReads += 1;
          throw new Error(privateMarker);
        },
      });
      return response;
    }, { forbiddenValues: [privateMarker] });
    assert.equal(statusReads, entry.missing ? 0 : 1,
      'invalid status must be read at most once');
    assert.equal(headerReads, 0, 'invalid status must stop before headers');
  }
  assert.equal(coercions, 0, 'invalid status validation must not coerce objects');
});

test('buyer contains primitive proxy and throwing post-submission response failures', async () => {
  const privateMarker = ['private', 'response', 'detail'].join('_');
  for (const response of [null, undefined, false, 0, '', 200, 200n, Symbol('invalid-response')]) {
    await expectObservedOutcomeUnknown(() => response, { forbiddenValues: [privateMarker] });
  }

  let accessorReads = 0;
  await expectObservedOutcomeUnknown(() => ({
    get status() {
      accessorReads += 1;
      throw new Error(privateMarker);
    },
  }), { forbiddenValues: [privateMarker] });
  assert.equal(accessorReads, 1, 'throwing status accessor must run once');

  let proxyReads = 0;
  await expectObservedOutcomeUnknown(() => new Proxy({}, {
    get(_target, field) {
      if (field === 'status') {
        proxyReads += 1;
        throw new Error(privateMarker);
      }
      return undefined;
    },
  }), { forbiddenValues: [privateMarker] });
  assert.equal(proxyReads, 1, 'throwing status proxy trap must run once');
});

test('buyer contains every post-submission header observation failure with validated status', async () => {
  const privateMarker = ['private', 'header', 'detail'].join('_');
  const variants = [
    { kind: 'headers-accessor', expectedGet: 0, expectedInvocation: 0 },
    { kind: 'response-proxy', expectedGet: 0, expectedInvocation: 0 },
    { kind: 'null-headers', expectedGet: 0, expectedInvocation: 0 },
    { kind: 'get-accessor', expectedGet: 0, expectedInvocation: 0 },
    { kind: 'get-proxy', expectedGet: 0, expectedInvocation: 0 },
    { kind: 'non-function-get', expectedGet: 0, expectedInvocation: 0 },
    { kind: 'throwing-invocation', expectedGet: 0, expectedInvocation: 1 },
    { kind: 'callable-proxy', expectedGet: 0, expectedInvocation: 1 },
    ...[undefined, false, 0, {}, [], Symbol('invalid-header-result')]
      .map(result => ({
        kind: 'invalid-result',
        result,
        expectedGet: 0,
        expectedInvocation: 1,
      })),
  ];

  for (const variant of variants) {
    let observed;
    await expectObservedOutcomeUnknown(() => {
      observed = makeHeaderFailureResponse(variant.kind, privateMarker, variant.result);
      return observed.response;
    }, { httpStatus: 200, forbiddenValues: [privateMarker] });
    assert.equal(observed.counts.status, 1, 'header failure must retain one validated status read');
    assert.equal(observed.counts.headers, 1, 'header failure must observe headers exactly once');
    assert.equal(observed.counts.get, variant.expectedGet,
      'header failure must read get the expected number of times');
    assert.equal(observed.counts.invocation, variant.expectedInvocation,
      'header failure must invoke get the expected number of times');
  }
});

test('buyer snapshots redirects and missing settlement headers without rereading status', async () => {
  let redirect;
  await expectObservedOutcomeUnknown(({ settlementHeader }) => {
    redirect = makeSingleReadSettlementResponse(302, settlementHeader);
    return redirect.response;
  }, { httpStatus: 302 });
  assert.deepEqual(redirect.counts, {
    status: 1,
    headers: 0,
    get: 0,
    invocation: 0,
    receiver: 0,
  }, 'redirect observation must stop after one status read');

  let missing;
  await expectObservedOutcomeUnknown(() => {
    missing = makeSingleReadSettlementResponse(599, null);
    return missing.response;
  }, { httpStatus: 599 });
  assert.deepEqual(missing.counts, {
    status: 1,
    headers: 1,
    get: 0,
    invocation: 1,
    receiver: 1,
  }, 'missing settlement header must use one complete observation');
});

test('buyer preserves definite rejection and recovery lanes through single-read snapshots', async () => {
  for (const status of [402, 409]) {
    let observed;
    const { result } = await runAcceptedObservedResponse(status, ({ settlementHeader }) => {
      observed = makeSingleReadSettlementResponse(status, settlementHeader);
      return observed.response;
    });
    assert.equal(result.settlement.success, false, 'settlement lane must remain non-positive');
    assert.equal(result.settlement.state, status === 402 ? 'VALIDATED' : 'SUBMISSION_OUTCOME_UNKNOWN',
      'settlement lane state must remain unchanged');
    assert.deepEqual(observed.counts, {
      status: 1,
      headers: 1,
      get: 0,
      invocation: 2,
      receiver: 2,
    }, 'settlement lane response members must each be observed once');
  }
});

test('buyer rejects an oversized raw challenge before payment construction', async () => {
  const { paymentRequired } = await buyerChallenge('http://buyer.test/paid');
  const originalChallenge = structuredClone(paymentRequired);
  const oversizedHeader = encodedJsonAtByteLength(paymentRequired, 6_145);
  assert.equal(oversizedHeader.length, (8 * 1024) + 4, 'oversized challenge must use the next Base64 quantum');
  let calls = 0;
  let constructions = 0;
  let observedError;

  try {
    await paidFetch(paymentRequired.resource.url, {
      async createPaymentPayload() {
        constructions += 1;
        throw new Error('payment construction must not run');
      },
    }, async () => {
      calls += 1;
      if (calls === 1) {
        return {
          status: 402,
          url: paymentRequired.resource.url,
          headers: new Headers({ [HEADERS.PAYMENT_REQUIRED]: oversizedHeader }),
        };
      }
      throw new Error('payment submission must not run');
    });
  } catch (error) {
    observedError = error;
  }

  assert.equal(observedError?.message, 'base64 JSON value exceeds encoded byte limit', 'challenge error must be fixed');
  assert.equal(observedError instanceof PaymentSubmissionOutcomeUnknownError, false, 'pre-payment failure must stay local');
  assert.equal(calls, 1, 'oversized challenge must stop after one request');
  assert.equal(constructions, 0, 'oversized challenge must not construct payment');
  assert.deepEqual(paymentRequired, originalChallenge, 'oversized challenge handling must not mutate input');
});

test('buyer enforces the raw payment signature limit before submission', async () => {
  const { paymentRequired, requirement } = await buyerChallenge('http://buyer.test/paid');
  const originalChallengeJson = JSON.stringify(paymentRequired);
  const exactClient = new MockExactZenonClient();
  let constructions = 0;
  let initialFetches = 0;
  let submissionFetches = 0;
  let sourcePayment;
  let sourcePaymentJson;
  let clientRequired;
  let clientRequiredJson;
  let clientAccepted;
  let clientAcceptedJson;
  let observedError;

  const paymentClient = {
    async createPaymentPayload(required, accepted) {
      constructions += 1;
      clientRequired = required;
      clientRequiredJson = JSON.stringify(required);
      clientAccepted = accepted;
      clientAcceptedJson = JSON.stringify(accepted);
      assert.equal(required === paymentRequired, false, 'payment client challenge input must be detached');
      assert.equal(required.resource === paymentRequired.resource, false, 'payment client resource input must be detached');
      assert.equal(accepted === requirement, false, 'payment client requirement input must be detached');

      sourcePayment = await exactClient.createPaymentPayload(required, accepted);
      sourcePayment.payload.transaction.transportPadding = '';
      const baseBytes = Buffer.byteLength(JSON.stringify(sourcePayment), 'utf8');
      const paddingBytes = 6_145 - baseBytes;
      assert.ok(paddingBytes >= 0, 'buyer egress fixture must fit the target size');
      sourcePayment.payload.transaction.transportPadding = 'x'.repeat(paddingBytes);
      const encoded = encodeB64Json(sourcePayment);
      assert.equal(Buffer.byteLength(JSON.stringify(sourcePayment), 'utf8'), 6_145, 'buyer egress JSON size must be exact');
      assert.equal(encoded.length, (8 * 1024) + 4, 'buyer egress must use the next Base64 quantum');
      assert.equal(Buffer.from(encoded, 'base64').toString('base64'), encoded, 'buyer egress Base64 must be canonical');
      sourcePaymentJson = JSON.stringify(sourcePayment);
      return sourcePayment;
    },
  };

  try {
    await paidFetch(paymentRequired.resource.url, paymentClient, async (_url, options) => {
      if (!options) {
        initialFetches += 1;
        return challengeResponse(paymentRequired);
      }
      submissionFetches += 1;
      throw new Error('payment submission must not run');
    });
  } catch (error) {
    observedError = error;
  }

  assert.equal(observedError?.message, 'base64 JSON value exceeds encoded byte limit', 'buyer egress error must be fixed');
  assert.equal(observedError instanceof PaymentSubmissionOutcomeUnknownError, false, 'pre-submission failure must stay local');
  assert.equal(constructions, 1, 'buyer must construct exactly one oversized payment');
  assert.equal(initialFetches, 1, 'buyer must make exactly one initial fetch');
  assert.equal(submissionFetches, 0, 'buyer must not submit an oversized payment');
  assert.equal(JSON.stringify(paymentRequired) === originalChallengeJson, true, 'buyer must not mutate the original challenge');
  assert.equal(JSON.stringify(clientRequired) === clientRequiredJson, true, 'buyer must not mutate the detached challenge input');
  assert.equal(JSON.stringify(clientAccepted) === clientAcceptedJson, true, 'buyer must not mutate the detached requirement input');
  assert.equal(JSON.stringify(sourcePayment) === sourcePaymentJson, true, 'buyer must not mutate the payment source value');
});

test('buyer classifies an oversized raw settlement as same-payment outcome unknown', async () => {
  const { paymentRequired, requirement } = await buyerChallenge('http://buyer.test/paid');
  const originalChallenge = structuredClone(paymentRequired);
  const exactClient = new MockExactZenonClient();
  let calls = 0;
  let constructions = 0;
  let submittedPayment;
  let observedError;

  const paymentClient = {
    async createPaymentPayload(...args) {
      constructions += 1;
      return exactClient.createPaymentPayload(...args);
    },
  };

  try {
    await paidFetch(paymentRequired.resource.url, paymentClient, async (_url, options) => {
      calls += 1;
      if (calls === 1) return challengeResponse(paymentRequired);
      if (calls > 2) throw new Error('a third request must not run');
      submittedPayment = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
      const settlement = {
        success: true,
        network: requirement.network,
        transaction: submittedPayment.payload.transaction.hash,
        payer: submittedPayment.payload.transaction.address,
        state: 'MOMENTUM_INCLUDED',
      };
      const oversizedHeader = encodedJsonAtByteLength(settlement, 6_145);
      assert.equal(oversizedHeader.length, (8 * 1024) + 4, 'oversized settlement must use the next Base64 quantum');
      return {
        status: 200,
        headers: new Headers({ [HEADERS.PAYMENT_RESPONSE]: oversizedHeader }),
      };
    });
  } catch (error) {
    observedError = error;
  }

  assert.ok(observedError instanceof PaymentSubmissionOutcomeUnknownError, 'oversized settlement must be uncertain');
  assert.equal(observedError?.message, 'payment_submission_outcome_unknown', 'settlement error must be fixed');
  assert.equal(observedError?.retrySamePayment, true, 'oversized settlement must reuse the same payment');
  assert.equal(observedError?.action, 'reuse_and_reconcile_same_payment', 'oversized settlement must preserve recovery action');
  assert.deepEqual(observedError?.paymentPayload, submittedPayment, 'recovery must retain the detached submitted payment');
  assert.notEqual(observedError?.paymentPayload, submittedPayment, 'recovery payment must be detached');
  assert.deepEqual(observedError?.paymentRequired, originalChallenge, 'recovery must retain the original challenge');
  assert.equal(
    Object.getOwnPropertyDescriptor(observedError, 'paymentPayload')?.enumerable,
    false,
    'submitted payment recovery field must be non-enumerable',
  );
  assert.equal(
    Object.getOwnPropertyDescriptor(observedError, 'paymentRequired')?.enumerable,
    false,
    'challenge recovery field must be non-enumerable',
  );
  assert.equal(constructions, 1, 'oversized settlement must construct exactly one payment');
  assert.equal(calls, 2, 'oversized settlement must make exactly two requests');
});

test('buyer uses manual redirect handling and preserves the exact payment on redirect', async () => {
  const { paymentRequired } = await buyerChallenge('https://resource.example/paid');
  let submissionOptions;
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    if (calls === 1) return challengeResponse(paymentRequired);
    submissionOptions = options;
    return { status: 302, headers: new Headers({ location: 'https://other.example/capture' }) };
  };

  await assert.rejects(
    paidFetch(paymentRequired.resource.url, new MockExactZenonClient(), fetchImpl),
    error => {
      assert.ok(error instanceof PaymentSubmissionOutcomeUnknownError);
      assert.equal(error.code, 'payment_submission_outcome_unknown');
      assert.equal(error.retrySamePayment, true);
      assert.equal(error.action, 'reuse_and_reconcile_same_payment');
      assert.equal(error.paymentPayload.payload.transaction.hash.length, 64);
      return true;
    },
  );
  assert.equal(submissionOptions.redirect, 'manual');
  assert.ok(submissionOptions.headers[HEADERS.PAYMENT_SIGNATURE]);
});

test('buyer transport errors preserve the reusable payment without exposing the cause', async () => {
  const { paymentRequired } = await buyerChallenge('https://resource.example/paid');
  let calls = 0;
  let submittedPayload;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    if (calls === 1) return challengeResponse(paymentRequired);
    submittedPayload = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
    throw new Error('sensitive transport detail');
  };

  await assert.rejects(
    paidFetch(paymentRequired.resource.url, new MockExactZenonClient(), fetchImpl),
    error => {
      assert.ok(error instanceof PaymentSubmissionOutcomeUnknownError);
      assert.equal(error.message, 'payment_submission_outcome_unknown');
      assert.doesNotMatch(String(error), /sensitive transport detail/);
      assert.deepEqual(error.paymentPayload, submittedPayload);
      assert.equal(Object.getOwnPropertyDescriptor(error, 'paymentPayload').enumerable, false);
      assert.equal(Object.getOwnPropertyDescriptor(error, 'paymentPayload').writable, false);
      assert.equal(Object.getOwnPropertyDescriptor(error, 'paymentRequired').enumerable, false);
      return true;
    },
  );
});

test('outcome-unknown recovery preserves optional ResourceInfo representation exactly', async () => {
  const resources = [
    { url: 'https://resource.example/paid' },
    { url: 'https://resource.example/paid', description: '', mimeType: '' },
    { url: 'https://resource.example/paid', serviceName: 'Service' },
    { url: 'https://resource.example/paid', tags: [] },
    {
      url: 'https://resource.example/paid',
      iconUrl: 'HTTPS://icons.example:443/a%2Fb.png?size=2#mark',
    },
    {
      url: 'https://resource.example/paid',
      description: '',
      mimeType: '',
      serviceName: 'Service',
      tags: ['alpha', 'alpha', 'beta'],
      iconUrl: 'https://localhost/icon.png',
    },
  ];

  for (const resource of resources) {
    const requirement = await buildRequirement('mock');
    const paymentRequired = {
      x402Version: 2,
      resource,
      accepts: [requirement],
    };
    paymentRequired.extensions = {};
    let calls = 0;
    let submitted;
    await assert.rejects(
      paidFetch(resource.url, new MockExactZenonClient(), async (_url, options) => {
        calls += 1;
        if (!options) return challengeResponse(paymentRequired);
        submitted = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
        throw new Error('synthetic transport failure');
      }),
      error => {
        assert.ok(error instanceof PaymentSubmissionOutcomeUnknownError);
        assert.deepEqual(error.paymentRequired.resource, resource);
      assert.deepEqual(error.paymentPayload.resource, resource);
        assert.deepEqual(submitted.resource, resource);
        assert.equal(error.retrySamePayment, true);
        assert.equal(Object.hasOwn(error.paymentPayload, 'extensions'), false);
        return true;
      },
    );
    assert.equal(calls, 2);
  }
});

test('detached single-offer client mutation cannot alter outcome-unknown recovery state', async () => {
  const { paymentRequired, requirement } = await buyerChallenge('https://resource.example/paid');
  paymentRequired.resource.serviceName = 'Service';
  paymentRequired.resource.tags = ['alpha', 'alpha', 'beta'];
  paymentRequired.resource.iconUrl = 'HTTPS://icons.example:443/a%2Fb.png?size=2#mark';
  const originalChallenge = structuredClone(paymentRequired);
  const exact = new MockExactZenonClient();
  let calls = 0;
  let submitted;
  let mutatedClientView;

  let recoveryError;
  try {
    await paidFetch(paymentRequired.resource.url, {
      async createPaymentPayload(received, selected) {
        const untouchedRequired = structuredClone(received);
        const untouchedSelected = structuredClone(selected);
        received.resource.serviceName = 'Other service';
        received.resource.tags.reverse();
        received.resource.iconUrl = 'https://icons.example/other.png';
        selected.amount = '101';
        received.accepts[0].maxTimeoutSeconds = 31;
        mutatedClientView = structuredClone(received);
        return exact.createPaymentPayload(untouchedRequired, untouchedSelected);
      },
    }, async (_url, options) => {
      calls += 1;
      if (!options) return challengeResponse(paymentRequired);
      submitted = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
      throw new Error('synthetic transport failure');
    });
  } catch (error) {
    recoveryError = error;
  }

  assert.equal(recoveryError?.message, 'payment_submission_outcome_unknown');
  assert.ok(recoveryError instanceof PaymentSubmissionOutcomeUnknownError);
  assert.deepEqual(recoveryError.paymentRequired, originalChallenge);
  assert.deepEqual(recoveryError.paymentRequired.resource, originalChallenge.resource);
  assert.deepEqual(recoveryError.paymentRequired.accepts[0], originalChallenge.accepts[0]);
  assert.deepEqual(recoveryError.paymentPayload, submitted);
  assert.deepEqual(recoveryError.paymentPayload.resource, originalChallenge.resource);
  assert.deepEqual(recoveryError.paymentPayload.accepted, originalChallenge.accepts[0]);
  assert.equal(recoveryError.retrySamePayment, true);

  assert.equal(calls, 2);
  assert.notDeepEqual(mutatedClientView, originalChallenge);
  assert.deepEqual(paymentRequired, originalChallenge);
});

test('mixed-offer recovery retains the original challenge and selected payment', async () => {
  const { paymentRequired, requirement } = await buyerChallenge('https://resource.example/paid');
  const original = {
    ...paymentRequired,
    accepts: [{
      scheme: 'other',
      network: 'other:test',
      asset: 'asset',
      amount: '1',
      payTo: 'recipient',
      maxTimeoutSeconds: 30,
      extra: null,
    }, ...paymentRequired.accepts],
  };
  const exact = new MockExactZenonClient();
  let selectedView;
  const wrapper = {
    async createPaymentPayload(required, accepted) {
      selectedView = required;
      return exact.createPaymentPayload(required, accepted);
    },
  };
  Object.defineProperty(wrapper, 'paymentCapabilities', {
    value: exact.paymentCapabilities,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  let calls = 0;
  await assert.rejects(
    paidFetch(original.resource.url, wrapper, async (_url, options) => {
      calls += 1;
      if (!options) return challengeResponse(original);
      throw new Error('synthetic transport failure');
    }),
    error => {
      assert.ok(error instanceof PaymentSubmissionOutcomeUnknownError);
      assert.deepEqual(error.paymentRequired, original);
      assert.deepEqual(error.paymentPayload.accepted, requirement);
      assert.equal(selectedView.accepts.length, 1);
      assert.deepEqual(selectedView.accepts[0], requirement);
      assert.notEqual(selectedView, original);
      assert.notEqual(selectedView.resource, original.resource);
      return true;
    },
  );
  assert.equal(calls, 2);
});

test('buyer treats a post-submission 402 without settlement evidence as uncertain', async () => {
  const { paymentRequired } = await buyerChallenge('https://resource.example/paid');
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return challengeResponse(paymentRequired);
    return { status: 402, headers: new Headers() };
  };

  await assert.rejects(
    paidFetch(paymentRequired.resource.url, new MockExactZenonClient(), fetchImpl),
    error => error instanceof PaymentSubmissionOutcomeUnknownError &&
      error.httpStatus === 402 && error.retrySamePayment === true,
  );
});

test('buyer treats an uncorroborated post-submission 400 as uncertain', async () => {
  const { paymentRequired } = await buyerChallenge('https://resource.example/paid');
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return challengeResponse(paymentRequired);
    return { status: 400, headers: new Headers() };
  };

  await assert.rejects(
    paidFetch(paymentRequired.resource.url, new MockExactZenonClient(), fetchImpl),
    error => error instanceof PaymentSubmissionOutcomeUnknownError &&
      error.httpStatus === 400 && error.retrySamePayment === true,
  );
  assert.equal(calls, 2);
});

test('buyer returns exact transaction-bound definite rejection evidence', async () => {
  const { paymentRequired, requirement } = await buyerChallenge('https://resource.example/paid');
  const result = await buyerSettlementAttempt(paymentRequired, requirement);

  assert.equal(result.response.status, 402);
  assert.equal(result.settlement.success, false);
  assert.equal(result.settlement.network, requirement.network);
  assert.equal(result.settlement.transaction, result.paymentPayload.payload.transaction.hash);
  assert.equal(result.settlement.payer, result.paymentPayload.payload.transaction.address);
  assert.equal(result.settlement.state, 'VALIDATED');
  assert.equal(result.settlement.errorReason, 'payment_settlement_failed');
  assert.equal(Object.hasOwn(result.settlement, 'retrySamePayment'), false);
});

test('buyer binds rejection evidence to the detached payload bytes actually submitted', async () => {
  const { paymentRequired, requirement } = await buyerChallenge('https://resource.example/paid');
  const mockClient = new MockExactZenonClient();
  let retainedPayload;
  let submittedPayload;
  let calls = 0;
  const paymentClient = {
    async createPaymentPayload(...args) {
      retainedPayload = await mockClient.createPaymentPayload(...args);
      return retainedPayload;
    },
  };
  const fetchImpl = async (_url, options) => {
    calls += 1;
    if (calls === 1) return challengeResponse(paymentRequired);
    submittedPayload = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
    retainedPayload.accepted.network = 'zenon:testnet';
    retainedPayload.payload.transaction.hash = 'a'.repeat(64);
    retainedPayload.payload.transaction.address = `mock-${'e'.repeat(32)}`;
    return {
      status: 402,
      headers: new Headers({
        [HEADERS.PAYMENT_RESPONSE]: encodeB64Json({
          success: false,
          network: retainedPayload.accepted.network,
          transaction: retainedPayload.payload.transaction.hash,
          payer: retainedPayload.payload.transaction.address,
          state: 'VALIDATED',
          errorReason: 'payment_settlement_failed',
        }),
      }),
    };
  };

  await assert.rejects(
    paidFetch(paymentRequired.resource.url, paymentClient, fetchImpl),
    error => {
      assert.ok(error instanceof PaymentSubmissionOutcomeUnknownError);
      assert.deepEqual(error.paymentPayload, submittedPayload);
      assert.equal(error.paymentPayload.accepted.network, requirement.network);
      assert.notEqual(error.paymentPayload.payload.transaction.hash, retainedPayload.payload.transaction.hash);
      return true;
    },
  );
});

test('buyer treats every malformed or inconsistent definite rejection variation as uncertain', async () => {
  const { paymentRequired, requirement } = await buyerChallenge('https://resource.example/paid');
  const cases = [
    { header: 'missing' },
    { header: 'malformed' },
    { header: 'noncanonical' },
    { header: 'oversized' },
    { transform: value => ({ ...value, unexpected: true }) },
    { status: 200 },
    { transform: value => ({ ...value, network: 'zenon:testnet' }) },
    { transform: value => ({ ...value, transaction: '0'.repeat(64) }) },
    { transform: value => ({ ...value, payer: 'mock-forged-payer' }) },
    { transform: value => ({ ...value, state: 'SUBMISSION_ACKNOWLEDGED' }) },
    { transform: value => ({ ...value, errorReason: 'private_frontier_detail' }) },
    { transform: value => ({ ...value, retrySamePayment: true }) },
    { transform: value => ({ ...value, retrySamePayment: false }) },
    { transform: value => ({ ...value, success: true }) },
    { transform: value => { delete value.success; return value; } },
    { transform: value => { delete value.errorReason; return value; } },
    { transform: value => { delete value.network; return value; } },
    { transform: value => { delete value.transaction; return value; } },
    { transform: value => { delete value.payer; return value; } },
    { transform: value => { delete value.state; return value; } },
    { transform: value => ({ ...value, transaction: 'A'.repeat(64) }) },
    { transform: value => ({ ...value, payer: 'x'.repeat(129) }) },
  ];

  for (const variation of cases) {
    await assert.rejects(
      buyerSettlementAttempt(paymentRequired, requirement, variation),
      error => error instanceof PaymentSubmissionOutcomeUnknownError &&
        error.code === 'payment_submission_outcome_unknown' &&
        error.retrySamePayment === true,
    );
  }
});

test('buyer rejects a settlement response for a different transaction', async () => {
  const { paymentRequired, requirement } = await buyerChallenge('https://resource.example/paid');
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    if (calls === 1) return challengeResponse(paymentRequired);
    const payload = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
    return {
      status: 200,
      headers: new Headers({
        [HEADERS.PAYMENT_RESPONSE]: encodeB64Json({
          success: true,
          network: requirement.network,
          transaction: '0'.repeat(64),
          payer: payload.payload.transaction.address,
          state: 'MOMENTUM_INCLUDED',
        }),
      }),
    };
  };
  await assert.rejects(
    paidFetch(paymentRequired.resource.url, new MockExactZenonClient(), fetchImpl),
    error => error instanceof PaymentSubmissionOutcomeUnknownError && error.retrySamePayment === true,
  );
});

test('buyer refuses an HTTP live payment resource before signing', async () => {
  const requirement = {
    scheme: 'exact',
    network: 'zenon:testnet',
    asset: 'zts1qqqqqqqqqqqqtq587y',
    amount: '1',
    payTo: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: {
        version: 1,
        chainIdentifier: '42424242',
        genesisMomentumHash: 'a'.repeat(64),
      },
    },
  };
  const { paymentRequired } = await buyerChallenge('http://resource.example/paid', requirement);
  let signed = false;
  await assert.rejects(
    paidFetch(paymentRequired.resource.url, {
      async createPaymentPayload() {
        signed = true;
      },
    }, async () => challengeResponse(paymentRequired)),
    /must use HTTPS/,
  );
  assert.equal(signed, false);
});

test('resource server exposes only exact terminal reconciliation evidence', async () => {
  const requirement = await buildRequirement('mock');
  const states = ['VALIDATED', 'SUBMISSION_ACKNOWLEDGED', 'SUBMISSION_OUTCOME_UNKNOWN'];
  let state = states[0];
  let deliveries = 0;
  let settleCalls = 0;
  const facilitator = {
    async settle(paymentPayload, selectedRequirement, paymentRequired) {
      settleCalls += 1;
      return terminalInternalEvidence(paymentPayload, selectedRequirement, paymentRequired, state);
    },
  };
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => {
      deliveries += 1;
      return { ok: true };
    },
  });
  const listening = await app.listen();
  try {
    const { paymentPayload } = await signedPayment(listening.url);
    for (state of states) {
      const response = await submitPayment(listening.url, paymentPayload);
      const responseHeader = response.headers.get(HEADERS.PAYMENT_RESPONSE);
      const rawBody = await response.text();
      assert.equal(response.status, 402);
      assertPaidResponseIsPrivate(response);
      assert.equal(response.headers.get(HEADERS.PAYMENT_REQUIRED), null);
      assert.equal(typeof responseHeader, 'string');
      assert.equal(rawBody === '{"error":"payment_reconciliation_terminal"}', true);
      const settlement = decodeB64Json(responseHeader);
      assert.deepEqual(Object.keys(settlement).sort(), [
        'errorReason', 'network', 'payer', 'state', 'success', 'transaction',
      ]);
      assert.equal(settlement.success, false);
      assert.equal(settlement.network === requirement.network, true);
      assert.equal(settlement.transaction === paymentPayload.payload.transaction.hash, true);
      assert.equal(settlement.payer === paymentPayload.payload.transaction.address, true);
      assert.equal(settlement.state, state);
      assert.equal(settlement.errorReason, 'payment_reconciliation_terminal');
      assert.equal(Object.hasOwn(settlement, 'retrySamePayment'), false);
      assert.equal(Object.hasOwn(settlement, 'authorizationKey'), false);
      assert.equal(Object.hasOwn(settlement, 'deliveryState'), false);
    }
    assert.equal(deliveries, 0);
    assert.equal(settleCalls, states.length);
  } finally {
    await app.close();
  }
});

test('resource server keeps malformed terminal reconciliation evidence private', async () => {
  const requirement = await buildRequirement('mock');
  let deliveries = 0;
  let deliveryTransitions = 0;
  let transform = value => value;
  const facilitator = {
    async settle(paymentPayload, selectedRequirement, paymentRequired) {
      return transform(terminalInternalEvidence(
        paymentPayload,
        selectedRequirement,
        paymentRequired,
        'SUBMISSION_OUTCOME_UNKNOWN',
      ));
    },
    async markDeliveryPending(settlement) {
      deliveryTransitions += 1;
      return {
        authorizationKey: settlement.authorizationKey,
        payer: settlement.payer,
        transaction: settlement.transaction,
        deliveryState: 'DELIVERY_PENDING',
        deliveryClaimed: true,
      };
    },
    async markDelivered(settlement, cachedResponse) {
      deliveryTransitions += 1;
      return {
        authorizationKey: settlement.authorizationKey,
        payer: settlement.payer,
        transaction: settlement.transaction,
        deliveryState: 'DELIVERED',
        cachedResponse,
      };
    },
  };
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => {
      deliveries += 1;
      return { ok: true };
    },
  });
  const listening = await app.listen();
  try {
    const { paymentPayload } = await signedPayment(listening.url);
    const variants = [
      value => { delete value.authorizationKey; return value; },
      value => ({ ...value, authorizationKey: '0'.repeat(64) }),
      value => ({ ...value, network: 'zenon:testnet' }),
      value => ({ ...value, transaction: '0'.repeat(64) }),
      value => ({ ...value, payer: `mock-${'0'.repeat(32)}` }),
      value => ({ ...value, state: 'MOMENTUM_INCLUDED' }),
      value => ({ ...value, success: true }),
      value => ({
        ...value,
        success: true,
        state: 'MOMENTUM_INCLUDED',
        deliveryState: 'NONE',
      }),
      value => ({ ...value, deliveryState: 'DELIVERY_PENDING' }),
      value => ({ ...value, retrySamePayment: true }),
      value => ({ ...value, unexpected: true }),
      value => ({ ...value, paymentRequired: true, paymentResponse: true }),
      value => {
        delete value.state;
        Object.defineProperty(value, 'state', {
          enumerable: true,
          get() {
            throw new Error('private terminal accessor');
          },
        });
        return value;
      },
    ];
    for (transform of variants) {
      const response = await submitPayment(listening.url, paymentPayload);
      const body = await response.text();
      assert.equal(response.status, 500);
      assertPaidResponseIsPrivate(response);
      assert.equal(response.headers.get(HEADERS.PAYMENT_REQUIRED), null);
      assert.equal(response.headers.get(HEADERS.PAYMENT_RESPONSE), null);
      assert.equal(body.includes('internal_error'), true);
      assert.equal(body.includes('payment_reconciliation_terminal'), false);
      assert.equal(body.includes('private terminal accessor'), false);
    }
    assert.equal(deliveries, 0);
    assert.equal(deliveryTransitions, 0);
  } finally {
    await app.close();
  }
});

test('resource server treats unreadable terminal reasons as private failures before delivery', async () => {
  const variants = ['accessor', 'descriptor-error'];

  for (const variant of variants) {
    const requirement = await buildRequirement('mock');
    const honest = new MockExactZenonFacilitator();
    let accessorReads = 0;
    let descriptorErrors = 0;
    let resourceHandlerCalls = 0;
    let pendingCalls = 0;
    let deliveredCalls = 0;
    const facilitator = {
      async settle(...args) {
        const settlement = await honest.settle(...args);
        if (variant === 'accessor') {
          Object.defineProperty(settlement, 'errorReason', {
            configurable: true,
            enumerable: true,
            get() {
              accessorReads += 1;
              throw new Error('private terminal accessor');
            },
          });
          return settlement;
        }
        return new Proxy(settlement, {
          getOwnPropertyDescriptor(target, property) {
            if (property === 'errorReason') {
              descriptorErrors += 1;
              throw new Error('private terminal descriptor');
            }
            return Reflect.getOwnPropertyDescriptor(target, property);
          },
        });
      },
      async markDeliveryPending(settlement) {
        pendingCalls += 1;
        return honest.markDeliveryPending(settlement);
      },
      async markDelivered(settlement, cachedResponse) {
        deliveredCalls += 1;
        return honest.markDelivered(settlement, cachedResponse);
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => {
        resourceHandlerCalls += 1;
        return { ok: true };
      },
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await signedPayment(listening.url);
      const response = await submitPayment(listening.url, paymentPayload);
      const body = await response.text();
      assert.equal(response.status, 500);
      assertPaidResponseIsPrivate(response);
      assert.equal(response.headers.get(HEADERS.PAYMENT_REQUIRED), null);
      assert.equal(response.headers.get(HEADERS.PAYMENT_RESPONSE), null);
      assert.equal(body === JSON.stringify({ error: 'internal_error' }, null, 2), true);
      assert.equal(body.includes('payment_reconciliation_terminal'), false);
      assert.equal(body.includes('private terminal'), false);
      assert.equal(resourceHandlerCalls, 0);
      assert.equal(pendingCalls, 0);
      assert.equal(deliveredCalls, 0);
      assert.equal(accessorReads, 0);
      assert.equal(variant === 'descriptor-error' ? descriptorErrors > 0 : descriptorErrors === 0, true);
    } finally {
      await app.close();
    }
  }
});

test('buyer accepts exact response-only terminal reconciliation without recovery ownership', async () => {
  const { paymentRequired, requirement } = await buyerChallenge('https://resource.example/paid');
  for (const state of ['VALIDATED', 'SUBMISSION_ACKNOWLEDGED', 'SUBMISSION_OUTCOME_UNKNOWN']) {
    let fetches = 0;
    let bodyReads = 0;
    const response = {};
    const result = await paidFetch(
      paymentRequired.resource.url,
      new MockExactZenonClient(),
      async (_url, options) => {
        fetches += 1;
        if (!options) return challengeResponse(paymentRequired);
        const paymentPayload = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
        Object.defineProperties(response, {
          status: { value: 402, enumerable: true },
          headers: {
            value: new Headers({
              [HEADERS.PAYMENT_RESPONSE]: encodeB64Json(
                terminalPublicEvidence(paymentPayload, requirement, state),
              ),
            }),
            enumerable: true,
          },
          body: {
            get() {
              bodyReads += 1;
              throw new Error('terminal body must not be consumed');
            },
          },
        });
        return response;
      },
    );
    assert.equal(result.response, response);
    assert.equal(result.settlement.state, state);
    assert.equal(result.settlement.errorReason, 'payment_reconciliation_terminal');
    assert.equal(Object.hasOwn(result.settlement, 'retrySamePayment'), false);
    assert.equal(Object.hasOwn(result, 'recoveryHandle'), false);
    let reconciliationFetches = 0;
    await assert.rejects(
      reconcilePayment(result, async () => {
        reconciliationFetches += 1;
        throw new Error('terminal reconciliation must not fetch');
      }),
      /invalid payment recovery owner/,
    );
    assert.equal(fetches, 2);
    assert.equal(reconciliationFetches, 0);
    assert.equal(bodyReads, 0);
  }
});

test('buyer keeps terminal ambiguity private and transfers same-payment recovery ownership', async () => {
  const { paymentRequired, requirement } = await buyerChallenge('https://resource.example/paid');
  let terminalHeaderAccessorReads = 0;

  async function expectTerminalUnknown({
    status = 402,
    transform = value => value,
    includePaymentRequired = false,
    headerAccessor = false,
    omitSettlement = false,
  } = {}) {
    let calls = 0;
    let submittedPayment;
    let observedError;
    try {
      await paidFetch(paymentRequired.resource.url, new MockExactZenonClient(), async (_url, options) => {
        calls += 1;
        if (!options) return challengeResponse(paymentRequired);
        submittedPayment = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
        if (headerAccessor) {
          const headers = {};
          Object.defineProperty(headers, 'get', {
            get() {
              terminalHeaderAccessorReads += 1;
              throw new Error('private terminal header accessor');
            },
          });
          return { status, headers };
        }
        const headers = new Headers();
        if (!omitSettlement) {
          headers.set(HEADERS.PAYMENT_RESPONSE, encodeB64Json(transform(
            terminalPublicEvidence(submittedPayment, requirement, 'SUBMISSION_OUTCOME_UNKNOWN'),
          )));
        }
        if (includePaymentRequired) {
          headers.set(HEADERS.PAYMENT_REQUIRED, encodeB64Json(paymentRequired));
        }
        return { status, headers };
      });
    } catch (error) {
      observedError = error;
    }
    assert.equal(observedError instanceof PaymentSubmissionOutcomeUnknownError, true);
    assert.equal(observedError?.retrySamePayment, true);
    assert.equal(Object.hasOwn(observedError, 'recoveryHandle'), true);
    assert.equal(calls, 2);

    let recoveryFetches = 0;
    const successor = await reconcilePayment(observedError, async (_url, options) => {
      recoveryFetches += 1;
      const paymentPayload = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
      return {
        status: 409,
        headers: new Headers({
          [HEADERS.PAYMENT_RESPONSE]: encodeB64Json(
            settlementEvidenceForStatus(409, requirement, paymentPayload),
          ),
        }),
      };
    });
    assert.equal(successor.settlement.retrySamePayment, true);
    assert.equal(Object.hasOwn(successor, 'recoveryHandle'), true);
    assert.equal(recoveryFetches, 1);
  }

  const variants = [
    { includePaymentRequired: true },
    { transform: value => ({ ...value, unexpected: true }) },
    { transform: value => ({ ...value, network: 'zenon:testnet' }) },
    { transform: value => ({ ...value, state: 'MOMENTUM_INCLUDED' }) },
    { transform: value => ({ ...value, errorReason: 'payment_reconciliation_inexact' }) },
    { transform: value => ({ ...value, retrySamePayment: false }) },
    { status: 409 },
    { status: 500, omitSettlement: true },
    { headerAccessor: true },
  ];
  for (const variant of variants) await expectTerminalUnknown(variant);
  assert.equal(terminalHeaderAccessorReads, 0);

  let legacyCalls = 0;
  const legacy = await paidFetch(paymentRequired.resource.url, new MockExactZenonClient(), async (_url, options) => {
    legacyCalls += 1;
    if (!options) return challengeResponse(paymentRequired);
    const paymentPayload = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
    return {
      status: 402,
      headers: new Headers({
        [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(paymentRequired),
        [HEADERS.PAYMENT_RESPONSE]: encodeB64Json(
          settlementEvidenceForStatus(402, requirement, paymentPayload),
        ),
      }),
    };
  });
  assert.equal(legacy.settlement.errorReason, 'payment_settlement_failed');
  assert.equal(Object.hasOwn(legacy, 'recoveryHandle'), false);
  assert.equal(legacyCalls, 2);

  let recoveryCalls = 0;
  const recovery = await paidFetch(paymentRequired.resource.url, new MockExactZenonClient(), async (_url, options) => {
    recoveryCalls += 1;
    if (!options) return challengeResponse(paymentRequired);
    const paymentPayload = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
    return {
      status: 409,
      headers: new Headers({
        [HEADERS.PAYMENT_RESPONSE]: encodeB64Json(
          settlementEvidenceForStatus(409, requirement, paymentPayload),
        ),
      }),
    };
  });
  assert.equal(recovery.settlement.retrySamePayment, true);
  assert.equal(Object.hasOwn(recovery, 'recoveryHandle'), true);
  assert.equal(recoveryCalls, 2);
});

function issue85LiveRequirement(minimumMomentumConfirmations = 2) {
  const payTo = sdk.Address.fromPublicKey(Uint8Array.from({ length: 32 }, (_, index) => index + 1))
    .toString();
  return {
    scheme: 'exact',
    network: 'zenon:testnet',
    asset: sdk.TokenStandard.fromCore(Uint8Array.from({ length: 10 }, (_, index) => index + 11))
      .toString(),
    amount: '1',
    payTo,
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: {
        version: 1,
        chainIdentifier: '7',
        genesisMomentumHash: sha256Hex('issue-85 synthetic chain profile'),
      },
      minimumMomentumConfirmations,
    },
  };
}

function issue85PaymentPayload(paymentRequired, label = 'payment') {
  const accepted = structuredClone(paymentRequired.accepts[0]);
  return {
    x402Version: paymentRequired.x402Version,
    resource: structuredClone(paymentRequired.resource),
    accepted,
    payload: {
      transaction: {
        hash: sha256Hex(`issue-85 synthetic ${label}`),
        address: sdk.Address.fromPublicKey(
          Uint8Array.from({ length: 32 }, (_, index) => 63 - index),
        ).toString(),
      },
      intentDigest: paymentIntentDigest(paymentRequired, accepted),
    },
  };
}

function issue85AuthorizationKey(paymentPayload, paymentRequired) {
  const accepted = paymentPayload.accepted;
  return sha256Hex({
    domain: 'zenon-x402-authorization-v1',
    chainProfile: accepted.extra.zenonChain,
    intentDigest: paymentIntentDigest(paymentRequired, accepted),
    resourceDigest: sha256Hex(paymentRequired.resource),
    transactionHash: paymentPayload.payload.transaction.hash,
  });
}

function issue85ShieldedThresholdResult(paymentPayload, paymentRequired) {
  const result = {
    success: false,
    network: paymentPayload.accepted.network,
    transaction: paymentPayload.payload.transaction.hash,
    payer: paymentPayload.payload.transaction.address,
    errorReason: 'momentum_confirmation_threshold_pending',
    state: 'MOMENTUM_INCLUDED',
    authorizationKey: issue85AuthorizationKey(paymentPayload, paymentRequired),
    retrySamePayment: true,
    deliveryState: 'NONE',
  };
  Object.defineProperty(result, 'then', {
    value: undefined,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return result;
}

function issue85CopyShieldedResult(value, overrides = {}) {
  const copy = { ...value, ...overrides };
  Object.defineProperty(copy, 'then', {
    value: undefined,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return copy;
}

async function issue85ChallengeAndPayment(url, label) {
  const challenge = await fetch(`${url}/paid`);
  assert.equal(challenge.status, 402);
  const paymentRequired = decodeB64Json(challenge.headers.get(HEADERS.PAYMENT_REQUIRED));
  return {
    paymentRequired,
    paymentPayload: issue85PaymentPayload(paymentRequired, label),
  };
}

test('exact authenticated threshold-pending evidence maps only to same-payment HTTP reconciliation',
  { concurrency: false, timeout: 30_000 }, async () => {
    if (await isolatePrototypeSensitiveTest(
      'exact authenticated threshold-pending evidence maps only to same-payment HTTP reconciliation',
      'X402_THRESHOLD_PENDING_THEN_ISOLATED',
    )) return;

    const requirement = issue85LiveRequirement(2);
    let claimCalls = 0;
    let deliveredCalls = 0;
    let handlerCalls = 0;
    let inheritedThenReads = 0;
    let arrayHookCalls = 0;
    const facilitator = {
      async settle(paymentPayload, accepted, paymentRequired) {
        assert.deepEqual(accepted, requirement);
        const result = issue85ShieldedThresholdResult(paymentPayload, paymentRequired);
        assert.deepEqual(Object.keys(result), [
          'success',
          'network',
          'transaction',
          'payer',
          'errorReason',
          'state',
          'authorizationKey',
          'retrySamePayment',
          'deliveryState',
        ]);
        assert.deepEqual(Object.getOwnPropertyDescriptor(result, 'then'), {
          value: undefined,
          enumerable: false,
          writable: false,
          configurable: false,
        });
        return result;
      },
      async markDeliveryPending() {
        claimCalls += 1;
        throw new Error('threshold-pending evidence must not claim delivery');
      },
      async markDelivered() {
        deliveredCalls += 1;
        throw new Error('threshold-pending evidence must not cache delivery');
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => {
        handlerCalls += 1;
        return { ok: true };
      },
    });
    const listening = await app.listen();
    const previousThen = Object.getOwnPropertyDescriptor(Object.prototype, 'then');
    const someDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'some');
    const everyDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'every');
    const includesDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'includes');
    const iteratorDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
    const isPendingShapeArray = value => {
      if (!Array.isArray(value) || (value.length !== 9 && value.length !== 10)) return false;
      let hasSuccess = false;
      let hasReason = false;
      let hasAuthorization = false;
      let hasDeliveryState = false;
      for (let index = 0; index < value.length; index += 1) {
        if (value[index] === 'success') hasSuccess = true;
        else if (value[index] === 'errorReason') hasReason = true;
        else if (value[index] === 'authorizationKey') hasAuthorization = true;
        else if (value[index] === 'deliveryState') hasDeliveryState = true;
      }
      return hasSuccess && hasReason && hasAuthorization && hasDeliveryState;
    };
    const poisonPendingArrayMethod = descriptor => ({
      ...descriptor,
      value: function poisonPendingShape(...args) {
        if (isPendingShapeArray(this)) {
          arrayHookCalls += 1;
          throw new Error('pending evidence reached a mutable Array hook');
        }
        return Reflect.apply(descriptor.value, this, args);
      },
    });
    let response;
    let paymentPayload;
    try {
      ({ paymentPayload } = await issue85ChallengeAndPayment(listening.url, 'honest threshold'));
      Object.defineProperty(Object.prototype, 'then', {
        configurable: true,
        get() {
          const state = Object.getOwnPropertyDescriptor(this, 'state');
          const reason = Object.getOwnPropertyDescriptor(this, 'errorReason');
          if (state?.value !== 'MOMENTUM_INCLUDED' ||
              reason?.value !== 'momentum_confirmation_threshold_pending') return undefined;
          inheritedThenReads += 1;
          throw new Error('threshold result inherited then was observed');
        },
      });
      Object.defineProperty(
        Array.prototype,
        'some',
        poisonPendingArrayMethod(someDescriptor),
      );
      Object.defineProperty(
        Array.prototype,
        'every',
        poisonPendingArrayMethod(everyDescriptor),
      );
      Object.defineProperty(
        Array.prototype,
        'includes',
        poisonPendingArrayMethod(includesDescriptor),
      );
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        ...iteratorDescriptor,
        value: function poisonPendingShapeIterator() {
          if (isPendingShapeArray(this)) {
            arrayHookCalls += 1;
            throw new Error('pending evidence reached the mutable Array iterator');
          }
          return Reflect.apply(iteratorDescriptor.value, this, []);
        },
      });
      response = await submitPayment(listening.url, paymentPayload);
    } finally {
      Object.defineProperty(Array.prototype, 'some', someDescriptor);
      Object.defineProperty(Array.prototype, 'every', everyDescriptor);
      Object.defineProperty(Array.prototype, 'includes', includesDescriptor);
      Object.defineProperty(Array.prototype, Symbol.iterator, iteratorDescriptor);
      if (previousThen) Object.defineProperty(Object.prototype, 'then', previousThen);
      else delete Object.prototype.then;
    }

    try {
      const observation = await observePaidSubmission(response);
      assertSubmittedIdentityRecovery(observation, paymentPayload, {
        state: 'MOMENTUM_INCLUDED',
        reason: 'payment_reconciliation_required',
      });
      assert.equal(response.headers.get(HEADERS.PAYMENT_REQUIRED), null);
      assert.equal(inheritedThenReads, 0);
      assert.equal(arrayHookCalls, 0);
      assert.equal(claimCalls, 0);
      assert.equal(deliveredCalls, 0);
      assert.equal(handlerCalls, 0);
    } finally {
      await app.close();
    }
  });

test('malformed threshold-pending candidates never authenticate or release the resource', async () => {
  const variants = [
    {
      label: 'missing immutable then shield',
      transform(value) {
        const copy = { ...value };
        return copy;
      },
    },
    {
      label: 'invalid then descriptor',
      transform(value) {
        const copy = { ...value };
        Object.defineProperty(copy, 'then', {
          value: null,
          enumerable: false,
          writable: false,
          configurable: false,
        });
        return copy;
      },
    },
    {
      label: 'additional field',
      transform: value => issue85CopyShieldedResult(value, { unexpected: true }),
    },
    {
      label: 'missing error reason',
      transform(value) {
        const copy = issue85CopyShieldedResult(value);
        delete copy.errorReason;
        return copy;
      },
    },
    {
      label: 'wrong error reason',
      transform: value => issue85CopyShieldedResult(value, { errorReason: 'payment_outcome_unknown' }),
    },
    {
      label: 'wrong state',
      transform: value => issue85CopyShieldedResult(value, { state: 'SUBMISSION_OUTCOME_UNKNOWN' }),
    },
    {
      label: 'wrong retry policy',
      transform: value => issue85CopyShieldedResult(value, { retrySamePayment: false }),
    },
    {
      label: 'wrong delivery state',
      transform: value => issue85CopyShieldedResult(value, { deliveryState: 'DELIVERY_PENDING' }),
    },
    {
      label: 'wrong success value',
      transform: value => issue85CopyShieldedResult(value, { success: true }),
    },
    {
      label: 'network mismatch',
      transform: value => issue85CopyShieldedResult(value, { network: 'zenon:other' }),
    },
    {
      label: 'transaction mismatch',
      transform: value => issue85CopyShieldedResult(value, {
        transaction: sha256Hex('issue-85 other transaction'),
      }),
    },
    {
      label: 'payer mismatch',
      transform: value => issue85CopyShieldedResult(value, {
        payer: sdk.Address.fromPublicKey(Uint8Array.from({ length: 32 }, (_, index) => index + 21))
          .toString(),
      }),
    },
    {
      label: 'authorization mismatch',
      transform: value => issue85CopyShieldedResult(value, {
        authorizationKey: sha256Hex('issue-85 other authorization'),
      }),
    },
    {
      label: 'accessor-backed identity',
      transform(value, observations) {
        const copy = issue85CopyShieldedResult(value);
        delete copy.authorizationKey;
        Object.defineProperty(copy, 'authorizationKey', {
          enumerable: true,
          configurable: true,
          get() {
            observations.accessorReads += 1;
            return issue85AuthorizationKey(observations.paymentPayload, observations.paymentRequired);
          },
        });
        return copy;
      },
    },
    {
      label: 'proxy-backed candidate',
      transform(value, observations) {
        return new Proxy(value, {
          ownKeys(target) {
            observations.proxyReads += 1;
            throw new Error('private synthetic proxy failure');
          },
        });
      },
    },
  ];

  for (const variant of variants) {
    const requirement = issue85LiveRequirement(2);
    const observations = {
      accessorReads: 0,
      proxyReads: 0,
      claimCalls: 0,
      deliveredCalls: 0,
      handlerCalls: 0,
    };
    const facilitator = {
      async settle(paymentPayload, _accepted, paymentRequired) {
        observations.paymentPayload = paymentPayload;
        observations.paymentRequired = paymentRequired;
        return variant.transform(
          issue85ShieldedThresholdResult(paymentPayload, paymentRequired),
          observations,
        );
      },
      async markDeliveryPending() {
        observations.claimCalls += 1;
        throw new Error('malformed threshold evidence must not claim delivery');
      },
      async markDelivered() {
        observations.deliveredCalls += 1;
        throw new Error('malformed threshold evidence must not cache delivery');
      },
    };
    const app = createResourceServer({
      facilitator,
      requirement,
      resourceHandler: async () => {
        observations.handlerCalls += 1;
        return { ok: true };
      },
    });
    const listening = await app.listen();
    try {
      const { paymentPayload } = await issue85ChallengeAndPayment(listening.url, variant.label);
      const response = await submitPayment(listening.url, paymentPayload);
      const settlementHeader = response.headers.get(HEADERS.PAYMENT_RESPONSE);
      const settlement = settlementHeader === null ? null : decodeB64Json(settlementHeader);
      assert.notEqual(response.status, 200, `${variant.label} must not authorize delivery`);
      assert.equal(
        settlement?.errorReason === 'payment_reconciliation_required' &&
          settlement?.state === 'MOMENTUM_INCLUDED',
        false,
        `${variant.label} must not authenticate as threshold-pending evidence`,
      );
      assert.equal(observations.accessorReads, 0, `${variant.label} accessor must not execute`);
      assert.equal(observations.claimCalls, 0, `${variant.label} must not acquire a claim`);
      assert.equal(observations.deliveredCalls, 0, `${variant.label} must not persist a response`);
      assert.equal(observations.handlerCalls, 0, `${variant.label} must not invoke the handler`);
      assert.equal((await response.text()).includes('private synthetic proxy failure'), false);
    } finally {
      await app.close();
    }
  }
});

test('exact-threshold concurrent HTTP requests acquire one claim, handler, and cached response', async () => {
  const requirement = issue85LiveRequirement(2);
  let settlementCalls = 0;
  let claimCalls = 0;
  let deliveredCalls = 0;
  let handlerCalls = 0;
  let deliveryState = 'NONE';
  let cachedResponse = null;
  let releaseDelivery;
  let deliveryStarted;
  const started = new Promise(resolve => { deliveryStarted = resolve; });
  const deliveryGate = new Promise(resolve => { releaseDelivery = resolve; });
  const facilitator = {
    async settle(paymentPayload, accepted, paymentRequired) {
      settlementCalls += 1;
      assert.equal(accepted.extra.minimumMomentumConfirmations, 2);
      const settlement = {
        success: true,
        network: accepted.network,
        transaction: paymentPayload.payload.transaction.hash,
        payer: paymentPayload.payload.transaction.address,
        state: 'MOMENTUM_INCLUDED',
        authorizationKey: issue85AuthorizationKey(paymentPayload, paymentRequired),
        deliveryState,
        ...(deliveryState === 'DELIVERED' ? { cachedResponse } : {}),
      };
      return issue85CopyShieldedResult(settlement);
    },
    async markDeliveryPending(settlement, acceptedRequirement) {
      claimCalls += 1;
      assert.deepEqual(acceptedRequirement, requirement);
      assert.equal(deliveryState, 'NONE');
      deliveryState = 'DELIVERY_PENDING';
      return issue85CopyShieldedResult({
        authorizationKey: settlement.authorizationKey,
        payer: settlement.payer,
        transaction: settlement.transaction,
        deliveryState,
        deliveryClaimed: true,
      });
    },
    async markDelivered(settlement, cached) {
      deliveredCalls += 1;
      assert.equal(deliveryState, 'DELIVERY_PENDING');
      deliveryState = 'DELIVERED';
      cachedResponse = structuredClone(cached);
      return issue85CopyShieldedResult({
        authorizationKey: settlement.authorizationKey,
        payer: settlement.payer,
        transaction: settlement.transaction,
        deliveryState,
        cachedResponse,
      });
    },
  };
  const app = createResourceServer({
    facilitator,
    requirement,
    resourceHandler: async () => {
      handlerCalls += 1;
      deliveryStarted();
      await deliveryGate;
      return {
        ok: true,
        entitlement: 'synthetic-threshold-result',
        handlerInvocation: handlerCalls,
      };
    },
  });
  const listening = await app.listen();
  let observeSecondPaidRequest;
  const secondPaidRequestEntered = new Promise(resolve => {
    observeSecondPaidRequest = resolve;
  });
  let enteredPaidRequests = 0;
  const observePaidRequest = request => {
    if (request.url === '/paid' && request.headers[HEADERS.PAYMENT_SIGNATURE] !== undefined &&
        ++enteredPaidRequests === 2) {
      observeSecondPaidRequest();
    }
  };
  app.server.on('request', observePaidRequest);
  try {
    const { paymentPayload } = await issue85ChallengeAndPayment(listening.url, 'exact threshold');
    const encodedPayment = encodeB64Json(paymentPayload);
    const request = () => fetch(`${listening.url}/paid`, {
      headers: { [HEADERS.PAYMENT_SIGNATURE]: encodedPayment },
    });
    const firstPending = request();
    await started;
    const secondPending = request();
    await secondPaidRequestEntered;
    await new Promise(resolve => setImmediate(resolve));
    releaseDelivery();
    const [first, second] = await Promise.all([firstPending, secondPending]);
    const firstBody = await first.text();
    const secondBody = await second.text();
    const replay = await request();
    const replayBody = await replay.text();
    assert.deepEqual([first.status, second.status, replay.status], [200, 200, 200]);
    assert.equal(secondBody, firstBody);
    assert.equal(replayBody, firstBody);
    assert.equal(settlementCalls, 2);
    assert.equal(claimCalls, 1);
    assert.equal(handlerCalls, 1);
    assert.equal(deliveredCalls, 1);
    assert.equal(deliveryState, 'DELIVERED');
  } finally {
    releaseDelivery?.();
    app.server.off('request', observePaidRequest);
    await app.close();
  }
});

test('paidFetch threshold reconciliation reuses one byte-identical payment without replacement', async () => {
  const requirement = issue85LiveRequirement(2);
  const paymentRequired = {
    x402Version: 2,
    resource: {
      url: 'https://issue-85-resource.invalid/paid',
      description: 'synthetic threshold resource',
      mimeType: 'application/json',
    },
    accepts: [requirement],
  };
  const retainedPayment = issue85PaymentPayload(paymentRequired, 'buyer reconciliation');
  const capabilities = createPaymentCapabilities([{
    scheme: 'exact',
    network: 'zenon:testnet',
    paymentFlows: ['upfront'],
  }]);
  let constructions = 0;
  const client = {
    async createPaymentPayload() {
      constructions += 1;
      return retainedPayment;
    },
  };
  Object.defineProperty(client, 'paymentCapabilities', {
    value: capabilities,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  const submittedHeaders = [];
  let requests = 0;
  const fetchImpl = async (_url, options) => {
    requests += 1;
    if (!options) return challengeResponse(paymentRequired);
    const encodedPayment = options.headers[HEADERS.PAYMENT_SIGNATURE];
    submittedHeaders.push(encodedPayment);
    const submitted = decodeB64Json(encodedPayment);
    const pending = submittedHeaders.length < 3;
    return {
      status: pending ? 409 : 200,
      headers: new Headers({
        [HEADERS.PAYMENT_RESPONSE]: encodeB64Json({
          success: !pending,
          network: submitted.accepted.network,
          transaction: submitted.payload.transaction.hash,
          payer: submitted.payload.transaction.address,
          state: 'MOMENTUM_INCLUDED',
          ...(pending ? {
            errorReason: 'payment_reconciliation_required',
            retrySamePayment: true,
          } : {}),
        }),
      }),
    };
  };

  const first = await paidFetch(paymentRequired.resource.url, client, fetchImpl);
  assert.equal(first.response.status, 409);
  assert.equal(first.settlement.errorReason, 'payment_reconciliation_required');
  const second = await reconcilePayment(first, fetchImpl);
  assert.equal(second.response.status, 409);
  assert.equal(second.settlement.errorReason, 'payment_reconciliation_required');
  const delivered = await reconcilePayment(second, fetchImpl);
  assert.equal(delivered.response.status, 200);
  assert.equal(delivered.settlement.success, true);
  assert.equal(constructions, 1);
  assert.equal(requests, 4);
  assert.equal(submittedHeaders.length, 3);
  assert.ok(submittedHeaders.every(value => value === submittedHeaders[0]));
  assert.equal(submittedHeaders[0], encodeB64Json(retainedPayment));
});
