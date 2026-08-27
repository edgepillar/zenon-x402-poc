import test from 'node:test';
import assert from 'node:assert/strict';

import {
  x402HTTPResourceServer,
  x402ResourceServer,
} from '@x402/core/server';
import {
  decodePaymentRequiredHeader as officialDecodePaymentRequired,
  decodePaymentResponseHeader as officialDecodePaymentResponse,
  decodePaymentSignatureHeader as officialDecodePaymentSignature,
  encodePaymentSignatureHeader as officialEncodePaymentSignature,
} from '@x402/core/http';
import {
  PaymentRequiredV2Schema as OfficialPaymentRequiredV2Schema,
} from '@x402/core/schemas';

import { buildRequirement } from '../src/config.js';
import {
  MockExactZenonClient,
  MockExactZenonFacilitator,
} from '../src/mock-payment.js';
import {
  makePaymentRequired,
  sameRequirements,
  sameResource,
  validateActiveUpfrontRequirement as validateZenonActiveUpfrontRequirement,
  validatePaymentPayloadEnvelope as validateZenonPaymentPayloadEnvelope,
  validatePaymentRequired as validateZenonPaymentRequired,
  validateRequirement as validateZenonRequirement,
} from '../src/x402-wire.js';

const SYNTHETIC_BASE_URL = 'https://resource-server.invalid';
const SYNTHETIC_RESOURCE_URL = `${SYNTHETIC_BASE_URL}/paid`;
const SYNTHETIC_ICON_URL = `${SYNTHETIC_BASE_URL}/icon.png`;

class CountingMockFacilitator extends MockExactZenonFacilitator {
  verifyCalls = 0;
  settleCalls = 0;

  async verify(...args) {
    this.verifyCalls += 1;
    const result = await super.verify(...args);
    this.lastVerifyResult = result;
    return result;
  }

  async settle(...args) {
    this.settleCalls += 1;
    const result = await super.settle(...args);
    this.lastSettleResult = result;
    return result;
  }
}

class InMemoryHTTPAdapter {
  constructor({ paymentSignature, path = '/paid', url = SYNTHETIC_RESOURCE_URL } = {}) {
    this.path = path;
    this.url = url;
    this.headers = new Map();
    if (paymentSignature !== undefined) {
      this.headers.set('payment-signature', paymentSignature);
    }
  }

  getHeader(name) {
    return this.headers.get(name.toLowerCase());
  }

  getMethod() {
    return 'GET';
  }

  getPath() {
    return this.path;
  }

  getUrl() {
    return this.url;
  }

  getAcceptHeader() {
    return 'application/json';
  }

  getUserAgent() {
    return 'synthetic-x402-resource-server-test';
  }
}

function requestContext(options) {
  const adapter = new InMemoryHTTPAdapter(options);
  return {
    adapter,
    method: adapter.getMethod(),
    path: adapter.getPath(),
    ...(options?.paymentSignature === undefined
      ? {}
      : { paymentHeader: options.paymentSignature }),
  };
}

function headerValue(headers, name) {
  const entry = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

function routeConfig(requirement, { extensions } = {}) {
  const route = {
    accepts: {
      scheme: requirement.scheme,
      network: requirement.network,
      payTo: requirement.payTo,
      price: {
        amount: requirement.amount,
        asset: requirement.asset,
      },
      maxTimeoutSeconds: requirement.maxTimeoutSeconds,
      extra: structuredClone(requirement.extra),
    },
    resource: SYNTHETIC_RESOURCE_URL,
    description: 'Synthetic official resource-server interoperability resource',
    mimeType: 'application/json',
    serviceName: 'synthetic-resource-server',
    tags: ['alpha', 'beta', 'alpha'],
    iconUrl: SYNTHETIC_ICON_URL,
  };
  if (extensions !== undefined) route.extensions = extensions;
  return { 'GET /paid': route };
}

function directChallenge(requirement, suffix) {
  return makePaymentRequired({
    resourceUrl: `${SYNTHETIC_BASE_URL}/${suffix}`,
    description: `Synthetic ${suffix} resource`,
    mimeType: 'application/json',
    serviceName: 'synthetic-resource-server',
    tags: ['alpha', 'beta', 'alpha'],
    iconUrl: SYNTHETIC_ICON_URL,
    requirement: structuredClone(requirement),
  });
}

function isEmptyExtensionContainer(value) {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Reflect.ownKeys(value).length === 0;
}

function createOfficialServerBridge({ requirement, localFacilitator }) {
  const pending = new WeakMap();
  const consumed = new WeakSet();
  let captureCount = 0;
  let verifyCalls = 0;
  let settleCalls = 0;

  function validateSelectedRequirement(selectedRequirement) {
    validateZenonRequirement(selectedRequirement);
    validateZenonActiveUpfrontRequirement(selectedRequirement);
    if (
      selectedRequirement.scheme !== 'exact' ||
      selectedRequirement.network !== requirement.network ||
      selectedRequirement.asset !== requirement.asset ||
      selectedRequirement.amount !== requirement.amount ||
      selectedRequirement.payTo !== requirement.payTo ||
      !sameRequirements(selectedRequirement, requirement)
    ) {
      throw new Error('unsupported synthetic Zenon requirement');
    }
  }

  function validateCompleteChallenge(paymentRequired) {
    OfficialPaymentRequiredV2Schema.parse(paymentRequired);
    if (
      Object.hasOwn(paymentRequired, 'extensions') &&
      !isEmptyExtensionContainer(paymentRequired.extensions)
    ) {
      throw new Error('non-empty extensions are unsupported');
    }
  }

  function captureChallenge(paymentRequiredResponse, requirements) {
    validateCompleteChallenge(paymentRequiredResponse);
    if (
      requirements.length !== paymentRequiredResponse.accepts.length ||
      !requirements.every(
        (selectedRequirement, index) =>
          selectedRequirement === paymentRequiredResponse.accepts[index],
      )
    ) {
      throw new Error('official requirement identity continuity changed');
    }

    const snapshot = structuredClone(paymentRequiredResponse);
    validateCompleteChallenge(snapshot);
    if (!sameResource(paymentRequiredResponse.resource, snapshot.resource)) {
      throw new Error('resource snapshot mismatch');
    }

    requirements.forEach((selectedRequirement, selectedIndex) => {
      validateSelectedRequirement(selectedRequirement);
      // Exact accepts-object identity continuity is characterized only for the
      // pinned @x402/core@2.23.0 runtime, not as a general public guarantee.
      const identityMatches = paymentRequiredResponse.accepts.filter(
        candidate => candidate === selectedRequirement,
      );
      if (identityMatches.length !== 1) {
        throw new Error('selected requirement identity is ambiguous');
      }
      if (
        pending.has(selectedRequirement) ||
        consumed.has(selectedRequirement) ||
        !sameRequirements(selectedRequirement, snapshot.accepts[selectedIndex])
      ) {
        throw new Error('selected requirement context cannot be rebound');
      }
      pending.set(selectedRequirement, {
        selectedIndex,
        snapshot,
        state: 'captured',
      });
      captureCount += 1;
    });
  }

  function requireContext(paymentPayload, selectedRequirement) {
    if (consumed.has(selectedRequirement)) {
      throw new Error('selected requirement context was already consumed');
    }
    const entry = pending.get(selectedRequirement);
    if (!entry) throw new Error('missing selected requirement context');

    validateSelectedRequirement(selectedRequirement);
    validateCompleteChallenge(entry.snapshot);
    validateZenonPaymentPayloadEnvelope(paymentPayload);
    const detachedSelected = entry.snapshot.accepts[entry.selectedIndex];
    if (
      !sameRequirements(selectedRequirement, detachedSelected) ||
      !sameRequirements(paymentPayload.accepted, selectedRequirement) ||
      !sameResource(paymentPayload.resource, entry.snapshot.resource)
    ) {
      throw new Error('payment context does not match the detached challenge');
    }
    if (
      Object.hasOwn(paymentPayload, 'extensions') &&
      !isEmptyExtensionContainer(paymentPayload.extensions)
    ) {
      throw new Error('non-empty payment extensions are unsupported');
    }
    return entry;
  }

  const schemeServer = {
    scheme: 'exact',
    defaultAssetTransferMethod: 'default',
    paymentFlows: {
      default: {
        supported: ['upfront'],
        default: 'upfront',
      },
    },
    async parsePrice(price, network) {
      if (
        network !== requirement.network ||
        price === null ||
        typeof price !== 'object' ||
        Array.isArray(price) ||
        price.amount !== requirement.amount ||
        price.asset !== requirement.asset
      ) {
        throw new Error('unsupported synthetic price');
      }
      return {
        amount: price.amount,
        asset: price.asset,
      };
    },
    async enhancePaymentRequirements(
      paymentRequirements,
      supportedKind,
      facilitatorExtensions,
    ) {
      if (
        supportedKind.x402Version !== 2 ||
        supportedKind.scheme !== 'exact' ||
        supportedKind.network !== requirement.network ||
        facilitatorExtensions.length !== 0
      ) {
        throw new Error('unsupported facilitator capability');
      }
      validateSelectedRequirement(paymentRequirements);
      return structuredClone(paymentRequirements);
    },
    async enrichPaymentRequiredResponse({
      paymentRequiredResponse,
      requirements,
    }) {
      captureChallenge(paymentRequiredResponse, requirements);
    },
  };

  const facilitatorClient = {
    async getSupported() {
      return {
        kinds: [
          {
            x402Version: 2,
            scheme: 'exact',
            network: requirement.network,
          },
        ],
        extensions: [],
        signers: {},
      };
    },
    async verify(paymentPayload, selectedRequirement) {
      verifyCalls += 1;
      const entry = requireContext(paymentPayload, selectedRequirement);
      if (entry.state !== 'captured') {
        throw new Error('selected requirement was not captured exactly once');
      }
      entry.state = 'verifying';
      try {
        const result = await localFacilitator.verify(
          structuredClone(paymentPayload),
          structuredClone(selectedRequirement),
          structuredClone(entry.snapshot),
        );
        if (!result?.isValid) {
          consumed.add(selectedRequirement);
          pending.delete(selectedRequirement);
          return result;
        }
        entry.state = 'verified';
        return result;
      } catch (error) {
        consumed.add(selectedRequirement);
        pending.delete(selectedRequirement);
        throw error;
      }
    },
    async settle(paymentPayload, selectedRequirement) {
      settleCalls += 1;
      const entry = requireContext(paymentPayload, selectedRequirement);
      if (entry.state !== 'captured' && entry.state !== 'verified') {
        throw new Error('selected requirement context is not settleable');
      }

      const detachedPayload = structuredClone(paymentPayload);
      const detachedRequirement = structuredClone(selectedRequirement);
      const detachedChallenge = structuredClone(entry.snapshot);
      entry.state = 'consumed';
      consumed.add(selectedRequirement);
      pending.delete(selectedRequirement);
      try {
        const result = await localFacilitator.settle(
          detachedPayload,
          detachedRequirement,
          detachedChallenge,
        );
        if (!result.success) {
          const errorReason = result.errorReason ?? 'settlement_failed';
          return {
            success: false,
            transaction: result.transaction ?? '',
            network: result.network ?? detachedRequirement.network,
            errorReason,
            errorMessage: errorReason,
          };
        }
        return {
          success: true,
          payer: result.payer,
          transaction: result.transaction,
          network: result.network,
        };
      } finally {
        pending.delete(selectedRequirement);
      }
    },
  };

  return {
    facilitatorClient,
    schemeServer,
    get captureCount() {
      return captureCount;
    },
    get verifyCalls() {
      return verifyCalls;
    },
    get settleCalls() {
      return settleCalls;
    },
    hasPending(selectedRequirement) {
      return pending.has(selectedRequirement);
    },
  };
}

async function createOfficialHarness(requirement, options) {
  const localFacilitator = new CountingMockFacilitator();
  const bridge = createOfficialServerBridge({ requirement, localFacilitator });
  const resourceServer = new x402ResourceServer(bridge.facilitatorClient);
  resourceServer.register(requirement.network, bridge.schemeServer);
  const httpServer = new x402HTTPResourceServer(
    resourceServer,
    routeConfig(requirement, options),
  );
  await httpServer.initialize();
  return {
    bridge,
    httpServer,
    localFacilitator,
    resourceServer,
  };
}

async function getUnpaidChallenge(harness) {
  const result = await harness.httpServer.processHTTPRequest(requestContext());
  assert.equal(result.type, 'payment-error');
  assert.equal(result.response.status, 402);
  const paymentRequiredHeader = headerValue(
    result.response.headers,
    'PAYMENT-REQUIRED',
  );
  assert.ok(paymentRequiredHeader);
  return {
    challenge: officialDecodePaymentRequired(paymentRequiredHeader),
    result,
  };
}

async function captureDirectChallenge(bridge, challenge) {
  await bridge.schemeServer.enrichPaymentRequiredResponse({
    requirements: challenge.accepts,
    resourceInfo: challenge.resource,
    paymentRequiredResponse: challenge,
  });
}

test('official resource-server registration builds a bounded upfront Zenon challenge', async () => {
  const requirement = await buildRequirement('mock');
  const incompleteBridge = createOfficialServerBridge({
    requirement,
    localFacilitator: new CountingMockFacilitator(),
  });
  const incompleteServer = new x402ResourceServer(
    incompleteBridge.facilitatorClient,
  );
  const incompleteHTTPServer = new x402HTTPResourceServer(
    incompleteServer,
    routeConfig(requirement),
  );
  await assert.rejects(() => incompleteHTTPServer.initialize());

  const absentHarness = await createOfficialHarness(requirement);
  assert.equal(
    absentHarness.resourceServer.hasRegisteredScheme(
      requirement.network,
      requirement.scheme,
    ),
    true,
  );
  const { challenge: absentChallenge } = await getUnpaidChallenge(absentHarness);
  OfficialPaymentRequiredV2Schema.parse(absentChallenge);
  validateZenonPaymentRequired(absentChallenge);
  assert.equal(absentChallenge.error, 'Payment required');
  assert.deepEqual(absentChallenge.resource, {
    url: SYNTHETIC_RESOURCE_URL,
    description: 'Synthetic official resource-server interoperability resource',
    mimeType: 'application/json',
    serviceName: 'synthetic-resource-server',
    tags: ['alpha', 'beta', 'alpha'],
    iconUrl: SYNTHETIC_ICON_URL,
  });
  assert.equal(absentChallenge.accepts.length, 1);
  assert.equal(sameRequirements(absentChallenge.accepts[0], requirement), true);
  assert.equal(absentChallenge.accepts[0].scheme, 'exact');
  assert.equal(absentChallenge.accepts[0].network, requirement.network);
  assert.equal(absentChallenge.accepts[0].extra.paymentFlow, 'upfront');
  assert.equal(Object.hasOwn(absentChallenge, 'extensions'), false);

  const emptyHarness = await createOfficialHarness(requirement, { extensions: {} });
  const { challenge: emptyChallenge } = await getUnpaidChallenge(emptyHarness);
  OfficialPaymentRequiredV2Schema.parse(emptyChallenge);
  validateZenonPaymentRequired(emptyChallenge);
  assert.equal(Object.hasOwn(emptyChallenge, 'extensions'), false);
  assert.equal(absentHarness.bridge.verifyCalls, 0);
  assert.equal(absentHarness.bridge.settleCalls, 0);
  assert.equal(emptyHarness.bridge.verifyCalls, 0);
  assert.equal(emptyHarness.bridge.settleCalls, 0);
  assert.equal(absentHarness.localFacilitator.records.size, 0);
  assert.equal(emptyHarness.localFacilitator.records.size, 0);
});

test('official upfront processing settles before protected handler execution', async () => {
  const requirement = await buildRequirement('mock');
  const harness = await createOfficialHarness(requirement);
  const { challenge } = await getUnpaidChallenge(harness);
  const paymentClient = new MockExactZenonClient();
  const paymentPayload = await paymentClient.createPaymentPayload(
    challenge,
    challenge.accepts[0],
  );
  const paymentSignature = officialEncodePaymentSignature(paymentPayload);
  const decodedPaymentPayload = officialDecodePaymentSignature(paymentSignature);
  const matchingRequirement = harness.resourceServer.findMatchingRequirements(
    challenge.accepts,
    decodedPaymentPayload,
  );
  assert.equal(matchingRequirement, challenge.accepts[0]);
  assert.equal(
    harness.resourceServer.validateExtensions(
      challenge,
      decodedPaymentPayload,
    ).valid,
    true,
  );
  assert.equal(
    harness.resourceServer.hasRegisteredScheme(
      matchingRequirement.network,
      matchingRequirement.scheme,
    ),
    true,
  );
  assert.equal(
    harness.resourceServer.getPaymentFlow(
      decodedPaymentPayload,
      matchingRequirement,
    ),
    'upfront',
  );

  let handlerCalls = 0;
  const paidResult = await harness.httpServer.processHTTPRequest(
    requestContext({ paymentSignature }),
  );
  assert.equal(harness.bridge.captureCount, 2);
  assert.equal(harness.bridge.verifyCalls, 0);
  assert.equal(harness.bridge.settleCalls, 1);
  assert.equal(harness.localFacilitator.lastVerifyResult.isValid, true);
  assert.equal(harness.localFacilitator.settleCalls, 1);
  assert.equal(harness.localFacilitator.verifyCalls, 1);
  assert.equal(harness.localFacilitator.lastSettleResult.success, true);
  assert.equal(paidResult.type, 'payment-verified');
  assert.ok(paidResult.beforeHandlerSettlement);
  assert.equal(paidResult.beforeHandlerSettlement.result.success, true);
  assert.equal(harness.localFacilitator.records.size, 1);
  assert.equal(handlerCalls, 0);

  handlerCalls += 1;
  const settleResult = await harness.httpServer.processSettlement(
    paidResult.paymentPayload,
    paidResult.paymentRequirements,
    paidResult.declaredExtensions,
    undefined,
    undefined,
    paidResult.beforeHandlerSettlement,
  );
  assert.equal(settleResult.success, true);
  assert.equal(handlerCalls, 1);
  assert.equal(harness.bridge.settleCalls, 1);
  assert.equal(harness.localFacilitator.settleCalls, 1);
  const paymentResponseHeader = headerValue(
    settleResult.headers,
    'PAYMENT-RESPONSE',
  );
  assert.ok(paymentResponseHeader);
  const decodedSettlement = officialDecodePaymentResponse(paymentResponseHeader);
  assert.equal(decodedSettlement.success, true);
  assert.equal(decodedSettlement.network, requirement.network);
  assert.equal(typeof decodedSettlement.transaction, 'string');
  assert.notEqual(decodedSettlement.transaction, '');
  const [record] = harness.localFacilitator.records.values();
  assert.equal(record.deliveryState, 'NONE');
  assert.equal(record.cachedResponse, null);
});

test('official server challenge contexts are detached, one-shot, and request-isolated', async () => {
  const requirement = await buildRequirement('mock');
  const registeredHarness = await createOfficialHarness(requirement);
  assert.equal(
    registeredHarness.resourceServer.hasRegisteredScheme(
      requirement.network,
      requirement.scheme,
    ),
    true,
  );
  const paymentClient = new MockExactZenonClient();
  let handlerEffects = 0;

  const missingChallenge = directChallenge(requirement, 'missing');
  const missingPayload = await paymentClient.createPaymentPayload(
    missingChallenge,
    missingChallenge.accepts[0],
  );
  const missingLocal = new CountingMockFacilitator();
  const missingBridge = createOfficialServerBridge({
    requirement,
    localFacilitator: missingLocal,
  });
  await assert.rejects(() =>
    missingBridge.facilitatorClient.verify(
      missingPayload,
      missingChallenge.accepts[0],
    ),
  );
  assert.equal(missingLocal.verifyCalls, 0);
  assert.equal(missingLocal.records.size, 0);

  const mutatedChallenge = directChallenge(requirement, 'mutated');
  const mutatedPayload = await paymentClient.createPaymentPayload(
    mutatedChallenge,
    mutatedChallenge.accepts[0],
  );
  const mutatedLocal = new CountingMockFacilitator();
  const mutatedBridge = createOfficialServerBridge({
    requirement,
    localFacilitator: mutatedLocal,
  });
  await captureDirectChallenge(mutatedBridge, mutatedChallenge);
  mutatedChallenge.accepts[0].amount = '101';
  await assert.rejects(() =>
    mutatedBridge.facilitatorClient.verify(
      mutatedPayload,
      mutatedChallenge.accepts[0],
    ),
  );
  assert.equal(mutatedLocal.verifyCalls, 0);
  assert.equal(mutatedLocal.records.size, 0);

  const crossChallenge = directChallenge(requirement, 'cross-bound');
  const crossPayload = await paymentClient.createPaymentPayload(
    crossChallenge,
    crossChallenge.accepts[0],
  );
  const sourceBridge = createOfficialServerBridge({
    requirement,
    localFacilitator: new CountingMockFacilitator(),
  });
  await captureDirectChallenge(sourceBridge, crossChallenge);
  const crossLocal = new CountingMockFacilitator();
  const crossBridge = createOfficialServerBridge({
    requirement,
    localFacilitator: crossLocal,
  });
  await assert.rejects(() =>
    crossBridge.facilitatorClient.verify(
      crossPayload,
      crossChallenge.accepts[0],
    ),
  );
  assert.equal(crossLocal.verifyCalls, 0);
  assert.equal(crossLocal.records.size, 0);

  const failedChallenge = directChallenge(requirement, 'failed-settlement');
  const failedPayload = await paymentClient.createPaymentPayload(
    failedChallenge,
    failedChallenge.accepts[0],
  );
  const failedLocal = new CountingMockFacilitator();
  const failedBridge = createOfficialServerBridge({
    requirement,
    localFacilitator: failedLocal,
  });
  await captureDirectChallenge(failedBridge, failedChallenge);
  const invalidSignaturePayload = structuredClone(failedPayload);
  const signature = invalidSignaturePayload.payload.transaction.signature;
  invalidSignaturePayload.payload.transaction.signature =
    `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  const failedSettlement = await failedBridge.facilitatorClient.settle(
    invalidSignaturePayload,
    failedChallenge.accepts[0],
  );
  assert.equal(failedSettlement.success, false);
  assert.equal(failedSettlement.transaction, '');
  assert.equal(failedSettlement.network, failedChallenge.accepts[0].network);
  assert.equal(typeof failedSettlement.errorReason, 'string');
  assert.equal(failedSettlement.errorMessage, failedSettlement.errorReason);
  assert.equal(
    sameRequirements(invalidSignaturePayload.accepted, failedChallenge.accepts[0]),
    true,
  );
  assert.equal(
    sameResource(invalidSignaturePayload.resource, failedChallenge.resource),
    true,
  );
  assert.equal(failedBridge.verifyCalls, 0);
  assert.equal(failedBridge.settleCalls, 1);
  assert.equal(failedLocal.verifyCalls, 1);
  assert.equal(failedLocal.settleCalls, 1);
  assert.equal(failedLocal.records.size, 0);
  assert.equal(failedBridge.hasPending(failedChallenge.accepts[0]), false);

  const reuseChallenge = directChallenge(requirement, 'reuse');
  const reusePayload = await paymentClient.createPaymentPayload(
    reuseChallenge,
    reuseChallenge.accepts[0],
  );
  const reuseLocal = new CountingMockFacilitator();
  const reuseBridge = createOfficialServerBridge({
    requirement,
    localFacilitator: reuseLocal,
  });
  await captureDirectChallenge(reuseBridge, reuseChallenge);
  const reuseVerification = await reuseBridge.facilitatorClient.verify(
    reusePayload,
    reuseChallenge.accepts[0],
  );
  assert.equal(reuseVerification.isValid, true);
  const reuseSettlement = await reuseBridge.facilitatorClient.settle(
    reusePayload,
    reuseChallenge.accepts[0],
  );
  assert.equal(reuseSettlement.success, true);
  await assert.rejects(() =>
    reuseBridge.facilitatorClient.settle(
      reusePayload,
      reuseChallenge.accepts[0],
    ),
  );
  assert.equal(reuseBridge.hasPending(reuseChallenge.accepts[0]), false);
  assert.equal(reuseLocal.records.size, 1);

  const concurrentLocal = new CountingMockFacilitator();
  const concurrentBridge = createOfficialServerBridge({
    requirement,
    localFacilitator: concurrentLocal,
  });
  const firstChallenge = directChallenge(requirement, 'concurrent-a');
  const secondChallenge = directChallenge(requirement, 'concurrent-b');
  await Promise.all([
    captureDirectChallenge(concurrentBridge, firstChallenge),
    captureDirectChallenge(concurrentBridge, secondChallenge),
  ]);
  const [firstPayload, secondPayload] = await Promise.all([
    paymentClient.createPaymentPayload(firstChallenge, firstChallenge.accepts[0]),
    paymentClient.createPaymentPayload(secondChallenge, secondChallenge.accepts[0]),
  ]);
  await assert.rejects(() =>
    concurrentBridge.facilitatorClient.verify(
      secondPayload,
      firstChallenge.accepts[0],
    ),
  );
  const verifications = await Promise.all([
    concurrentBridge.facilitatorClient.verify(
      firstPayload,
      firstChallenge.accepts[0],
    ),
    concurrentBridge.facilitatorClient.verify(
      secondPayload,
      secondChallenge.accepts[0],
    ),
  ]);
  assert.deepEqual(verifications.map(result => result.isValid), [true, true]);
  const settlements = await Promise.all([
    concurrentBridge.facilitatorClient.settle(
      firstPayload,
      firstChallenge.accepts[0],
    ),
    concurrentBridge.facilitatorClient.settle(
      secondPayload,
      secondChallenge.accepts[0],
    ),
  ]);
  assert.deepEqual(settlements.map(result => result.success), [true, true]);
  assert.equal(concurrentLocal.records.size, 2);
  assert.equal(concurrentBridge.hasPending(firstChallenge.accepts[0]), false);
  assert.equal(concurrentBridge.hasPending(secondChallenge.accepts[0]), false);
  assert.equal(handlerEffects, 0);
});

test('official resource-server rejection remains isolated from local PoC failure lanes', async () => {
  const requirement = await buildRequirement('mock');
  const harness = await createOfficialHarness(requirement);
  const { challenge } = await getUnpaidChallenge(harness);
  const paymentClient = new MockExactZenonClient();
  const paymentPayload = await paymentClient.createPaymentPayload(
    challenge,
    challenge.accepts[0],
  );
  let handlerEffects = 0;

  const unsupportedPayment = structuredClone(paymentPayload);
  unsupportedPayment.accepted.amount = '101';
  const unsupportedResult = await harness.httpServer.processHTTPRequest(
    requestContext({
      paymentSignature: officialEncodePaymentSignature(unsupportedPayment),
    }),
  );
  assert.equal(unsupportedResult.type, 'payment-error');
  assert.equal(unsupportedResult.response.status, 402);
  assert.equal(harness.bridge.verifyCalls, 0);
  assert.equal(harness.bridge.settleCalls, 0);
  assert.equal(harness.localFacilitator.verifyCalls, 0);
  assert.equal(harness.localFacilitator.settleCalls, 0);
  assert.equal(harness.localFacilitator.records.size, 0);
  assert.equal(handlerEffects, 0);

  const nonEmptyExtensions = structuredClone(paymentPayload);
  nonEmptyExtensions.extensions = { synthetic: {} };
  const extensionResult = await harness.httpServer.processHTTPRequest(
    requestContext({
      paymentSignature: officialEncodePaymentSignature(nonEmptyExtensions),
    }),
  );
  assert.equal(extensionResult.type, 'payment-error');
  assert.equal(extensionResult.response.status, 402);
  assert.equal(harness.resourceServer.getExtensions().length, 0);
  assert.equal(harness.bridge.verifyCalls, 0);
  assert.equal(harness.bridge.settleCalls, 1);
  assert.equal(harness.localFacilitator.verifyCalls, 0);
  assert.equal(harness.localFacilitator.settleCalls, 0);
  assert.equal(harness.localFacilitator.records.size, 0);
  assert.equal(handlerEffects, 0);

  // Released official malformed-header behavior does not replace the local PoC's
  // strict HTTP 400 lane. HTTP 409 remains a PoC-specific recovery boundary.
  assert.notEqual(unsupportedResult.response.status, 409);
  assert.notEqual(extensionResult.response.status, 409);
});
