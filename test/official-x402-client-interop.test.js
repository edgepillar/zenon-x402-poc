import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

import {
  DEFAULT_MAX_AMOUNT_PER_PAYMENT,
  x402Client,
  x402HTTPClient,
} from '@x402/core/client';
import {
  PaymentPayloadV2Schema as OfficialPaymentPayloadV2Schema,
  PaymentRequiredV2Schema as OfficialPaymentRequiredV2Schema,
} from '@x402/core/schemas';

import { buildRequirement } from '../src/config.js';
import {
  MockExactZenonClient,
  MockExactZenonFacilitator,
} from '../src/mock-payment.js';
import { createResourceServer } from '../src/resource-server.js';
import {
  HEADERS,
  makePaymentRequired,
  sameRequirements,
  sameResource,
  validateActiveUpfrontRequirement as validateZenonActiveUpfrontRequirement,
  validatePaymentPayloadEnvelope,
  validatePaymentPayloadStructure,
  validateRequirement as validateZenonRequirement,
} from '../src/x402-wire.js';

const SYNTHETIC_RESOURCE_BASE = 'https://synthetic.invalid';
const SYNTHETIC_RESOURCE_URL = `${SYNTHETIC_RESOURCE_BASE}/official-client`;
const SYNTHETIC_ICON_URL = `${SYNTHETIC_RESOURCE_BASE}/icon.png`;

function challengeFor(requirement, { accepts, extensions } = {}) {
  const paymentRequired = makePaymentRequired({
    resourceUrl: SYNTHETIC_RESOURCE_URL,
    description: 'Synthetic official client interoperability resource',
    mimeType: 'application/json',
    serviceName: 'synthetic-official-client',
    tags: ['alpha', 'beta', 'alpha'],
    iconUrl: SYNTHETIC_ICON_URL,
    requirement,
  });

  const challenge = {
    ...paymentRequired,
    accepts: accepts ?? paymentRequired.accepts,
  };
  if (extensions !== undefined) challenge.extensions = extensions;
  return challenge;
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

function createOfficialClient(bridge, requirement) {
  return new x402Client()
    .setSpendControls(spendControlsFor(requirement))
    .register(requirement.network, bridge.adapter);
}

function createTestLocalBridge({ localClient, requirement }) {
  const pending = new WeakMap();
  const consumed = new WeakSet();
  let constructionCount = 0;
  let snapshotBindingCount = 0;

  function requireSelectedPolicy(x402Version, selectedRequirement) {
    if (x402Version !== 2) throw new Error('unsupported x402 version');
    validateZenonRequirement(selectedRequirement);
    validateZenonActiveUpfrontRequirement(selectedRequirement);
    if (
      selectedRequirement.scheme !== 'exact' ||
      selectedRequirement.network !== requirement.network ||
      selectedRequirement.asset !== requirement.asset ||
      selectedRequirement.amount !== requirement.amount
    ) {
      throw new Error('unsupported synthetic payment requirement');
    }
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
      async onBeforePaymentCreation({
        paymentRequired,
        selectedRequirements,
      }) {
        OfficialPaymentRequiredV2Schema.parse(paymentRequired);
        requireSelectedPolicy(paymentRequired.x402Version, selectedRequirements);

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
        requireSelectedPolicy(
          snapshot.x402Version,
          snapshot.accepts[selectedIndex],
        );
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
          throw new Error('selected payment requirement snapshot mismatch');
        }

        const hasExtensions = Object.hasOwn(paymentRequired, 'extensions');
        if (hasExtensions !== Object.hasOwn(snapshot, 'extensions')) {
          throw new Error('extension-presence snapshot mismatch');
        }
        if (
          hasExtensions &&
          (snapshot.extensions === null ||
            Reflect.ownKeys(snapshot.extensions).length !== 0)
        ) {
          throw new Error('non-empty extensions are unsupported');
        }
        if (pending.has(selectedRequirements) || consumed.has(selectedRequirements)) {
          throw new Error('payment requirement context is not reusable');
        }

        snapshotBindingCount += 1;
        pending.set(selectedRequirements, {
          hasExtensions,
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
        requireSelectedPolicy(x402Version, selectedRequirement);
        const detachedSelected = entry.snapshot.accepts[entry.selectedIndex];
        if (!sameRequirements(selectedRequirement, detachedSelected)) {
          throw new Error('selected payment requirement changed after binding');
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
          (contextExtensions === null ||
            Reflect.ownKeys(contextExtensions).length !== 0)
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

class CountingFacilitator extends MockExactZenonFacilitator {
  settleCalls = 0;

  async settle(...args) {
    this.settleCalls += 1;
    return super.settle(...args);
  }
}

async function startResourceServer(t, facilitator, requirement, onDelivery) {
  const server = createResourceServer({
    facilitator,
    requirement,
    port: 0,
    host: '127.0.0.1',
    advertisedBaseUrl: SYNTHETIC_RESOURCE_BASE,
    resourceHandler: async () => {
      onDelivery();
      return { ok: true };
    },
  });
  t.after(async () => {
    await server.close();
  });
  return server.listen();
}

test('official client registration preserves selection and construction discipline', async () => {
  const requirement = await buildRequirement('mock');
  const firstCompatible = structuredClone(requirement);
  const secondCompatible = structuredClone(requirement);
  const paymentRequired = challengeFor(requirement, {
    accepts: [
      { ...structuredClone(requirement), scheme: 'unsupported' },
      { ...structuredClone(requirement), network: 'synthetic:unsupported' },
      firstCompatible,
      secondCompatible,
    ],
  });
  const bridge = createTestLocalBridge({
    localClient: new MockExactZenonClient(),
    requirement,
  });
  const client = createOfficialClient(bridge, requirement);

  const paymentPayload = await client.createPaymentPayload(paymentRequired);

  assert.equal(paymentPayload.accepted, firstCompatible);
  assert.equal(bridge.constructionCount, 1);
  assert.equal(bridge.snapshotBindingCount, 1);
  assert.equal(bridge.hasPending(firstCompatible), false);

  const priorConstructionCount = bridge.constructionCount;
  await assert.rejects(
    client.createPaymentPayload(
      challengeFor(requirement, {
        accepts: [
          {
            ...structuredClone(requirement),
            amount: (BigInt(requirement.amount) + 1n).toString(),
          },
        ],
      }),
    ),
  );
  await assert.rejects(
    client.createPaymentPayload(
      challengeFor(requirement, {
        accepts: [
          {
            ...structuredClone(requirement),
            asset: `${requirement.asset}-unsupported`,
          },
        ],
      }),
    ),
  );
  assert.equal(bridge.constructionCount, priorConstructionCount);
});

test('official client HTTP lifecycle reaches local mock settlement and delivery', async t => {
  const requirement = await buildRequirement('mock');
  const localClient = new MockExactZenonClient();
  const facilitator = new CountingFacilitator();
  const bridge = createTestLocalBridge({ localClient, requirement });
  const httpClient = new x402HTTPClient(createOfficialClient(bridge, requirement));
  let deliveries = 0;
  const listener = await startResourceServer(
    t,
    facilitator,
    requirement,
    () => {
      deliveries += 1;
    },
  );
  const protectedUrl = `${listener.url}/paid`;

  const unpaidResponse = await fetch(protectedUrl);
  assert.equal(unpaidResponse.status, 402);
  const paymentRequired = httpClient.getPaymentRequiredResponse(name =>
    unpaidResponse.headers.get(name),
  );
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const paidResponse = await fetch(protectedUrl, {
    headers: httpClient.encodePaymentSignatureHeader(paymentPayload),
  });

  assert.equal(paidResponse.status, 200);
  assert.deepEqual(await paidResponse.json(), { ok: true });
  const settlement = httpClient.getPaymentSettleResponse(name =>
    paidResponse.headers.get(name),
  );
  assert.equal(settlement.success, true);
  assert.equal(facilitator.settleCalls, 1);
  assert.equal(deliveries, 1);
  assert.equal(facilitator.records.size, 1);
  const [record] = facilitator.records.values();
  assert.equal(record.deliveryState, 'DELIVERED');
  assert.equal(record.cachedResponse.status, 200);
  assert.deepEqual(record.cachedResponse.body, { ok: true });
});

test('official client contexts preserve extensions and request isolation', async () => {
  const requirement = await buildRequirement('mock');
  const bridge = createTestLocalBridge({
    localClient: new MockExactZenonClient(),
    requirement,
  });
  const client = createOfficialClient(bridge, requirement);

  const absentRequirement = structuredClone(requirement);
  const absentChallenge = challengeFor(requirement, {
    accepts: [absentRequirement],
  });
  const absentChallengeSnapshot = structuredClone(absentChallenge);
  const absentPayload = await client.createPaymentPayload(absentChallenge);
  const absentPayloadSnapshot = structuredClone(absentPayload);
  const extensionsDescriptor = Object.getOwnPropertyDescriptor(
    absentPayload,
    'extensions',
  );

  assert.equal(Object.hasOwn(absentPayload, 'extensions'), true);
  assert.equal(extensionsDescriptor !== undefined, true);
  assert.equal(Object.hasOwn(extensionsDescriptor, 'value'), true);
  assert.equal(extensionsDescriptor.value, undefined);
  assert.equal(extensionsDescriptor.enumerable, true);
  assert.equal(extensionsDescriptor.writable, true);
  assert.equal(extensionsDescriptor.configurable, true);
  assert.doesNotThrow(() => OfficialPaymentPayloadV2Schema.parse(absentPayload));

  const localValidationResults = [
    validatePaymentPayloadStructure,
    validatePaymentPayloadEnvelope,
  ].map(validate => {
    try {
      validate(absentPayload);
      return true;
    } catch {
      return false;
    }
  });
  assert.deepEqual(
    localValidationResults,
    [true, true],
    'local payload validators must accept official undefined extensions',
  );

  assert.equal(isDeepStrictEqual(absentChallenge, absentChallengeSnapshot), true);
  assert.equal(isDeepStrictEqual(absentPayload, absentPayloadSnapshot), true);
  assert.equal(
    isDeepStrictEqual(
      Object.getOwnPropertyDescriptor(absentPayload, 'extensions'),
      extensionsDescriptor,
    ),
    true,
  );
  const absentJsonRoundTrip = JSON.parse(JSON.stringify(absentPayload));
  assert.equal(Object.hasOwn(absentJsonRoundTrip, 'extensions'), false);

  const emptyRequirement = structuredClone(requirement);
  await client.createPaymentPayload(
    challengeFor(requirement, {
      accepts: [emptyRequirement],
      extensions: {},
    }),
  );
  const acceptedConstructionCount = bridge.constructionCount;

  await assert.rejects(
    client.createPaymentPayload(
      challengeFor(requirement, {
        accepts: [structuredClone(requirement)],
        extensions: { unsupported: {} },
      }),
    ),
  );
  assert.equal(bridge.constructionCount, acceptedConstructionCount);

  await assert.rejects(
    bridge.adapter.createPaymentPayload(
      2,
      structuredClone(requirement),
      undefined,
    ),
  );

  const mismatchedRequirement = structuredClone(requirement);
  const mismatchedChallenge = challengeFor(requirement, {
    accepts: [mismatchedRequirement],
  });
  await bridge.adapter.schemeHooks.onBeforePaymentCreation({
    paymentRequired: mismatchedChallenge,
    selectedRequirements: mismatchedRequirement,
  });
  mismatchedRequirement.amount = (
    BigInt(mismatchedRequirement.amount) + 1n
  ).toString();
  await assert.rejects(
    bridge.adapter.createPaymentPayload(
      2,
      mismatchedRequirement,
      undefined,
    ),
  );
  assert.equal(bridge.hasPending(mismatchedRequirement), false);

  await assert.rejects(
    bridge.adapter.createPaymentPayload(2, absentPayload.accepted, undefined),
  );

  const realConcurrentClient = new MockExactZenonClient();
  let arrivals = 0;
  let release;
  const gate = new Promise(resolve => {
    release = resolve;
  });
  const gatedClient = {
    async createPaymentPayload(...args) {
      arrivals += 1;
      if (arrivals === 2) release();
      await gate;
      return realConcurrentClient.createPaymentPayload(...args);
    },
  };
  const concurrentBridge = createTestLocalBridge({
    localClient: gatedClient,
    requirement,
  });
  const concurrentClient = createOfficialClient(concurrentBridge, requirement);
  const concurrentRequirementA = structuredClone(requirement);
  const concurrentRequirementB = structuredClone(requirement);
  const [payloadA, payloadB] = await Promise.all([
    concurrentClient.createPaymentPayload(
      challengeFor(requirement, { accepts: [concurrentRequirementA] }),
    ),
    concurrentClient.createPaymentPayload(
      challengeFor(requirement, { accepts: [concurrentRequirementB] }),
    ),
  ]);

  assert.equal(payloadA.accepted, concurrentRequirementA);
  assert.equal(payloadB.accepted, concurrentRequirementB);
  assert.equal(concurrentBridge.constructionCount, 2);
  assert.equal(concurrentBridge.hasPending(concurrentRequirementA), false);
  assert.equal(concurrentBridge.hasPending(concurrentRequirementB), false);
});

test('official client interoperability preserves local HTTP failure lanes', async t => {
  const requirement = await buildRequirement('mock');
  const facilitator = new CountingFacilitator();
  const bridge = createTestLocalBridge({
    localClient: new MockExactZenonClient(),
    requirement,
  });
  const httpClient = new x402HTTPClient(createOfficialClient(bridge, requirement));
  let deliveries = 0;
  const listener = await startResourceServer(
    t,
    facilitator,
    requirement,
    () => {
      deliveries += 1;
    },
  );
  const protectedUrl = `${listener.url}/paid`;

  const malformedResponse = await fetch(protectedUrl, {
    headers: { [HEADERS.PAYMENT_SIGNATURE]: 'not-a-payment-header' },
  });
  assert.equal(malformedResponse.status, 400);
  assert.equal(facilitator.records.size, 0);
  assert.equal(deliveries, 0);

  const unpaidResponse = await fetch(protectedUrl);
  const paymentRequired = httpClient.getPaymentRequiredResponse(name =>
    unpaidResponse.headers.get(name),
  );
  const validPayload = await httpClient.createPaymentPayload(paymentRequired);
  const unsupportedPayload = structuredClone(validPayload);
  unsupportedPayload.accepted.network = 'synthetic:unsupported';
  const unsupportedResponse = await fetch(protectedUrl, {
    headers: httpClient.encodePaymentSignatureHeader(unsupportedPayload),
  });

  assert.equal(unsupportedResponse.status, 402);
  assert.equal(facilitator.records.size, 0);
  assert.equal(facilitator.settleCalls, 0);
  assert.equal(deliveries, 0);

  // HTTP 409 remains a PoC-specific recovery boundary, not official behavior.
});
