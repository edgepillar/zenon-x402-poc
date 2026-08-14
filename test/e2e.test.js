import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceServer } from '../src/resource-server.js';
import { MockExactZenonClient, MockExactZenonFacilitator } from '../src/mock-payment.js';
import { paidFetch } from '../src/buyer.js';
import { buildRequirement } from '../src/config.js';
import { decodeB64Json, HEADERS } from '../src/x402-wire.js';

test('x402 v2 wire flow: 402 -> signed payment -> settlement -> resource', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  const app = createResourceServer({ facilitator, requirement, port: 0 });
  const listening = await app.listen();
  try {
    const first = await fetch(`${listening.url}/paid`);
    assert.equal(first.status, 402);
    const pr = decodeB64Json(first.headers.get(HEADERS.PAYMENT_REQUIRED));
    assert.equal(pr.x402Version, 2);
    assert.equal(pr.accepts[0].scheme, 'exact');

    const buyer = new MockExactZenonClient();
    const result = await paidFetch(`${listening.url}/paid`, buyer);
    assert.equal(result.response.status, 200);
    assert.equal(result.settlement.success, true);
    assert.match(result.settlement.transaction, /^[a-f0-9]{64}$/);
    const body = await result.response.json();
    assert.equal(body.ok, true);
    assert.equal(body.payer, buyer.address);
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
