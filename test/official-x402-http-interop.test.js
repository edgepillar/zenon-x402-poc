import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodePaymentRequiredHeader as officialDecodePaymentRequired,
  decodePaymentResponseHeader as officialDecodePaymentResponse,
  decodePaymentSignatureHeader as officialDecodePaymentSignature,
  encodePaymentRequiredHeader as officialEncodePaymentRequired,
  encodePaymentSignatureHeader as officialEncodePaymentSignature,
} from '@x402/core/http';

import { buildRequirement } from '../src/config.js';
import { MockExactZenonClient, MockExactZenonFacilitator } from '../src/mock-payment.js';
import { createResourceServer } from '../src/resource-server.js';
import {
  HEADERS,
  MOCK_NETWORK,
  decodeB64Json,
  encodeB64Json,
  makePaymentRequired,
  validatePaymentRequired,
} from '../src/x402-wire.js';

const SYNTHETIC_RESOURCE_URL = 'https://interop.example/protected';
const SYNTHETIC_ICON_URL = 'HTTPS://icons.example:443/a%2Fb.png?size=2#mark';

async function syntheticChallenge() {
  const requirement = await buildRequirement('mock');
  const paymentRequired = makePaymentRequired({
    resourceUrl: SYNTHETIC_RESOURCE_URL,
    description: 'Synthetic interoperability resource',
    mimeType: 'application/json',
    serviceName: 'interop-service',
    tags: ['alpha', 'beta', 'alpha'],
    iconUrl: SYNTHETIC_ICON_URL,
    requirement,
  });

  return { paymentRequired, requirement };
}

test('official and local HTTP challenge codecs preserve ResourceInfo and advertised offer order', async () => {
  const { paymentRequired, requirement } = await syntheticChallenge();
  paymentRequired.accepts = [
    { ...requirement, amount: '2' },
    { ...requirement, amount: '1' },
  ];
  validatePaymentRequired(paymentRequired);

  const expected = structuredClone(paymentRequired);
  const officiallyDecoded = officialDecodePaymentRequired(encodeB64Json(paymentRequired));
  const locallyDecoded = decodeB64Json(officialEncodePaymentRequired(paymentRequired));

  assert.deepEqual(officiallyDecoded, expected);
  assert.deepEqual(locallyDecoded, expected);
  assert.deepEqual(locallyDecoded.resource, {
    url: SYNTHETIC_RESOURCE_URL,
    description: 'Synthetic interoperability resource',
    mimeType: 'application/json',
    serviceName: 'interop-service',
    tags: ['alpha', 'beta', 'alpha'],
    iconUrl: SYNTHETIC_ICON_URL,
  });
  assert.deepEqual(locallyDecoded.accepts.map(({ amount }) => amount), ['2', '1']);
  for (const accepted of locallyDecoded.accepts) {
    assert.equal(accepted.scheme, 'exact');
    assert.equal(accepted.network, MOCK_NETWORK);
    assert.equal(accepted.extra.paymentFlow, 'upfront');
  }
  assert.equal(Object.hasOwn(locallyDecoded, 'extensions'), false);
});

test('empty extension containers interoperate without enabling non-empty extensions', async () => {
  const { paymentRequired } = await syntheticChallenge();
  const absentRoundTrip = officialDecodePaymentRequired(encodeB64Json(paymentRequired));
  const withEmptyExtensions = structuredClone(paymentRequired);
  withEmptyExtensions.extensions = {};
  const emptyRoundTrip = decodeB64Json(officialEncodePaymentRequired(withEmptyExtensions));

  assert.equal(Object.hasOwn(absentRoundTrip, 'extensions'), false);
  assert.deepEqual(emptyRoundTrip.extensions, {});
  assert.doesNotThrow(() => validatePaymentRequired(absentRoundTrip));
  assert.doesNotThrow(() => validatePaymentRequired(emptyRoundTrip));

  const unsupported = structuredClone(withEmptyExtensions);
  unsupported.extensions = { 'synthetic-unsupported': {} };
  assert.throws(() => validatePaymentRequired(unsupported));
  assert.equal(Object.hasOwn(paymentRequired, 'extensions'), false);
  assert.deepEqual(withEmptyExtensions.extensions, {});
});

test('official payment encoding reaches local mock settlement while local 400 and 402 policy remains intact', async t => {
  const requirement = await buildRequirement('mock');
  const facilitator = new MockExactZenonFacilitator();
  const paymentClient = new MockExactZenonClient();
  let deliveries = 0;
  const resourceServer = createResourceServer({
    facilitator,
    requirement,
    port: 0,
    host: '127.0.0.1',
    advertisedBaseUrl: 'https://interop.example',
    resourceHandler: async () => {
      deliveries += 1;
      return { ok: true };
    },
  });
  const listener = await resourceServer.listen();
  t.after(async () => resourceServer.close());
  const resourceUrl = `${listener.url}/paid`;

  const unpaidResponse = await fetch(resourceUrl);
  assert.equal(unpaidResponse.status, 402);
  const localChallengeHeader = unpaidResponse.headers.get(HEADERS.PAYMENT_REQUIRED);
  assert.ok(localChallengeHeader);
  const paymentRequired = officialDecodePaymentRequired(localChallengeHeader);
  assert.equal(paymentRequired.accepts.length, 1);
  assert.equal(paymentRequired.accepts[0].scheme, 'exact');
  assert.equal(paymentRequired.accepts[0].network, MOCK_NETWORK);
  assert.equal(paymentRequired.accepts[0].extra.paymentFlow, 'upfront');
  assert.equal(Object.hasOwn(paymentRequired, 'extensions'), false);

  const paymentPayload = await paymentClient.createPaymentPayload(
    paymentRequired,
    paymentRequired.accepts[0],
  );

  const malformedPayload = structuredClone(paymentPayload);
  malformedPayload.extensions = [];
  const malformedResponse = await fetch(resourceUrl, {
    headers: { [HEADERS.PAYMENT_SIGNATURE]: encodeB64Json(malformedPayload) },
  });
  assert.equal(malformedResponse.status, 400);
  assert.equal(malformedResponse.headers.get(HEADERS.PAYMENT_REQUIRED), null);
  assert.equal(malformedResponse.headers.get(HEADERS.PAYMENT_RESPONSE), null);
  assert.equal(facilitator.records.size, 0);
  assert.equal(deliveries, 0);

  const unsupportedPayload = structuredClone(paymentPayload);
  unsupportedPayload.extensions = { 'synthetic-unsupported': {} };
  const unsupportedHeader = officialEncodePaymentSignature(unsupportedPayload);
  assert.deepEqual(
    officialDecodePaymentSignature(unsupportedHeader).extensions,
    unsupportedPayload.extensions,
  );
  const unsupportedResponse = await fetch(resourceUrl, {
    headers: { [HEADERS.PAYMENT_SIGNATURE]: unsupportedHeader },
  });
  assert.equal(unsupportedResponse.status, 402);
  assert.ok(unsupportedResponse.headers.get(HEADERS.PAYMENT_REQUIRED));
  assert.equal(unsupportedResponse.headers.get(HEADERS.PAYMENT_RESPONSE), null);
  assert.equal(facilitator.records.size, 0);
  assert.equal(deliveries, 0);

  const emptyPayload = structuredClone(paymentPayload);
  emptyPayload.extensions = {};
  const officialPaymentHeader = officialEncodePaymentSignature(emptyPayload);
  assert.deepEqual(officialDecodePaymentSignature(officialPaymentHeader).extensions, {});
  const paidResponse = await fetch(resourceUrl, {
    headers: { [HEADERS.PAYMENT_SIGNATURE]: officialPaymentHeader },
  });
  assert.equal(paidResponse.status, 200);
  assert.deepEqual(await paidResponse.json(), { ok: true });
  assert.equal(facilitator.records.size, 1);
  const [settlementRecord] = facilitator.records.values();
  assert.equal(settlementRecord.deliveryState, 'DELIVERED');
  assert.ok(settlementRecord.cachedResponse);
  assert.equal(settlementRecord.cachedResponse.status, 200);
  assert.deepEqual(settlementRecord.cachedResponse.body, { ok: true });
  assert.equal(deliveries, 1);

  const localPaymentResponseHeader = paidResponse.headers.get(HEADERS.PAYMENT_RESPONSE);
  assert.ok(localPaymentResponseHeader);
  const paymentResponse = officialDecodePaymentResponse(localPaymentResponseHeader);
  assert.equal(paymentResponse.success, true);
  assert.equal(paymentResponse.network, MOCK_NETWORK);
  assert.equal(typeof paymentResponse.transaction, 'string');
  assert.equal(Object.hasOwn(paymentResponse, 'extensions'), false);

  // HTTP 409 remains a PoC-specific uncertain-settlement lane, not an official codec claim.
});
