import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  prepareZenonFundingResource,
  deriveZenonFundingObserverTarget,
} from '../src/service-credit-zenon-funding-evidence.js';
import { createZenonFundingObserverState } from '../src/service-credit-zenon-funding-observer-state.js';
import {
  createZenonFundingObserverSqliteStore,
  openZenonFundingObserverSqliteStore,
} from '../src/service-credit-zenon-funding-observer-sqlite-store.js';
import {
  parseZenonFundingProviderAttestationAuthorityRecord,
  createZenonFundingProviderAttestationSigningBytes,
} from '../src/service-credit-zenon-funding-provider-attestation.js';

let createProducer;
try {
  ({ createZenonFundingObservationProducer: createProducer } = await import(
    '../src/service-credit-zenon-funding-observation-producer.js'
  ));
} catch {
  // The first test-first run intentionally has no production producer.
}

const hash = label => createHash('sha256').update(`observation-fixture:${label}`).digest('hex');
const commitment = label => `sha256:${hash(label)}`;
const NOW = 2_100_000_000_000;
const PAIR = generateKeyPairSync('ed25519');
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
function frozen(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
const AUTHORITY_TEXT = canonical({
  authorityRecordVersion: 1,
  authorityProfileId: 'zenon.provider-attestation',
  authorityProfileVersion: 1,
  verifierVersion: 1,
  providerAuthorityId: 'provider.observation.fixture',
  generationId: 'generation.observation.fixture',
  generationVersion: 1,
  keyId: 'key.observation.fixture',
  algorithm: 'Ed25519',
  publicKey: PAIR.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64url'),
  network: 'zenon:testnet',
  chainProfile: { version: 1, chainIdentifier: '12345', genesisMomentumHash: hash('genesis') },
  observerPolicy: { policyId: 'zenon.injected-observer', policyVersion: 1, verifierVersion: 1 },
  confirmationPolicy: { policyId: 'zenon.authenticated-momentum-inclusion', policyVersion: 1, minimumConfirmations: 3 },
  bootstrapCheckpoint: { height: 20, hash: hash('momentum.20') },
  sourcePolicyCommitment: commitment('source-policy'),
  maximumAttestationBytes: 4096,
  maximumCanonicalBytes: 524288,
  maximumInitialAgeSeconds: 300,
  maximumFutureSkewSeconds: 5,
  maximumValiditySeconds: 300,
});
const AUTHORITY = parseZenonFundingProviderAttestationAuthorityRecord(AUTHORITY_TEXT);
const BINDING = frozen({
  sourcePolicyCommitment: AUTHORITY.sourcePolicyCommitment,
  authorityGeneration: structuredClone(AUTHORITY.authorityGeneration),
  chainProfile: structuredClone(AUTHORITY.chainProfile),
  bootstrapCheckpoint: structuredClone(AUTHORITY.bootstrapCheckpoint),
});

function fixture(t, { testHooks, maximumPageEntries = 2 } = {}) {
  assert.equal(typeof createProducer, 'function', 'FUNDING_OBSERVATION_PRODUCER_MISSING');
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'credit-observation-fixture-')));
  chmodSync(directory, 0o700);
  let store;
  t.after(() => {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const chosen = {
    offerId: 'offer.observation.fixture', offerVersion: 1,
    holderId: `z1${'q'.repeat(38)}`, capabilityCommitment: commitment('capability'),
  };
  const prepared = prepareZenonFundingResource({
    offer: {
      modelVersion: 1, providerId: 'provider.fixture', serviceId: 'service.fixture',
      resourceId: 'resource.fixture', resourceBinding: `sha256:${createHash('sha256')
        .update('zenon-x402-service-credit-resource-binding-v1').update('\0')
        .update(canonical({ resourceId: 'resource.fixture', resourceUrl: 'https://localhost/credit-fixture' })).digest('hex')}`,
      offerId: chosen.offerId, offerVersion: chosen.offerVersion, costPolicyId: 'cost.fixture',
      fundingPolicyId: 'funding.fixture', fundingPolicyVersion: 1,
    },
    selection: chosen,
    resourceUrl: 'https://localhost/credit-fixture',
    authorityProfile: AUTHORITY.authorityProfile,
    now: () => NOW,
    deriveFundingTerms: () => ({
      fundingPolicyId: 'funding.fixture', fundingPolicyVersion: 1, totalUnits: 4, expiresAt: NOW + 60_000,
      requirement: {
        scheme: 'exact', network: 'zenon:testnet', asset: `zts1${'q'.repeat(10)}`,
        amount: '7', payTo: `z1${'p'.repeat(38)}`, maxTimeoutSeconds: 30,
        extra: {
          poc: true, paymentFlow: 'upfront', settlement: 'account-block',
          zenonChain: structuredClone(AUTHORITY.chainProfile), minimumMomentumConfirmations: 3,
        },
      },
    }),
  });
  const target = deriveZenonFundingObserverTarget({
    offer: prepared.offer, challenge: prepared.challenge, authorityProfile: AUTHORITY.authorityProfile,
    transactionHash: hash('transaction'), payer: chosen.holderId,
    resourceUrl: prepared.challenge.paymentRequired.resource.url,
  });
  const configuration = {
    databasePath: join(directory, 'observer.sqlite'), allowedRoot: directory,
    authorityRecord: AUTHORITY_TEXT,
    initialState: createZenonFundingObserverState({
      observerPolicy: AUTHORITY.observerPolicy, authorityGeneration: AUTHORITY.authorityGeneration,
      chainProfile: AUTHORITY.chainProfile, confirmationPolicy: AUTHORITY.confirmationPolicy,
      target, checkpoint: AUTHORITY.bootstrapCheckpoint,
      catchUp: { maximumPageEntries, maximumBackfillSpan: 8, maximumMembersPerMomentum: 2 },
    }),
    ...(testHooks === undefined ? {} : { testHooks }),
  };
  store = createZenonFundingObserverSqliteStore(configuration);
  const recordKey = store.load().recordKey;
  const options = Object.freeze({
    fundingObserverStore: store, authorityRecord: AUTHORITY_TEXT, sourceBinding: BINDING,
    limits: frozen({ maximumReplyBytes: 65536, maximumContentHeaders: 4 }),
  });
  return { store, target, options, producer: createProducer(options), configuration, recordKey };
}

function nativeMomentum(height, content = []) {
  return {
    version: 1, chainIdentifier: 12345, hash: hash(`momentum.${height}`),
    previousHash: hash(`momentum.${height - 1}`), height, timestamp: height,
    data: '', content, changesHash: hash('changes'), publicKey: '', signature: '',
    producer: `z1${'r'.repeat(38)}`,
  };
}
function nativeBlock(target, overrides = {}) {
  return {
    version: 1, chainIdentifier: 12345, blockType: 2,
    hash: target.transactionId.slice(8), previousHash: hash('account-parent'), height: 4,
    momentumAcknowledged: { height: 20, hash: hash('momentum.20') },
    address: target.payer, toAddress: target.payee, amount: target.amount,
    tokenStandard: target.asset, fromBlockHash: '0'.repeat(64),
    data: Buffer.from(target.paymentIntentDigest.slice(7), 'hex').toString('base64'),
    fusedPlasma: 0, difficulty: 0, nonce: '', publicKey: '', signature: '',
    confirmationDetail: { numConfirmations: 9999, momentumHeight: 21, momentumHash: hash('momentum.21'), momentumTimestamp: 21 },
    ...overrides,
  };
}
function batch(context, { frontier = 24, targetHeight = 21 } = {}) {
  const state = context.store.load().state;
  const block = nativeBlock(context.target, {
    confirmationDetail: {
      numConfirmations: 9999, momentumHeight: targetHeight,
      momentumHash: hash(`momentum.${targetHeight}`), momentumTimestamp: targetHeight,
    },
  });
  const header = { address: block.address, hash: block.hash, height: block.height };
  const through = Math.min(frontier, state.checkpoint.height + state.catchUp.maximumPageEntries);
  const list = [];
  for (let height = state.checkpoint.height + 1; height <= through; height += 1) {
    list.push(nativeMomentum(height, height === targetHeight ? [header] : []));
  }
  return {
    checkpoint: nativeMomentum(state.checkpoint.height), frontier: nativeMomentum(frontier),
    momentums: { count: list.length, list }, accountBlock: block,
    inclusionMomentum: nativeMomentum(targetHeight, [header]),
  };
}
function momentumReplies(reply) {
  return [
    reply.checkpoint,
    reply.frontier,
    ...reply.momentums.list,
    reply.inclusionMomentum,
  ].filter(value => value !== null);
}
function dynamicPlasmaBundle(reply, versionAtHeight = () => 2) {
  for (const item of momentumReplies(reply)) {
    const version = versionAtHeight(item.height);
    item.version = version;
    item.data = null;
    item.nextFusionPrice = version === 1 ? 0 : 1_000 + item.height;
    item.nextWorkPrice = version === 1 ? 0 : 2_000 + item.height;
  }
  return reply;
}
function input(context, reply = batch(context), overrides = {}) {
  return Object.freeze({
    expectedRevision: context.store.load().state.revision, sourceBinding: BINDING,
    reply: reply === null ? null : JSON.stringify(reply), ...overrides,
  });
}
const codeIs = suffix => error => error?.code === `ZENON_FUNDING_OBSERVATION_PRODUCER_${suffix}`;

test('observation producer is inert, frozen, default-off and owns no downstream effects', t => {
  const context = fixture(t);
  const before = context.store.load();
  assert.deepEqual(Object.keys(context.producer), ['apply']);
  assert.equal(Object.isFrozen(context.producer), true);
  assert.equal(Object.isFrozen(context.producer.apply), true);
  assert.deepEqual(context.store.load(), before);
  const source = readFileSync(new URL('../src/service-credit-zenon-funding-observation-producer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:https?|net|tls|child_process|async_hooks|v8)|promiseHooks|process\.(?:on|once|addListener|prependListener|prependOnceListener)|commitAuthenticatedEnvelope|facilitator\.settle|setTimeout|process\.env/);
  assert.doesNotMatch(source, /provider-signing-operation|https-operator-pilot|external-holder|zenon-payment/);
  assert.throws(() => createProducer({ ...context.options }), codeIs('INVALID_CONFIGURATION'));
  assert.throws(() => createProducer(Object.freeze({ ...context.options, extra: true })), codeIs('INVALID_CONFIGURATION'));
  assert.throws(() => createProducer(Object.freeze({ ...context.options, fundingObserverStore: Object.create(Object.getPrototypeOf(context.store)) })), codeIs('INVALID_CONFIGURATION'));
});

test('native target membership advances bounded pages and derives PREPARED without READY', t => {
  const context = fixture(t);
  const first = context.producer.apply(input(context));
  assert.equal(first.status, 'APPLIED');
  assert.equal(first.observerStatus, 'INCLUDED_BELOW_THRESHOLD');
  assert.equal(first.outboxStatus, 'NONE');
  const second = context.producer.apply(input(context));
  assert.equal(second.observerStatus, 'THRESHOLD_OBSERVED');
  assert.equal(second.outboxStatus, 'PREPARED');
  assert.equal(context.store.load().state.inclusion.currentConfirmations, 4);
  assert.notEqual(context.store.peekPreparedAttestation(), null);
  assert.equal(context.store.projectCommittedFundingEvidence(), null);
  const prepared = context.store.peekPreparedAttestation();
  const unchanged = context.store.load();
  context.producer.apply(input(context));
  assert.deepEqual(context.store.peekPreparedAttestation(), prepared);
  assert.deepEqual(context.store.load(), unchanged);
  assert.equal(Object.isFrozen(second), true);
  assert.deepEqual(Object.keys(second), ['status', 'observerStatus', 'outboxStatus', 'revision']);
});

test('native content is fully bounded but projection retains only the proven target', t => {
  const context = fixture(t);
  const reply = batch(context);
  reply.momentums.list[0].content.unshift({ address: `z1${'q'.repeat(38)}`, hash: hash('unrelated'), height: 9 });
  reply.inclusionMomentum.content = structuredClone(reply.momentums.list[0].content);
  context.producer.apply(input(context, reply));
  const receipt = context.store.load().state.catchUp.lastAppliedPage;
  assert.equal(receipt.targetMembership.transactionId, context.target.transactionId);
  assert.equal(JSON.stringify(receipt).includes(hash('unrelated')), false);
  assert.equal(context.store.load().state.inclusion.currentConfirmations, 2);
  assert.equal(context.store.load().outbox.status, 'NONE');
});

test('exact Dynamic Plasma v1 and v2 Momentum DTOs preserve forward version lineage', async t => {
  await t.test('DP-capable v1 requires and accepts both zero price fields', t => {
    const context = fixture(t);
    const result = context.producer.apply(input(context, dynamicPlasmaBundle(
      batch(context),
      () => 1,
    )));
    assert.equal(result.status, 'APPLIED');
    assert.equal(context.store.load().state.checkpoint.height, 22);
  });

  await t.test('v2 accepts both bounded nonnegative price fields', t => {
    const context = fixture(t);
    const result = context.producer.apply(input(context, dynamicPlasmaBundle(batch(context))));
    assert.equal(result.status, 'APPLIED');
    assert.equal(context.store.load().state.checkpoint.height, 22);
  });

  await t.test('one forward v1 to v2 transition retains an older v1 inclusion', t => {
    const context = fixture(t);
    const first = dynamicPlasmaBundle(batch(context), height => height < 22 ? 1 : 2);
    assert.equal(context.producer.apply(input(context, first)).observerStatus, 'INCLUDED_BELOW_THRESHOLD');
    assert.equal(context.store.load().state.checkpoint.height, 22);

    const second = dynamicPlasmaBundle(batch(context), height => height < 22 ? 1 : 2);
    const result = context.producer.apply(input(context, second));
    assert.equal(result.observerStatus, 'THRESHOLD_OBSERVED');
    assert.equal(result.outboxStatus, 'PREPARED');
    assert.equal(context.store.load().state.inclusion.momentumHeight, 21);
  });
});

test('invalid Dynamic Plasma Momentum contracts never mutate observer state', async t => {
  const cases = [
    ['partial v1 fields', 'INVALID_INPUT', reply => {
      dynamicPlasmaBundle(reply, () => 1);
      delete reply.frontier.nextWorkPrice;
    }],
    ['nonzero v1 price', 'SOURCE_CONTEXT_CONFLICT', reply => {
      dynamicPlasmaBundle(reply, () => 1);
      reply.frontier.nextFusionPrice = 1;
    }],
    ['v2 without price fields', 'SOURCE_CONTEXT_CONFLICT', reply => {
      reply.frontier.version = 2;
    }],
    ['partial v2 fields', 'INVALID_INPUT', reply => {
      dynamicPlasmaBundle(reply);
      delete reply.frontier.nextWorkPrice;
    }],
    ['unsupported version', 'SOURCE_CONTEXT_CONFLICT', reply => {
      dynamicPlasmaBundle(reply);
      reply.frontier.version = 3;
    }],
    ['unsafe price', 'INVALID_INPUT', reply => {
      dynamicPlasmaBundle(reply);
      reply.frontier.nextFusionPrice = Number.MAX_SAFE_INTEGER + 1;
    }],
    ['negative price', 'INVALID_INPUT', reply => {
      dynamicPlasmaBundle(reply);
      reply.frontier.nextFusionPrice = -1;
    }],
    ['fractional price', 'INVALID_INPUT', reply => {
      dynamicPlasmaBundle(reply);
      reply.frontier.nextFusionPrice = 1.5;
    }],
    ['unknown field', 'INVALID_INPUT', reply => {
      dynamicPlasmaBundle(reply);
      reply.frontier.futureConsensusField = 1;
    }],
    ['forward version downgrade', 'SOURCE_CONTEXT_CONFLICT', reply => {
      dynamicPlasmaBundle(reply);
      reply.frontier.version = 1;
      reply.frontier.nextFusionPrice = 0;
      reply.frontier.nextWorkPrice = 0;
    }],
    ['same-height version conflict', 'SOURCE_CONTEXT_CONFLICT', reply => {
      dynamicPlasmaBundle(reply, height => height < 22 ? 1 : 2);
      reply.inclusionMomentum.version = 2;
      reply.inclusionMomentum.nextFusionPrice = 1_021;
      reply.inclusionMomentum.nextWorkPrice = 2_021;
    }],
    ['same-height hash conflict', 'SOURCE_CONTEXT_CONFLICT', reply => {
      dynamicPlasmaBundle(reply);
      reply.inclusionMomentum.hash = hash('conflicting-momentum.21');
    }],
    ['same-height parent conflict', 'SOURCE_CONTEXT_CONFLICT', reply => {
      dynamicPlasmaBundle(reply);
      reply.inclusionMomentum.previousHash = hash('conflicting-parent.21');
    }],
    ['same-height content conflict', 'SOURCE_CONTEXT_CONFLICT', reply => {
      dynamicPlasmaBundle(reply);
      reply.inclusionMomentum.content.push({
        address: `z1${'q'.repeat(38)}`, hash: hash('conflicting-content.21'), height: 9,
      });
    }],
    ['same-height timestamp conflict', 'SOURCE_CONTEXT_CONFLICT', reply => {
      dynamicPlasmaBundle(reply);
      reply.inclusionMomentum.timestamp += 1;
    }],
    ['same-height v1 grammar conflict', 'SOURCE_CONTEXT_CONFLICT', reply => {
      dynamicPlasmaBundle(reply, () => 1);
      delete reply.inclusionMomentum.nextFusionPrice;
      delete reply.inclusionMomentum.nextWorkPrice;
      reply.inclusionMomentum.data = '';
    }],
    ['same-height v2 price conflict', 'SOURCE_CONTEXT_CONFLICT', reply => {
      dynamicPlasmaBundle(reply);
      reply.inclusionMomentum.nextWorkPrice += 1;
    }],
    ['nonempty DP-capable data', 'INVALID_INPUT', reply => {
      dynamicPlasmaBundle(reply);
      reply.frontier.data = 'AA==';
    }],
    ['non-native DP empty-string data', 'INVALID_INPUT', reply => {
      dynamicPlasmaBundle(reply);
      reply.frontier.data = '';
    }],
  ];
  for (const [name, suffix, mutate] of cases) {
    await t.test(name, t => {
      const context = fixture(t);
      const before = context.store.load();
      const reply = batch(context);
      mutate(reply);
      assert.throws(() => context.producer.apply(input(context, reply)), codeIs(suffix));
      assert.deepEqual(context.store.load(), before);
    });
  }
});

test('exact last-step replay retrieves its fixed result only while committed state is unchanged', t => {
  const context = fixture(t);
  const request = input(context);
  const result = context.producer.apply(request);
  const before = context.store.load();
  assert.equal(context.producer.apply(request), result);
  assert.deepEqual(context.store.load(), before);
  assert.throws(() => context.producer.apply(Object.freeze({ ...request, reply: `${request.reply} ` })), codeIs('STALE_REVISION'));
});

test('missing or behind source does not debit, authorize, erase or replace committed progress', t => {
  const context = fixture(t);
  context.producer.apply(input(context));
  const before = context.store.load();
  assert.equal(context.producer.apply(input(context, null)).status, 'SOURCE_UNAVAILABLE');
  const behind = batch(context, { frontier: 21 });
  behind.checkpoint = null;
  assert.equal(context.producer.apply(input(context, behind)).status, 'SOURCE_BEHIND');
  const missingCheckpoint = batch(context);
  missingCheckpoint.checkpoint = null;
  assert.equal(context.producer.apply(input(context, missingCheckpoint)).status, 'SOURCE_UNAVAILABLE');
  assert.deepEqual(context.store.load(), before);
  assert.throws(() => context.producer.apply(input(context, null, { expectedRevision: 0 })), codeIs('STALE_REVISION'));
});

test('source policy, generation, profile and bootstrap are constructor-fixed and cannot fall back', async t => {
  for (const key of ['sourcePolicyCommitment', 'authorityGeneration', 'chainProfile', 'bootstrapCheckpoint']) {
    await t.test(key, t => {
      const context = fixture(t);
      const changed = structuredClone(BINDING);
      if (key === 'sourcePolicyCommitment') changed[key] = commitment('different-policy');
      if (key === 'authorityGeneration') changed[key].generationVersion += 1;
      if (key === 'chainProfile') changed[key].genesisMomentumHash = hash('different-genesis');
      if (key === 'bootstrapCheckpoint') changed[key].hash = hash('different-bootstrap');
      frozen(changed);
      assert.throws(() => createProducer(Object.freeze({ ...context.options, sourceBinding: changed })), codeIs('INVALID_CONFIGURATION'));
      const before = context.store.load();
      assert.throws(() => context.producer.apply(input(context, batch(context), { sourceBinding: changed })), codeIs('SOURCE_CONTEXT_CONFLICT'));
      assert.deepEqual(context.store.load(), before);
      assert.throws(() => context.producer.apply(input(context)), codeIs('SOURCE_CONTEXT_CONFLICT'));
    });
  }
});

test('actual parent, checkpoint and frontier conflicts preserve existing store quarantine semantics', async t => {
  for (const kind of ['parent', 'checkpoint', 'frontier', 'order']) {
    await t.test(kind, t => {
      const context = fixture(t);
      const reply = batch(context, { frontier: 22 });
      if (kind === 'parent') reply.momentums.list[1].previousHash = hash('wrong-parent');
      if (kind === 'checkpoint') {
        reply.checkpoint.hash = hash('wrong-checkpoint');
        reply.momentums.list[0].previousHash = reply.checkpoint.hash;
      }
      if (kind === 'frontier') reply.frontier.hash = hash('replacement-frontier');
      if (kind === 'order') reply.momentums.list.reverse();
      const result = context.producer.apply(input(context, reply));
      assert.equal(result.status, 'QUARANTINED');
      assert.equal(result.observerStatus, 'QUARANTINED');
      assert.equal(context.store.peekPreparedAttestation(), null);
      assert.equal(context.store.projectCommittedFundingEvidence(), null);
      const before = context.store.load();
      assert.equal(context.producer.apply(input(context)).status, 'QUARANTINED');
      assert.deepEqual(context.store.load(), before);
    });
  }
});

test('native profile drift seals this producer without inventing a store quarantine', t => {
  const context = fixture(t);
  const before = context.store.load();
  const reply = batch(context);
  reply.frontier.chainIdentifier += 1;
  assert.throws(() => context.producer.apply(input(context, reply)), codeIs('SOURCE_CONTEXT_CONFLICT'));
  assert.deepEqual(context.store.load(), before);
  assert.throws(() => context.producer.apply(input(context)), codeIs('SOURCE_CONTEXT_CONFLICT'));
});

test('checkpoint-only inconsistency is refused without a fabricated page or quarantine', t => {
  const context = fixture(t);
  const before = context.store.load();
  const reply = batch(context);
  reply.checkpoint.hash = hash('unlinked-checkpoint');
  assert.throws(() => context.producer.apply(input(context, reply)), codeIs('SOURCE_CONTEXT_CONFLICT'));
  assert.deepEqual(context.store.load(), before);
});

test('false target headers and transaction tuple or data cannot create a membership', async t => {
  const mutations = [
    reply => { reply.accountBlock.hash = hash('wrong-transaction'); },
    reply => { reply.accountBlock.address = `z1${'p'.repeat(38)}`; },
    reply => { reply.accountBlock.toAddress = `z1${'q'.repeat(38)}`; },
    reply => { reply.accountBlock.amount = '8'; },
    reply => { reply.accountBlock.tokenStandard = `zts1${'p'.repeat(10)}`; },
    reply => { reply.accountBlock.blockType = 3; },
    reply => { reply.accountBlock.chainIdentifier += 1; },
    reply => { reply.accountBlock.data = hash('wrong-intent'); },
    reply => { reply.accountBlock.data = Buffer.from(hash('wrong-intent'), 'hex').toString('base64'); },
    reply => { reply.momentums.list[0].content[0].height += 1; },
    reply => { reply.inclusionMomentum.content[0].address = `z1${'p'.repeat(38)}`; },
    reply => { reply.inclusionMomentum.hash = hash('wrong-inclusion'); },
    reply => { reply.accountBlock.confirmationDetail.momentumHeight += 1; },
  ];
  for (let index = 0; index < mutations.length; index += 1) {
    await t.test(`target refusal ${index + 1}`, t => {
      const context = fixture(t);
      const before = context.store.load();
      const reply = batch(context);
      mutations[index](reply);
      assert.throws(() => context.producer.apply(input(context, reply)), codeIs('TARGET_MISMATCH'));
      assert.deepEqual(context.store.load(), before);
    });
  }
});

test('a confirmation tuple and separate native header cannot bypass a linked page receipt', t => {
  const context = fixture(t);
  const reply = batch(context);
  reply.momentums.list[0].content = [];
  const result = context.producer.apply(input(context, reply));
  assert.equal(result.status, 'QUARANTINED');
  assert.equal(context.store.load().state.quarantine.reason, 'MEMBERSHIP_NOT_LINKED');
  assert.equal(context.store.peekPreparedAttestation(), null);
});

test('raw JSON bounds reject malformed, accessor, proxy, SDK-shaped and oversized inputs without hooks', async t => {
  const context = fixture(t);
  const before = context.store.load();
  let hooks = 0;
  const accessor = Object.freeze(Object.defineProperty({ expectedRevision: 0, sourceBinding: BINDING }, 'reply', {
    enumerable: true, get() { hooks += 1; return '{}'; },
  }));
  const proxy = new Proxy({}, { get() { hooks += 1; }, ownKeys() { hooks += 1; return []; }, getPrototypeOf() { hooks += 1; return Object.prototype; } });
  const foreign = { toJSON() { hooks += 1; return batch(context); } };
  for (const request of [accessor, proxy, input(context, null, { reply: proxy }), input(context, null, { reply: foreign }), input(context, null, { reply: '{' }), input(context, null, { reply: ' '.repeat(65537) })]) {
    assert.throws(() => context.producer.apply(request), codeIs('INVALID_INPUT'));
  }
  assert.equal(hooks, 0);
  for (const mutate of [
    reply => { reply.momentums.list.push(nativeMomentum(23)); },
    reply => { reply.momentums.list[0].content = Array.from({ length: 5 }, (_, index) => ({ address: `z1${'q'.repeat(38)}`, hash: hash(`header.${index}`), height: index + 1 })); },
    reply => { reply.frontier.height = Number.MAX_SAFE_INTEGER + 1; },
    reply => { reply.momentums.list[0].content[0].targetBindingDigest = commitment('rpc-echo'); },
    reply => { reply.momentums.list[0].content.push(structuredClone(reply.momentums.list[0].content[0])); },
    reply => { reply.frontier.data = 'not-hex'; },
    reply => { reply.accountBlock.amount = '07'; },
    reply => { reply.momentums.count = 1.5; },
    reply => { reply.momentums.list = []; },
  ]) {
    const reply = batch(context);
    mutate(reply);
    assert.throws(() => context.producer.apply(input(context, reply)), codeIs('INVALID_INPUT'));
  }
  assert.deepEqual(context.store.load(), before);
});

test('post-commit ambiguity retains the actual receipt for fresh-owner same-target recovery', t => {
  let fail = true;
  const context = fixture(t, { testHooks: { afterCommit({ operation }) {
    if (operation === 'applyPage' && fail) { fail = false; throw new Error('synthetic committed interruption'); }
  } } });
  assert.throws(() => context.producer.apply(input(context)), codeIs('STORE_RECOVERY_REQUIRED'));
  assert.throws(() => context.producer.apply(Object.freeze({ expectedRevision: 0, sourceBinding: BINDING, reply: null })), codeIs('STORE_RECOVERY_REQUIRED'));
  const reopened = openZenonFundingObserverSqliteStore({
    databasePath: context.configuration.databasePath, allowedRoot: context.configuration.allowedRoot,
    expectedRecordKey: context.recordKey, authorityRecord: AUTHORITY_TEXT,
  });
  t.after(() => reopened.close());
  assert.notEqual(reopened.load().state.catchUp.lastAppliedPage.targetMembership, null);
  const recovered = { ...context, store: reopened, producer: createProducer(Object.freeze({ ...context.options, fundingObserverStore: reopened })) };
  // The pending early-page receipt is consumed before later linked pages.
  assert.equal(reopened.load().state.inclusion, null);
  const result = recovered.producer.apply(input(recovered));
  assert.equal(result.observerStatus, 'THRESHOLD_OBSERVED');
  assert.equal(result.outboxStatus, 'PREPARED');
  assert.equal(reopened.load().state.inclusion.currentConfirmations, 4);
  assert.equal(reopened.load().state.target.transactionId, context.target.transactionId);
});

test('pending eligible receipts cannot become positive before incoming lineage is admitted', async t => {
  for (const conflict of ['checkpoint and first parent', 'same-height frontier', 'later parent', 'later height']) {
    await t.test(conflict, t => {
      const context = fixture(t, { maximumPageEntries: 4, testHooks: {
        afterCommit({ operation }) {
          if (operation === 'applyPage') throw new Error('synthetic committed page interruption');
        },
      } });
      assert.throws(() => context.producer.apply(input(context)), codeIs('STORE_RECOVERY_REQUIRED'));
      const openConfiguration = {
        databasePath: context.configuration.databasePath,
        allowedRoot: context.configuration.allowedRoot,
        expectedRecordKey: context.recordKey,
        authorityRecord: AUTHORITY_TEXT,
      };
      const committedOperations = [];
      const reopened = openZenonFundingObserverSqliteStore({
        ...openConfiguration,
        testHooks: { afterCommit({ operation, changed }) {
          if (!changed) return;
          committedOperations.push(operation);
          // Expose the actual crash window after positive receipt classification,
          // rather than allowing a later quarantine to conceal that committed state.
          if (operation === 'applyInclusion') throw new Error('synthetic committed inclusion interruption');
        } },
      });
      t.after(() => reopened.close());
      const recovered = {
        ...context, store: reopened,
        producer: createProducer(Object.freeze({ ...context.options, fundingObserverStore: reopened })),
      };
      const before = reopened.load();
      assert.equal(before.state.inclusion, null);
      assert.equal(before.state.firstThreshold, null);
      assert.notEqual(before.state.catchUp.lastAppliedPage.targetMembership, null);
      assert.notEqual(before.state.catchUp.lastAppliedPage.thresholdCheckpoint, null);
      assert.equal(before.outbox.status, 'NONE');
      const reply = batch(recovered, { frontier: conflict === 'same-height frontier' ? 24 : 26 });
      if (conflict === 'checkpoint and first parent') {
        reply.checkpoint.hash = hash('pending-receipt-conflicting-checkpoint');
        reply.momentums.list[0].previousHash = reply.checkpoint.hash;
      }
      if (conflict === 'same-height frontier') reply.frontier.hash = hash('pending-receipt-replaced-frontier');
      if (conflict === 'later parent') reply.momentums.list[1].previousHash = hash('pending-receipt-conflicting-parent');
      if (conflict === 'later height') reply.momentums.list[1].height += 1;
      let refusal;
      try { recovered.producer.apply(input(recovered, reply)); }
      catch (error) { refusal = error; }
      const reader = openZenonFundingObserverSqliteStore(openConfiguration);
      t.after(() => reader.close());
      const observed = reader.load();
      assert.notEqual(observed.state.status, 'THRESHOLD_OBSERVED', 'PENDING_RECEIPT_POSITIVE_BEFORE_LINEAGE_ADMISSION');
      assert.equal(observed.outbox.status, 'NONE');
      assert.deepEqual(observed, before);
      assert.deepEqual(committedOperations, []);
      assert.equal(codeIs('SOURCE_CONTEXT_CONFLICT')(refusal), true);
      assert.equal(reader.peekPreparedAttestation(), null);
      assert.equal(reader.projectCommittedFundingEvidence(), null);
      assert.throws(() => recovered.producer.apply(input(recovered)), codeIs('SOURCE_CONTEXT_CONFLICT'));
      assert.deepEqual(reader.load(), before);
    });
  }
});

test('reentrant real-store callbacks cannot manufacture a successful producer result', t => {
  let context;
  let entered = false;
  context = fixture(t, { testHooks: { beforeWrite({ operation }) {
    if (operation === 'applyPage' && !entered) {
      entered = true;
      assert.throws(() => context.producer.apply(Object.freeze({ expectedRevision: 0, sourceBinding: BINDING, reply: null })), codeIs('REENTRANT'));
    }
  } } });
  assert.throws(() => context.producer.apply(input(context)), codeIs('STORE_RECOVERY_REQUIRED'));
  assert.equal(entered, true);
  assert.equal(context.store.projectCommittedFundingEvidence(), null);
});

test('source loss and replay preserve a real READY while definite disappearance invalidates it', t => {
  const context = fixture(t);
  context.producer.apply(input(context));
  context.producer.apply(input(context));
  const request = context.store.peekPreparedAttestation();
  const envelope = {
    envelopeVersion: 1, attestationId: request.attestationId, keyId: AUTHORITY.keyId,
    issuedAt: NOW / 1000, validUntil: NOW / 1000 + 30,
  };
  envelope.signature = sign(null, createZenonFundingProviderAttestationSigningBytes({
    request, issuedAt: envelope.issuedAt, validUntil: envelope.validUntil,
  }), PAIR.privateKey).toString('base64url');
  const current = context.store.load();
  context.store.commitAuthenticatedEnvelope({
    expectedObserverRevision: current.state.revision, expectedOutboxRevision: current.outbox.revision,
    attestationId: request.attestationId, envelope, nowEpochSeconds: NOW / 1000,
  });
  const before = context.store.load();
  assert.equal(context.producer.apply(input(context, null)).outboxStatus, 'READY');
  assert.equal(context.producer.apply(input(context)).outboxStatus, 'READY');
  assert.deepEqual(context.store.load(), before);
  const missing = batch(context);
  missing.accountBlock = null;
  missing.inclusionMomentum = null;
  const result = context.producer.apply(input(context, missing));
  assert.equal(result.observerStatus, 'QUARANTINED');
  assert.equal(result.outboxStatus, 'INVALIDATED');
  assert.equal(context.store.projectCommittedFundingEvidence(), null);
});
