import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import {
  DEFAULT_MAX_AMOUNT_PER_PAYMENT,
  x402Client,
  x402HTTPClient,
} from '@x402/core/client';
import {
  x402HTTPResourceServer,
  x402ResourceServer,
} from '@x402/core/server';
import {
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

const SYNTHETIC_BASE_URL = 'https://composition.invalid';
const SYNTHETIC_RESOURCE_URL = `${SYNTHETIC_BASE_URL}/paid`;
const SYNTHETIC_ICON_URL = `${SYNTHETIC_BASE_URL}/icon.png`;

class CountingMockFacilitator extends MockExactZenonFacilitator {
  verifyCalls = 0;
  settleCalls = 0;

  async verify(...args) {
    this.verifyCalls += 1;
    return super.verify(...args);
  }

  async settle(...args) {
    this.settleCalls += 1;
    return super.settle(...args);
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
    return 'synthetic-x402-composition-test';
  }
}

function requestContext(options = {}) {
  const adapter = new InMemoryHTTPAdapter(options);
  return {
    adapter,
    method: adapter.getMethod(),
    path: adapter.getPath(),
    ...(options.paymentSignature === undefined
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

function isEmptyExtensionContainer(value) {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Reflect.ownKeys(value).length === 0;
}

function routeConfig(
  requirement,
  { extensions, resourceUrl = SYNTHETIC_RESOURCE_URL } = {},
) {
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
    resource: resourceUrl,
    description: 'Synthetic official composition resource',
    mimeType: 'application/json',
    serviceName: 'synthetic-composition',
    tags: ['alpha', 'beta', 'alpha'],
    iconUrl: SYNTHETIC_ICON_URL,
  };
  if (extensions !== undefined) route.extensions = extensions;
  return { 'GET /paid': route };
}

function spendControlsFor(requirement) {
  return {
    maxAmountPerPayment: DEFAULT_MAX_AMOUNT_PER_PAYMENT,
    allowedAssets: [
      {
        network: requirement.network,
        asset: requirement.asset,
        maxAmountPerPayment: requirement.amount,
      },
    ],
  };
}

function createDirectChallenge(requirement, resourceUrl) {
  return makePaymentRequired({
    resourceUrl,
    description: 'Synthetic direct composition resource',
    mimeType: 'application/json',
    serviceName: 'synthetic-composition',
    tags: ['alpha', 'beta', 'alpha'],
    iconUrl: SYNTHETIC_ICON_URL,
    requirement: structuredClone(requirement),
  });
}

function createClientBridge({ localClient, requirement }) {
  const pending = new WeakMap();
  const consumed = new WeakSet();
  let constructionCount = 0;
  let snapshotBindingCount = 0;

  function validateSelectedRequirement(x402Version, selectedRequirement) {
    if (x402Version !== 2) throw new Error('unsupported x402 version');
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
      throw new Error('unsupported synthetic payment requirement');
    }
  }

  function validateSelectedSnapshot(snapshot, selectedIndex) {
    const selectedOnlyChallenge = {
      ...snapshot,
      accepts: [snapshot.accepts[selectedIndex]],
    };
    validateZenonPaymentRequired(selectedOnlyChallenge);
    validateSelectedRequirement(
      selectedOnlyChallenge.x402Version,
      selectedOnlyChallenge.accepts[0],
    );
  }

  const adapter = {
    scheme: 'exact',
    findDefaultAsset(asset, network) {
      if (asset !== requirement.asset || network !== requirement.network) {
        return undefined;
      }
      return { asset, decimals: 8, symbol: 'MOCK' };
    },
    schemeHooks: {
      async onBeforePaymentCreation({ paymentRequired, selectedRequirements }) {
        OfficialPaymentRequiredV2Schema.parse(paymentRequired);
        validateSelectedRequirement(
          paymentRequired.x402Version,
          selectedRequirements,
        );
        if (
          Object.hasOwn(paymentRequired, 'extensions') &&
          !isEmptyExtensionContainer(paymentRequired.extensions)
        ) {
          throw new Error('non-empty extensions are unsupported');
        }

        // Exact selected-offer identity continuity is characterized only for
        // pinned @x402/core@2.23.0, not as a general public guarantee.
        const selectedIndexes = [];
        for (let index = 0; index < paymentRequired.accepts.length; index += 1) {
          if (paymentRequired.accepts[index] === selectedRequirements) {
            selectedIndexes.push(index);
          }
        }
        if (selectedIndexes.length !== 1) {
          throw new Error('selected payment requirement identity is ambiguous');
        }

        const selectedIndex = selectedIndexes[0];
        const snapshot = structuredClone(paymentRequired);
        OfficialPaymentRequiredV2Schema.parse(snapshot);
        validateSelectedSnapshot(snapshot, selectedIndex);
        if (!sameResource(paymentRequired.resource, snapshot.resource)) {
          throw new Error('resource snapshot mismatch');
        }
        if (
          paymentRequired.accepts.length !== snapshot.accepts.length ||
          !paymentRequired.accepts.every((accepted, index) =>
            isDeepStrictEqual(accepted, snapshot.accepts[index]),
          )
        ) {
          throw new Error('offer-order snapshot mismatch');
        }
        if (
          !sameRequirements(
            selectedRequirements,
            snapshot.accepts[selectedIndex],
          )
        ) {
          throw new Error('selected requirement snapshot mismatch');
        }
        if (
          pending.has(selectedRequirements) ||
          consumed.has(selectedRequirements)
        ) {
          throw new Error('payment requirement context cannot be rebound');
        }

        snapshotBindingCount += 1;
        pending.set(selectedRequirements, {
          hasExtensions: Object.hasOwn(paymentRequired, 'extensions'),
          selectedIndex,
          snapshot,
        });
      },
      async onPaymentCreationFailure({ selectedRequirements }) {
        pending.delete(selectedRequirements);
      },
    },
    async createPaymentPayload(
      x402Version,
      selectedRequirement,
      extensionContext,
    ) {
      const entry = pending.get(selectedRequirement);
      if (!entry || consumed.has(selectedRequirement)) {
        throw new Error('missing one-shot payment requirement context');
      }
      consumed.add(selectedRequirement);

      try {
        validateSelectedRequirement(x402Version, selectedRequirement);
        const detachedSelected = entry.snapshot.accepts[entry.selectedIndex];
        if (!sameRequirements(selectedRequirement, detachedSelected)) {
          throw new Error('selected requirement changed after binding');
        }

        const contextOwnsExtensions =
          extensionContext !== undefined &&
          Object.hasOwn(extensionContext, 'extensions');
        const contextExtensions = contextOwnsExtensions
          ? extensionContext.extensions
          : undefined;
        const contextHasExtensions =
          contextOwnsExtensions && contextExtensions !== undefined;
        if (entry.hasExtensions !== contextHasExtensions) {
          throw new Error('extension context does not match the challenge');
        }
        if (
          contextHasExtensions &&
          !isEmptyExtensionContainer(contextExtensions)
        ) {
          throw new Error('non-empty extension context is unsupported');
        }

        constructionCount += 1;
        const selectedOnlyChallenge = {
          ...entry.snapshot,
          accepts: [detachedSelected],
        };
        const localPayload = await localClient.createPaymentPayload(
          selectedOnlyChallenge,
          detachedSelected,
        );
        if (
          localPayload.x402Version !== 2 ||
          !sameRequirements(localPayload.accepted, detachedSelected) ||
          !sameResource(localPayload.resource, entry.snapshot.resource)
        ) {
          throw new Error('local payment payload binding mismatch');
        }

        return {
          x402Version: localPayload.x402Version,
          payload: localPayload.payload,
          ...(Object.hasOwn(localPayload, 'extensions')
            ? { extensions: localPayload.extensions }
            : {}),
        };
      } finally {
        pending.delete(selectedRequirement);
      }
    },
  };

  return {
    adapter,
    get constructionCount() {
      return constructionCount;
    },
    get snapshotBindingCount() {
      return snapshotBindingCount;
    },
    hasPending(selectedRequirement) {
      return pending.has(selectedRequirement);
    },
  };
}

function createOfficialClient(bridge, requirement) {
  return new x402Client()
    .setSpendControls(spendControlsFor(requirement))
    .register(requirement.network, bridge.adapter);
}

function createServerBridge({ requirement, localFacilitator }) {
  const pending = new WeakMap();
  const consumed = new WeakSet();
  let captureCount = 0;
  let verifyCalls = 0;
  let settleCalls = 0;
  let lastSettleResponse;

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
    validateZenonPaymentRequired(snapshot);
    if (!sameResource(paymentRequiredResponse.resource, snapshot.resource)) {
      throw new Error('resource snapshot mismatch');
    }

    requirements.forEach((selectedRequirement, selectedIndex) => {
      validateSelectedRequirement(selectedRequirement);
      // Exact accepts-object identity continuity is characterized only for
      // pinned @x402/core@2.23.0, not as a general public guarantee.
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
        price.amount !== requirement.amount ||
        price.asset !== requirement.asset
      ) {
        throw new Error('unsupported synthetic price');
      }
      validateSelectedRequirement({
        ...structuredClone(requirement),
        amount: price.amount,
        asset: price.asset,
      });
      return { amount: price.amount, asset: price.asset };
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
      try {
        const entry = requireContext(paymentPayload, selectedRequirement);
        if (entry.state !== 'captured') {
          throw new Error('selected requirement was not captured exactly once');
        }
        entry.state = 'verifying';
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
      try {
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
        const result = await localFacilitator.settle(
          detachedPayload,
          detachedRequirement,
          detachedChallenge,
        );
        if (!result.success) {
          const errorReason = result.errorReason ?? 'settlement_failed';
          lastSettleResponse = {
            success: false,
            transaction: result.transaction ?? '',
            network: result.network ?? detachedRequirement.network,
            errorReason,
            errorMessage: errorReason,
          };
          return lastSettleResponse;
        }
        lastSettleResponse = {
          success: true,
          payer: result.payer,
          transaction: result.transaction,
          network: result.network,
        };
        return lastSettleResponse;
      } catch (error) {
        consumed.add(selectedRequirement);
        pending.delete(selectedRequirement);
        throw error;
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
    get lastSettleResponse() {
      return lastSettleResponse;
    },
    hasPending(selectedRequirement) {
      return pending.has(selectedRequirement);
    },
  };
}

async function createCompositionHarness(
  requirement,
  {
    extensions,
    resourceUrl = SYNTHETIC_RESOURCE_URL,
    localClient = new MockExactZenonClient(),
    localFacilitator = new CountingMockFacilitator(),
  } = {},
) {
  const clientBridge = createClientBridge({ localClient, requirement });
  const client = createOfficialClient(clientBridge, requirement);
  const httpClient = new x402HTTPClient(client);
  const serverBridge = createServerBridge({ requirement, localFacilitator });
  const resourceServer = new x402ResourceServer(serverBridge.facilitatorClient);
  resourceServer.register(requirement.network, serverBridge.schemeServer);
  const httpServer = new x402HTTPResourceServer(
    resourceServer,
    routeConfig(requirement, { extensions, resourceUrl }),
  );
  await httpServer.initialize();

  let handlerEffects = 0;
  return {
    client,
    clientBridge,
    httpClient,
    httpServer,
    localFacilitator,
    resourceServer,
    resourceUrl,
    serverBridge,
    get handlerEffects() {
      return handlerEffects;
    },
    async finish(paidResult) {
      assert.equal(paidResult.type, 'payment-verified');
      assert.equal(paidResult.beforeHandlerSettlement?.result?.success, true);
      handlerEffects += 1;
      return httpServer.processSettlement(
        paidResult.paymentPayload,
        paidResult.paymentRequirements,
        paidResult.declaredExtensions,
        undefined,
        undefined,
        paidResult.beforeHandlerSettlement,
      );
    },
  };
}

async function getChallenge(harness) {
  const result = await harness.httpServer.processHTTPRequest(
    requestContext({ url: harness.resourceUrl }),
  );
  assert.equal(result.type, 'payment-error');
  assert.equal(result.response.status, 402);
  const challenge = harness.httpClient.getPaymentRequiredResponse(name =>
    headerValue(result.response.headers, name),
  );
  return { challenge, result };
}

function encodedPaymentHeader(httpClient, paymentPayload) {
  const headers = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const value = headerValue(headers, 'PAYMENT-SIGNATURE');
  assert.ok(value);
  return value;
}

async function processPaid(harness, paymentPayload) {
  return harness.httpServer.processHTTPRequest(
    requestContext({
      paymentSignature: encodedPaymentHeader(harness.httpClient, paymentPayload),
      url: harness.resourceUrl,
    }),
  );
}

async function composeOnce(harness) {
  const { challenge } = await getChallenge(harness);
  const paymentPayload = await harness.httpClient.createPaymentPayload(challenge);
  const paidResult = await processPaid(harness, paymentPayload);
  const settlementResult = await harness.finish(paidResult);
  const settlement = harness.httpClient.getPaymentSettleResponse(name =>
    headerValue(settlementResult.headers, name),
  );
  return { challenge, paidResult, paymentPayload, settlement, settlementResult };
}

function createBarrier(size) {
  let arrivals = 0;
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  return async () => {
    arrivals += 1;
    if (arrivals === size) release();
    await gate;
  };
}

test('official client and resource server compose one upfront Zenon settlement before handler execution', async () => {
  const requirement = await buildRequirement('mock');
  const harness = await createCompositionHarness(requirement);
  const { challenge } = await getChallenge(harness);

  OfficialPaymentRequiredV2Schema.parse(challenge);
  validateZenonPaymentRequired(challenge);
  assert.equal(challenge.resource.url, SYNTHETIC_RESOURCE_URL);
  assert.equal(sameRequirements(challenge.accepts[0], requirement), true);
  assert.equal(harness.clientBridge.constructionCount, 0);
  assert.equal(harness.serverBridge.settleCalls, 0);
  assert.equal(harness.localFacilitator.records.size, 0);
  assert.equal(harness.handlerEffects, 0);

  const emptyExtensionHarness = await createCompositionHarness(requirement, {
    extensions: {},
  });
  const emptyExtensionChallenge = (
    await getChallenge(emptyExtensionHarness)
  ).challenge;
  assert.equal(Object.hasOwn(emptyExtensionChallenge, 'extensions'), false);
  assert.equal(emptyExtensionHarness.clientBridge.constructionCount, 0);
  assert.equal(emptyExtensionHarness.localFacilitator.records.size, 0);

  const paymentPayload = await harness.httpClient.createPaymentPayload(challenge);
  assert.equal(paymentPayload.accepted, challenge.accepts[0]);
  assert.equal(sameResource(paymentPayload.resource, challenge.resource), true);
  assert.equal(harness.clientBridge.snapshotBindingCount, 1);
  const paymentHeader = encodedPaymentHeader(harness.httpClient, paymentPayload);
  const decodedPayment = officialDecodePaymentSignature(paymentHeader);
  assert.equal(sameRequirements(decodedPayment.accepted, requirement), true);

  const paidResult = await harness.httpServer.processHTTPRequest(
    requestContext({ paymentSignature: paymentHeader }),
  );
  assert.equal(paidResult.type, 'payment-verified');
  assert.equal(paidResult.beforeHandlerSettlement.result.success, true);
  assert.equal(harness.serverBridge.verifyCalls, 0);
  assert.equal(harness.serverBridge.settleCalls, 1);
  assert.equal(harness.serverBridge.captureCount, 2);
  assert.equal(harness.localFacilitator.verifyCalls, 1);
  assert.equal(harness.localFacilitator.settleCalls, 1);
  assert.equal(harness.localFacilitator.records.size, 1);
  assert.equal(harness.handlerEffects, 0);

  const settlementResult = await harness.finish(paidResult);
  const settlement = harness.httpClient.getPaymentSettleResponse(name =>
    headerValue(settlementResult.headers, name),
  );
  const encodedSettlement = headerValue(
    settlementResult.headers,
    'PAYMENT-RESPONSE',
  );
  assert.deepEqual(settlement, officialDecodePaymentResponse(encodedSettlement));
  assert.equal(settlement.success, true);
  assert.equal(harness.serverBridge.settleCalls, 1);
  assert.equal(harness.localFacilitator.settleCalls, 1);
  assert.equal(harness.handlerEffects, 1);
});

test('composed official contexts remain independently detached, one-shot, and request-isolated', async () => {
  const requirement = await buildRequirement('mock');
  const isolatedHarness = await createCompositionHarness(requirement);
  const { challenge } = await getChallenge(isolatedHarness);

  await assert.rejects(
    isolatedHarness.clientBridge.adapter.createPaymentPayload(
      2,
      structuredClone(requirement),
      undefined,
    ),
  );
  const missingChallenge = createDirectChallenge(
    requirement,
    `${SYNTHETIC_BASE_URL}/missing-server-context`,
  );
  const missingPayload = await new MockExactZenonClient().createPaymentPayload(
    missingChallenge,
    missingChallenge.accepts[0],
  );
  await assert.rejects(
    isolatedHarness.serverBridge.facilitatorClient.settle(
      missingPayload,
      missingChallenge.accepts[0],
    ),
  );
  assert.equal(isolatedHarness.localFacilitator.settleCalls, 0);

  const mutableSelected = challenge.accepts[0];
  await isolatedHarness.clientBridge.adapter.schemeHooks.onBeforePaymentCreation({
    paymentRequired: challenge,
    selectedRequirements: mutableSelected,
  });
  mutableSelected.amount = (BigInt(mutableSelected.amount) + 1n).toString();
  await assert.rejects(
    isolatedHarness.clientBridge.adapter.createPaymentPayload(
      2,
      mutableSelected,
      undefined,
    ),
  );
  assert.equal(isolatedHarness.clientBridge.hasPending(mutableSelected), false);

  const sourceHarness = await createCompositionHarness(requirement, {
    resourceUrl: `${SYNTHETIC_BASE_URL}/source`,
  });
  const targetHarness = await createCompositionHarness(requirement, {
    resourceUrl: `${SYNTHETIC_BASE_URL}/target`,
  });
  const sourceChallenge = (await getChallenge(sourceHarness)).challenge;
  const sourcePayload = await sourceHarness.httpClient.createPaymentPayload(
    sourceChallenge,
  );
  assert.equal(sourcePayload.accepted, sourceChallenge.accepts[0]);
  await assert.rejects(
    sourceHarness.clientBridge.adapter.createPaymentPayload(
      2,
      sourcePayload.accepted,
      undefined,
    ),
  );
  assert.equal(sourceHarness.clientBridge.constructionCount, 1);
  const crossBoundResult = await targetHarness.httpServer.processHTTPRequest(
    requestContext({
      paymentSignature: encodedPaymentHeader(
        sourceHarness.httpClient,
        sourcePayload,
      ),
      url: targetHarness.resourceUrl,
    }),
  );
  assert.equal(crossBoundResult.type, 'payment-error');
  assert.equal(crossBoundResult.response.status, 402);
  assert.equal(targetHarness.localFacilitator.records.size, 0);
  assert.equal(targetHarness.handlerEffects, 0);

  const clientBarrier = createBarrier(2);
  const baseClient = new MockExactZenonClient();
  const gatedClient = {
    async createPaymentPayload(...args) {
      await clientBarrier();
      return baseClient.createPaymentPayload(...args);
    },
  };
  const settlementBarrier = createBarrier(2);
  class GatedFacilitator extends CountingMockFacilitator {
    async settle(...args) {
      await settlementBarrier();
      return super.settle(...args);
    }
  }
  const concurrentHarness = await createCompositionHarness(requirement, {
    localClient: gatedClient,
    localFacilitator: new GatedFacilitator(),
  });
  const [challengeA, challengeB] = await Promise.all([
    getChallenge(concurrentHarness).then(result => result.challenge),
    getChallenge(concurrentHarness).then(result => result.challenge),
  ]);
  const [payloadA, payloadB] = await Promise.all([
    concurrentHarness.httpClient.createPaymentPayload(challengeA),
    concurrentHarness.httpClient.createPaymentPayload(challengeB),
  ]);
  const [paidA, paidB] = await Promise.all([
    processPaid(concurrentHarness, payloadA),
    processPaid(concurrentHarness, payloadB),
  ]);
  assert.equal(paidA.type, 'payment-verified');
  assert.equal(paidB.type, 'payment-verified');
  assert.notEqual(payloadA.accepted, paidA.paymentRequirements);
  assert.notEqual(payloadB.accepted, paidB.paymentRequirements);
  assert.equal(
    sameRequirements(payloadA.accepted, paidA.paymentRequirements),
    true,
  );
  assert.equal(
    sameRequirements(payloadB.accepted, paidB.paymentRequirements),
    true,
  );
  await concurrentHarness.finish(paidA);
  await concurrentHarness.finish(paidB);
  assert.equal(concurrentHarness.clientBridge.constructionCount, 2);
  assert.equal(concurrentHarness.serverBridge.settleCalls, 2);
  assert.equal(concurrentHarness.localFacilitator.records.size, 2);
  assert.equal(concurrentHarness.handlerEffects, 2);
  await assert.rejects(
    concurrentHarness.serverBridge.facilitatorClient.settle(
      paidA.paymentPayload,
      paidA.paymentRequirements,
    ),
  );
  assert.equal(concurrentHarness.localFacilitator.settleCalls, 2);
});

test('composed official failures remain fail-closed without broadening local HTTP semantics', async () => {
  const requirement = await buildRequirement('mock');
  const baselineHarness = await createCompositionHarness(requirement);
  const baseline = await composeOnce(baselineHarness);
  assert.equal(baseline.settlement.success, true);

  const policyHarness = await createCompositionHarness(requirement);
  const policyChallenge = (await getChallenge(policyHarness)).challenge;
  const excessiveChallenge = structuredClone(policyChallenge);
  excessiveChallenge.accepts[0].amount = (
    BigInt(requirement.amount) + 1n
  ).toString();
  await assert.rejects(
    policyHarness.httpClient.createPaymentPayload(excessiveChallenge),
  );
  const unsupportedChallenge = structuredClone(policyChallenge);
  unsupportedChallenge.accepts[0].scheme = 'unsupported';
  await assert.rejects(
    policyHarness.httpClient.createPaymentPayload(unsupportedChallenge),
  );
  const malformedExtensions = structuredClone(policyChallenge);
  malformedExtensions.extensions = null;
  await assert.rejects(
    policyHarness.httpClient.createPaymentPayload(malformedExtensions),
  );
  assert.equal(policyHarness.clientBridge.constructionCount, 0);
  assert.equal(policyHarness.localFacilitator.records.size, 0);
  assert.equal(policyHarness.handlerEffects, 0);

  const resourceHarness = await createCompositionHarness(requirement);
  const resourceChallenge = (await getChallenge(resourceHarness)).challenge;
  const resourcePayload = await resourceHarness.httpClient.createPaymentPayload(
    resourceChallenge,
  );
  resourcePayload.resource.url = `${SYNTHETIC_BASE_URL}/mismatched`;
  const resourceResult = await processPaid(resourceHarness, resourcePayload);
  assert.equal(resourceResult.type, 'payment-error');
  assert.equal(resourceResult.response.status, 402);
  assert.equal(resourceHarness.serverBridge.settleCalls, 1);
  assert.equal(resourceHarness.localFacilitator.settleCalls, 0);
  assert.equal(resourceHarness.localFacilitator.records.size, 0);
  assert.equal(resourceHarness.handlerEffects, 0);

  const extensionHarness = await createCompositionHarness(requirement);
  const extensionChallenge = (await getChallenge(extensionHarness)).challenge;
  const extensionPayload = await extensionHarness.httpClient.createPaymentPayload(
    extensionChallenge,
  );
  extensionPayload.extensions = { unsupported: {} };
  const extensionResult = await processPaid(extensionHarness, extensionPayload);
  assert.equal(extensionResult.type, 'payment-error');
  assert.equal(extensionResult.response.status, 402);
  assert.equal(extensionHarness.serverBridge.settleCalls, 1);
  assert.equal(extensionHarness.localFacilitator.settleCalls, 0);
  assert.equal(extensionHarness.localFacilitator.records.size, 0);
  assert.equal(extensionHarness.handlerEffects, 0);

  const invalidHarness = await createCompositionHarness(requirement);
  const invalidChallenge = (await getChallenge(invalidHarness)).challenge;
  const invalidPayload = await invalidHarness.httpClient.createPaymentPayload(
    invalidChallenge,
  );
  const signature = invalidPayload.payload.transaction.signature;
  invalidPayload.payload.transaction.signature = `${
    signature[0] === 'A' ? 'B' : 'A'
  }${signature.slice(1)}`;
  const invalidHeader = officialEncodePaymentSignature(invalidPayload);
  const invalidResult = await invalidHarness.httpServer.processHTTPRequest(
    requestContext({ paymentSignature: invalidHeader }),
  );
  assert.equal(invalidResult.type, 'payment-error');
  assert.equal(invalidResult.response.status, 402);
  assert.equal(invalidHarness.serverBridge.settleCalls, 1);
  assert.equal(invalidHarness.localFacilitator.settleCalls, 1);
  assert.equal(invalidHarness.localFacilitator.verifyCalls, 1);
  assert.equal(invalidHarness.localFacilitator.records.size, 0);
  assert.equal(invalidHarness.serverBridge.lastSettleResponse.success, false);
  assert.equal(invalidHarness.serverBridge.lastSettleResponse.transaction, '');
  assert.equal(
    invalidHarness.serverBridge.lastSettleResponse.network,
    requirement.network,
  );
  assert.equal(invalidHarness.handlerEffects, 0);

  // Official HTTP 402 rejection does not replace the local strict HTTP 400 lane.
  // HTTP 409 remains a PoC-specific recovery boundary, not official behavior.
  assert.notEqual(resourceResult.response.status, 400);
  assert.notEqual(resourceResult.response.status, 409);
  assert.notEqual(extensionResult.response.status, 400);
  assert.notEqual(extensionResult.response.status, 409);
  assert.notEqual(invalidResult.response.status, 400);
  assert.notEqual(invalidResult.response.status, 409);
});
