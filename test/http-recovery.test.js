import test from 'node:test';
import assert from 'node:assert/strict';
import { paidFetch, PaymentSubmissionOutcomeUnknownError } from '../src/buyer.js';
import { createResourceServer } from '../src/resource-server.js';
import { MockExactZenonClient, MockExactZenonFacilitator } from '../src/mock-payment.js';
import { buildRequirement } from '../src/config.js';
import { decodeB64Json, encodeB64Json, HEADERS } from '../src/x402-wire.js';

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

test('malformed payment header remains a safe 402 boundary failure', async () => {
  const facilitator = new MockExactZenonFacilitator();
  const requirement = await buildRequirement('mock');
  const app = createResourceServer({ facilitator, requirement });
  const listening = await app.listen();
  try {
    const response = await fetch(`${listening.url}/paid`, {
      headers: { [HEADERS.PAYMENT_SIGNATURE]: 'not canonical base64!' },
    });
    assert.equal(response.status, 402);
    assertPaidResponseIsPrivate(response);
    assert.equal((await response.json()).error, 'invalid_payment_header');
    assert.ok(response.headers.get(HEADERS.PAYMENT_REQUIRED));
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

test('paid resource fails closed without a positive durable delivery claim', async () => {
  const requirement = await buildRequirement('mock');
  let deliveries = 0;
  const facilitator = {
    async settle(paymentPayload) {
      return {
        success: true,
        network: requirement.network,
        transaction: paymentPayload.payload.transaction.hash,
        payer: paymentPayload.payload.transaction.address,
        state: 'MOMENTUM_INCLUDED',
        authorizationKey: 'a'.repeat(64),
        deliveryState: 'NONE',
      };
    },
    async markDeliveryPending() {
      return { deliveryState: 'DELIVERY_PENDING', deliveryClaimed: false };
    },
    async markDelivered() {
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
    assert.equal(response.status, 402);
    assert.equal((await response.json()).error, 'invalid_payment_header');
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

function challengeResponse(paymentRequired) {
  return {
    status: 402,
    url: paymentRequired.resource.url,
    headers: new Headers({ [HEADERS.PAYMENT_REQUIRED]: encodeB64Json(paymentRequired) }),
  };
}

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
