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
