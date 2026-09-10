import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

import { canonicalJson, paymentIntentDigest } from '../src/canonical.js';
import {
  InMemoryServiceCreditModel,
  SERVICE_CREDIT_ACTIVATION_VERSION,
  SERVICE_CREDIT_MODEL_VERSION,
  SERVICE_CREDIT_ZENON_ACTIVATION_RECORD_VERSION,
} from '../src/service-credit-model.js';
import {
  createZenonFundingEvidenceActivation,
} from '../src/service-credit-zenon-funding-evidence.js';
import {
  deriveServiceCreditResourceBinding,
} from '../src/service-credit-activation.js';
import { ServiceCreditSqliteStore } from '../src/service-credit-sqlite-store.js';
import { EXPERIMENTAL_LIVE_NETWORK } from '../src/x402-wire.js';

const NOW = 2_000_000_000_000;
const RESOURCE_URL = 'https://service.example/credits/zenon-fund';
const TRANSACTION_HASH = 'c'.repeat(64);
const MOMENTUM_HASH = 'e'.repeat(64);
const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '12345',
  genesisMomentumHash: '1'.repeat(64),
});
const CONFIRMATION_POLICY = Object.freeze({
  policyId: 'zenon.authenticated-momentum-inclusion',
  policyVersion: 1,
  minimumConfirmations: 2,
});

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
    profileId: 'authority.zenon.authenticated.reference',
    profileVersion: 1,
    verifierVersion: 1,
    recordDigest: digest('d'),
    network: EXPERIMENTAL_LIVE_NETWORK,
    chainProfile: { ...CHAIN_PROFILE },
    confirmationPolicy: { ...CONFIRMATION_POLICY },
    ...overrides,
  };
}

function offer(overrides = {}) {
  return {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.zenon.funding',
    resourceBinding: deriveServiceCreditResourceBinding({
      resourceId: 'resource.zenon.funding',
      resourceUrl: RESOURCE_URL,
    }),
    offerId: 'offer.zenon.reference',
    offerVersion: 1,
    costPolicyId: 'cost.fixed',
    fundingPolicyId: 'funding.exact.zenon.authenticated-evidence',
    fundingPolicyVersion: 1,
    ...overrides,
  };
}

function selection(overrides = {}) {
  return {
    offerId: 'offer.zenon.reference',
    offerVersion: 1,
    holderId: 'z1syntheticpayer',
    capabilityCommitment: digest('a'),
    ...overrides,
  };
}

function requirement(overrides = {}) {
  const base = {
    scheme: 'exact',
    network: EXPERIMENTAL_LIVE_NETWORK,
    asset: 'zts1syntheticasset',
    amount: '7',
    payTo: 'z1syntheticpayee',
    maxTimeoutSeconds: 30,
    extra: {
      paymentFlow: 'upfront',
      poc: true,
      settlement: 'account-block',
      zenonChain: { ...CHAIN_PROFILE },
      minimumMomentumConfirmations: CONFIRMATION_POLICY.minimumConfirmations,
    },
  };
  return {
    ...base,
    ...overrides,
    extra: {
      ...base.extra,
      ...(overrides.extra ?? {}),
    },
  };
}

function providerTerms(policyInput, overrides = {}) {
  return {
    fundingPolicyId: policyInput.offer.fundingPolicyId,
    fundingPolicyVersion: policyInput.offer.fundingPolicyVersion,
    totalUnits: 10,
    expiresAt: NOW + 10_000,
    requirement: requirement(),
    ...overrides,
  };
}

function evidenceCandidate(overrides = {}) {
  return {
    evidenceVersion: 1,
    artifact: {
      format: 'synthetic-authenticated-verifier-input',
      bytes: 'detached-test-fixture',
    },
    ...overrides,
  };
}

function expectedFundingFromResource(resource) {
  return `sha256:${resource.tags[1]}${resource.tags[2]}`;
}

function fundingResourceFromCommitment(fundingCommitment) {
  const hex = fundingCommitment.slice('sha256:'.length);
  return {
    url: RESOURCE_URL,
    tags: [
      'x402-service-credit-funding-v1',
      hex.slice(0, 32),
      hex.slice(32),
    ],
  };
}

function expectedFundingCommitment({
  activationIntent,
  activationOffer = offer(),
  accepted = requirement(),
  authority = authorityProfile(),
}) {
  return canonicalCommitment('zenon-x402-service-credit-grant-funding-v1', {
    modelVersion: activationIntent.modelVersion,
    activationVersion: activationIntent.activationVersion,
    activationRecordVersion: SERVICE_CREDIT_ZENON_ACTIVATION_RECORD_VERSION,
    evidenceVersion: 1,
    evidenceType: 'zenon-authenticated-funding-evidence',
    authorityProfileId: authority.profileId,
    authorityProfileVersion: authority.profileVersion,
    verifierVersion: authority.verifierVersion,
    authorityRecordDigest: authority.recordDigest,
    confirmationPolicy: authority.confirmationPolicy,
    fundingPolicyId: activationOffer.fundingPolicyId,
    fundingPolicyVersion: activationOffer.fundingPolicyVersion,
    costPolicyId: activationOffer.costPolicyId,
    providerId: activationIntent.providerId,
    serviceId: activationIntent.serviceId,
    resourceId: activationIntent.resourceId,
    resourceBinding: activationOffer.resourceBinding,
    offerId: activationIntent.offerId,
    offerVersion: activationIntent.offerVersion,
    holderId: activationIntent.holderId,
    capabilityCommitment: activationIntent.capabilityCommitment,
    totalUnits: activationIntent.totalUnits,
    expiresAt: activationIntent.expiresAt,
    scheme: accepted.scheme,
    paymentFlow: accepted.extra.paymentFlow,
    settlement: accepted.extra.settlement,
    poc: accepted.extra.poc,
    maxTimeoutSeconds: accepted.maxTimeoutSeconds,
    network: accepted.network,
    chainProfile: accepted.extra.zenonChain,
    asset: accepted.asset,
    amount: accepted.amount,
    payee: accepted.payTo,
  });
}

function verifiedRecord({
  activationIntent,
  paymentRequired,
  activationOffer = offer(),
  authority = authorityProfile(),
  overrides = {},
}) {
  const accepted = paymentRequired.accepts[0];
  const expectedIntent = paymentIntentDigest(paymentRequired, accepted);
  const base = {
    evidenceVersion: 1,
    evidenceType: 'zenon-authenticated-funding-evidence',
    authorityProfileId: authority.profileId,
    authorityProfileVersion: authority.profileVersion,
    verifierVersion: authority.verifierVersion,
    authorityRecordDigest: authority.recordDigest,
    network: authority.network,
    chainProfile: structuredClone(authority.chainProfile),
    transactionId: `zenontx:${TRANSACTION_HASH}`,
    payer: activationIntent.holderId,
    payee: accepted.payTo,
    asset: accepted.asset,
    amount: accepted.amount,
    paymentResourceDigest: canonicalCommitment(
      'zenon-x402-service-credit-payment-resource-v1',
      paymentRequired.resource,
    ),
    paymentRequirementDigest: canonicalCommitment(
      'zenon-x402-service-credit-payment-requirement-v1',
      accepted,
    ),
    paymentIntentDigest: `sha256:${expectedIntent}`,
    resourceBinding: activationOffer.resourceBinding,
    offerId: activationIntent.offerId,
    offerVersion: activationIntent.offerVersion,
    fundingPolicyId: activationOffer.fundingPolicyId,
    fundingPolicyVersion: activationOffer.fundingPolicyVersion,
    capabilityCommitment: activationIntent.capabilityCommitment,
    totalUnits: activationIntent.totalUnits,
    expiresAt: activationIntent.expiresAt,
    grantFundingCommitment: expectedFundingFromResource(paymentRequired.resource),
    inclusionEvidence: {
      state: 'MOMENTUM_INCLUDED',
      transactionHash: TRANSACTION_HASH,
      momentumHeight: 100,
      momentumHash: MOMENTUM_HASH,
      observedConfirmations: CONFIRMATION_POLICY.minimumConfirmations,
    },
    confirmationPolicy: structuredClone(authority.confirmationPolicy),
  };
  return { ...base, ...overrides };
}

function legacyMockActivationRecord(overrides = {}) {
  const activationOffer = offer();
  return {
    activationVersion: SERVICE_CREDIT_ACTIVATION_VERSION,
    authorityProfileId: 'authority.mock.reference',
    authorityProfileVersion: 1,
    verifierVersion: 1,
    authorityRecordDigest: digest('d'),
    fundingPolicyId: activationOffer.fundingPolicyId,
    fundingPolicyVersion: activationOffer.fundingPolicyVersion,
    sourceSettlementId: 'settlement.mock.reference',
    transactionId: `mocktx:${'2'.repeat(64)}`,
    providerId: activationOffer.providerId,
    serviceId: activationOffer.serviceId,
    resourceId: activationOffer.resourceId,
    resourceBinding: activationOffer.resourceBinding,
    offerId: activationOffer.offerId,
    offerVersion: activationOffer.offerVersion,
    holderId: 'holder.mock.reference',
    capabilityCommitment: digest('a'),
    totalUnits: 10,
    expiresAt: NOW + 10_000,
    scheme: 'exact',
    paymentFlow: 'upfront',
    network: 'zenon:mock',
    chainProfile: {
      version: 1,
      chainIdentifier: Number.MAX_SAFE_INTEGER.toString(),
      genesisMomentumHash: '0'.repeat(64),
    },
    asset: 'zts1mockasset',
    amount: '1',
    payee: 'payee.mock.reference',
    payer: 'holder.mock.reference',
    paymentResourceDigest: digest('4'),
    paymentRequirementDigest: digest('2'),
    paymentIntentDigest: digest('1'),
    grantFundingCommitment: digest('3'),
    evidenceState: 'MOMENTUM_INCLUDED',
    confirmationPolicy: {
      policyId: 'mock.momentum-included',
      policyVersion: 1,
      minimumConfirmations: 1,
    },
    ...overrides,
  };
}

function setupModel(t, {
  store = undefined,
  storeOffer = offer(),
  authority = authorityProfile(),
  now = () => NOW,
  producer = undefined,
  policy = undefined,
} = {}) {
  const model = store ?? new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  model.registerOffer(storeOffer);
  const state = { record: null, calls: 0, policyCalls: 0, clockCalls: 0 };
  const fixedProducer = producer ?? (async () => {
    state.calls += 1;
    return structuredClone(state.record);
  });
  const selectedPolicy = policy ?? (input => providerTerms(input));
  const fixedPolicy = input => {
    state.policyCalls += 1;
    return selectedPolicy(input);
  };
  const fixedNow = () => {
    state.clockCalls += 1;
    return now();
  };
  const activation = createZenonFundingEvidenceActivation({
    store: model,
    deriveFundingTerms: fixedPolicy,
    verifyFundingEvidence: fixedProducer,
    authorityProfile: authority,
    now: fixedNow,
  });
  return { activation, model, state };
}

function prepare(activation, fundingSelection = selection()) {
  const prepared = activation.createFundingResource({
    selection: fundingSelection,
    resourceUrl: RESOURCE_URL,
  });
  return {
    activationIntent: prepared.activationIntent,
    paymentRequired: prepared.paymentRequired,
    prepared,
  };
}

async function expectCode(operation, code) {
  await assert.rejects(operation, error => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, code);
    return true;
  });
}

test('Zenon funding evidence activation imports inertly and is default-inactive', () => {
  assert.equal(typeof createZenonFundingEvidenceActivation, 'function');
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    Object.values(packageJson.scripts).some(value => value.includes('zenon-funding-evidence')),
    false,
  );
});

test('authority construction mirrors the current SDK-safe chain identifier ceiling', () => {
  const maximum = '9007199254740991';
  const maximumProfile = { ...CHAIN_PROFILE, chainIdentifier: maximum };
  const context = setupModel(null, {
    authority: authorityProfile({ chainProfile: maximumProfile }),
    policy: input => providerTerms(input, {
      requirement: requirement({ extra: { zenonChain: maximumProfile } }),
    }),
  });
  assert.doesNotThrow(() => prepare(context.activation));

  assert.throws(
    () => setupModel(null, {
      authority: authorityProfile({
        chainProfile: { ...CHAIN_PROFILE, chainIdentifier: '9007199254740992' },
      }),
    }),
    error => error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_INVALID_CONFIGURATION',
  );
});

test('one complete fixed-verifier record creates one exactly bound durable activation', async () => {
  const context = setupModel();
  const payment = prepare(context.activation);
  context.state.record = verifiedRecord(payment);
  const result = await context.activation.activate({
    intent: payment.activationIntent,
    paymentRequired: payment.paymentRequired,
    fundingEvidence: evidenceCandidate(),
  });

  assert.equal(result.grant.lifecycle, 'ACTIVE');
  assert.equal(result.activation.transactionId, `zenontx:${TRANSACTION_HASH}`);
  assert.equal(result.activation.payer, payment.activationIntent.holderId);
  assert.equal(result.activation.payee, payment.paymentRequired.accepts[0].payTo);
  assert.equal(result.activation.asset, payment.paymentRequired.accepts[0].asset);
  assert.equal(result.activation.amount, payment.paymentRequired.accepts[0].amount);
  assert.equal(result.activation.resourceBinding, offer().resourceBinding);
  assert.equal(result.activation.offerId, payment.activationIntent.offerId);
  assert.equal(result.activation.capabilityCommitment, payment.activationIntent.capabilityCommitment);
  assert.equal(
    payment.prepared.fundingCommitment,
    expectedFundingCommitment({
      activationIntent: payment.activationIntent,
      accepted: payment.paymentRequired.accepts[0],
    }),
  );
  assert.equal(
    result.activation.activationVersion,
    SERVICE_CREDIT_ZENON_ACTIVATION_RECORD_VERSION,
  );
  assert.equal(result.activation.evidenceVersion, 1);
  assert.equal(result.activation.network, EXPERIMENTAL_LIVE_NETWORK);
  assert.deepEqual(result.activation.chainProfile, CHAIN_PROFILE);
  assert.equal(result.activation.evidenceState, 'MOMENTUM_INCLUDED');
  assert.match(result.activation.inclusionAuthorizationDigest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(result.activation.confirmationPolicy, CONFIRMATION_POLICY);
  assert.deepEqual(context.model.getActivation(result.activation.activationId), result.activation);
  assert.equal(JSON.stringify(context.model.exportState()).includes('observedConfirmations'), false);
  assert.equal(context.state.calls, 1);
});

test('fixed provider policy alone derives complete funding terms from minimal frozen selection', () => {
  let observedInput;
  const context = setupModel(null, {
    policy: input => {
      observedInput = input;
      return providerTerms(input);
    },
  });
  const payment = prepare(context.activation);
  assert.deepEqual(Object.keys(observedInput), [
    'offer',
    'holderId',
    'capabilityCommitment',
  ]);
  assert.equal(Object.isFrozen(observedInput), true);
  assert.equal(Object.isFrozen(observedInput.offer), true);
  assert.equal(Object.hasOwn(observedInput, 'payee'), false);
  assert.equal(Object.hasOwn(observedInput, 'amount'), false);
  assert.equal(Object.hasOwn(observedInput, 'totalUnits'), false);
  assert.equal(Object.hasOwn(observedInput, 'expiresAt'), false);
  assert.equal(payment.activationIntent.totalUnits, 10);
  assert.equal(payment.activationIntent.expiresAt, NOW + 10_000);
  assert.deepEqual(payment.paymentRequired.accepts, [requirement()]);
});

test('no payable challenge is returned for expired or downstream-invalid provider terms', async t => {
  const cases = [
    ['expiry equal to challenge clock', {
      policy: input => providerTerms(input, { expiresAt: NOW }),
      code: 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
      expectedClockCalls: 1,
    }],
    ['expiry before challenge clock', {
      policy: input => providerTerms(input, { expiresAt: NOW - 1 }),
      code: 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
      expectedClockCalls: 1,
    }],
    ['downstream-invalid asset', {
      policy: input => providerTerms(input, {
        requirement: requirement({ asset: 'https://asset.invalid' }),
      }),
      code: 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
      expectedClockCalls: 0,
    }],
    ['downstream-invalid payee', {
      policy: input => providerTerms(input, {
        requirement: requirement({ payTo: 'https://payee.invalid' }),
      }),
      code: 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
      expectedClockCalls: 0,
    }],
    ['amount above the canonical 255-bit bound', {
      policy: input => providerTerms(input, {
        requirement: requirement({ amount: (1n << 255n).toString() }),
      }),
      code: 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
      expectedClockCalls: 0,
    }],
  ];

  for (const [name, configuration] of cases) {
    await t.test(name, () => {
      const context = setupModel(null, { policy: configuration.policy });
      let challengeReturned = false;
      assert.throws(
        () => {
          prepare(context.activation);
          challengeReturned = true;
        },
        error => error?.code === configuration.code,
      );
      assert.equal(challengeReturned, false);
      assert.equal(context.state.policyCalls, 1);
      assert.equal(context.state.clockCalls, configuration.expectedClockCalls);
      assert.equal(context.state.calls, 0);
      assert.equal(context.model.exportState().grants.length, 0);
    });
  }
});

test('challenge-time clock failures return no payable challenge or mutation', async t => {
  for (const [name, now] of [
    ['throwing clock', () => { throw new Error('synthetic'); }],
    ['invalid clock value', () => Number.NaN],
  ]) {
    await t.test(name, () => {
      const context = setupModel(null, { now });
      let challengeReturned = false;
      assert.throws(
        () => {
          prepare(context.activation);
          challengeReturned = true;
        },
        error => error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_CLOCK_FAILED',
      );
      assert.equal(challengeReturned, false);
      assert.equal(context.state.policyCalls, 1);
      assert.equal(context.state.clockCalls, 1);
      assert.equal(context.state.calls, 0);
      assert.equal(context.model.exportState().grants.length, 0);
    });
  }
});

test('activation retains independent pre-verifier and post-verifier expiry gates', async t => {
  await t.test('expiry at the pre-verifier check', async () => {
    const times = [NOW, NOW + 10_000];
    const context = setupModel(null, { now: () => times.shift() });
    const payment = prepare(context.activation);
    context.state.record = verifiedRecord(payment);
    await expectCode(
      () => context.activation.activate({
        intent: payment.activationIntent,
        paymentRequired: payment.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
    );
    assert.equal(context.state.clockCalls, 2);
    assert.equal(context.state.calls, 0);
    assert.equal(context.model.exportState().grants.length, 0);
  });

  await t.test('expiry at the post-verifier check', async () => {
    const times = [NOW, NOW + 1, NOW + 10_000];
    const context = setupModel(null, { now: () => times.shift() });
    const payment = prepare(context.activation);
    context.state.record = verifiedRecord(payment);
    await expectCode(
      () => context.activation.activate({
        intent: payment.activationIntent,
        paymentRequired: payment.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_SETTLED_NOT_GRANTED',
    );
    assert.equal(context.state.clockCalls, 3);
    assert.equal(context.state.calls, 1);
    assert.equal(context.model.exportState().grants.length, 0);
  });
});

test('self-consistent caller-chosen economics reject before verifier or durable mutation', async t => {
  const cases = [
    ['self payment', ({ activationIntent, accepted }) => {
      accepted.payTo = activationIntent.holderId;
    }],
    ['underpayment', ({ accepted }) => { accepted.amount = '1'; }],
    ['wrong asset', ({ accepted }) => { accepted.asset = 'zts1otherasset'; }],
    ['inflated units', ({ activationIntent }) => { activationIntent.totalUnits += 1_000; }],
    ['extended expiry', ({ activationIntent }) => { activationIntent.expiresAt += 100_000; }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const context = setupModel();
      const prepared = prepare(context.activation);
      const activationIntent = structuredClone(prepared.activationIntent);
      const accepted = structuredClone(prepared.paymentRequired.accepts[0]);
      mutate({ activationIntent, accepted });
      const maliciousFunding = expectedFundingCommitment({ activationIntent, accepted });
      const paymentRequired = {
        x402Version: 2,
        resource: fundingResourceFromCommitment(maliciousFunding),
        accepts: [accepted],
      };
      context.state.record = verifiedRecord({ activationIntent, paymentRequired });
      await expectCode(
        () => context.activation.activate({
          intent: activationIntent,
          paymentRequired,
          fundingEvidence: evidenceCandidate(),
        }),
        'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
      );
      assert.equal(context.state.calls, 0);
      assert.equal(context.model.exportState().grants.length, 0);
    });
  }
});

test('policy identity drift and semantic rotation fail closed before verifier or mutation', async t => {
  for (const [name, override] of [
    ['policy id', { fundingPolicyId: 'funding.changed' }],
    ['policy version', { fundingPolicyVersion: 2 }],
  ]) {
    await t.test(name, () => {
      const context = setupModel(null, {
        policy: input => providerTerms(input, override),
      });
      assert.throws(
        () => prepare(context.activation),
        error => error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
      );
      assert.equal(context.state.calls, 0);
      assert.equal(context.model.exportState().grants.length, 0);
    });
  }

  await t.test('a returned policy object changed after challenge construction', async () => {
    let terms;
    const context = setupModel(null, {
      policy: input => {
        terms ??= providerTerms(input);
        return terms;
      },
    });
    const payment = prepare(context.activation);
    terms.expiresAt += 1;
    context.state.record = verifiedRecord(payment);
    await expectCode(
      () => context.activation.activate({
        intent: payment.activationIntent,
        paymentRequired: payment.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
    );
    assert.equal(context.state.calls, 0);
    assert.equal(context.model.exportState().grants.length, 0);
  });
});

test('hostile provider-policy results fail closed before verifier or durable mutation', async t => {
  const accessor = providerTerms({ offer: offer() });
  Object.defineProperty(accessor, 'totalUnits', {
    configurable: true,
    enumerable: true,
    get() { throw new Error('must-not-run'); },
  });
  const cyclic = providerTerms({ offer: offer() });
  cyclic.requirement.extra.cycle = cyclic;
  const shared = { value: 'same' };
  const sharedResult = providerTerms({ offer: offer() });
  sharedResult.requirement.extra.left = shared;
  sharedResult.requirement.extra.right = shared;
  const cases = [
    ['proxy', () => new Proxy(providerTerms({ offer: offer() }), {})],
    ['accessor', () => accessor],
    ['extra field', input => ({ ...providerTerms(input), authenticated: true })],
    ['cycle', () => cyclic],
    ['shared reference', () => sharedResult],
    ['oversized string', input => providerTerms(input, {
      requirement: requirement({ asset: 'x'.repeat(300_000) }),
    })],
    ['Promise', input => Promise.resolve(providerTerms(input))],
  ];
  for (const [name, policy] of cases) {
    await t.test(name, () => {
      const context = setupModel(null, { policy });
      assert.throws(
        () => prepare(context.activation),
        error => error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
      );
      assert.equal(context.state.calls, 0);
      assert.equal(context.model.exportState().grants.length, 0);
    });
  }
});

test('callers cannot replace the constructor-captured provider policy', async () => {
  const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  model.registerOffer(offer());
  let capturedCalls = 0;
  const options = {
    store: model,
    deriveFundingTerms: input => {
      capturedCalls += 1;
      return providerTerms(input);
    },
    verifyFundingEvidence: async () => ({}),
    authorityProfile: authorityProfile(),
    now: () => NOW,
  };
  const activation = createZenonFundingEvidenceActivation(options);
  options.deriveFundingTerms = input => providerTerms(input, { totalUnits: 1_000_000 });
  const payment = prepare(activation);
  assert.equal(payment.activationIntent.totalUnits, 10);
  assert.equal(capturedCalls, 1);

  assert.throws(
    () => activation.createFundingResource({
      selection: selection(),
      resourceUrl: RESOURCE_URL,
      deriveFundingTerms: options.deriveFundingTerms,
    }),
    error => error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_INVALID_INPUT',
  );
  assert.throws(
    () => activation.createFundingResource({
      intent: payment.activationIntent,
      requirement: payment.paymentRequired.accepts[0],
      resourceUrl: RESOURCE_URL,
    }),
    error => error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_INVALID_INPUT',
  );
  await expectCode(
    () => activation.activate({
      intent: payment.activationIntent,
      paymentRequired: payment.paymentRequired,
      fundingEvidence: evidenceCandidate(),
      deriveFundingTerms: options.deriveFundingTerms,
    }),
    'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_INVALID_INPUT',
  );
  assert.equal(model.exportState().grants.length, 0);
});

test('legacy mock activation records hydrate and replay byte-for-byte unchanged', () => {
  const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  model.registerOffer(offer());
  const first = model.activateGrantFromTrustedRecord(legacyMockActivationRecord());
  const state = model.exportState();
  assert.equal(first.activation.activationVersion, SERVICE_CREDIT_ACTIVATION_VERSION);
  assert.equal(Object.hasOwn(first.activation, 'evidenceVersion'), false);
  assert.equal(Object.hasOwn(first.activation, 'inclusionAuthorizationDigest'), false);

  const recovered = InMemoryServiceCreditModel.fromState({
    deriveCost: () => 1,
    now: () => NOW,
  }, structuredClone(state));
  assert.deepEqual(recovered.exportState(), state);
  assert.deepEqual(
    recovered.activateGrantFromTrustedRecord(legacyMockActivationRecord()),
    first,
  );
  assert.deepEqual(recovered.exportState(), state);
});

test('activation-record versions fail closed across mock and authenticated Zenon shapes', async t => {
  const mockModel = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  mockModel.registerOffer(offer());
  mockModel.activateGrantFromTrustedRecord(legacyMockActivationRecord());
  const mockState = mockModel.exportState();

  const live = setupModel();
  const payment = prepare(live.activation);
  live.state.record = verifiedRecord(payment);
  await live.activation.activate({
    intent: payment.activationIntent,
    paymentRequired: payment.paymentRequired,
    fundingEvidence: evidenceCandidate(),
  });
  const liveState = live.model.exportState();

  const cases = [
    ['mock record with Zenon record version', mockState, activation => {
      activation.activationVersion = SERVICE_CREDIT_ZENON_ACTIVATION_RECORD_VERSION;
    }],
    ['mock record with evidence version', mockState, activation => {
      activation.evidenceVersion = 1;
    }],
    ['mock record with undefined Zenon-only fields', mockState, activation => {
      activation.evidenceVersion = undefined;
      activation.inclusionAuthorizationDigest = undefined;
    }],
    ['Zenon record with legacy record version', liveState, activation => {
      activation.activationVersion = SERVICE_CREDIT_ACTIVATION_VERSION;
    }],
    ['Zenon record without evidence version', liveState, activation => {
      delete activation.evidenceVersion;
    }],
    ['Zenon record with future evidence version', liveState, activation => {
      activation.evidenceVersion = 2;
    }],
    ['Zenon record without stable inclusion authorization', liveState, activation => {
      delete activation.inclusionAuthorizationDigest;
    }],
    ['Zenon record with legacy observation digest field', liveState, activation => {
      activation.inclusionEvidenceDigest = activation.inclusionAuthorizationDigest;
      delete activation.inclusionAuthorizationDigest;
    }],
    ['Zenon record above the SDK-safe chain ceiling', liveState, activation => {
      activation.chainProfile.chainIdentifier = '9007199254740992';
    }],
  ];

  for (const [name, sourceState, mutate] of cases) {
    await t.test(name, () => {
      const malformed = structuredClone(sourceState);
      mutate(malformed.grants[0].activation);
      assert.throws(
        () => InMemoryServiceCreditModel.fromState({
          deriveCost: () => 1,
          now: () => NOW,
        }, malformed),
        error => error?.code === 'INVALID_STATE',
      );
    });
  }
});

test('every authoritative binding mismatch rejects before durable mutation', async t => {
  const mutations = [
    ['evidence version', record => { record.evidenceVersion += 1; }],
    ['authority profile', record => { record.authorityProfileId = 'authority.changed'; }],
    ['authority profile version', record => { record.authorityProfileVersion += 1; }],
    ['verifier version', record => { record.verifierVersion += 1; }],
    ['authority record', record => { record.authorityRecordDigest = digest('f'); }],
    ['network', record => { record.network = 'zenon:other'; }],
    ['chain profile', record => { record.chainProfile.chainIdentifier = '54321'; }],
    ['transaction identity', record => { record.transactionId = `zenontx:${'b'.repeat(64)}`; }],
    ['payer holder', record => { record.payer = 'z1otherpayer'; }],
    ['payee', record => { record.payee = 'z1otherpayee'; }],
    ['asset', record => { record.asset = 'zts1otherasset'; }],
    ['amount', record => { record.amount = '8'; }],
    ['resource digest', record => { record.paymentResourceDigest = digest('8'); }],
    ['selected requirement', record => { record.paymentRequirementDigest = digest('9'); }],
    ['payment intent', record => { record.paymentIntentDigest = digest('7'); }],
    ['resource binding', record => { record.resourceBinding = digest('6'); }],
    ['offer', record => { record.offerId = 'offer.changed'; }],
    ['offer version', record => { record.offerVersion += 1; }],
    ['funding policy', record => { record.fundingPolicyId = 'funding.changed'; }],
    ['funding policy version', record => { record.fundingPolicyVersion += 1; }],
    ['capability', record => { record.capabilityCommitment = digest('5'); }],
    ['total units', record => { record.totalUnits += 1; }],
    ['expiry', record => { record.expiresAt += 1; }],
    ['funding commitment', record => { record.grantFundingCommitment = digest('4'); }],
    ['inclusion state', record => { record.inclusionEvidence.state = 'ACKNOWLEDGED'; }],
    ['inclusion transaction', record => { record.inclusionEvidence.transactionHash = 'a'.repeat(64); }],
    ['inclusion height', record => { record.inclusionEvidence.momentumHeight = 0; }],
    ['inclusion momentum', record => {
      record.inclusionEvidence.momentumHash = record.inclusionEvidence.transactionHash;
    }],
    ['inclusion confirmations', record => { record.inclusionEvidence.observedConfirmations = 1; }],
    ['confirmation policy', record => { record.confirmationPolicy.minimumConfirmations += 1; }],
  ];

  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const context = setupModel();
      const payment = prepare(context.activation);
      context.state.record = verifiedRecord(payment);
      mutate(context.state.record);
      await expectCode(
        () => context.activation.activate({
          intent: payment.activationIntent,
          paymentRequired: payment.paymentRequired,
          fundingEvidence: evidenceCandidate(),
        }),
        'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
      );
      assert.equal(context.model.exportState().grants.length, 0);
    });
  }
});

test('operator-trusted, generic assertion, transaction-only, partial, and expanded records reject', async t => {
  const recordCases = [
    ['operator-trusted Gate-B', { evidenceVersion: 1, evidenceType: 'operator-trusted-current-testnet-observation' }],
    ['generic flags', { authenticated: true, success: true }],
    ['transaction only', { transactionId: `zenontx:${TRANSACTION_HASH}` }],
    ['partial', { evidenceVersion: 1, evidenceType: 'zenon-authenticated-funding-evidence' }],
  ];
  for (const [name, record] of recordCases) {
    await t.test(name, async () => {
      const context = setupModel(null, { producer: async () => record });
      const payment = prepare(context.activation);
      await expectCode(
        () => context.activation.activate({
          intent: payment.activationIntent,
          paymentRequired: payment.paymentRequired,
          fundingEvidence: evidenceCandidate(),
        }),
        'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
      );
      assert.equal(context.model.exportState().grants.length, 0);
    });
  }

  await t.test('extra asserted field', async () => {
    const context = setupModel();
    const payment = prepare(context.activation);
    context.state.record = verifiedRecord(payment);
    context.state.record.authenticated = true;
    await expectCode(
      () => context.activation.activate({
        intent: payment.activationIntent,
        paymentRequired: payment.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
    );
    assert.equal(context.model.exportState().grants.length, 0);
  });
});

test('hostile evidence and producer result shapes fail closed without store mutation', async t => {
  let calls = 0;
  const context = setupModel(null, {
    producer: async () => {
      calls += 1;
      return {};
    },
  });
  const payment = prepare(context.activation);
  const accessorEvidence = evidenceCandidate();
  Object.defineProperty(accessorEvidence, 'artifact', {
    enumerable: true,
    get() { throw new Error('must-not-run'); },
  });
  for (const candidate of [
    null,
    new Proxy(evidenceCandidate(), {}),
    accessorEvidence,
    { ...evidenceCandidate(), success: true },
    { evidenceVersion: 1, artifact: new Proxy({}, {}) },
  ]) {
    await expectCode(
      () => context.activation.activate({
        intent: payment.activationIntent,
        paymentRequired: payment.paymentRequired,
        fundingEvidence: candidate,
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_INVALID_INPUT',
    );
  }
  assert.equal(calls, 0);
  assert.equal(context.model.exportState().grants.length, 0);

  await t.test('thenable producer result', async () => {
    const thenable = setupModel(null, {
      producer: () => ({ then(resolve) { resolve({}); } }),
    });
    const candidate = prepare(thenable.activation);
    await expectCode(
      () => thenable.activation.activate({
        intent: candidate.activationIntent,
        paymentRequired: candidate.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
    );
    assert.equal(thenable.model.exportState().grants.length, 0);
  });

  await t.test('proxy producer record', async () => {
    const proxied = setupModel(null, { producer: async () => new Proxy({}, {}) });
    const candidate = prepare(proxied.activation);
    await expectCode(
      () => proxied.activation.activate({
        intent: candidate.activationIntent,
        paymentRequired: candidate.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
    );
    assert.equal(proxied.model.exportState().grants.length, 0);
  });

  await t.test('accessor-backed producer record', async () => {
    let record;
    const accessor = setupModel(null, { producer: async () => record });
    const candidate = prepare(accessor.activation);
    record = verifiedRecord(candidate);
    Object.defineProperty(record, 'payer', {
      configurable: true,
      enumerable: true,
      get() { throw new Error('must-not-run'); },
    });
    await expectCode(
      () => accessor.activation.activate({
        intent: candidate.activationIntent,
        paymentRequired: candidate.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
    );
    assert.equal(accessor.model.exportState().grants.length, 0);
  });

  await t.test('nested proxy producer record', async () => {
    let record;
    const proxied = setupModel(null, { producer: async () => record });
    const candidate = prepare(proxied.activation);
    record = verifiedRecord(candidate);
    record.inclusionEvidence = new Proxy(record.inclusionEvidence, {});
    await expectCode(
      () => proxied.activation.activate({
        intent: candidate.activationIntent,
        paymentRequired: candidate.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
    );
    assert.equal(proxied.model.exportState().grants.length, 0);
  });

  await t.test('own Promise constructor accessor', async () => {
    let produced;
    const promiseContext = setupModel(null, { producer: () => produced });
    const candidate = prepare(promiseContext.activation);
    produced = Promise.resolve(verifiedRecord(candidate));
    Object.defineProperty(produced, 'constructor', {
      configurable: true,
      enumerable: false,
      get() { throw new Error('must-not-run'); },
    });
    await expectCode(
      () => promiseContext.activation.activate({
        intent: candidate.activationIntent,
        paymentRequired: candidate.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
    );
    assert.equal(promiseContext.model.exportState().grants.length, 0);
  });

  await t.test('lookalike Promise constructor descriptor', async () => {
    let produced;
    const promiseContext = setupModel(null, { producer: () => produced });
    const candidate = prepare(promiseContext.activation);
    produced = Promise.resolve(verifiedRecord(candidate));
    Object.defineProperty(produced, 'constructor', {
      configurable: true,
      enumerable: false,
      value: Promise,
      writable: false,
    });
    await expectCode(
      () => promiseContext.activation.activate({
        intent: candidate.activationIntent,
        paymentRequired: candidate.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
    );
    assert.equal(promiseContext.model.exportState().grants.length, 0);
  });

  await t.test('nonextensible Promise', async () => {
    let produced;
    const promiseContext = setupModel(null, { producer: () => produced });
    const candidate = prepare(promiseContext.activation);
    produced = Object.preventExtensions(Promise.resolve(verifiedRecord(candidate)));
    await expectCode(
      () => promiseContext.activation.activate({
        intent: candidate.activationIntent,
        paymentRequired: candidate.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      }),
      'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
    );
    assert.equal(promiseContext.model.exportState().grants.length, 0);
  });
});

test('cumulative snapshot budgets, cycles, and shared references reject before any authority call', async t => {
  const base = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  base.registerOffer(offer());
  const calls = { clock: 0, store: 0, verifier: 0 };
  const store = {
    getOffer(input) {
      calls.store += 1;
      return base.getOffer(input);
    },
    activateGrantFromTrustedRecord(input) {
      calls.store += 1;
      return base.activateGrantFromTrustedRecord(input);
    },
  };
  const activation = createZenonFundingEvidenceActivation({
    store,
    deriveFundingTerms: input => providerTerms(input),
    verifyFundingEvidence: async () => {
      calls.verifier += 1;
      return {};
    },
    authorityProfile: authorityProfile(),
    now: () => {
      calls.clock += 1;
      return NOW;
    },
  });
  const payment = prepare(activation);
  calls.store = 0;

  const cases = [
    ['array length ceiling', () => evidenceCandidate({ artifact: {
      values: new Array(4097),
    } })],
    ['string code-unit ceiling', () => evidenceCandidate({ artifact: {
      value: 'x'.repeat((256 * 1024) + 1),
    } })],
    ['cycle', () => {
      const artifact = {};
      artifact.self = artifact;
      return evidenceCandidate({ artifact });
    }],
    ['shared reference', () => {
      const shared = { value: 1 };
      return evidenceCandidate({ artifact: { left: shared, right: shared } });
    }],
    ['cumulative nodes', () => evidenceCandidate({
      artifact: { values: Array.from({ length: 4096 }, () => [0]) },
    })],
    ['cumulative members', () => evidenceCandidate({
      artifact: {
        values: Array.from({ length: 4096 }, (_, index) => ({ left: index, right: index })),
      },
    })],
    ['cumulative key bytes', () => {
      const values = {};
      for (let index = 0; index < 2048; index += 1) {
        values[`long_bounded_key_${index.toString().padStart(24, '0')}`] = null;
      }
      return evidenceCandidate({ artifact: values });
    }],
    ['cumulative string bytes', () => evidenceCandidate({
      artifact: { values: Array.from({ length: 4096 }, () => 'x'.repeat(70)) },
    })],
  ];

  for (const [name, build] of cases) {
    await t.test(name, async () => {
      calls.clock = 0;
      calls.store = 0;
      calls.verifier = 0;
      await expectCode(
        () => activation.activate({
          intent: payment.activationIntent,
          paymentRequired: payment.paymentRequired,
          fundingEvidence: build(),
        }),
        'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_INVALID_INPUT',
      );
      assert.deepEqual(calls, { clock: 0, store: 0, verifier: 0 });
    });
  }
});

test('unsafe verifier Promise shapes reject without success or store mutation', () => {
  const fundingModule = new URL(
    '../src/service-credit-zenon-funding-evidence.js',
    import.meta.url,
  ).href;
  const activationModule = new URL('../src/service-credit-activation.js', import.meta.url).href;
  const source = `
    import { runInNewContext } from 'node:vm';
    const [{ createZenonFundingEvidenceActivation }, { deriveServiceCreditResourceBinding }] =
      await Promise.all([import(process.argv[1]), import(process.argv[2])]);
    const now = 2_000_000_000_000;
    const resourceUrl = 'https://service.example/credits/zenon-fund';
    const chainProfile = {
      version: 1,
      chainIdentifier: '12345',
      genesisMomentumHash: '1'.repeat(64),
    };
    const offer = {
      modelVersion: 1,
      providerId: 'provider.reference',
      serviceId: 'service.reference',
      resourceId: 'resource.zenon.funding',
      resourceBinding: deriveServiceCreditResourceBinding({
        resourceId: 'resource.zenon.funding',
        resourceUrl,
      }),
      offerId: 'offer.zenon.reference',
      offerVersion: 1,
      costPolicyId: 'cost.fixed',
      fundingPolicyId: 'funding.exact.zenon.authenticated-evidence',
      fundingPolicyVersion: 1,
    };
    const intent = {
      modelVersion: 1,
      activationVersion: 1,
      providerId: offer.providerId,
      serviceId: offer.serviceId,
      resourceId: offer.resourceId,
      offerId: offer.offerId,
      offerVersion: offer.offerVersion,
      holderId: 'z1syntheticpayer',
      capabilityCommitment: 'sha256:' + 'a'.repeat(64),
      totalUnits: 10,
      expiresAt: now + 10_000,
    };
    const requirement = {
      scheme: 'exact',
      network: 'zenon:testnet',
      asset: 'zts1syntheticasset',
      amount: '7',
      payTo: 'z1syntheticpayee',
      maxTimeoutSeconds: 30,
      extra: {
        paymentFlow: 'upfront',
        poc: true,
        settlement: 'account-block',
        zenonChain: chainProfile,
        minimumMomentumConfirmations: 2,
      },
    };
    const authorityProfile = {
      profileId: 'authority.zenon.authenticated.reference',
      profileVersion: 1,
      verifierVersion: 1,
      recordDigest: 'sha256:' + 'd'.repeat(64),
      network: 'zenon:testnet',
      chainProfile,
      confirmationPolicy: {
        policyId: 'zenon.authenticated-momentum-inclusion',
        policyVersion: 1,
        minimumConfirmations: 2,
      },
    };
    const store = {
      getOffer() { return structuredClone(offer); },
      activateGrantFromTrustedRecord() { throw new Error('must-not-run'); },
    };
    function activationFor(producer) {
      const activation = createZenonFundingEvidenceActivation({
        store,
        deriveFundingTerms: ({ offer: selectedOffer }) => ({
          fundingPolicyId: selectedOffer.fundingPolicyId,
          fundingPolicyVersion: selectedOffer.fundingPolicyVersion,
          totalUnits: 10,
          expiresAt: now + 10_000,
          requirement,
        }),
        verifyFundingEvidence: producer,
        authorityProfile,
        now: () => now,
      });
      const prepared = activation.createFundingResource({
        selection: {
          offerId: offer.offerId,
          offerVersion: offer.offerVersion,
          holderId: intent.holderId,
          capabilityCommitment: intent.capabilityCommitment,
        },
        resourceUrl,
      });
      return {
        activation,
        input: {
          intent: prepared.activationIntent,
          paymentRequired: prepared.paymentRequired,
          fundingEvidence: { evidenceVersion: 1, artifact: { format: 'synthetic' } },
        },
      };
    }
    const factories = [
      () => Object.preventExtensions(Promise.resolve({})),
      () => {
        class ForeignPromise extends Promise {}
        return ForeignPromise.resolve({});
      },
      () => runInNewContext('Promise.resolve({})'),
      () => {
        const promise = Promise.resolve({});
        Object.defineProperty(promise, 'constructor', {
          configurable: false,
          enumerable: false,
          get() { throw new Error('must-not-run'); },
        });
        return promise;
      },
    ];
    const originalThen = Promise.prototype.then;
    try {
      Promise.prototype.then = () => { throw new Error('must-not-run'); };
      for (const factory of factories) {
        const rejected = factory();
        const context = activationFor(() => rejected);
        let fixed = false;
        try { await context.activation.activate(context.input); }
        catch (error) {
          fixed = error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED';
        }
        if (!fixed) process.exit(1);
      }
    } finally {
      Promise.prototype.then = originalThen;
    }
    process.stdout.write('UNSAFE_PROMISE_CONTRACT=PASS\\n');
  `;
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', source, fundingModule, activationModule],
    { encoding: 'utf8' },
  );
  assert.equal(child.status, 0);
  assert.equal(child.stdout, 'UNSAFE_PROMISE_CONTRACT=PASS\n');
});

test('ordinary verifier rejection fails closed without durable mutation', async () => {
  const context = setupModel(null, {
    producer: async () => { throw new Error('synthetic'); },
  });
  const payment = prepare(context.activation);
  await expectCode(
    () => context.activation.activate({
      intent: payment.activationIntent,
      paymentRequired: payment.paymentRequired,
      fundingEvidence: evidenceCandidate(),
    }),
    'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED',
  );
  assert.equal(context.model.exportState().grants.length, 0);
});

test('exact replay and concurrent duplicate activation converge without a second durable write', async () => {
  const context = setupModel();
  const payment = prepare(context.activation);
  context.state.record = verifiedRecord(payment);
  const input = {
    intent: payment.activationIntent,
    paymentRequired: payment.paymentRequired,
    fundingEvidence: evidenceCandidate(),
  };
  const [first, second] = await Promise.all([
    context.activation.activate(structuredClone(input)),
    context.activation.activate(structuredClone(input)),
  ]);
  const revision = context.model.exportState().grants.length;
  const replay = await context.activation.activate(structuredClone(input));
  assert.deepEqual(second, first);
  assert.deepEqual(replay, first);
  assert.equal(revision, 1);
  assert.equal(context.model.exportState().grants.length, 1);
});

test('a cached verifier Promise remains valid for exact replay after constructor pinning', async () => {
  let cachedPromise;
  const context = setupModel(null, { producer: () => cachedPromise });
  const payment = prepare(context.activation);
  cachedPromise = Promise.resolve(verifiedRecord(payment));
  const input = {
    intent: payment.activationIntent,
    paymentRequired: payment.paymentRequired,
    fundingEvidence: evidenceCandidate(),
  };
  const first = await context.activation.activate(structuredClone(input));
  const replay = await context.activation.activate(structuredClone(input));
  assert.deepEqual(replay, first);
  assert.equal(context.model.exportState().grants.length, 1);
});

test('minimum and later confirmation observations converge concurrently and on replay', async () => {
  let calls = 0;
  let payment;
  const context = setupModel(null, {
    producer: () => {
      const record = verifiedRecord(payment);
      record.inclusionEvidence.observedConfirmations = (
        CONFIRMATION_POLICY.minimumConfirmations + calls
      );
      calls += 5;
      return Promise.resolve(record);
    },
  });
  payment = prepare(context.activation);
  const input = {
    intent: payment.activationIntent,
    paymentRequired: payment.paymentRequired,
    fundingEvidence: evidenceCandidate(),
  };
  const [minimum, later] = await Promise.all([
    context.activation.activate(structuredClone(input)),
    context.activation.activate(structuredClone(input)),
  ]);
  const replay = await context.activation.activate(structuredClone(input));
  assert.deepEqual(later, minimum);
  assert.deepEqual(replay, minimum);
  assert.equal(context.model.exportState().grants.length, 1);
});

test('valid inclusion height or momentum drift for one transaction conflicts before mutation', async t => {
  for (const [name, mutate] of [
    ['height', record => { record.inclusionEvidence.momentumHeight += 1; }],
    ['momentum hash', record => { record.inclusionEvidence.momentumHash = 'f'.repeat(64); }],
  ]) {
    await t.test(name, async () => {
      const context = setupModel();
      const payment = prepare(context.activation);
      context.state.record = verifiedRecord(payment);
      await context.activation.activate({
        intent: payment.activationIntent,
        paymentRequired: payment.paymentRequired,
        fundingEvidence: evidenceCandidate(),
      });
      const before = context.model.exportState();
      context.state.record = verifiedRecord(payment);
      mutate(context.state.record);
      await expectCode(
        () => context.activation.activate({
          intent: payment.activationIntent,
          paymentRequired: payment.paymentRequired,
          fundingEvidence: evidenceCandidate(),
        }),
        'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_CONFLICT',
      );
      assert.deepEqual(context.model.exportState(), before);
    });
  }
});

test('one transaction cannot activate conflicting capability or offer bindings', async () => {
  const context = setupModel();
  const firstPayment = prepare(context.activation);
  context.state.record = verifiedRecord(firstPayment);
  await context.activation.activate({
    intent: firstPayment.activationIntent,
    paymentRequired: firstPayment.paymentRequired,
    fundingEvidence: evidenceCandidate(),
  });

  const conflictingSelection = selection({ capabilityCommitment: digest('b') });
  const conflictingPayment = prepare(context.activation, conflictingSelection);
  context.state.record = verifiedRecord(conflictingPayment);
  await expectCode(
    () => context.activation.activate({
      intent: conflictingPayment.activationIntent,
      paymentRequired: conflictingPayment.paymentRequired,
      fundingEvidence: evidenceCandidate({ artifact: { format: 'other', bytes: 'other' } }),
    }),
    'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_CONFLICT',
  );
  assert.equal(context.model.exportState().grants.length, 1);
});

test('SQLite concurrent duplicates converge and exact replay remains stable after clean reopen', async t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-funding-converge-')));
  chmodSync(directory, 0o700);
  const databasePath = join(directory, 'ledger.sqlite');
  const configuration = {
    databasePath,
    allowedRoot: directory,
    deriveCost: () => 1,
    now: () => NOW,
  };
  const store = ServiceCreditSqliteStore.create(configuration);
  const context = setupModel(null, { store });
  const payment = prepare(context.activation);
  context.state.record = verifiedRecord(payment);
  const input = {
    intent: payment.activationIntent,
    paymentRequired: payment.paymentRequired,
    fundingEvidence: evidenceCandidate(),
  };
  const beforeRevision = store.getMetadata().revision;
  const [first, second] = await Promise.all([
    context.activation.activate(structuredClone(input)),
    context.activation.activate(structuredClone(input)),
  ]);
  assert.deepEqual(second, first);
  assert.equal(store.getMetadata().revision, beforeRevision + 1);
  store.close();

  const reopened = ServiceCreditSqliteStore.openExisting(configuration);
  const reopenedContext = setupModel(null, { store: reopened });
  reopenedContext.state.record = verifiedRecord(payment);
  reopenedContext.state.record.inclusionEvidence.observedConfirmations += 8;
  const reopenedRevision = reopened.getMetadata().revision;
  const replay = await reopenedContext.activation.activate(structuredClone(input));
  assert.deepEqual(replay, first);
  assert.equal(reopened.getMetadata().revision, reopenedRevision);
  assert.equal(reopened.load().state.grants.length, 1);
  reopened.close();
  rmSync(directory, { recursive: true, force: true });
  t.after(() => {
    try { reopened.close(); } catch {}
    rmSync(directory, { recursive: true, force: true });
  });
});

test('definite pre-commit failure rolls back without an activation', async t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-funding-rollback-')));
  chmodSync(directory, 0o700);
  const databasePath = join(directory, 'ledger.sqlite');
  let armed = false;
  const store = ServiceCreditSqliteStore.create({
    databasePath,
    allowedRoot: directory,
    deriveCost: () => 1,
    now: () => NOW,
    testHooks: {
      beforeCommit({ operation }) {
        if (armed && operation === 'activateGrantFromTrustedRecord') throw new Error('synthetic');
      },
    },
  });
  const context = setupModel(null, { store });
  const payment = prepare(context.activation);
  context.state.record = verifiedRecord(payment);
  const before = store.load();
  armed = true;
  await expectCode(
    () => context.activation.activate({
      intent: payment.activationIntent,
      paymentRequired: payment.paymentRequired,
      fundingEvidence: evidenceCandidate(),
    }),
    'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_SETTLED_NOT_GRANTED',
  );
  armed = false;
  assert.deepEqual(store.load(), before);
  store.close();
  rmSync(directory, { recursive: true, force: true });
  t.after(() => {
    try { store.close(); } catch {}
    rmSync(directory, { recursive: true, force: true });
  });
});

test('SQLite exact replay survives reopen and post-commit ambiguity preserves one activation', async t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'zenon-funding-evidence-')));
  chmodSync(directory, 0o700);
  const databasePath = join(directory, 'ledger.sqlite');
  let armed = false;
  const configuration = {
    databasePath,
    allowedRoot: directory,
    deriveCost: () => 1,
    now: () => NOW,
    testHooks: {
      afterCommit({ operation }) {
        if (armed && operation === 'activateGrantFromTrustedRecord') throw new Error('synthetic');
      },
    },
  };
  const store = ServiceCreditSqliteStore.create(configuration);
  const context = setupModel(null, { store });
  const payment = prepare(context.activation);
  context.state.record = verifiedRecord(payment);
  armed = true;
  await expectCode(
    () => context.activation.activate({
      intent: payment.activationIntent,
      paymentRequired: payment.paymentRequired,
      fundingEvidence: evidenceCandidate(),
    }),
    'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_OUTCOME_UNKNOWN',
  );
  assert.throws(() => store.load(), error => error?.code === 'SERVICE_CREDIT_STORE_CLOSED');

  const reopened = ServiceCreditSqliteStore.openExisting({
    databasePath,
    allowedRoot: directory,
    deriveCost: () => 1,
    now: () => NOW,
  });
  const reopenedContext = setupModel(null, { store: reopened });
  reopenedContext.state.record = verifiedRecord(payment);
  reopenedContext.state.record.inclusionEvidence.observedConfirmations += 8;
  const reopenedRevision = reopened.getMetadata().revision;
  const recovered = await reopenedContext.activation.activate({
    intent: payment.activationIntent,
    paymentRequired: payment.paymentRequired,
    fundingEvidence: evidenceCandidate(),
  });
  assert.equal(recovered.grant.lifecycle, 'ACTIVE');
  assert.equal(reopened.getMetadata().revision, reopenedRevision);
  assert.equal(reopened.load().state.grants.length, 1);
  reopened.close();
  rmSync(directory, { recursive: true, force: true });
  t.after(() => {
    try { reopened.close(); } catch {}
    rmSync(directory, { recursive: true, force: true });
  });
});

test('the contract has no live, wallet, RPC, listener, route, environment, or dependency surface', () => {
  const source = readFileSync(
    new URL('../src/service-credit-zenon-funding-evidence.js', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'node:http',
    'node:https',
    'node:net',
    'resource-server.js',
    'live-evidence.js',
    'zenon-payment.js',
    'wallet',
    'publishRawTransaction',
    'process.env',
    'listen(',
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});
