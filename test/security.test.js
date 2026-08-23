import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { sha512 } from '@noble/hashes/sha2';
import * as ed from '@noble/ed25519';
import * as sdk from 'znn-typescript-sdk';
import { paymentIntentDigest, sha256Hex } from '../src/canonical.js';
import { MockExactZenonClient, MockExactZenonFacilitator } from '../src/mock-payment.js';
import { paidFetch } from '../src/buyer.js';
import { createResourceServer } from '../src/resource-server.js';
import {
  createPaymentCapabilities,
  encodeB64Json,
  decodeB64Json,
  HEADERS,
  MAX_ZENON_AMOUNT,
  MOCK_ZENON_CHAIN_PROFILE,
  validateRequirement,
} from '../src/x402-wire.js';
import {
  assertNoConflictingUnconfirmedBlocks,
  assertZenonNodeReady,
  assertAssetExists,
  computeBlockHash,
  ensurePublished,
  ExactZenonClient,
  ExactZenonFacilitator,
  normalizeConfirmationDetail,
  PerPayerQueue,
  preflightZenonPayment,
  validateAccountBlockJson,
  validateObservedAccountBlock,
  waitForMomentumInclusion,
} from '../src/zenon-payment.js';
import { EVIDENCE_STATES } from '../src/settlement-journal.js';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const LEGACY_FLOW_OPTION = 'allowLegacyMissingPaymentFlowForCharacterization';

function requirement() {
  return {
    scheme: 'exact',
    network: 'zenon:mock',
    asset: 'mock-zts',
    amount: '100',
    payTo: 'mock-seller',
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: { ...MOCK_ZENON_CHAIN_PROFILE },
    },
  };
}

function paymentRequired(accepted = requirement()) {
  return {
    x402Version: 2,
    resource: { url: 'http://example.test/paid', description: 'test', mimeType: 'application/json' },
    accepts: [accepted],
  };
}

function liveRequirement() {
  return {
    ...requirement(),
    network: 'zenon:testnet',
    asset: 'zts1qqqqqqqqqqqqtq587y',
    payTo: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
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
}

function definePaymentCapabilities(client, capabilities) {
  Object.defineProperty(client, 'paymentCapabilities', {
    value: capabilities,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return client;
}

function recordingPaymentClient(capabilities, observations = {}) {
  return definePaymentCapabilities({
    async createPaymentPayload(required, accepted) {
      observations.constructions = (observations.constructions ?? 0) + 1;
      observations.required = required;
      observations.accepted = accepted;
      const intentDigest = paymentIntentDigest(required, accepted);
      return {
        x402Version: required.x402Version,
        resource: structuredClone(required.resource),
        accepted: structuredClone(accepted),
        payload: {
          transaction: {
            hash: 'c'.repeat(64),
            address: 'synthetic-payer',
            data: intentDigest,
          },
          intentDigest,
        },
      };
    },
  }, capabilities);
}

async function completeSelection(paymentRequiredValue, paymentClient, observations = {}, paidFetchOptions = {}) {
  const result = await paidFetch(paymentRequiredValue.resource.url, paymentClient, async (_url, options) => {
    observations.requests = (observations.requests ?? 0) + 1;
    if (!options) {
      return {
        status: 402,
        url: paymentRequiredValue.resource.url,
        headers: new Headers({
          [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(paymentRequiredValue),
        }),
      };
    }
    observations.retries = (observations.retries ?? 0) + 1;
    const payload = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
    return {
      status: 200,
      headers: new Headers({
        [HEADERS.PAYMENT_RESPONSE]: encodeB64Json({
          success: true,
          network: payload.accepted.network,
          transaction: payload.payload.transaction.hash,
          payer: payload.payload.transaction.address,
          state: 'MOMENTUM_INCLUDED',
        }),
      }),
    };
  }, paidFetchOptions);
  return result;
}

function freezeCapabilityFixture(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) freezeCapabilityFixture(value[key]);
  return Object.freeze(value);
}

async function signedMock() {
  const accepted = requirement();
  const required = paymentRequired(accepted);
  const client = new MockExactZenonClient();
  return { accepted, required, client, payload: await client.createPaymentPayload(required, accepted) };
}

function nonCanonicalBase64Alias(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  assert.notEqual(padding, 0);
  const index = value.length - padding - 1;
  const replacement = alphabet[alphabet.indexOf(value[index]) + 1];
  const alias = `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
  assert.deepEqual(Buffer.from(alias, 'base64'), Buffer.from(value, 'base64'));
  return alias;
}

test('payment requirements and resource binding reject tampering', async () => {
  const cases = [
    payload => { payload.accepted.payTo = 'other-recipient'; },
    payload => { payload.accepted.amount = '101'; },
    payload => { payload.accepted.asset = 'other-asset'; },
    payload => { payload.accepted.network = 'zenon:other'; },
    payload => { payload.payload.transaction.data = '0'.repeat(64); },
    payload => { payload.payload.intentDigest = '0'.repeat(64); },
  ];
  for (const mutate of cases) {
    const { accepted, required, payload } = await signedMock();
    mutate(payload);
    const result = await new MockExactZenonFacilitator().verify(payload, accepted, required);
    assert.equal(result.isValid, false);
  }

  const { accepted, required, payload } = await signedMock();
  required.resource.url = 'http://example.test/changed';
  const resourceResult = await new MockExactZenonFacilitator().verify(payload, accepted, required);
  assert.equal(resourceResult.isValid, false);
});

test('mock signed transaction rejects signature, key, payer, and hash tampering', async () => {
  const cases = [
    payload => { payload.payload.transaction.signature = Buffer.alloc(64).toString('base64'); },
    payload => { payload.payload.transaction.publicKey = Buffer.alloc(44).toString('base64'); },
    payload => { payload.payload.transaction.address = 'mock-wrong'; },
    payload => { payload.payload.transaction.hash = '0'.repeat(64); },
    payload => { payload.payload.transaction.tokenStandard = 'unexpected'; },
  ];
  for (const mutate of cases) {
    const { accepted, required, payload } = await signedMock();
    mutate(payload);
    const result = await new MockExactZenonFacilitator().verify(payload, accepted, required);
    assert.equal(result.isValid, false);
  }
});

test('strict Ed25519 verification rejects a small-order identity key forgery', () => {
  const publicKey = Buffer.alloc(32);
  publicKey[0] = 1;
  const signature = Buffer.alloc(64);
  signature[0] = 1;
  const message = Buffer.alloc(32, 7);
  assert.equal(ed.verify(signature, message, publicKey), true);
  assert.equal(ed.verify(signature, message, publicKey, { zip215: false }), false);
});

test('wire decoder rejects base64 aliases and invalid UTF-8', () => {
  const encoded = encodeB64Json({});
  assert.throws(() => decodeB64Json(nonCanonicalBase64Alias(encoded)), /invalid base64/);
  const invalidUtf8Json = Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc0, 0xaf, 0x22, 0x7d]);
  assert.throws(() => decodeB64Json(invalidUtf8Json.toString('base64')));
});

test('mock replay key cannot be changed through base64 signature aliases', async () => {
  const { accepted, required, payload } = await signedMock();
  const facilitator = new MockExactZenonFacilitator();
  assert.equal((await facilitator.settle(payload, accepted, required)).success, true);

  const replay = structuredClone(payload);
  const tx = replay.payload.transaction;
  tx.signature = nonCanonicalBase64Alias(tx.signature);
  const unsigned = { ...tx };
  delete unsigned.signature;
  delete unsigned.hash;
  tx.hash = sha256Hex({ block: unsigned, signature: tx.signature });
  const result = await facilitator.settle(replay, accepted, required);
  assert.equal(result.success, false);
  assert.equal(result.errorReason, 'verification_failed');
});

test('requirements use canonical positive Zenon amounts up to 2^255 - 1', () => {
  assert.doesNotThrow(() => validateRequirement(requirement()));
  for (const amount of ['0', '00', '01', '+1', '-1', '1.0', '1e2', ' 1', '1 ', (1n << 255n).toString()]) {
    assert.throws(() => validateRequirement({ ...requirement(), amount }));
  }
  assert.equal(MAX_ZENON_AMOUNT, (1n << 255n) - 1n);
  assert.doesNotThrow(() => validateRequirement({ ...requirement(), amount: MAX_ZENON_AMOUNT.toString() }));
});

test('payment intent digest covers every selected requirement and resource field', () => {
  const accepted = requirement();
  const required = paymentRequired(accepted);
  const original = paymentIntentDigest(required, accepted);
  const mutations = [
    value => { value.required.x402Version = 3; },
    value => { value.required.resource.url += '/other'; },
    value => { value.required.resource.description += ' other'; },
    value => { value.required.resource.mimeType = 'text/plain'; },
    value => { value.accepted.scheme = 'other'; },
    value => { value.accepted.network = 'zenon:other'; },
    value => { value.accepted.asset = 'other-zts'; },
    value => { value.accepted.amount = '101'; },
    value => { value.accepted.payTo = 'other-recipient'; },
    value => { value.accepted.maxTimeoutSeconds = 31; },
    value => { value.accepted.extra.paymentFlow = 'authorization'; },
    value => { value.accepted.extra.poc = false; },
  ];
  for (const mutate of mutations) {
    const value = { required: structuredClone(required), accepted: structuredClone(accepted) };
    value.required.accepts[0] = value.accepted;
    mutate(value);
    assert.notEqual(paymentIntentDigest(value.required, value.accepted), original);
  }
  const reordered = { ...accepted, extra: { z: 1, a: 2 } };
  const reorderedAgain = { ...accepted, extra: { a: 2, z: 1 } };
  assert.equal(
    paymentIntentDigest(paymentRequired(reordered), reordered),
    paymentIntentDigest(paymentRequired(reorderedAgain), reorderedAgain),
  );
});

test('buyer refuses to sign for a different advertised resource URL', async () => {
  const accepted = requirement();
  const required = paymentRequired(accepted);
  required.resource.url = 'https://other.example/paid';
  let signed = false;
  const fetchImpl = async () => ({
    status: 402,
    url: 'https://expected.example/paid',
    headers: new Headers({ [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(required) }),
  });
  await assert.rejects(
    paidFetch('https://expected.example/paid', { createPaymentPayload: async () => { signed = true; } }, fetchImpl),
    /does not match/,
  );
  assert.equal(signed, false);
});

test('buyer rejects every non-upfront flow before payment construction or retry', async () => {
  const variants = [
    { label: 'missing', value: undefined },
    { label: 'null', value: null },
    { label: 'authorization', value: 'authorization' },
    { label: 'escrow', value: 'escrow' },
    { label: 'unknown', value: 'unknown' },
    { label: 'boolean', value: false },
    { label: 'number', value: 1 },
    { label: 'object', value: {} },
  ];

  for (const variant of variants) {
    const accepted = requirement();
    if (variant.label === 'missing') delete accepted.extra.paymentFlow;
    else accepted.extra.paymentFlow = variant.value;
    const required = paymentRequired(accepted);
    let paymentConstructions = 0;
    let requests = 0;
    const fetchImpl = async () => {
      requests += 1;
      return {
        status: 402,
        url: required.resource.url,
        headers: new Headers({ [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(required) }),
      };
    };

    await assert.rejects(
      paidFetch(required.resource.url, {
        async createPaymentPayload() {
          paymentConstructions += 1;
        },
      }, fetchImpl),
      /paymentFlow/,
    );
    assert.equal(paymentConstructions, 0);
    assert.equal(requests, 1);
  }
});

test('paidFetch characterization option permits only a completely absent payment flow', async () => {
  const accepted = requirement();
  delete accepted.extra.paymentFlow;
  const required = paymentRequired(accepted);
  let falseOptionConstructions = 0;
  let falseOptionRequests = 0;
  await assert.rejects(
    paidFetch(required.resource.url, {
      async createPaymentPayload() {
        falseOptionConstructions += 1;
      },
    }, async () => {
      falseOptionRequests += 1;
      return {
        status: 402,
        url: required.resource.url,
        headers: new Headers({ [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(required) }),
      };
    }, { [LEGACY_FLOW_OPTION]: false }),
    /paymentFlow/,
  );
  assert.equal(falseOptionConstructions, 0);
  assert.equal(falseOptionRequests, 1);

  const exact = new MockExactZenonClient();
  let paymentConstructions = 0;
  let requests = 0;
  const paymentClient = {
    async createPaymentPayload(...args) {
      paymentConstructions += 1;
      return exact.createPaymentPayload(...args);
    },
  };
  const fetchImpl = async (_url, options) => {
    requests += 1;
    if (requests === 1) {
      return {
        status: 402,
        url: required.resource.url,
        headers: new Headers({ [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(required) }),
      };
    }
    const payload = decodeB64Json(options.headers[HEADERS.PAYMENT_SIGNATURE]);
    return {
      status: 200,
      headers: new Headers({
        [HEADERS.PAYMENT_RESPONSE]: encodeB64Json({
          success: true,
          network: accepted.network,
          transaction: payload.payload.transaction.hash,
          payer: payload.payload.transaction.address,
          state: 'MOMENTUM_INCLUDED',
        }),
      }),
    };
  };

  const result = await paidFetch(required.resource.url, paymentClient, fetchImpl, {
    [LEGACY_FLOW_OPTION]: true,
  });
  assert.equal(result.response.status, 200);
  assert.equal(Object.hasOwn(result.paymentPayload.accepted.extra, 'paymentFlow'), false);
  assert.equal(paymentConstructions, 1);
  assert.equal(requests, 2);

  for (const paymentFlow of [null, 'authorization', 'escrow', 'unknown', false, 1, {}]) {
    const invalidAccepted = requirement();
    invalidAccepted.extra.paymentFlow = paymentFlow;
    const invalidRequired = paymentRequired(invalidAccepted);
    let invalidConstructions = 0;
    let invalidRequests = 0;
    await assert.rejects(
      paidFetch(invalidRequired.resource.url, {
        async createPaymentPayload() {
          invalidConstructions += 1;
        },
      }, async () => {
        invalidRequests += 1;
        return {
          status: 402,
          url: invalidRequired.resource.url,
          headers: new Headers({ [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(invalidRequired) }),
        };
      }, { [LEGACY_FLOW_OPTION]: true }),
      /paymentFlow/,
    );
    assert.equal(invalidConstructions, 0);
    assert.equal(invalidRequests, 1);
  }
});

test('paidFetch rejects malformed characterization options before any request', async () => {
  let accessorReads = 0;
  const accessorOption = {};
  Object.defineProperty(accessorOption, LEGACY_FLOW_OPTION, {
    enumerable: true,
    get() {
      accessorReads += 1;
      return true;
    },
  });
  const malformedOptions = [
    null,
    [],
    true,
    'true',
    { unexpected: true },
    { [LEGACY_FLOW_OPTION]: null },
    { [LEGACY_FLOW_OPTION]: 'true' },
    { [LEGACY_FLOW_OPTION]: true, unexpected: true },
    { [Symbol('unexpected')]: true },
    accessorOption,
  ];

  for (const options of malformedOptions) {
    let requests = 0;
    let paymentConstructions = 0;
    await assert.rejects(
      paidFetch('https://resource.example/paid', {
        async createPaymentPayload() {
          paymentConstructions += 1;
        },
      }, async () => {
        requests += 1;
      }, options),
      /paidFetch options|allowLegacyMissingPaymentFlowForCharacterization/,
    );
    assert.equal(requests, 0);
    assert.equal(paymentConstructions, 0);
  }
  assert.equal(accessorReads, 0);
});

test('built-in payment clients expose exact immutable routing capabilities', () => {
  const mock = new MockExactZenonClient();
  const live = new ExactZenonClient({ mnemonic: '', accountIndex: 0, rpcTimeoutMs: 1 });
  for (const [client, network] of [[mock, 'zenon:mock'], [live, 'zenon:testnet']]) {
    const property = Object.getOwnPropertyDescriptor(client, 'paymentCapabilities');
    assert.ok(property);
    assert.equal(Object.hasOwn(property, 'value'), true);
    assert.equal(property.enumerable, false);
    assert.equal(property.writable, false);
    assert.equal(property.configurable, false);
    assert.deepEqual(property.value, {
      version: 1,
      x402Version: 2,
      routes: [{ scheme: 'exact', network, paymentFlows: ['upfront'] }],
    });
    assert.equal(Object.isFrozen(property.value), true);
    assert.equal(Object.isFrozen(property.value.routes), true);
    assert.equal(Object.isFrozen(property.value.routes[0]), true);
    assert.equal(Object.isFrozen(property.value.routes[0].paymentFlows), true);
    assert.throws(() => { property.value.routes[0].network = 'other:test'; }, TypeError);
  }
  assert.equal(Object.keys(mock).includes('paymentCapabilities'), false);
  assert.equal(Object.keys(live).includes('paymentCapabilities'), false);
});

test('client-owned capabilities select the correct route in either offer order', async () => {
  const mockCapabilities = new MockExactZenonClient().paymentCapabilities;
  const liveCapabilities = new ExactZenonClient({ mnemonic: '', accountIndex: 0, rpcTimeoutMs: 1 })
    .paymentCapabilities;
  const mock = requirement();
  const live = liveRequirement();
  const cases = [
    { offers: [mock, live], capabilities: mockCapabilities, expected: mock },
    { offers: [mock, live], capabilities: liveCapabilities, expected: live },
    { offers: [live, mock], capabilities: mockCapabilities, expected: mock },
    { offers: [live, mock], capabilities: liveCapabilities, expected: live },
  ];

  for (const scenario of cases) {
    const required = {
      ...paymentRequired(),
      resource: {
        ...paymentRequired().resource,
        url: 'https://resource.example/paid',
      },
      accepts: structuredClone(scenario.offers),
    };
    const original = structuredClone(required);
    const observations = {};
    const client = recordingPaymentClient(scenario.capabilities, observations);
    const result = await completeSelection(required, client, observations);

    assert.deepEqual(result.paymentPayload.accepted, scenario.expected);
    assert.deepEqual(result.paymentRequired, original);
    assert.equal(observations.constructions, 1);
    assert.equal(observations.requests, 2);
    assert.equal(observations.retries, 1);
    assert.equal(observations.required.accepts.length, 1);
    assert.deepEqual(observations.required.accepts[0], scenario.expected);
    assert.notEqual(observations.required, required);
    assert.notEqual(observations.required.resource, required.resource);
    assert.notEqual(observations.accepted, scenario.expected);
    assert.equal(
      result.paymentPayload.payload.intentDigest,
      paymentIntentDigest(required, scenario.expected),
    );
  }
});

test('nonmatching payment flows are skipped only when a later upfront offer is usable', async () => {
  const capabilities = new MockExactZenonClient().paymentCapabilities;
  const variants = [undefined, null, 'authorization', 'escrow', 'unknown', {}, 1, false];
  for (const paymentFlow of variants) {
    const alternative = requirement();
    if (paymentFlow === undefined) delete alternative.extra.paymentFlow;
    else alternative.extra.paymentFlow = paymentFlow;
    const supported = requirement();
    const observations = {};
    const client = recordingPaymentClient(capabilities, observations);
    const required = { ...paymentRequired(), accepts: [alternative, supported] };
    const result = await completeSelection(required, client, observations);
    assert.deepEqual(result.paymentPayload.accepted, supported);
    assert.equal(observations.constructions, 1);

    let singleOfferConstructions = 0;
    let singleOfferRequests = 0;
    await assert.rejects(
      paidFetch(required.resource.url, definePaymentCapabilities({
        async createPaymentPayload() {
          singleOfferConstructions += 1;
        },
      }, capabilities), async () => {
        singleOfferRequests += 1;
        return {
          status: 402,
          url: required.resource.url,
          headers: new Headers({
            [HEADERS.PAYMENT_REQUIRED]: encodeB64Json({ ...required, accepts: [alternative] }),
          }),
        };
      }),
      /paymentFlow/,
    );
    assert.equal(singleOfferConstructions, 0);
    assert.equal(singleOfferRequests, 1);
  }

  const missingFlow = { ...requirement(), amount: '99' };
  delete missingFlow.extra.paymentFlow;
  const supported = requirement();
  const observations = {};
  const client = recordingPaymentClient(capabilities, observations);
  const result = await completeSelection(
    { ...paymentRequired(), accepts: [missingFlow, supported] },
    client,
    observations,
    { [LEGACY_FLOW_OPTION]: true },
  );
  assert.deepEqual(result.paymentPayload.accepted, supported);
});

test('malformed alternatives and invalid claimed Zenon offers invalidate the challenge', async () => {
  const capabilities = new MockExactZenonClient().paymentCapabilities;
  const unsupported = {
    scheme: 'other',
    network: 'other:test',
    asset: 'asset',
    amount: '9'.repeat(78),
    payTo: 'recipient',
    maxTimeoutSeconds: 0.5,
    extra: { paymentFlow: 1 },
  };
  const malformed = [
    { ...unsupported, scheme: null },
    { ...unsupported, network: 'unscoped' },
    { ...unsupported, amount: {} },
    { ...unsupported, maxTimeoutSeconds: 0 },
    { ...unsupported, extra: [] },
  ];
  const invalidClaimed = [
    { ...requirement(), amount: '0' },
    { ...requirement(), amount: '9'.repeat(78) },
    { ...requirement(), maxTimeoutSeconds: 0.5 },
  ];

  const observations = {};
  const supported = requirement();
  const selected = await completeSelection(
    { ...paymentRequired(), accepts: [unsupported, supported] },
    recordingPaymentClient(capabilities, observations),
    observations,
  );
  assert.deepEqual(selected.paymentPayload.accepted, supported);
  assert.equal(observations.constructions, 1);

  for (const alternative of [...malformed, ...invalidClaimed]) {
    let constructions = 0;
    let requests = 0;
    const client = definePaymentCapabilities({
      async createPaymentPayload() {
        constructions += 1;
      },
    }, capabilities);
    await assert.rejects(paidFetch(paymentRequired().resource.url, client, async () => {
      requests += 1;
      return {
        status: 402,
        url: paymentRequired().resource.url,
        headers: new Headers({
          [HEADERS.PAYMENT_REQUIRED]: encodeB64Json({
            ...paymentRequired(),
            accepts: [alternative, requirement()],
          }),
        }),
      };
    }));
    assert.equal(constructions, 0);
    assert.equal(requests, 1);
  }
});

test('descriptor-less and unmatched clients fail closed without speculative work', async () => {
  const supported = requirement();
  const unsupported = liveRequirement();
  const required = { ...paymentRequired(), accepts: [unsupported, supported] };

  let ambiguousConstructions = 0;
  await assert.rejects(
    paidFetch(required.resource.url, {
      async createPaymentPayload() {
        ambiguousConstructions += 1;
      },
    }, async () => ({
      status: 402,
      url: required.resource.url,
      headers: new Headers({ [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(required) }),
    })),
    /ambiguous/,
  );
  assert.equal(ambiguousConstructions, 0);

  const singleObservations = {};
  const singleClient = {
    async createPaymentPayload(requiredView, accepted) {
      return recordingPaymentClient(
        createPaymentCapabilities([{ scheme: 'exact', network: 'zenon:mock', paymentFlows: ['upfront'] }]),
        singleObservations,
      ).createPaymentPayload(requiredView, accepted);
    },
  };
  const singleResult = await completeSelection(paymentRequired(supported), singleClient, singleObservations);
  assert.deepEqual(singleResult.paymentPayload.accepted, supported);
  assert.equal(singleObservations.constructions, 1);

  let unmatchedConstructions = 0;
  const unmatchedClient = definePaymentCapabilities({
    async createPaymentPayload() {
      unmatchedConstructions += 1;
    },
  }, new MockExactZenonClient().paymentCapabilities);
  await assert.rejects(
    paidFetch(paymentRequired(unsupported).resource.url, unmatchedClient, async () => ({
      status: 402,
      url: paymentRequired(unsupported).resource.url,
      headers: new Headers({
        [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(paymentRequired(unsupported)),
      }),
    })),
    /no supported upfront paymentFlow option/,
  );
  assert.equal(unmatchedConstructions, 0);
});

test('malformed capability descriptors fail before the initial request', async () => {
  const validRoute = { scheme: 'exact', network: 'zenon:mock', paymentFlows: ['upfront'] };
  const frozen = value => freezeCapabilityFixture(value);
  const malformedValues = [
    { version: 1, x402Version: 2, routes: [validRoute] },
    Object.freeze({ version: 1, x402Version: 2, routes: [validRoute] }),
    frozen({ version: 1, x402Version: 2, routes: [validRoute], unexpected: true }),
    frozen({ version: 2, x402Version: 2, routes: [validRoute] }),
    frozen({ version: 1, x402Version: 1, routes: [validRoute] }),
    frozen({ version: 1, x402Version: 2, routes: [] }),
    frozen({ version: 1, x402Version: 2, routes: [{
      ...validRoute,
      paymentFlows: [],
    }] }),
    frozen({ version: 1, x402Version: 2, routes: Array.from({ length: 17 }, (_, index) => ({
      scheme: `scheme-${index}`,
      network: `network:${index}`,
      paymentFlows: ['upfront'],
    })) }),
    frozen({ version: 1, x402Version: 2, routes: [{
      scheme: 'x'.repeat(129),
      network: 'zenon:mock',
      paymentFlows: ['upfront'],
    }] }),
    frozen({ version: 1, x402Version: 2, routes: [validRoute, { ...validRoute }] }),
    frozen({ version: 1, x402Version: 2, routes: [{
      ...validRoute,
      paymentFlows: ['upfront', 'upfront'],
    }] }),
    frozen({ version: 1, x402Version: 2, routes: [{
      ...validRoute,
      paymentFlows: ['unknown'],
    }] }),
    frozen({ version: 1, x402Version: 2, routes: [{
      ...validRoute,
      unexpected: true,
    }] }),
  ];

  const symbolRoot = { version: 1, x402Version: 2, routes: [validRoute] };
  symbolRoot[Symbol('unexpected')] = true;
  malformedValues.push(frozen(symbolRoot));

  const symbolRoute = { ...validRoute, [Symbol('unexpected')]: true };
  malformedValues.push(frozen({ version: 1, x402Version: 2, routes: [symbolRoute] }));

  const symbolRoutes = [validRoute];
  symbolRoutes[Symbol('unexpected')] = true;
  malformedValues.push(frozen({ version: 1, x402Version: 2, routes: symbolRoutes }));

  const symbolFlows = ['upfront'];
  symbolFlows[Symbol('unexpected')] = true;
  malformedValues.push(frozen({ version: 1, x402Version: 2, routes: [{
    ...validRoute,
    paymentFlows: symbolFlows,
  }] }));

  let routeAccessorReads = 0;
  const accessorRoute = {
    network: validRoute.network,
    paymentFlows: Object.freeze([...validRoute.paymentFlows]),
  };
  Object.defineProperty(accessorRoute, 'scheme', {
    get() {
      routeAccessorReads += 1;
      return validRoute.scheme;
    },
    enumerable: true,
  });
  Object.freeze(accessorRoute);
  malformedValues.push(Object.freeze({
    version: 1,
    x402Version: 2,
    routes: Object.freeze([accessorRoute]),
  }));

  let accessorReads = 0;
  const accessorClient = { async createPaymentPayload() {} };
  Object.defineProperty(accessorClient, 'paymentCapabilities', {
    get() {
      accessorReads += 1;
      return createPaymentCapabilities([validRoute]);
    },
  });
  const malformedClients = [accessorClient];
  for (const value of malformedValues) {
    malformedClients.push(definePaymentCapabilities({ async createPaymentPayload() {} }, value));
  }
  const enumerableClient = { async createPaymentPayload() {} };
  enumerableClient.paymentCapabilities = createPaymentCapabilities([validRoute]);
  malformedClients.push(enumerableClient);
  for (const propertyFlags of [{ writable: true }, { configurable: true }]) {
    const client = { async createPaymentPayload() {} };
    Object.defineProperty(client, 'paymentCapabilities', {
      value: createPaymentCapabilities([validRoute]),
      enumerable: false,
      writable: propertyFlags.writable ?? false,
      configurable: propertyFlags.configurable ?? false,
    });
    malformedClients.push(client);
  }

  for (const client of malformedClients) {
    let requests = 0;
    await assert.rejects(paidFetch('https://resource.example/paid', client, async () => {
      requests += 1;
    }), /paymentCapabilities/);
    assert.equal(requests, 0);
  }
  assert.equal(accessorReads, 0);
  assert.equal(routeAccessorReads, 0);
});

test('multi-offer wrappers must explicitly copy immutable capabilities', async () => {
  const exact = new MockExactZenonClient();
  const required = { ...paymentRequired(), accepts: [liveRequirement(), requirement()] };
  const withoutCapabilities = {
    createPaymentPayload: (...args) => exact.createPaymentPayload(...args),
  };
  await assert.rejects(
    paidFetch(required.resource.url, withoutCapabilities, async () => ({
      status: 402,
      url: required.resource.url,
      headers: new Headers({ [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(required) }),
    })),
    /ambiguous/,
  );

  const observations = {};
  const withCapabilities = recordingPaymentClient(exact.paymentCapabilities, observations);
  const result = await completeSelection(required, withCapabilities, observations);
  assert.deepEqual(result.paymentPayload.accepted, requirement());
  assert.equal(observations.constructions, 1);
});

test('resource server rejects non-upfront configuration before downstream effects', () => {
  const variants = [undefined, null, 'authorization', 'escrow', 'unknown', false, 1, {}];
  for (const paymentFlow of variants) {
    const accepted = requirement();
    if (paymentFlow === undefined) delete accepted.extra.paymentFlow;
    else accepted.extra.paymentFlow = paymentFlow;
    const effects = { settle: 0, verify: 0, journal: 0, publication: 0, resource: 0 };
    const facilitator = {
      async verify() {
        effects.verify += 1;
      },
      async settle() {
        effects.settle += 1;
        effects.journal += 1;
        effects.publication += 1;
      },
    };

    assert.throws(() => createResourceServer({
      facilitator,
      requirement: accepted,
      resourceHandler: async () => { effects.resource += 1; },
    }), /paymentFlow/);
    assert.deepEqual(effects, { settle: 0, verify: 0, journal: 0, publication: 0, resource: 0 });
  }
});

test('resource server rejects a submitted requirement without upfront before settlement', async () => {
  const accepted = requirement();
  const required = paymentRequired(accepted);
  const payload = await new MockExactZenonClient().createPaymentPayload(required, accepted);
  delete payload.accepted.extra.paymentFlow;
  let settleCalls = 0;
  let deliveries = 0;
  const app = createResourceServer({
    facilitator: {
      async settle() {
        settleCalls += 1;
      },
    },
    requirement: accepted,
    resourceHandler: async () => { deliveries += 1; },
  });
  const listening = await app.listen();
  try {
    const response = await fetch(`${listening.url}/paid`, {
      headers: { [HEADERS.PAYMENT_SIGNATURE]: encodeB64Json(payload) },
    });
    assert.equal(response.status, 402);
    assert.equal((await response.json()).error, 'invalid_payment_header');
    assert.equal(settleCalls, 0);
    assert.equal(deliveries, 0);
  } finally {
    await app.close();
  }
});

function structurallyValidBlockJson() {
  return {
    version: 1,
    chainIdentifier: 7,
    blockType: 2,
    hash: '1'.repeat(64),
    previousHash: '2'.repeat(64),
    height: 2,
    momentumAcknowledged: { hash: '3'.repeat(64), height: 10 },
    address: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
    toAddress: 'z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f',
    amount: '1',
    tokenStandard: 'zts1qqqqqqqqqqqqtq587y',
    fromBlockHash: '0'.repeat(64),
    data: Buffer.alloc(32).toString('base64'),
    fusedPlasma: 0,
    difficulty: 0,
    nonce: '0'.repeat(16),
    publicKey: Buffer.alloc(32, 1).toString('base64'),
    signature: Buffer.alloc(64, 2).toString('base64'),
  };
}

test('account-block wire validation rejects malformed signed fields', () => {
  assert.doesNotThrow(() => validateAccountBlockJson(structurallyValidBlockJson()));
  const mutations = [
    json => { json.version = 2; },
    json => { json.chainIdentifier = 0; },
    json => { json.blockType = '2'; },
    json => { json.previousHash = 'bad'; },
    json => { json.height = 0; },
    json => { json.momentumAcknowledged.height = -1; },
    json => { json.address = ''; },
    json => { json.toAddress = ''; },
    json => { json.amount = '-1'; },
    json => { json.amount = (1n << 255n).toString(); },
    json => { json.tokenStandard = ''; },
    json => { json.data = Buffer.alloc(33).toString('base64'); },
    json => { json.difficulty = -1; },
    json => { json.nonce = 'xyz'; },
    json => { json.publicKey = Buffer.alloc(31).toString('base64'); },
    json => { json.signature = Buffer.alloc(63).toString('base64'); },
    json => { json.unexpected = true; },
    json => { json.momentumAcknowledged.unexpected = true; },
  ];
  for (const mutate of mutations) {
    const json = structuredClone(structurallyValidBlockJson());
    mutate(json);
    assert.throws(() => validateAccountBlockJson(json));
  }
});

function readyNode(overrides = {}) {
  return {
    stats: {
      networkInfo: async () => ({
        numPeers: 1,
        self: { publicKey: 'test-public-key', ip: 'test-peer-address' },
        peers: [],
      }),
      syncInfo: async () => ({ state: 2, currentHeight: 20, targetHeight: 20 }),
    },
    ledger: {
      getFrontierMomentum: async () => ({ chainIdentifier: 7, height: 20 }),
    },
    ...overrides,
  };
}

const SYNTHETIC_LIVE_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '7',
  genesisMomentumHash: '7'.repeat(64),
});

test('node readiness discovers chain ID but requires exact authenticated chain profile', async () => {
  const fakeSdk = { SyncState: { SyncDone: 2 } };
  const ready = await assertZenonNodeReady(
    readyNode(),
    fakeSdk,
    async () => SYNTHETIC_LIVE_PROFILE,
    SYNTHETIC_LIVE_PROFILE,
  );
  assert.equal(ready.chainId, 7);
  await assert.rejects(
    assertZenonNodeReady(readyNode(), fakeSdk, undefined, SYNTHETIC_LIVE_PROFILE),
    { code: 'node_network_identity_unavailable' },
  );
  await assert.rejects(
    assertZenonNodeReady(
      readyNode(),
      fakeSdk,
      async () => ({ ...SYNTHETIC_LIVE_PROFILE, genesisMomentumHash: '8'.repeat(64) }),
      SYNTHETIC_LIVE_PROFILE,
    ),
    { code: 'connected_node_chain_profile_mismatch' },
  );
});

test('node readiness fails closed for sync, RPC, and malformed responses', async () => {
  const fakeSdk = { SyncState: { SyncDone: 2 } };
  const auth = async () => SYNTHETIC_LIVE_PROFILE;
  await assert.rejects(assertZenonNodeReady(readyNode({
    stats: {
      networkInfo: async () => ({
        numPeers: 1,
        self: { publicKey: 'test-public-key', ip: 'test-peer-address' },
        peers: [],
      }),
      syncInfo: async () => ({ state: 1, currentHeight: 19, targetHeight: 20 }),
    },
  }), fakeSdk, auth, SYNTHETIC_LIVE_PROFILE), { code: 'node_not_synchronized' });
  await assert.rejects(assertZenonNodeReady(readyNode({
    stats: { networkInfo: async () => { throw new Error('offline'); }, syncInfo: async () => ({ state: 2, currentHeight: 20, targetHeight: 20 }) },
  }), fakeSdk, auth, SYNTHETIC_LIVE_PROFILE), { code: 'node_health_unavailable' });
  await assert.rejects(assertZenonNodeReady(readyNode({
    ledger: { getFrontierMomentum: async () => ({ chainIdentifier: '7', height: 20 }) },
  }), fakeSdk, auth, SYNTHETIC_LIVE_PROFILE), { code: 'malformed_frontier_momentum' });
  await assert.rejects(assertZenonNodeReady(readyNode({
    stats: {
      networkInfo: async () => ({ numPeers: 1, self: 'not-a-peer', peers: [] }),
      syncInfo: async () => ({ state: 2, currentHeight: 20, targetHeight: 20 }),
    },
  }), fakeSdk, auth, SYNTHETIC_LIVE_PROFILE), { code: 'malformed_node_network_info' });
  await assert.rejects(assertZenonNodeReady(readyNode({
    stats: {
      networkInfo: async () => ({
        numPeers: 1,
        self: { publicKey: 'test-public-key', ip: 'test-peer-address' },
        peers: [null],
      }),
      syncInfo: async () => ({ state: 2, currentHeight: 20, targetHeight: 20 }),
    },
  }), fakeSdk, auth, SYNTHETIC_LIVE_PROFILE), { code: 'malformed_node_network_info' });
  await assert.rejects(assertZenonNodeReady(readyNode({
    stats: {
      networkInfo: async () => ({ numPeers: 1, self: {}, peers: [] }),
      syncInfo: async () => ({ state: 2, currentHeight: 20, targetHeight: 20 }),
    },
  }), fakeSdk, auth, SYNTHETIC_LIVE_PROFILE), { code: 'malformed_node_network_info' });
  await assert.rejects(assertZenonNodeReady(readyNode({
    stats: {
      networkInfo: async () => ({
        numPeers: 0,
        self: { publicKey: 'test-public-key', ip: 'test-peer-address' },
        peers: [],
      }),
      syncInfo: async () => ({ state: 2, currentHeight: 20, targetHeight: 20 }),
    },
  }), fakeSdk, auth, SYNTHETIC_LIVE_PROFILE), { code: 'malformed_node_network_info' });
});

test('asset validation accepts native assets and requires non-native metadata', async () => {
  let lookups = 0;
  const zenon = { embedded: { token: { getByZts: async tokenStandard => {
    lookups += 1;
    return { tokenStandard };
  } } } };
  await assertAssetExists(zenon, sdk, sdk.ZNN_ZTS);
  assert.equal(lookups, 0);
  const custom = { toString: () => 'zts-custom-test-value' };
  await assertAssetExists(zenon, sdk, custom);
  assert.equal(lookups, 1);
  await assert.rejects(assertAssetExists({ embedded: { token: { getByZts: async () => null } } }, sdk, custom), { code: 'asset_not_found' });
  await assert.rejects(assertAssetExists({ embedded: { token: { getByZts: async () => { throw new Error('offline'); } } } }, sdk, custom), { code: 'asset_lookup_failed' });
});

test('publication is idempotent and reconciles ambiguous publish results', async () => {
  let publishes = 0;
  const existing = { confirmationDetail: undefined };
  const alreadyKnown = await ensurePublished({
    lookup: async () => existing,
    publish: async () => { publishes += 1; },
  });
  assert.equal(alreadyKnown.state, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);
  assert.equal(publishes, 0);

  let lookups = 0;
  const recovered = await ensurePublished({
    lookup: async () => (++lookups === 1 ? null : existing),
    publish: async () => { publishes += 1; throw new Error('response lost'); },
  });
  assert.equal(recovered.state, EVIDENCE_STATES.SUBMISSION_ACKNOWLEDGED);

  const ambiguous = await ensurePublished({
    lookup: async () => null,
    publish: async () => { throw new Error('unknown'); },
  });
  assert.equal(ambiguous.state, EVIDENCE_STATES.SUBMISSION_OUTCOME_UNKNOWN);
});

test('a synchronous pre-publication failure is not classified as an uncertain submission', async () => {
  const error = new Error('local publication setup failed');
  await assert.rejects(
    ensurePublished({
      lookup: async () => null,
      publish: () => { throw error; },
    }),
    candidate => candidate === error,
  );
});

test('Momentum inclusion waiting rejects noncanonical or unbounded timeouts', async () => {
  const options = {
    lookup: async () => null,
    initialObserved: null,
    wake: { wait: async () => {}, close() {} },
  };
  for (const timeoutSeconds of [undefined, 0, -1, '1', Number.NaN, 301, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(
      waitForMomentumInclusion({ ...options, timeoutSeconds }),
      { code: 'invalid_confirmation_timeout' },
    );
  }
});

test('per-payer queue serializes one payer and allows independent payers', async () => {
  const queue = new PerPayerQueue();
  let sameActive = 0;
  let samePeak = 0;
  const samePayer = () => queue.run('payer-a', async () => {
    sameActive += 1;
    samePeak = Math.max(samePeak, sameActive);
    await delay(15);
    sameActive -= 1;
  });
  await Promise.all([samePayer(), samePayer()]);
  assert.equal(samePeak, 1);

  let totalActive = 0;
  let totalPeak = 0;
  const operation = key => queue.run(key, async () => {
    totalActive += 1;
    totalPeak = Math.max(totalPeak, totalActive);
    await delay(15);
    totalActive -= 1;
  });
  await Promise.all([operation('payer-a'), operation('payer-b')]);
  assert.equal(totalPeak, 2);
  await assert.rejects(queue.run('payer-c', async () => { throw new Error('expected'); }));
  await assert.doesNotReject(queue.run('payer-c', async () => {}));
});

test('unconfirmed inspection is bounded, paginated, and fail-closed', async () => {
  const transactionHash = '1'.repeat(64);
  const block = { hash: { toString: () => transactionHash } };
  const requestedPages = [];
  await assert.rejects(assertNoConflictingUnconfirmedBlocks({
    ledger: {
      getUnconfirmedBlocksByAddress: async (_address, page) => {
        requestedPages.push(page);
        return { count: 51, list: Array.from({ length: page === 0 ? 50 : 1 }, () => block) };
      },
    },
    address: {},
    transactionHash,
  }), { code: 'malformed_unconfirmed_blocks' });
  assert.deepEqual(requestedPages, [0, 1]);

  await assert.rejects(assertNoConflictingUnconfirmedBlocks({
    ledger: { getUnconfirmedBlocksByAddress: async () => ({ count: '1', list: [] }) },
    address: {},
    transactionHash,
  }), { code: 'malformed_unconfirmed_blocks' });
  await assert.rejects(assertNoConflictingUnconfirmedBlocks({
    ledger: { getUnconfirmedBlocksByAddress: async () => ({ count: 201, list: [] }) },
    address: {},
    transactionHash,
  }), { code: 'too_many_unconfirmed_blocks' });
  await assert.rejects(assertNoConflictingUnconfirmedBlocks({
    ledger: { getUnconfirmedBlocksByAddress: async () => { throw new Error('unavailable'); } },
    address: {},
    transactionHash,
  }), { code: 'unconfirmed_lookup_failed' });
  await assert.rejects(assertNoConflictingUnconfirmedBlocks({
    ledger: {
      getUnconfirmedBlocksByAddress: async () => {
        const error = new Error('transport unavailable');
        error.code = 'NETWORK_ERROR';
        throw error;
      },
    },
    address: {},
    transactionHash,
  }), { code: 'unconfirmed_lookup_failed' });
  await assert.rejects(assertNoConflictingUnconfirmedBlocks({
    ledger: {
      getUnconfirmedBlocksByAddress: async (_address, page) => {
        if (page === 1) throw new Error('later page unavailable');
        return {
          count: 51,
          list: Array.from({ length: 50 }, (_value, index) => ({
            hash: { toString: () => index.toString(16).padStart(64, '0') },
          })),
        };
      },
    },
    address: {},
    transactionHash,
  }), { code: 'unconfirmed_lookup_failed' });

  let emptySnapshotReads = 0;
  await assert.rejects(assertNoConflictingUnconfirmedBlocks({
    ledger: {
      getUnconfirmedBlocksByAddress: async () => {
        emptySnapshotReads += 1;
        return emptySnapshotReads === 1 ? { count: 0, list: [] } : { count: 1, list: [block] };
      },
    },
    address: {},
    transactionHash,
  }), { code: 'unconfirmed_snapshot_changed' });
});

test('verify and direct settle share offline rejection of a non-testnet live label', async () => {
  const priorAck = process.env.ZENON_LIVE_ACK;
  const priorNetwork = process.env.ZENON_NETWORK_ID;
  process.env.ZENON_LIVE_ACK = 'I_UNDERSTAND_TESTNET_ONLY';
  process.env.ZENON_NETWORK_ID = '3';
  try {
    const wrong = { ...requirement(), network: 'zenon:mainnet' };
    const required = paymentRequired(wrong);
    const payload = {
      x402Version: 2,
      resource: structuredClone(required.resource),
      accepted: structuredClone(wrong),
      payload: {
        transaction: structurallyValidBlockJson(),
        intentDigest: '0'.repeat(64),
      },
    };
    const facilitator = new ExactZenonFacilitator();
    const verification = await facilitator.verify(payload, wrong, required);
    assert.equal(verification.isValid, false);
    assert.equal(verification.invalidReason, 'malformed_payment');
    const result = await facilitator.settle(payload, wrong, required);
    assert.equal(result.success, false);
    assert.equal(result.state, 'VALIDATION_FAILED');
    assert.equal(result.errorReason, 'malformed_payment');
  } finally {
    if (priorAck === undefined) delete process.env.ZENON_LIVE_ACK;
    else process.env.ZENON_LIVE_ACK = priorAck;
    if (priorNetwork === undefined) delete process.env.ZENON_NETWORK_ID;
    else process.env.ZENON_NETWORK_ID = priorNetwork;
  }
});

test('local hash reconstruction matches SDK prepareBlock output', async () => {
  const originalChainId = sdk.Zenon.getChainIdentifier();
  sdk.Zenon.setChainID(7);
  const zenon = sdk.Zenon.getInstance();
  const originalLedger = zenon.ledger;
  const originalEmbedded = zenon.embedded;
  const buyerKey = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 7));
  const sellerKey = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 8));
  try {
    zenon.ledger = {
      getFrontierAccountBlock: async () => null,
      getFrontierMomentum: async () => ({ hash: sdk.Hash.digest(Buffer.from('momentum')), height: 1 }),
    };
    zenon.embedded = { plasma: { getRequiredPoWForAccountBlock: async () => ({ requiredDifficulty: 0, basePlasma: 0 }) } };
    const block = sdk.AccountBlockTemplate.send(sellerKey.getAddress(), sdk.ZNN_ZTS, 1n);
    block.data = Buffer.from(paymentIntentDigest(paymentRequired(), requirement()), 'hex');
    const prepared = await zenon.prepareBlock(block, buyerKey);
    assert.equal(computeBlockHash(prepared, sdk).toString(), prepared.hash.toString());
    assert.equal(ed.verify(prepared.signature, prepared.hash.getBytes(), prepared.publicKey, { zip215: false }), true);
  } finally {
    buyerKey.clear();
    sellerKey.clear();
    zenon.ledger = originalLedger;
    zenon.embedded = originalEmbedded;
    sdk.Zenon.setChainID(originalChainId);
  }
});

test('local hash reconstruction matches varied SDK-generated fields', async () => {
  const originalChainId = sdk.Zenon.getChainIdentifier();
  const originalPowProvider = sdk.Zenon.getPowProvider();
  const zenon = sdk.Zenon.getInstance();
  const originalLedger = zenon.ledger;
  const originalEmbedded = zenon.embedded;
  const buyerKey = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 27));
  const sellerKey = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 28));
  try {
    sdk.Zenon.setChainID(987654);
    sdk.Zenon.setPowProvider(async () => '0102030405060708');
    zenon.ledger = {
      getFrontierAccountBlock: async () => ({ height: 41, hash: sdk.Hash.digest(Buffer.from('previous-frontier')) }),
      getFrontierMomentum: async () => ({ hash: sdk.Hash.digest(Buffer.from('later-momentum')), height: 73 }),
    };
    zenon.embedded = {
      plasma: { getRequiredPoWForAccountBlock: async () => ({ requiredDifficulty: 17, availablePlasma: 123456 }) },
    };
    const amount = MAX_ZENON_AMOUNT;
    const block = sdk.AccountBlockTemplate.send(sellerKey.getAddress(), sdk.QSR_ZTS, amount);
    block.version = 9;
    block.fromBlockHash = sdk.Hash.digest(Buffer.from('non-zero-source'));
    block.data = Buffer.from('varied transaction data');
    const prepared = await zenon.prepareBlock(block, buyerKey);
    assert.equal(prepared.chainIdentifier, 987654);
    assert.equal(prepared.height, 42);
    assert.equal(prepared.fusedPlasma, 123456);
    assert.equal(prepared.difficulty, 17);
    assert.equal(prepared.nonce, '0102030405060708');
    assert.equal(computeBlockHash(prepared, sdk).toString(), prepared.hash.toString());
  } finally {
    buyerKey.clear();
    sellerKey.clear();
    zenon.ledger = originalLedger;
    zenon.embedded = originalEmbedded;
    sdk.Zenon.setChainID(originalChainId);
    if (originalPowProvider) sdk.Zenon.setPowProvider(originalPowProvider);
    else sdk.Zenon.clearPowProvider();
  }
});

async function preparedZenonFixture({ recipient } = {}) {
  const originalChainId = sdk.Zenon.getChainIdentifier();
  sdk.Zenon.setChainID(7);
  const zenonInstance = sdk.Zenon.getInstance();
  const originalLedger = zenonInstance.ledger;
  const originalEmbedded = zenonInstance.embedded;
  const buyerKey = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 17));
  const sellerKey = sdk.KeyPair.fromPrivateKey(Buffer.alloc(32, 18));
  try {
    zenonInstance.ledger = {
      getFrontierAccountBlock: async () => null,
      getFrontierMomentum: async () => ({ hash: sdk.Hash.digest(Buffer.from('fixture-momentum')), height: 1 }),
    };
    zenonInstance.embedded = { plasma: { getRequiredPoWForAccountBlock: async () => ({ requiredDifficulty: 0, basePlasma: 0 }) } };
    const payTo = recipient ?? sellerKey.getAddress();
    const accepted = {
      scheme: 'exact',
      network: 'zenon:testnet',
      asset: sdk.ZNN_ZTS.toString(),
      amount: '1',
      payTo: payTo.toString(),
      maxTimeoutSeconds: 30,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: { ...SYNTHETIC_LIVE_PROFILE },
      },
    };
    const required = paymentRequired(accepted);
    required.resource.url = 'https://example.test/paid';
    const block = sdk.AccountBlockTemplate.send(payTo, sdk.ZNN_ZTS, 1n);
    const intentDigest = paymentIntentDigest(required, accepted);
    block.data = Buffer.from(intentDigest, 'hex');
    const prepared = await zenonInstance.prepareBlock(block, buyerKey);
    return { accepted, required, intentDigest, json: prepared.toJson() };
  } finally {
    buyerKey.clear();
    sellerKey.clear();
    zenonInstance.ledger = originalLedger;
    zenonInstance.embedded = originalEmbedded;
    sdk.Zenon.setChainID(originalChainId);
  }
}

test('offline preflight rejects signed-block semantic and cryptographic tampering', async () => {
  const fixture = await preparedZenonFixture();
  const makePayload = () => ({
    x402Version: 2,
    resource: fixture.required.resource,
    accepted: fixture.accepted,
    payload: { transaction: structuredClone(fixture.json), intentDigest: fixture.intentDigest },
  });
  const good = await preflightZenonPayment(makePayload(), fixture.accepted, fixture.required);
  assert.equal(good.transactionHash, fixture.json.hash);

  const mutations = [
    payload => { payload.payload.transaction.chainIdentifier = 8; },
    payload => { payload.payload.transaction.blockType = sdk.BlockTypeEnum.UserReceive; },
    payload => { payload.payload.transaction.previousHash = '1'.repeat(64); },
    payload => { payload.payload.transaction.height = 2; },
    payload => { payload.payload.transaction.hash = '1'.repeat(64); },
    payload => { payload.payload.transaction.signature = Buffer.alloc(64).toString('base64'); },
    payload => { payload.payload.transaction.publicKey = Buffer.alloc(32, 3).toString('base64'); },
    payload => { payload.payload.transaction.address = fixture.accepted.payTo; },
    payload => { payload.payload.transaction.tokenStandard = sdk.QSR_ZTS.toString(); },
  ];
  for (const mutate of mutations) {
    const payload = makePayload();
    mutate(payload);
    await assert.rejects(preflightZenonPayment(payload, fixture.accepted, fixture.required));
  }
});

test('RPC observations must match the exact preflighted signed block', async () => {
  const fixture = await preparedZenonFixture();
  const payload = {
    x402Version: 2,
    resource: fixture.required.resource,
    accepted: fixture.accepted,
    payload: { transaction: structuredClone(fixture.json), intentDigest: fixture.intentDigest },
  };
  const preflight = await preflightZenonPayment(payload, fixture.accepted, fixture.required);
  const observation = () => {
    const block = sdk.AccountBlockTemplate.fromJson(fixture.json);
    block.publicKey = Buffer.from(fixture.json.publicKey, 'base64');
    block.signature = Buffer.from(fixture.json.signature, 'base64');
    return block;
  };

  assert.equal(validateObservedAccountBlock(observation(), preflight, sdk).hash.toString(), fixture.json.hash);
  const sdkParsedObservation = sdk.AccountBlock.fromJson(fixture.json);
  assert.equal(
    validateObservedAccountBlock(sdkParsedObservation, preflight, sdk).hash.toString(),
    fixture.json.hash,
  );

  const wrongHash = observation();
  wrongHash.hash = sdk.Hash.digest(Buffer.from('wrong-observed-hash'));
  assert.throws(
    () => validateObservedAccountBlock(wrongHash, preflight, sdk),
    { code: 'observed_transaction_mismatch' },
  );

  const alteredAmount = observation();
  alteredAmount.amount += 1n;
  assert.throws(
    () => validateObservedAccountBlock(alteredAmount, preflight, sdk),
    { code: 'observed_transaction_mismatch' },
  );

  const malformedConfirmation = observation();
  malformedConfirmation.confirmationDetail = {
    numConfirmations: 0,
    momentumHeight: 1,
    momentumHash: sdk.Hash.digest(Buffer.from('momentum')),
    momentumTimestamp: 1,
  };
  assert.throws(
    () => validateObservedAccountBlock(malformedConfirmation, preflight, sdk),
    { code: 'malformed_confirmation_detail' },
  );
});

test('Momentum inclusion evidence has a strict normalized schema', () => {
  const momentumHash = 'a'.repeat(64);
  assert.deepEqual(normalizeConfirmationDetail({
    numConfirmations: 2,
    momentumHeight: 123,
    momentumHash,
    momentumTimestamp: 456,
  }), {
    numConfirmations: 2,
    momentumHeight: 123,
    momentumHash,
    momentumTimestamp: 456,
  });
  for (const detail of [
    { numConfirmations: 0, momentumHeight: 123, momentumHash, momentumTimestamp: 456 },
    { numConfirmations: 1, momentumHeight: 0, momentumHash, momentumTimestamp: 456 },
    { numConfirmations: 1, momentumHeight: 123, momentumHash: 'A'.repeat(64), momentumTimestamp: 456 },
    { numConfirmations: 1, momentumHeight: 123, momentumHash, momentumTimestamp: -1 },
  ]) {
    assert.throws(() => normalizeConfirmationDetail(detail), { code: 'malformed_confirmation_detail' });
  }
});

test('live SDK runtime references cannot be reassigned per client or facilitator', () => {
  const authenticator = async () => SYNTHETIC_LIVE_PROFILE;
  const client = new ExactZenonClient({
    mnemonic: 'synthetic-placeholder',
    authenticateChainProfile: authenticator,
    rpcTimeoutMs: 100,
  });
  const facilitator = new ExactZenonFacilitator({
    authenticateChainProfile: authenticator,
    rpcTimeoutMs: 100,
  });
  const clientRuntime = client.runtime;
  const facilitatorRuntime = facilitator.runtime;
  assert.throws(() => { client.runtime = {}; }, TypeError);
  assert.throws(() => { facilitator.runtime = {}; }, TypeError);
  assert.throws(() => { client.authenticateChainProfile = async () => ({}); }, TypeError);
  assert.throws(() => { facilitator.authenticateChainProfile = async () => ({}); }, TypeError);
  assert.throws(() => { facilitator.payerQueue = new PerPayerQueue(); }, TypeError);
  assert.equal(client.runtime, clientRuntime);
  assert.equal(facilitator.runtime, facilitatorRuntime);
  assert.equal(client.authenticateChainProfile, authenticator);
  assert.equal(facilitator.authenticateChainProfile, authenticator);
  assert.equal(Object.getOwnPropertyDescriptor(client, 'mnemonic').enumerable, false);
  assert.equal(Object.getOwnPropertyDescriptor(client, 'mnemonic').writable, false);
  assert.doesNotMatch(JSON.stringify(client), /synthetic-placeholder/);
});

test('offline preflight rejects embedded-contract recipients', async () => {
  const fixture = await preparedZenonFixture({ recipient: sdk.PLASMA_ADDRESS });
  const payload = {
    x402Version: 2,
    resource: fixture.required.resource,
    accepted: fixture.accepted,
    payload: { transaction: structuredClone(fixture.json), intentDigest: fixture.intentDigest },
  };
  await assert.rejects(
    preflightZenonPayment(payload, fixture.accepted, fixture.required),
    { code: 'unsupported_recipient_address' },
  );
});

async function withServer(run) {
  const facilitator = new MockExactZenonFacilitator();
  const app = createResourceServer({ facilitator, requirement: requirement(), port: 0 });
  const listening = await app.listen();
  try {
    await run(`${listening.url}/paid`);
  } finally {
    await app.close();
  }
}

test('HTTP boundary separates malformed payment input from unsupported payment policy', async () => {
  const accepted = requirement();
  const effects = { facilitator: 0, journal: 0, publication: 0, delivery: 0 };
  const app = createResourceServer({
    facilitator: {
      async settle() {
        effects.facilitator += 1;
        effects.journal += 1;
        effects.publication += 1;
        throw new Error('unreachable synthetic settlement');
      },
    },
    requirement: accepted,
    resourceHandler: async () => {
      effects.delivery += 1;
      throw new Error('unreachable synthetic delivery');
    },
  });
  const listening = await app.listen();
  const url = `${listening.url}/paid`;
  const noEffects = () => assert.deepEqual(
    effects,
    { facilitator: 0, journal: 0, publication: 0, delivery: 0 },
  );
  const assertPrivate = response => {
    assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*private\b/i);
    assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*no-store\b/i);
    assert.ok((response.headers.get('vary') ?? '').split(',').map(value => value.trim().toLowerCase())
      .includes(HEADERS.PAYMENT_SIGNATURE));
  };
  const submitHeader = header => fetch(url, {
    headers: header instanceof Headers ? header : { [HEADERS.PAYMENT_SIGNATURE]: header },
  });
  const assertMalformed = async header => {
    const response = await submitHeader(header);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_payment' });
    assert.equal(response.headers.get(HEADERS.PAYMENT_REQUIRED), null);
    assert.equal(response.headers.get(HEADERS.PAYMENT_RESPONSE), null);
    assertPrivate(response);
    noEffects();
  };
  const assertUnsupported = async payload => {
    const response = await submitHeader(encodeB64Json(payload));
    assert.equal(response.status, 402);
    assert.equal(response.headers.get(HEADERS.PAYMENT_RESPONSE), null);
    const required = decodeB64Json(response.headers.get(HEADERS.PAYMENT_REQUIRED));
    assert.equal(required.error, 'invalid_payment_header');
    assertPrivate(response);
    noEffects();
  };

  try {
    const missing = await fetch(url);
    assert.equal(missing.status, 402);
    assert.ok(missing.headers.get(HEADERS.PAYMENT_REQUIRED));
    assert.equal(missing.headers.get(HEADERS.PAYMENT_RESPONSE), null);
    assertPrivate(missing);
    noEffects();

    const required = decodeB64Json(missing.headers.get(HEADERS.PAYMENT_REQUIRED));
    const valid = await new MockExactZenonClient().createPaymentPayload(required, accepted);

    const deep = structuredClone(valid);
    let nested = deep.payload.transaction;
    for (let index = 0; index < 24; index += 1) {
      nested.child = {};
      nested = nested.child;
    }
    const fractionalTransactionNumber = structuredClone(valid);
    fractionalTransactionNumber.payload.transaction.unexpectedNumber = 0.5;
    const unsafeTransactionNumber = structuredClone(valid);
    unsafeTransactionNumber.payload.transaction.unexpectedNumber = Number.MAX_SAFE_INTEGER + 1;

    const malformedPayloads = [
      {},
      { ...valid, x402Version: '2' },
      Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'accepted')),
      Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'payload')),
      { ...valid, accepted: [] },
      { ...valid, payload: [] },
      {
        ...valid,
        accepted: Object.fromEntries(Object.entries(valid.accepted).filter(([key]) => key !== 'amount')),
      },
      { ...valid, accepted: { ...valid.accepted, amount: '01' } },
      { ...valid, accepted: { ...valid.accepted, maxTimeoutSeconds: '30' } },
      { ...valid, accepted: { ...valid.accepted, extra: [] } },
      {
        ...valid,
        accepted: {
          ...valid.accepted,
          extra: { ...valid.accepted.extra, zenonChain: null },
        },
      },
      {
        ...valid,
        accepted: {
          ...valid.accepted,
          extra: {
            ...valid.accepted.extra,
            zenonChain: { ...valid.accepted.extra.zenonChain, genesisMomentumHash: 'A'.repeat(64) },
          },
        },
      },
      { ...valid, payload: { ...valid.payload, transaction: [] } },
      { ...valid, payload: { ...valid.payload, intentDigest: 'A'.repeat(64) } },
      fractionalTransactionNumber,
      unsafeTransactionNumber,
      deep,
    ];

    const duplicate = new Headers();
    duplicate.append(HEADERS.PAYMENT_SIGNATURE, encodeB64Json(valid));
    duplicate.append(HEADERS.PAYMENT_SIGNATURE, encodeB64Json(valid));
    for (const header of [
      duplicate,
      '',
      'not-base64',
      nonCanonicalBase64Alias(encodeB64Json({ x402Version: 2 })),
      Buffer.from([0xc3, 0x28]).toString('base64'),
      Buffer.from('{', 'utf8').toString('base64'),
      Buffer.from('[]', 'utf8').toString('base64'),
      'A'.repeat(9000),
      ...malformedPayloads.map(encodeB64Json),
    ]) {
      await assertMalformed(header);
    }

    const missingResource = structuredClone(valid);
    delete missingResource.resource;
    const missingFlow = structuredClone(valid);
    delete missingFlow.accepted.extra.paymentFlow;
    const nonUpfront = structuredClone(valid);
    nonUpfront.accepted.extra.paymentFlow = 'authorization';
    const malformedFlowPolicy = structuredClone(valid);
    malformedFlowPolicy.accepted.extra.paymentFlow = { unsupported: true };
    const timeoutPolicy = structuredClone(valid);
    timeoutPolicy.accepted.maxTimeoutSeconds = 301;
    const fractionalTimeoutPolicy = structuredClone(valid);
    fractionalTimeoutPolicy.accepted.maxTimeoutSeconds = 0.5;
    const amountPolicy = structuredClone(valid);
    amountPolicy.accepted.amount = (MAX_ZENON_AMOUNT + 1n).toString();
    const networkPolicy = structuredClone(valid);
    networkPolicy.accepted.network = 'zenon:other';
    const schemePolicy = structuredClone(valid);
    schemePolicy.accepted.scheme = 'other';
    const chainPolicy = structuredClone(valid);
    chainPolicy.accepted.network = 'zenon:testnet';
    const mismatch = structuredClone(valid);
    mismatch.accepted.amount = '101';

    for (const payload of [
      { x402Version: 1 },
      missingResource,
      { ...valid, resource: null },
      { ...valid, extensions: {} },
      { ...valid, unexpected: true },
      missingFlow,
      nonUpfront,
      malformedFlowPolicy,
      timeoutPolicy,
      fractionalTimeoutPolicy,
      amountPolicy,
      networkPolicy,
      schemePolicy,
      chainPolicy,
      mismatch,
    ]) {
      await assertUnsupported(payload);
    }
  } finally {
    await app.close();
  }
});
