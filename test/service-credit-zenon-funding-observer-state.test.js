import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  applyZenonFundingInclusionObservation,
  applyZenonFundingObserverPage,
  createZenonFundingObserverState,
  parseZenonFundingObserverState,
  planZenonFundingObserverBackfill,
  projectZenonFundingObservationCandidate,
  serializeZenonFundingObserverState,
  ZENON_FUNDING_OBSERVATION_CANDIDATE_TYPE,
  ZENON_FUNDING_OBSERVER_STATUS,
  ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION,
} from '../src/service-credit-zenon-funding-observer-state.js';
import {
  createZenonFundingEvidenceActivation,
} from '../src/service-credit-zenon-funding-evidence.js';
import {
  InMemoryServiceCreditModel,
  SERVICE_CREDIT_MODEL_VERSION,
} from '../src/service-credit-model.js';
import { deriveServiceCreditResourceBinding } from '../src/service-credit-activation.js';

const NOW = 2_000_000_000_000;
const INITIAL_HEIGHT = 10;
const INITIAL_HASH = 'a'.repeat(64);
const TRANSACTION_HASH = 'c'.repeat(64);
const CHAIN_PROFILE = Object.freeze({
  version: 1,
  chainIdentifier: '12345',
  genesisMomentumHash: '1'.repeat(64),
});

function digest(fill) {
  return `sha256:${fill.repeat(64)}`;
}

function momentumHash(height) {
  return createHash('sha256').update(`observer-momentum-${height}`).digest('hex');
}

function target(overrides = {}) {
  return {
    transactionId: `zenontx:${TRANSACTION_HASH}`,
    payer: 'z1syntheticpayer',
    payee: 'z1syntheticpayee',
    asset: 'zts1syntheticasset',
    amount: '7',
    scheme: 'exact',
    paymentFlow: 'upfront',
    settlement: 'account-block',
    network: 'zenon:testnet',
    providerId: 'provider.reference',
    serviceId: 'service.reference',
    resourceId: 'resource.zenon.funding',
    resourceBinding: digest('1'),
    paymentResourceDigest: digest('2'),
    paymentRequirementDigest: digest('3'),
    paymentIntentDigest: digest('4'),
    offerId: 'offer.zenon.reference',
    offerVersion: 1,
    fundingPolicyId: 'funding.exact.zenon.observer',
    fundingPolicyVersion: 1,
    capabilityCommitment: digest('5'),
    totalUnits: 10,
    expiresAt: NOW + 10_000,
    grantFundingCommitment: digest('6'),
    ...overrides,
  };
}

function configuration(overrides = {}) {
  const base = {
    observerPolicy: {
      policyId: 'zenon.injected-observer',
      policyVersion: 1,
      verifierVersion: 1,
    },
    authorityGeneration: {
      generationId: 'authority.generation.reference',
      generationVersion: 1,
      generationCommitment: digest('7'),
    },
    chainProfile: { ...CHAIN_PROFILE },
    confirmationPolicy: {
      policyId: 'zenon.injected-contiguous-confirmations',
      policyVersion: 1,
      minimumConfirmations: 3,
    },
    target: target(),
    checkpoint: { height: INITIAL_HEIGHT, hash: INITIAL_HASH },
    catchUp: {
      maximumPageEntries: 4,
      maximumBackfillSpan: 8,
      maximumMembersPerMomentum: 4,
    },
  };
  return {
    ...base,
    ...overrides,
    observerPolicy: { ...base.observerPolicy, ...(overrides.observerPolicy ?? {}) },
    authorityGeneration: {
      ...base.authorityGeneration,
      ...(overrides.authorityGeneration ?? {}),
    },
    chainProfile: { ...base.chainProfile, ...(overrides.chainProfile ?? {}) },
    confirmationPolicy: {
      ...base.confirmationPolicy,
      ...(overrides.confirmationPolicy ?? {}),
    },
    target: { ...base.target, ...(overrides.target ?? {}) },
    checkpoint: { ...base.checkpoint, ...(overrides.checkpoint ?? {}) },
    catchUp: { ...base.catchUp, ...(overrides.catchUp ?? {}) },
  };
}

function context(state, overrides = {}) {
  return {
    observerRecordId: state.observerRecordId,
    targetBindingDigest: state.targetBindingDigest,
    authorityGeneration: structuredClone(state.authorityGeneration),
    chainProfile: structuredClone(state.chainProfile),
    ...overrides,
  };
}

function availableSource(state, frontierHeight, overrides = {}) {
  return {
    status: 'AVAILABLE',
    frontier: {
      height: frontierHeight,
      hash: frontierHeight === state.checkpoint.height
        ? state.checkpoint.hash
        : momentumHash(frontierHeight),
    },
    checkpointHash: frontierHeight >= state.checkpoint.height
      ? state.checkpoint.hash
      : null,
    ...overrides,
  };
}

function plan(state, frontierHeight, overrides = {}) {
  return planZenonFundingObserverBackfill({
    state,
    expectedRevision: state.revision,
    ...context(state),
    source: availableSource(state, frontierHeight),
    ...overrides,
  });
}

function pageFor(state, planned, {
  memberHeight = null,
  memberTargetBinding = state.targetBindingDigest,
  count = planned.plan.entryCount,
  mutateEntry = undefined,
  pageOverrides = {},
} = {}) {
  let previousHash = planned.plan.startCheckpoint.hash;
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const height = planned.plan.fromHeight + index;
    const hash = momentumHash(height);
    const entry = {
      height,
      hash,
      previousHash,
      members: height === memberHeight
        ? [{
          transactionId: state.target.transactionId,
          targetBindingDigest: memberTargetBinding,
        }]
        : [],
    };
    entries.push(entry);
    previousHash = hash;
  }
  if (mutateEntry !== undefined) mutateEntry(entries);
  return {
    pageVersion: 1,
    ...context(state),
    planId: planned.plan.planId,
    startCheckpoint: structuredClone(planned.plan.startCheckpoint),
    frontier: structuredClone(planned.plan.frontier),
    entries,
    ...pageOverrides,
  };
}

function applyPage(state, planned, page) {
  return applyZenonFundingObserverPage({
    state,
    expectedRevision: state.revision,
    plan: planned.plan,
    page,
  });
}

function foundObservation(state, overrides = {}) {
  const receipt = state.catchUp.lastAppliedPage;
  return {
    status: 'FOUND',
    transactionId: state.target.transactionId,
    targetBindingDigest: state.targetBindingDigest,
    momentumHeight: receipt.targetMembership.momentumHeight,
    momentumHash: receipt.targetMembership.momentumHash,
    pageDigest: receipt.pageDigest,
    ...overrides,
  };
}

function observe(state, observation, overrides = {}) {
  return applyZenonFundingInclusionObservation({
    state,
    expectedRevision: state.revision,
    ...context(state),
    observation,
    ...overrides,
  });
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function expectCode(operation, code) {
  assert.throws(operation, error => error?.code === code && error?.message === code);
}

function canonicalForTest(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalForTest).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalForTest(value[key])}`
  )).join(',')}}`;
}

test('observer import is inert and its dependency closure stays pure and inactive', async () => {
  const source = readFileSync(
    new URL('../src/service-credit-zenon-funding-observer-state.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /from 'node:crypto'/);
  assert.match(source, /from 'node:util'/);
  assert.doesNotMatch(
    source,
    /node:fs|node:http|node:https|node:net|node:tls|node:child_process|znn-typescript-sdk|service-credit-model|service-credit-zenon-funding-evidence|live-evidence|wallet|rpc/i,
  );
  const imported = await import('../src/service-credit-zenon-funding-observer-state.js');
  assert.equal(typeof imported.createZenonFundingObserverState, 'function');
});

test('state v1 is exact, canonical, detached, deeply frozen, and byte-stable', () => {
  const input = configuration();
  const state = createZenonFundingObserverState(input);
  input.target.amount = '999';
  assert.equal(state.target.amount, '7');
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.revision, 0);
  assert.equal(state.status, ZENON_FUNDING_OBSERVER_STATUS.AWAITING_INCLUSION);
  assert.equal(state.trustClassification, ZENON_FUNDING_OBSERVER_TRUST_CLASSIFICATION);
  assert.equal(state.inclusion, null);
  assert.equal(state.firstThreshold, null);
  assert.equal(state.quarantine, null);
  assertDeepFrozen(state);
  const serialized = serializeZenonFundingObserverState(state);
  const reparsed = parseZenonFundingObserverState(serialized);
  assert.equal(serializeZenonFundingObserverState(reparsed), serialized);
  assert.deepEqual(reparsed, state);
  assertDeepFrozen(reparsed);
});

test('hostile, expanded, cyclic, accessor-backed, proxy, and oversized inputs reject', async t => {
  const cases = [
    ['extra field', () => ({ ...configuration(), authenticated: true })],
    ['accessor', () => Object.defineProperty(configuration(), 'target', {
      enumerable: true,
      get() { throw new Error('synthetic'); },
    })],
    ['proxy', () => new Proxy(configuration(), {})],
    ['cycle', () => {
      const value = configuration();
      value.target.loop = value;
      return value;
    }],
    ['oversized', () => configuration({
      observerPolicy: { policyId: `policy.${'x'.repeat(300_000)}` },
    })],
  ];
  for (const [name, make] of cases) {
    await t.test(name, () => expectCode(
      () => createZenonFundingObserverState(make()),
      'ZENON_FUNDING_OBSERVER_INVALID_INPUT',
    ));
  }
});

test('backfill planning is bounded and unavailable or behind sources are no-ops', () => {
  const state = createZenonFundingObserverState(configuration());
  const planned = plan(state, INITIAL_HEIGHT + 20);
  assert.equal(planned.disposition, 'BACKFILL_REQUIRED');
  assert.equal(planned.plan.fromHeight, INITIAL_HEIGHT + 1);
  assert.equal(planned.plan.throughHeight, INITIAL_HEIGHT + 4);
  assert.equal(planned.plan.entryCount, 4);
  assert.equal(planned.state.revision, 0);

  const unavailable = plan(state, INITIAL_HEIGHT, {
    source: { status: 'UNAVAILABLE', reason: 'TIMEOUT' },
  });
  assert.equal(unavailable.disposition, 'SOURCE_UNAVAILABLE');
  assert.equal(unavailable.state.revision, 0);

  const behind = plan(state, INITIAL_HEIGHT - 1);
  assert.equal(behind.disposition, 'SOURCE_BEHIND');
  assert.equal(behind.state.revision, 0);
});

test('planner state and plan outputs apply directly without caller cloning', () => {
  const initial = createZenonFundingObserverState(configuration());
  const planned = plan(initial, INITIAL_HEIGHT + 2);
  assert.notEqual(planned.state.authorityGeneration, planned.plan.authorityGeneration);
  assert.notEqual(planned.state.chainProfile, planned.plan.chainProfile);
  assert.notEqual(planned.state.checkpoint, planned.plan.startCheckpoint);

  const applied = applyZenonFundingObserverPage({
    state: planned.state,
    expectedRevision: planned.state.revision,
    plan: planned.plan,
    page: pageFor(planned.state, planned),
  });

  assert.equal(applied.disposition, 'APPLIED');
  assert.equal(applied.state.revision, 1);
  assert.equal(applied.state.checkpoint.height, INITIAL_HEIGHT + 2);
});

test('a same-height source replacement enters terminal quarantine', () => {
  const state = createZenonFundingObserverState(configuration());
  const result = plan(state, INITIAL_HEIGHT, {
    source: availableSource(state, INITIAL_HEIGHT, {
      frontier: { height: INITIAL_HEIGHT, hash: 'b'.repeat(64) },
      checkpointHash: 'b'.repeat(64),
    }),
  });
  assert.equal(result.disposition, 'QUARANTINED');
  assert.equal(result.state.status, ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED);
  assert.equal(result.state.quarantine.reason, 'CHECKPOINT_HASH_MISMATCH');
  assert.equal(result.state.revision, 1);
});

test('one contiguous page advances cursor and revision exactly once; exact replay converges', () => {
  const state = createZenonFundingObserverState(configuration());
  const planned = plan(state, INITIAL_HEIGHT + 2);
  const page = pageFor(state, planned);
  const applied = applyPage(state, planned, page);
  assert.equal(applied.disposition, 'APPLIED');
  assert.equal(applied.state.revision, 1);
  assert.deepEqual(applied.state.checkpoint, {
    height: INITIAL_HEIGHT + 2,
    hash: momentumHash(INITIAL_HEIGHT + 2),
  });
  const replay = applyZenonFundingObserverPage({
    state: applied.state,
    expectedRevision: applied.state.revision,
    plan: planned.plan,
    page,
  });
  assert.equal(replay.disposition, 'REPLAY');
  assert.equal(replay.state.revision, 1);
  expectCode(
    () => applyZenonFundingObserverPage({
      state: applied.state,
      expectedRevision: 0,
      plan: planned.plan,
      page,
    }),
    'ZENON_FUNDING_OBSERVER_STALE_REVISION',
  );
});

test('linked target discovery must be observed before a later page can replace its receipt', () => {
  const initial = createZenonFundingObserverState(configuration());
  const planned = plan(initial, INITIAL_HEIGHT + 2);
  const discovered = applyPage(
    initial,
    planned,
    pageFor(initial, planned, { memberHeight: INITIAL_HEIGHT + 1 }),
  ).state;
  const blocked = plan(discovered, INITIAL_HEIGHT + 3);
  assert.equal(blocked.disposition, 'INCLUSION_OBSERVATION_REQUIRED');
  assert.equal(blocked.plan, null);
  assert.equal(blocked.state.revision, discovered.revision);
  assert.deepEqual(blocked.state.catchUp.lastAppliedPage.targetMembership, {
    transactionId: initial.target.transactionId,
    targetBindingDigest: initial.targetBindingDigest,
    momentumHeight: INITIAL_HEIGHT + 1,
    momentumHash: momentumHash(INITIAL_HEIGHT + 1),
  });

  const sameContextWithoutReceipt = createZenonFundingObserverState(configuration({
    checkpoint: structuredClone(discovered.checkpoint),
  }));
  const bypassPlan = plan(sameContextWithoutReceipt, INITIAL_HEIGHT + 3);
  const direct = applyZenonFundingObserverPage({
    state: discovered,
    expectedRevision: discovered.revision,
    plan: bypassPlan.plan,
    page: pageFor(discovered, bypassPlan),
  });
  assert.equal(direct.disposition, 'INCLUSION_OBSERVATION_REQUIRED');
  assert.equal(direct.state.revision, discovered.revision);
  assert.deepEqual(direct.state.catchUp.lastAppliedPage, discovered.catchUp.lastAppliedPage);
});

test('gaps, order conflicts, duplicates, bad parents, and frontier replacement quarantine', async t => {
  const cases = [
    ['missing entry', entries => entries.pop(), 'PAGE_GAP'],
    ['unsorted heights', entries => {
      const first = entries[0];
      entries[0] = entries[1];
      entries[1] = first;
    }, 'PAGE_HEIGHT_CONFLICT'],
    ['duplicate height', entries => { entries[1].height = entries[0].height; }, 'PAGE_HEIGHT_CONFLICT'],
    ['bad parent', entries => { entries[1].previousHash = 'f'.repeat(64); }, 'PAGE_PARENT_MISMATCH'],
    ['frontier replacement', entries => { entries.at(-1).hash = 'f'.repeat(64); }, 'FRONTIER_REPLACEMENT'],
  ];
  for (const [name, mutate, reason] of cases) {
    await t.test(name, () => {
      const state = createZenonFundingObserverState(configuration());
      const planned = plan(state, INITIAL_HEIGHT + 2);
      const page = pageFor(state, planned, { mutateEntry: mutate });
      const result = applyPage(state, planned, page);
      assert.equal(result.disposition, 'QUARANTINED');
      assert.equal(result.state.quarantine.reason, reason);
      assert.deepEqual(result.state.checkpoint, state.checkpoint);
    });
  }
});

test('context drift quarantines without moving the cursor', async t => {
  for (const [name, override] of [
    ['chain', { chainProfile: { ...CHAIN_PROFILE, chainIdentifier: '54321' } }],
    ['authority', { authorityGeneration: {
      ...configuration().authorityGeneration,
      generationVersion: 2,
    } }],
    ['target', { targetBindingDigest: digest('f') }],
  ]) {
    await t.test(name, () => {
      const state = createZenonFundingObserverState(configuration());
      const result = plan(state, INITIAL_HEIGHT + 1, override);
      assert.equal(result.disposition, 'QUARANTINED');
      assert.equal(result.state.revision, 1);
      assert.deepEqual(result.state.checkpoint, state.checkpoint);
    });
  }
});

test('hard page, backfill, member, and input capacities reject without truncation', async t => {
  await t.test('configured page ceiling', () => expectCode(
    () => createZenonFundingObserverState(configuration({
      catchUp: { maximumPageEntries: 65 },
    })),
    'ZENON_FUNDING_OBSERVER_INVALID_INPUT',
  ));
  await t.test('configured backfill ceiling', () => expectCode(
    () => createZenonFundingObserverState(configuration({
      catchUp: { maximumBackfillSpan: 4097 },
    })),
    'ZENON_FUNDING_OBSERVER_INVALID_INPUT',
  ));
  await t.test('members are not truncated', () => {
    const state = createZenonFundingObserverState(configuration());
    const planned = plan(state, INITIAL_HEIGHT + 1);
    const page = pageFor(state, planned);
    page.entries[0].members = Array.from({ length: 5 }, (_, index) => ({
      transactionId: `zenontx:${String(index + 1).repeat(64)}`,
      targetBindingDigest: digest(String(index + 1)),
    }));
    expectCode(
      () => applyPage(state, planned, page),
      'ZENON_FUNDING_OBSERVER_INVALID_INPUT',
    );
  });
});

test('membership plus exact binding is required before threshold observation', () => {
  const state = createZenonFundingObserverState(configuration());
  const planned = plan(state, INITIAL_HEIGHT + 2);
  const page = pageFor(state, planned, { memberHeight: INITIAL_HEIGHT + 1 });
  const advanced = applyPage(state, planned, page).state;
  assert.equal(advanced.status, ZENON_FUNDING_OBSERVER_STATUS.AWAITING_INCLUSION);
  assert.notEqual(advanced.catchUp.lastAppliedPage.targetMembership, null);
  const included = observe(advanced, foundObservation(advanced)).state;
  assert.equal(included.status, ZENON_FUNDING_OBSERVER_STATUS.INCLUDED_BELOW_THRESHOLD);
  assert.equal(included.inclusion.currentConfirmations, 2);
  assert.equal(included.firstThreshold, null);
});

test('the same inclusion strengthens monotonically and pins the first threshold checkpoint', () => {
  const initial = createZenonFundingObserverState(configuration());
  const firstPlan = plan(initial, INITIAL_HEIGHT + 1);
  const firstPage = pageFor(initial, firstPlan, { memberHeight: INITIAL_HEIGHT + 1 });
  const firstAdvance = applyPage(initial, firstPlan, firstPage).state;
  const included = observe(firstAdvance, foundObservation(firstAdvance)).state;
  assert.equal(included.inclusion.currentConfirmations, 1);

  const secondPlan = plan(included, INITIAL_HEIGHT + 3);
  const secondPage = pageFor(included, secondPlan);
  const threshold = applyPage(included, secondPlan, secondPage).state;
  assert.equal(threshold.status, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
  assert.equal(threshold.inclusion.currentConfirmations, 3);
  assert.deepEqual(threshold.firstThreshold.checkpoint, {
    height: INITIAL_HEIGHT + 3,
    hash: momentumHash(INITIAL_HEIGHT + 3),
  });
  assert.equal(threshold.firstThreshold.confirmations, 3);
  assert.deepEqual(threshold.firstThreshold.lineageReceipt, threshold.catchUp.lastAppliedPage);

  const thirdPlan = plan(threshold, INITIAL_HEIGHT + 5);
  const later = applyPage(threshold, thirdPlan, pageFor(threshold, thirdPlan)).state;
  assert.equal(later.inclusion.currentConfirmations, 5);
  assert.deepEqual(later.firstThreshold, threshold.firstThreshold);
  const equality = observe(later, {
    status: 'FOUND',
    transactionId: later.target.transactionId,
    targetBindingDigest: later.targetBindingDigest,
    momentumHeight: later.inclusion.momentumHeight,
    momentumHash: later.inclusion.momentumHash,
    pageDigest: later.catchUp.lastAppliedPage.pageDigest,
  });
  assert.equal(equality.disposition, 'UNCHANGED');
  assert.equal(equality.state.revision, later.revision);
});

test('a page crossing the threshold internally pins its actual end cursor and derived count', () => {
  const initial = createZenonFundingObserverState(configuration());
  const firstPlan = plan(initial, INITIAL_HEIGHT + 4);
  const firstPage = pageFor(initial, firstPlan, { memberHeight: INITIAL_HEIGHT + 1 });
  const linked = applyPage(initial, firstPlan, firstPage).state;
  const threshold = observe(linked, foundObservation(linked)).state;
  assert.equal(threshold.status, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
  assert.deepEqual(threshold.firstThreshold.checkpoint, threshold.checkpoint);
  assert.equal(threshold.firstThreshold.confirmations, 4);
  assert.deepEqual(
    threshold.firstThreshold.lineageReceipt.endCheckpoint,
    threshold.firstThreshold.checkpoint,
  );
  assert.deepEqual(
    threshold.firstThreshold.lineageReceipt.thresholdCheckpoint,
    threshold.firstThreshold.checkpoint,
  );
  const candidate = projectZenonFundingObservationCandidate(threshold);

  const laterPlan = plan(threshold, INITIAL_HEIGHT + 6);
  const later = applyPage(threshold, laterPlan, pageFor(threshold, laterPlan)).state;
  assert.deepEqual(later.firstThreshold, threshold.firstThreshold);
  assert.equal(
    JSON.stringify(projectZenonFundingObservationCandidate(later)),
    JSON.stringify(candidate),
  );

  const corrupted = structuredClone(later);
  const replacementHash = 'f'.repeat(64);
  corrupted.firstThreshold.checkpoint.hash = replacementHash;
  corrupted.firstThreshold.lineageReceipt.thresholdCheckpoint.hash = replacementHash;
  expectCode(
    () => parseZenonFundingObserverState(canonicalForTest(corrupted)),
    'ZENON_FUNDING_OBSERVER_INVALID_STATE',
  );
});

test('pending linked membership disappearing before observation quarantines', () => {
  const initial = createZenonFundingObserverState(configuration());
  const planned = plan(initial, INITIAL_HEIGHT + 1);
  const linked = applyPage(
    initial,
    planned,
    pageFor(initial, planned, { memberHeight: INITIAL_HEIGHT + 1 }),
  ).state;
  const disappeared = observe(linked, {
    status: 'NOT_FOUND',
    transactionId: linked.target.transactionId,
  });
  assert.equal(disappeared.disposition, 'QUARANTINED');
  assert.equal(disappeared.state.quarantine.reason, 'INCLUSION_DISAPPEARED');
  assert.deepEqual(disappeared.state.checkpoint, linked.checkpoint);
});

test('reload rejects receipt and first-threshold hash corruption', async t => {
  const initial = createZenonFundingObserverState(configuration());
  const planned = plan(initial, INITIAL_HEIGHT + 3);
  const advanced = applyPage(
    initial,
    planned,
    pageFor(initial, planned, { memberHeight: INITIAL_HEIGHT + 1 }),
  ).state;
  const threshold = observe(advanced, foundObservation(advanced)).state;

  await t.test('last-page membership hash', () => {
    const corrupted = structuredClone(threshold);
    corrupted.catchUp.lastAppliedPage.targetMembership.momentumHash = 'f'.repeat(64);
    expectCode(
      () => serializeZenonFundingObserverState(corrupted),
      'ZENON_FUNDING_OBSERVER_INVALID_STATE',
    );
  });

  await t.test('first-threshold lineage hash', () => {
    const serialized = serializeZenonFundingObserverState(threshold);
    const original = `"firstThreshold":{"checkpoint":{"hash":"${threshold.firstThreshold.checkpoint.hash}"`;
    const replacement = `"firstThreshold":{"checkpoint":{"hash":"${'f'.repeat(64)}"`;
    const corrupted = serialized.replace(original, replacement);
    assert.notEqual(corrupted, serialized);
    expectCode(
      () => parseZenonFundingObserverState(corrupted),
      'ZENON_FUNDING_OBSERVER_INVALID_STATE',
    );
  });
});

test('checkpoint-only receipts are fully revalidated on reload', async t => {
  const initial = createZenonFundingObserverState(configuration());
  const aheadPlan = plan(initial, INITIAL_HEIGHT + 20);
  const advanced = applyPage(initial, aheadPlan, pageFor(initial, aheadPlan)).state;

  await t.test('frontier-ahead coordinated end replacement keeps no unchecked summary', () => {
    const corrupted = structuredClone(advanced);
    const replacementHash = 'f'.repeat(64);
    corrupted.checkpoint.hash = replacementHash;
    corrupted.catchUp.lastAppliedPage.endCheckpoint.hash = replacementHash;
    corrupted.catchUp.lastAppliedPage.lineage.at(-1).hash = replacementHash;
    expectCode(
      () => parseZenonFundingObserverState(canonicalForTest(corrupted)),
      'ZENON_FUNDING_OBSERVER_INVALID_STATE',
    );
  });

  await t.test('internal hash replacement', () => {
    const corrupted = structuredClone(advanced);
    const replacementHash = 'e'.repeat(64);
    corrupted.catchUp.lastAppliedPage.lineage[1].hash = replacementHash;
    corrupted.catchUp.lastAppliedPage.lineage[2].previousHash = replacementHash;
    expectCode(
      () => parseZenonFundingObserverState(canonicalForTest(corrupted)),
      'ZENON_FUNDING_OBSERVER_INVALID_STATE',
    );
  });

  for (const [name, mutate] of [
    ['bad predecessor', receipt => { receipt.lineage[1].previousHash = 'f'.repeat(64); }],
    ['reordered height', receipt => { receipt.lineage[1].height = receipt.lineage[0].height; }],
    ['height gap', receipt => { receipt.lineage[1].height += 1; }],
  ]) {
    await t.test(name, () => {
      const corrupted = structuredClone(advanced);
      mutate(corrupted.catchUp.lastAppliedPage);
      expectCode(
        () => parseZenonFundingObserverState(canonicalForTest(corrupted)),
        'ZENON_FUNDING_OBSERVER_INVALID_STATE',
      );
    });
  }

  await t.test('hard lineage ceiling', () => {
    const corrupted = structuredClone(advanced);
    const receipt = corrupted.catchUp.lastAppliedPage;
    receipt.lineage = [];
    let previousHash = receipt.startCheckpoint.hash;
    for (let index = 1; index <= 65; index += 1) {
      const height = receipt.startCheckpoint.height + index;
      const hash = momentumHash(height);
      receipt.lineage.push({ height, hash, previousHash });
      previousHash = hash;
    }
    receipt.entryCount = receipt.lineage.length;
    receipt.endCheckpoint = {
      height: receipt.lineage.at(-1).height,
      hash: receipt.lineage.at(-1).hash,
    };
    receipt.frontier = structuredClone(receipt.endCheckpoint);
    corrupted.checkpoint = structuredClone(receipt.endCheckpoint);
    expectCode(
      () => parseZenonFundingObserverState(canonicalForTest(corrupted)),
      'ZENON_FUNDING_OBSERVER_INVALID_STATE',
    );
  });

  await t.test('retained first-threshold lineage after later growth', () => {
    const firstPlan = plan(initial, INITIAL_HEIGHT + 4);
    const linked = applyPage(
      initial,
      firstPlan,
      pageFor(initial, firstPlan, { memberHeight: INITIAL_HEIGHT + 1 }),
    ).state;
    const threshold = observe(linked, foundObservation(linked)).state;
    const laterPlan = plan(threshold, INITIAL_HEIGHT + 6);
    const later = applyPage(threshold, laterPlan, pageFor(threshold, laterPlan)).state;
    assert.deepEqual(
      parseZenonFundingObserverState(serializeZenonFundingObserverState(later)),
      later,
    );
    const corrupted = structuredClone(later);
    const lineage = corrupted.firstThreshold.lineageReceipt.lineage;
    const replacementHash = 'd'.repeat(64);
    lineage[1].hash = replacementHash;
    lineage[2].previousHash = replacementHash;
    expectCode(
      () => parseZenonFundingObserverState(canonicalForTest(corrupted)),
      'ZENON_FUNDING_OBSERVER_INVALID_STATE',
    );
  });
});

test('inclusion tuple drift, binding drift, disappearance, and regression quarantine', async t => {
  const makeIncluded = () => {
    const initial = createZenonFundingObserverState(configuration());
    const planned = plan(initial, INITIAL_HEIGHT + 1);
    const advanced = applyPage(
      initial,
      planned,
      pageFor(initial, planned, { memberHeight: INITIAL_HEIGHT + 1 }),
    ).state;
    return observe(advanced, foundObservation(advanced)).state;
  };
  const cases = [
    ['tuple drift', state => foundObservation(state, { momentumHash: 'f'.repeat(64) }), 'INCLUSION_TUPLE_DRIFT'],
    ['binding drift', state => foundObservation(state, { targetBindingDigest: digest('f') }), 'TARGET_BINDING_DRIFT'],
    ['disappeared', state => ({ status: 'NOT_FOUND', transactionId: state.target.transactionId }), 'INCLUSION_DISAPPEARED'],
    ['regression', state => foundObservation(state, { momentumHeight: state.inclusion.momentumHeight + 1 }), 'INCLUSION_TUPLE_DRIFT'],
  ];
  for (const [name, makeObservation, reason] of cases) {
    await t.test(name, () => {
      const state = makeIncluded();
      const result = observe(state, makeObservation(state));
      assert.equal(result.disposition, 'QUARANTINED');
      assert.equal(result.state.quarantine.reason, reason);
      assert.equal(result.state.revision, state.revision + 1);
    });
  }
});

test('source timeout and unavailability never change inclusion state', () => {
  const state = createZenonFundingObserverState(configuration());
  for (const reason of ['TIMEOUT', 'UNAVAILABLE']) {
    const result = observe(state, { status: 'UNAVAILABLE', reason });
    assert.equal(result.disposition, 'SOURCE_UNAVAILABLE');
    assert.deepEqual(result.state, state);
  }
});

test('quarantine is terminal and survives canonical serialization and reload', () => {
  const state = createZenonFundingObserverState(configuration());
  const quarantined = plan(state, INITIAL_HEIGHT, {
    source: availableSource(state, INITIAL_HEIGHT, { checkpointHash: 'f'.repeat(64) }),
  }).state;
  const reloaded = parseZenonFundingObserverState(
    serializeZenonFundingObserverState(quarantined),
  );
  assert.equal(reloaded.status, ZENON_FUNDING_OBSERVER_STATUS.QUARANTINED);
  assert.deepEqual(reloaded.quarantine, quarantined.quarantine);
  const result = plan(reloaded, INITIAL_HEIGHT + 1);
  assert.equal(result.disposition, 'QUARANTINED');
  assert.deepEqual(result.state, reloaded);
});

test('revision-race and reload simulations converge without hidden authority', () => {
  const serialized = serializeZenonFundingObserverState(
    createZenonFundingObserverState(configuration()),
  );
  const workerA = parseZenonFundingObserverState(serialized);
  const workerB = parseZenonFundingObserverState(serialized);
  const plannedA = plan(workerA, INITIAL_HEIGHT + 1);
  const winner = applyPage(workerA, plannedA, pageFor(workerA, plannedA)).state;
  expectCode(
    () => applyZenonFundingObserverPage({
      state: winner,
      expectedRevision: workerB.revision,
      plan: plannedA.plan,
      page: pageFor(workerB, plannedA),
    }),
    'ZENON_FUNDING_OBSERVER_STALE_REVISION',
  );
  assert.equal(winner.trustClassification, 'injected-observation-only');
});

test('operator-trusted and authenticated-shaped attempts cannot alter classification', async t => {
  const state = createZenonFundingObserverState(configuration());
  for (const [name, observation] of [
    ['authenticated flag', { authenticated: true }],
    ['Gate-B record', {
      evidenceType: 'gate-b-operator-trusted-observation',
      transactionId: state.target.transactionId,
      state: 'MOMENTUM_INCLUDED',
    }],
    ['supplied confirmations', {
      status: 'FOUND',
      transactionId: state.target.transactionId,
      targetBindingDigest: state.targetBindingDigest,
      momentumHeight: 11,
      momentumHash: momentumHash(11),
      pageDigest: digest('8'),
      observedConfirmations: 999,
    }],
  ]) {
    await t.test(name, () => expectCode(
      () => observe(state, observation),
      'ZENON_FUNDING_OBSERVER_INVALID_INPUT',
    ));
  }
  assert.equal(state.trustClassification, 'injected-observation-only');
});

test('threshold candidate is non-authorizing, exact, frozen, and consumer-incompatible', async () => {
  const initial = createZenonFundingObserverState(configuration());
  const planned = plan(initial, INITIAL_HEIGHT + 3);
  const advanced = applyPage(
    initial,
    planned,
    pageFor(initial, planned, { memberHeight: INITIAL_HEIGHT + 1 }),
  ).state;
  const threshold = observe(advanced, foundObservation(advanced)).state;
  assert.equal(threshold.status, ZENON_FUNDING_OBSERVER_STATUS.THRESHOLD_OBSERVED);
  const candidate = projectZenonFundingObservationCandidate(threshold);
  assert.equal(candidate.candidateType, ZENON_FUNDING_OBSERVATION_CANDIDATE_TYPE);
  assert.equal(candidate.trustClassification, 'injected-observation-only');
  assert.equal(candidate.authorization, 'NONE');
  assert.equal(Object.hasOwn(candidate, 'authenticated'), false);
  assert.equal(Object.hasOwn(candidate, 'evidenceVersion'), false);
  assert.equal(Object.hasOwn(candidate, 'evidenceType'), false);
  assert.equal(Object.hasOwn(candidate, 'checkpoint'), false);
  assert.equal(Object.hasOwn(candidate.inclusion, 'currentConfirmations'), false);
  for (const forbidden of [
    'endpoint', 'authorizationHeader', 'signedBlock', 'signature', 'wallet',
    'rawTransaction', 'rawPayment', 'privateKey', 'mnemonic',
  ]) {
    assert.equal(JSON.stringify(candidate).includes(forbidden), false);
  }
  assertDeepFrozen(candidate);

  const model = new InMemoryServiceCreditModel({ deriveCost: () => 1, now: () => NOW });
  const resourceUrl = 'https://service.example/credits/zenon-fund';
  const offer = {
    modelVersion: SERVICE_CREDIT_MODEL_VERSION,
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
  model.registerOffer(offer);
  let storeCalls = 0;
  const store = {
    getOffer: input => model.getOffer(input),
    activateGrantFromTrustedRecord: input => {
      storeCalls += 1;
      return model.activateGrantFromTrustedRecord(input);
    },
  };
  const activation = createZenonFundingEvidenceActivation({
    store,
    deriveFundingTerms: input => ({
      fundingPolicyId: input.offer.fundingPolicyId,
      fundingPolicyVersion: input.offer.fundingPolicyVersion,
      totalUnits: 10,
      expiresAt: NOW + 10_000,
      requirement: {
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
          zenonChain: { ...CHAIN_PROFILE },
          minimumMomentumConfirmations: 3,
        },
      },
    }),
    verifyFundingEvidence: async value => value,
    authorityProfile: {
      profileId: 'authority.zenon.authenticated.reference',
      profileVersion: 1,
      verifierVersion: 1,
      recordDigest: digest('9'),
      network: 'zenon:testnet',
      chainProfile: { ...CHAIN_PROFILE },
      confirmationPolicy: {
        policyId: 'zenon.authenticated-momentum-inclusion',
        policyVersion: 1,
        minimumConfirmations: 3,
      },
    },
    now: () => NOW,
  });
  const prepared = activation.createFundingResource({
    selection: {
      offerId: offer.offerId,
      offerVersion: offer.offerVersion,
      holderId: 'z1syntheticpayer',
      capabilityCommitment: digest('5'),
    },
    resourceUrl,
  });
  await assert.rejects(
    () => activation.activate({
      intent: prepared.activationIntent,
      paymentRequired: prepared.paymentRequired,
      fundingEvidence: candidate,
    }),
    error => (
      error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_INVALID_INPUT'
      || error?.code === 'SERVICE_CREDIT_ZENON_FUNDING_EVIDENCE_REJECTED'
    ),
  );
  assert.equal(storeCalls, 0);
  assert.equal(model.exportState().grants.length, 0);

  const laterPlan = plan(threshold, threshold.checkpoint.height + 2);
  const later = applyPage(
    threshold,
    laterPlan,
    pageFor(threshold, laterPlan),
  ).state;
  assert.equal(later.inclusion.currentConfirmations, threshold.inclusion.currentConfirmations + 2);
  assert.equal(
    JSON.stringify(projectZenonFundingObservationCandidate(later)),
    JSON.stringify(candidate),
  );
});
