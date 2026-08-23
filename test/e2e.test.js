import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceServer } from '../src/resource-server.js';
import { MockExactZenonClient, MockExactZenonFacilitator } from '../src/mock-payment.js';
import { paidFetch } from '../src/buyer.js';
import { buildRequirement } from '../src/config.js';
import { paymentIntentDigest } from '../src/canonical.js';
import { decodeB64Json, encodeB64Json, HEADERS } from '../src/x402-wire.js';

test('x402 v2 wire flow: 402 -> signed payment -> settlement -> resource', async () => {
  const exact = new MockExactZenonFacilitator();
  const events = [];
  let settleCalls = 0;
  let verifyCalls = 0;
  let submittedRequirement;
  let submittedPaymentRequired;
  const facilitator = {
    async settle(payload, selected, paymentRequired) {
      settleCalls += 1;
      events.push('settle');
      submittedRequirement = structuredClone(selected);
      submittedPaymentRequired = structuredClone(paymentRequired);
      return exact.settle(payload, selected, paymentRequired);
    },
    async verify(...args) {
      verifyCalls += 1;
      return exact.verify(...args);
    },
    markDeliveryPending: (...args) => exact.markDeliveryPending(...args),
    markDelivered: (...args) => exact.markDelivered(...args),
  };
  const requirement = await buildRequirement('mock');
  const app = createResourceServer({
    facilitator,
    requirement,
    port: 0,
    resourceHandler: async ({ settlement }) => {
      events.push('resource');
      return { ok: true, payer: settlement.payer };
    },
  });
  const listening = await app.listen();
  try {
    const first = await fetch(`${listening.url}/paid`);
    assert.equal(first.status, 402);
    const pr = decodeB64Json(first.headers.get(HEADERS.PAYMENT_REQUIRED));
    assert.equal(pr.x402Version, 2);
    assert.equal(pr.accepts[0].scheme, 'exact');
    assert.equal(pr.accepts[0].extra.paymentFlow, 'upfront');

    const buyer = new MockExactZenonClient();
    const result = await paidFetch(`${listening.url}/paid`, buyer);
    events.push('response');
    assert.equal(result.response.status, 200);
    assert.equal(result.settlement.success, true);
    assert.match(result.settlement.transaction, /^[a-f0-9]{64}$/);
    assert.equal(result.paymentRequired.accepts[0].extra.paymentFlow, 'upfront');
    assert.equal(result.paymentPayload.accepted.extra.paymentFlow, 'upfront');
    assert.equal(submittedRequirement.extra.paymentFlow, 'upfront');
    assert.equal(submittedPaymentRequired.accepts[0].extra.paymentFlow, 'upfront');
    const intentDigest = paymentIntentDigest(result.paymentRequired, result.paymentPayload.accepted);
    assert.equal(result.paymentPayload.payload.intentDigest, intentDigest);
    assert.equal(result.paymentPayload.payload.transaction.data, intentDigest);
    assert.equal(settleCalls, 1);
    assert.equal(verifyCalls, 0);
    assert.deepEqual(events, ['settle', 'resource', 'response']);
    const body = await result.response.json();
    assert.equal(body.ok, true);
    assert.equal(body.payer, buyer.address);
  } finally {
    await app.close();
  }
});

test('mixed offers select the supported mock route before settlement and delivery', async () => {
  const exact = new MockExactZenonFacilitator();
  const events = [];
  let settlements = 0;
  let verifications = 0;
  let deliveries = 0;
  const facilitator = {
    async settle(...args) {
      settlements += 1;
      events.push('settle');
      return exact.settle(...args);
    },
    async verify(...args) {
      verifications += 1;
      return exact.verify(...args);
    },
    markDeliveryPending: (...args) => exact.markDeliveryPending(...args),
    markDelivered: (...args) => exact.markDelivered(...args),
  };
  const requirement = await buildRequirement('mock');
  const app = createResourceServer({
    facilitator,
    requirement,
    port: 0,
    resourceHandler: async () => {
      deliveries += 1;
      events.push('resource');
      return { ok: true };
    },
  });
  const listening = await app.listen();
  let requests = 0;
  try {
    const fetchImpl = async (url, options) => {
      requests += 1;
      const response = await fetch(url, options);
      if (options) return response;
      const required = decodeB64Json(response.headers.get(HEADERS.PAYMENT_REQUIRED));
      const unsupported = {
        scheme: 'other',
        network: 'other:test',
        asset: 'asset',
        amount: '1',
        payTo: 'recipient',
        maxTimeoutSeconds: 30,
        extra: null,
      };
      return {
        status: response.status,
        url: response.url,
        headers: new Headers({
          [HEADERS.PAYMENT_REQUIRED]: encodeB64Json({
            ...required,
            accepts: [unsupported, ...required.accepts],
          }),
        }),
      };
    };

    const result = await paidFetch(`${listening.url}/paid`, new MockExactZenonClient(), fetchImpl);
    events.push('response');
    assert.equal(result.response.status, 200);
    assert.equal(result.paymentRequired.accepts.length, 2);
    assert.deepEqual(result.paymentPayload.accepted, requirement);
    assert.equal(requests, 2);
    assert.equal(settlements, 1);
    assert.equal(verifications, 0);
    assert.equal(deliveries, 1);
    assert.deepEqual(events, ['settle', 'resource', 'response']);
  } finally {
    await app.close();
  }
});

test('tampered recipient is rejected', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  const paymentRequired = {
    x402Version: 2,
    resource: { url: 'http://example.test/paid', description: 'x', mimeType: 'application/json' },
    accepts: [requirement],
  };
  const buyer = new MockExactZenonClient();
  const payload = await buyer.createPaymentPayload(paymentRequired, requirement);
  payload.payload.transaction.toAddress = 'attacker';
  const result = await facilitator.verify(payload, requirement, paymentRequired);
  assert.equal(result.isValid, false);
});

test('same signed payment settles idempotently in one facilitator process', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  const paymentRequired = {
    x402Version: 2,
    resource: { url: 'http://example.test/paid', description: 'x', mimeType: 'application/json' },
    accepts: [requirement],
  };
  const buyer = new MockExactZenonClient();
  const payload = await buyer.createPaymentPayload(paymentRequired, requirement);
  const a = await facilitator.settle(payload, requirement, paymentRequired);
  const b = await facilitator.settle(payload, requirement, paymentRequired);
  assert.equal(a.success, true);
  assert.equal(b.success, true);
  assert.equal(b.transaction, a.transaction);
  assert.equal(b.authorizationKey, a.authorizationKey);
  assert.equal(facilitator.records.size, 1);
});
