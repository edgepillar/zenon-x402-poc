import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  InMemoryServiceCreditModel,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
  SERVICE_CREDIT_STATE_SCHEMA_VERSION,
} from '../src/service-credit-model.js';
import {
  createMockServiceCreditActivation,
  deriveServiceCreditResourceBinding,
} from '../src/service-credit-activation.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import {
  MockExactZenonClient,
  MockExactZenonFacilitator,
} from '../src/mock-payment.js';
import {
  MOCK_NETWORK,
  MOCK_ZENON_CHAIN_PROFILE,
} from '../src/x402-wire.js';
import { canonicalJson } from '../src/canonical.js';

const NOW = 2_000_000_000_000;
const RESOURCE_URL = 'https://service.example/credits/fund';

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function canonicalCommitment(domain, value) {
  return `sha256:${createHash('sha256')
    .update(Buffer.from(`${domain}\0`, 'ascii'))
    .update(Buffer.from(canonicalJson(value), 'utf8'))
    .digest('hex')}`;
}

function authorityProfile(overrides = {}) {
  return {
    profileId: 'authority.mock.reference',
    profileVersion: 1,
    verifierVersion: 1,
    recordDigest: digest('d'),
    ...overrides,
  };
}

function offer(overrides = {}) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.funding',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.funding',
      resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.reference',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.mock',
    fundingPolicyVersion: 1,
    ...overrides,
  };
}

function intent(overrides = {}) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.funding',
    offerId: 'offer.reference',
    offerVersion: 1,
    holderId: 'holder.reference',
    capabilityCommitment: digest('a'),
    totalUnits: 10,
    expiresAt: NOW + 10_000,
    ...overrides,
  };
}

function requirement(overrides = {}) {
  return {
    scheme: 'exact',
    network: MOCK_NETWORK,
    asset: 'zts1mockasset',
    amount: '7',
    payTo: 'mock-payee',
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: { ...MOCK_ZENON_CHAIN_PROFILE },
    },
    ...overrides,
  };
}

function setupModel(verifySettlement, now = () => NOW) {
  const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  model.registerOffer(offer());
  const facilitator = new MockExactZenonFacilitator();
  const activation = createMockServiceCreditActivation({
    store: model,
    verifySettlement: verifySettlement ?? facilitator.settle.bind(facilitator),
    authorityProfile: authorityProfile(),
    now,
  });
  return { activation, facilitator, model };
}

function sqliteSetup(t, testHooks = undefined) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'service-credit-activation-')));
  chmodSync(directory, 0o700);
  const configuration = {
    databasePath: join(directory, 'ledger.sqlite'),
    allowedRoot: directory,
    deriveCost: () => 1,
    now: () => NOW,
    ...(testHooks ? { testHooks } : {}),
  };
  const store = ServiceCreditSqliteStore.create(configuration);
  store.registerOffer(offer());
  const facilitator = new MockExactZenonFacilitator();
  const activation = createMockServiceCreditActivation({
    store,
    verifySettlement: facilitator.settle.bind(facilitator),
    authorityProfile: authorityProfile(),
    now: () => NOW,
  });
  t.after(() => {
    try { store.close(); } catch {}
    rmSync(directory, { recursive: true, force: true });
  });
  return { activation, configuration, directory, facilitator, store };
}

async function expectCode(operation, code) {
  await assert.rejects(operation, error => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, code);
    return true;
  });
}

async function paymentFor(activation, activationIntent = intent(), accepted = requirement()) {
  const client = new MockExactZenonClient();
  const boundIntent = { ...activationIntent, holderId: client.address };
  const prepared = activation.createFundingResource({
    intent: boundIntent,
    requirement: accepted,
    resourceUrl: RESOURCE_URL,
  });
  const paymentRequired = {
    x402Version: 2,
    resource: prepared.resource,
    accepts: [accepted],
  };
  const paymentPayload = await client.createPaymentPayload(paymentRequired, accepted);
  return { activationIntent: boundIntent, paymentPayload, paymentRequired, prepared };
}

test('service-credit settlement activation is explicitly versioned behind state schema v2', () => {
  assert.equal(SERVICE_CREDIT_ACTIVATION_VERSION, 1);
  assert.equal(SERVICE_CREDIT_STATE_SCHEMA_VERSION, 2);
  assert.equal(typeof createMockServiceCreditActivation, 'function');
});

test('the activation module imports without constructing a verifier or performing effects', () => {
  assert.equal(typeof createMockServiceCreditActivation, 'function');
});

test('one exact mock funding settlement atomically creates a bound activation and ACTIVE grant', async () => {
  const { activation, model } = setupModel();
  const payment = await paymentFor(activation);
  const result = await activation.activate({
    intent: payment.activationIntent,
    paymentRequired: payment.paymentRequired,
    paymentPayload: payment.paymentPayload,
  });

  assert.match(result.activation.activationId, /^activation_[0-9a-f]{64}$/);
  assert.match(result.grant.grantId, /^grant_[0-9a-f]{64}$/);
  assert.equal(result.grant.activationId, result.activation.activationId);
  assert.equal(result.grant.lifecycle, 'ACTIVE');
  assert.equal(result.activation.grantFundingCommitment, payment.prepared.fundingCommitment);
  assert.equal(
    result.activation.paymentRequirementDigest,
    canonicalCommitment(
      'zenon-x402-service-credit-payment-requirement-v1',
      payment.paymentRequired.accepts[0],
    ),
  );
  assert.equal(result.activation.network, MOCK_NETWORK);
  assert.deepEqual(result.activation.chainProfile, MOCK_ZENON_CHAIN_PROFILE);
  assert.equal(result.activation.evidenceState, 'MOMENTUM_INCLUDED');
  assert.deepEqual(model.getActivation(result.activation.activationId), result.activation);

  const serialized = JSON.stringify(model.exportState());
  assert.equal(serialized.includes(payment.paymentPayload.payload.transaction.publicKey), false);
  assert.equal(serialized.includes(payment.paymentPayload.payload.transaction.signature), false);
});

test('SQLite restart and explicit exact re-verification preserve one activation with zero revision replay', async t => {
  const ledger = sqliteSetup(t);
  const payment = await paymentFor(ledger.activation);
  const first = await ledger.activation.activate({
    intent: payment.activationIntent,
    paymentRequired: payment.paymentRequired,
    paymentPayload: payment.paymentPayload,
  });
  const revision = ledger.store.getMetadata().revision;
  const replay = await ledger.activation.activate({
    intent: payment.activationIntent,
    paymentRequired: payment.paymentRequired,
    paymentPayload: payment.paymentPayload,
  });
  assert.deepEqual(replay, first);
  assert.equal(ledger.store.getMetadata().revision, revision);
  ledger.store.close();

  const reopened = ServiceCreditSqliteStore.openExisting({
    databasePath: ledger.configuration.databasePath,
    allowedRoot: ledger.configuration.allowedRoot,
    deriveCost: () => 1,
    now: () => NOW,
  });
  const freshVerifier = new MockExactZenonFacilitator();
  const recoveredActivation = createMockServiceCreditActivation({
    store: reopened,
    verifySettlement: freshVerifier.settle.bind(freshVerifier),
    authorityProfile: authorityProfile(),
    now: () => NOW,
  });
  const recovered = await recoveredActivation.activate({
    intent: payment.activationIntent,
    paymentRequired: payment.paymentRequired,
    paymentPayload: payment.paymentPayload,
  });
  assert.deepEqual(recovered, first);
  assert.equal(reopened.getMetadata().revision, revision);
  reopened.close();
});

test('every caller-controlled grant term is payer-signed and any changed term rejects before mutation', async t => {
  const changes = [
    ['model version', { modelVersion: 2 }],
    ['activation version', { activationVersion: 2 }],
    ['provider', { providerId: 'provider.changed' }],
    ['service', { serviceId: 'service.changed' }],
    ['resource', { resourceId: 'resource.changed' }],
    ['offer id', { offerId: 'offer.changed' }],
    ['offer version', { offerVersion: 2 }],
    ['holder', { holderId: 'holder.changed' }],
    ['capability', { capabilityCommitment: digest('b') }],
    ['total units', { totalUnits: 11 }],
    ['expiry', { expiresAt: NOW + 20_000 }],
  ];
  for (const [name, change] of changes) {
    await t.test(name, async () => {
      let verifierCalls = 0;
      const facilitator = new MockExactZenonFacilitator();
      const { activation, model } = setupModel(async (...args) => {
        verifierCalls += 1;
        return facilitator.settle(...args);
      });
      const payment = await paymentFor(activation);
      await expectCode(
        () => activation.activate({
          intent: { ...payment.activationIntent, ...change },
          paymentRequired: payment.paymentRequired,
          paymentPayload: payment.paymentPayload,
        }),
        change.modelVersion || change.activationVersion
          ? 'SERVICE_CREDIT_ACTIVATION_INVALID_INPUT'
          : 'SERVICE_CREDIT_ACTIVATION_REJECTED',
      );
      assert.equal(model.exportState().grants.length, 0);
      assert.equal(verifierCalls, 0);
    });
  }
});

test('plain asserted, transaction-only, partial, and changed mock evidence never authorize credit', async t => {
  const cases = [
    ['plain assertion', async () => ({ verified: true })],
    ['transaction only', async (...args) => ({
      transaction: args[0].payload.transaction.hash,
    })],
    ['wrong evidence state', async (...args) => {
      const facilitator = new MockExactZenonFacilitator();
      return { ...(await facilitator.settle(...args)), state: 'SUBMISSION_ACKNOWLEDGED' };
    }],
    ['wrong delivery state', async (...args) => {
      const facilitator = new MockExactZenonFacilitator();
      return { ...(await facilitator.settle(...args)), deliveryState: 'DELIVERED' };
    }],
    ['extra verifier field', async (...args) => {
      const facilitator = new MockExactZenonFacilitator();
      return { ...(await facilitator.settle(...args)), asserted: true };
    }],
  ];
  for (const [name, verifier] of cases) {
    await t.test(name, async () => {
      const { activation, model } = setupModel(verifier);
      const payment = await paymentFor(activation);
      await expectCode(
        () => activation.activate({
          intent: payment.activationIntent,
          paymentRequired: payment.paymentRequired,
          paymentPayload: payment.paymentPayload,
        }),
        'SERVICE_CREDIT_ACTIVATION_REJECTED',
      );
      assert.equal(model.exportState().grants.length, 0);
    });
  }
});

test('a verifier replaced after adapter construction cannot bypass mock signature validation', async () => {
  const { activation, facilitator, model } = setupModel();
  const payment = await paymentFor(activation);
  const honestVerification = await facilitator.verify(
    payment.paymentPayload,
    payment.paymentRequired.accepts[0],
    payment.paymentRequired,
  );
  const invalidPayload = structuredClone(payment.paymentPayload);
  const signature = invalidPayload.payload.transaction.signature;
  invalidPayload.payload.transaction.signature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  facilitator.verify = async () => honestVerification;
  assert.equal(Object.hasOwn(facilitator, 'verify'), true);

  await expectCode(
    () => activation.activate({
      intent: payment.activationIntent,
      paymentRequired: payment.paymentRequired,
      paymentPayload: invalidPayload,
    }),
    'SERVICE_CREDIT_ACTIVATION_REJECTED',
  );
  assert.equal(model.exportState().grants.length, 0);
});

test('expiry is checked before settlement and again after positive settlement evidence', async t => {
  await t.test('already expired', async () => {
    let verifierCalls = 0;
    const { activation, model } = setupModel(async () => {
      verifierCalls += 1;
      return {};
    });
    const payment = await paymentFor(activation, intent({ expiresAt: NOW + 1 }));
    await expectCode(
      () => activation.activate({
        intent: { ...payment.activationIntent, expiresAt: NOW },
        paymentRequired: payment.paymentRequired,
        paymentPayload: payment.paymentPayload,
      }),
      'SERVICE_CREDIT_ACTIVATION_REJECTED',
    );
    assert.equal(verifierCalls, 0);
    assert.equal(model.exportState().grants.length, 0);
  });

  await t.test('crosses expiry after verification', async () => {
    const clock = { value: NOW };
    const facilitator = new MockExactZenonFacilitator();
    const { model, activation } = setupModel(async (...args) => {
      const evidence = await facilitator.settle(...args);
      clock.value = NOW + 10_000;
      return evidence;
    }, () => clock.value);
    const payment = await paymentFor(activation);
    await expectCode(
      () => activation.activate({
        intent: payment.activationIntent,
        paymentRequired: payment.paymentRequired,
        paymentPayload: payment.paymentPayload,
      }),
      'SERVICE_CREDIT_ACTIVATION_SETTLED_NOT_GRANTED',
    );
    assert.equal(model.exportState().grants.length, 0);
  });
});

test('wrong flow, network, profile, confirmation policy, or funding descriptor fails closed', async t => {
  const { activation, model } = setupModel();
  const payment = await paymentFor(activation);
  const cases = [
    ['flow', value => { value.paymentRequired.accepts[0].extra.paymentFlow = 'authorization'; }],
    ['network', value => { value.paymentRequired.accepts[0].network = 'zenon:testnet'; }],
    ['profile', value => { value.paymentRequired.accepts[0].extra.zenonChain.chainIdentifier = '7'; }],
    ['confirmation', value => { value.paymentRequired.accepts[0].extra.minimumMomentumConfirmations = 2; }],
    ['funding tag', value => { value.paymentRequired.resource.tags[1] = '0'.repeat(32); }],
    ['payload resource', value => { value.paymentPayload.resource.tags[2] = '0'.repeat(32); }],
    ['payment intent', value => { value.paymentPayload.payload.intentDigest = '0'.repeat(64); }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const candidate = structuredClone({
        paymentRequired: payment.paymentRequired,
        paymentPayload: payment.paymentPayload,
      });
      mutate(candidate);
      await expectCode(
        () => activation.activate({
          intent: payment.activationIntent,
          paymentRequired: candidate.paymentRequired,
          paymentPayload: candidate.paymentPayload,
        }),
        'SERVICE_CREDIT_ACTIVATION_REJECTED',
      );
      assert.equal(model.exportState().grants.length, 0);
    });
  }
});

test('malformed, Proxy, accessor-backed, and expanded public inputs are rejected before authority', async t => {
  let verifierCalls = 0;
  const { activation, model } = setupModel(async () => {
    verifierCalls += 1;
    return {};
  });
  const payment = await paymentFor(activation);
  const accessorIntent = { ...payment.activationIntent };
  Object.defineProperty(accessorIntent, 'totalUnits', {
    enumerable: true,
    get() { throw new Error('must-not-run'); },
  });
  const cases = [
    null,
    new Proxy({
      intent: payment.activationIntent,
      paymentRequired: payment.paymentRequired,
      paymentPayload: payment.paymentPayload,
    }, {}),
    {
      intent: accessorIntent,
      paymentRequired: payment.paymentRequired,
      paymentPayload: payment.paymentPayload,
    },
    {
      intent: payment.activationIntent,
      paymentRequired: payment.paymentRequired,
      paymentPayload: payment.paymentPayload,
      verified: true,
    },
    {
      intent: { ...payment.activationIntent, bearerProof: 'forbidden' },
      paymentRequired: payment.paymentRequired,
      paymentPayload: payment.paymentPayload,
    },
  ];
  for (const candidate of cases) {
    await expectCode(
      () => activation.activate(candidate),
      'SERVICE_CREDIT_ACTIVATION_INVALID_INPUT',
    );
  }
  assert.equal(verifierCalls, 0);
  assert.equal(model.exportState().grants.length, 0);
});

test('nested primitive __proto__ collisions reject before verifier or store mutation', async t => {
  for (const [name, select] of [
    ['payment resource', value => value.paymentRequired.resource],
    ['signed transaction', value => value.paymentPayload.payload.transaction],
  ]) {
    await t.test(name, async () => {
      let verifierCalls = 0;
      const facilitator = new MockExactZenonFacilitator();
      const { activation, model } = setupModel(async (...args) => {
        verifierCalls += 1;
        return facilitator.settle(...args);
      });
      const payment = await paymentFor(activation);
      const candidate = structuredClone({
        paymentRequired: payment.paymentRequired,
        paymentPayload: payment.paymentPayload,
      });
      Object.defineProperty(select(candidate), '__proto__', {
        configurable: true,
        enumerable: true,
        value: 'must-not-disappear',
        writable: true,
      });
      await expectCode(
        () => activation.activate({
          intent: payment.activationIntent,
          paymentRequired: candidate.paymentRequired,
          paymentPayload: candidate.paymentPayload,
        }),
        'SERVICE_CREDIT_ACTIVATION_INVALID_INPUT',
      );
      assert.equal(verifierCalls, 0);
      assert.equal(model.exportState().grants.length, 0);
    });
  }
});

test('before-commit failure rolls back; post-commit ambiguity is quarantined and recovers only by reopen', async t => {
  await t.test('before commit', async t => {
    let armed = false;
    const ledger = sqliteSetup(t, {
      beforeCommit({ operation }) {
        if (armed && operation === 'activateGrantFromTrustedRecord') throw new Error('synthetic');
      },
    });
    const payment = await paymentFor(ledger.activation);
    const before = ledger.store.load();
    armed = true;
    await expectCode(
      () => ledger.activation.activate({
        intent: payment.activationIntent,
        paymentRequired: payment.paymentRequired,
        paymentPayload: payment.paymentPayload,
      }),
      'SERVICE_CREDIT_ACTIVATION_SETTLED_NOT_GRANTED',
    );
    armed = false;
    assert.deepEqual(ledger.store.load(), before);
  });

  await t.test('after commit', async t => {
    let armed = false;
    const ledger = sqliteSetup(t, {
      afterCommit({ operation }) {
        if (armed && operation === 'activateGrantFromTrustedRecord') throw new Error('synthetic');
      },
    });
    const payment = await paymentFor(ledger.activation);
    const revision = ledger.store.getMetadata().revision;
    armed = true;
    await expectCode(
      () => ledger.activation.activate({
        intent: payment.activationIntent,
        paymentRequired: payment.paymentRequired,
        paymentPayload: payment.paymentPayload,
      }),
      'SERVICE_CREDIT_ACTIVATION_OUTCOME_UNKNOWN',
    );
    assert.throws(
      () => ledger.store.load(),
      error => error?.code === 'SERVICE_CREDIT_STORE_CLOSED',
    );

    const reopened = ServiceCreditSqliteStore.openExisting({
      databasePath: ledger.configuration.databasePath,
      allowedRoot: ledger.configuration.allowedRoot,
      deriveCost: () => 1,
      now: () => NOW,
    });
    assert.equal(reopened.getMetadata().revision, revision + 1);
    assert.equal(reopened.load().state.grants.length, 1);
    reopened.close();
  });
});

test('activation stays import-safe and isolated from live, wallet, RPC, HTTP, and CLI modules', () => {
  const source = readFileSync(new URL('../src/service-credit-activation.js', import.meta.url), 'utf8');
  for (const forbidden of [
    'zenon-payment.js',
    'service-credit-http.js',
    'resource-server.js',
    'wallet',
    'publishRawTransaction',
    'process.env',
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});
