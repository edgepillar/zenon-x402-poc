import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { chmodSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  prepareZenonFundingResource,
  deriveZenonFundingObserverTarget,
} from '../src/service-credit-zenon-funding-evidence.js';
import { createZenonFundingObserverState } from '../src/service-credit-zenon-funding-observer-state.js';
import { createZenonFundingObserverSqliteStore } from '../src/service-credit-zenon-funding-observer-sqlite-store.js';
import { createZenonFundingObservationProducer } from '../src/service-credit-zenon-funding-observation-producer.js';
import { parseZenonFundingProviderAttestationAuthorityRecord } from '../src/service-credit-zenon-funding-provider-attestation.js';

let createSourceOwner;
try {
  ({ createZenonFundingObservationSourceOwner: createSourceOwner } = await import(
    '../src/service-credit-zenon-funding-observation-source-owner.js'
  ));
} catch {
  // The first red run intentionally precedes the source-owner implementation.
}

const PREFIX = 'ZENON_FUNDING_OBSERVATION_SOURCE_OWNER_';
const NOW = 2_100_000_000_000;
const PAIR = generateKeyPairSync('ed25519');
const hash = label => createHash('sha256').update(`source-owner-fixture:${label}`).digest('hex');
const commitment = label => `sha256:${hash(label)}`;
const codeIs = suffix => error => error?.code === `${PREFIX}${suffix}`;

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
  providerAuthorityId: 'provider.source-owner.fixture',
  generationId: 'generation.source-owner.fixture',
  generationVersion: 1,
  keyId: 'key.source-owner.fixture',
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

function controlled() {
  let resolve;
  let reject;
  const promise = new Promise((accept, refuse) => { resolve = accept; reject = refuse; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}

function settled(value, rejection = false) {
  const promise = rejection ? Promise.reject(value) : Promise.resolve(value);
  promise.catch(() => {});
  return promise;
}

function transportScenario({
  replies = [], delayAt = -1, rejectAt = -1, closeMode = 'resolve',
  cancelOutstandingOnClose = false, onRead, onClose,
} = {}) {
  const calls = [];
  const outstanding = [];
  const closeCapability = controlled();
  let readIndex = 0;
  let closeCalls = 0;
  const callRead = Object.freeze(function callRead(request) {
    const index = readIndex++;
    assert.equal(Object.isFrozen(request), true);
    assert.equal(Object.isFrozen(request.params), true);
    calls.push({ method: request.method, params: structuredClone(request.params) });
    onRead?.({ index, request });
    if (index === rejectAt) return settled(new Error('private transport failure'), true);
    if (index === delayAt) {
      const capability = controlled();
      outstanding.push(capability);
      return capability.promise;
    }
    assert.notEqual(replies[index], undefined);
    const reply = typeof replies[index] === 'string' ? replies[index] : JSON.stringify(replies[index]);
    return settled(reply);
  });
  const close = Object.freeze(function close() {
    closeCalls += 1;
    onClose?.();
    if (cancelOutstandingOnClose) {
      for (const capability of outstanding) capability.reject(new Error('private cancellation'));
    }
    if (closeMode === 'resolve') closeCapability.resolve(undefined);
    if (closeMode === 'reject') closeCapability.reject(new Error('private close failure'));
    return closeCapability.promise;
  });
  return {
    owner: Object.freeze({
      transport: Object.freeze({ callRead }),
      close,
      sourcePolicyCommitment: BINDING.sourcePolicyCommitment,
    }),
    calls,
    outstanding,
    closeCapability,
    get closeCalls() { return closeCalls; },
  };
}

function createFixture(t, readTransportOwner, {
  maximumPageEntries = 2,
  maximumBackfillSpan = 8,
  limits = frozen({ maximumReplyBytes: 65536, maximumContentHeaders: 4 }),
} = {}) {
  assert.equal(typeof createSourceOwner, 'function', 'FUNDING_OBSERVATION_SOURCE_OWNER_MISSING');
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'funding-source-owner-')));
  chmodSync(directory, 0o700);
  let store;
  let sourceOwner;
  t.after(async () => {
    try { await sourceOwner?.close(); } catch { /* fake transports can make close uncertain */ }
    try { store?.close(); } catch { /* test cleanup only */ }
    rmSync(directory, { recursive: true, force: true });
  });
  const chosen = {
    offerId: 'offer.source-owner.fixture', offerVersion: 1,
    holderId: `z1${'q'.repeat(38)}`, capabilityCommitment: commitment('capability'),
  };
  const prepared = prepareZenonFundingResource({
    offer: {
      modelVersion: 1, providerId: 'provider.fixture', serviceId: 'service.fixture',
      resourceId: 'resource.fixture', resourceBinding: `sha256:${createHash('sha256')
        .update('zenon-x402-service-credit-resource-binding-v1').update('\0')
        .update(canonical({ resourceId: 'resource.fixture', resourceUrl: 'https://localhost/source-owner' })).digest('hex')}`,
      offerId: chosen.offerId, offerVersion: chosen.offerVersion, costPolicyId: 'cost.fixture',
      fundingPolicyId: 'funding.fixture', fundingPolicyVersion: 1,
    },
    selection: chosen,
    resourceUrl: 'https://localhost/source-owner',
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
  store = createZenonFundingObserverSqliteStore({
    databasePath: join(directory, 'observer.sqlite'), allowedRoot: directory,
    authorityRecord: AUTHORITY_TEXT,
    initialState: createZenonFundingObserverState({
      observerPolicy: AUTHORITY.observerPolicy, authorityGeneration: AUTHORITY.authorityGeneration,
      chainProfile: AUTHORITY.chainProfile, confirmationPolicy: AUTHORITY.confirmationPolicy,
      target, checkpoint: AUTHORITY.bootstrapCheckpoint,
      catchUp: { maximumPageEntries, maximumBackfillSpan, maximumMembersPerMomentum: 2 },
    }),
  });
  const producerOptions = Object.freeze({
    fundingObserverStore: store,
    authorityRecord: AUTHORITY_TEXT,
    sourceBinding: BINDING,
    limits,
  });
  sourceOwner = createSourceOwner(Object.freeze({ ...producerOptions, readTransportOwner }));
  return {
    sourceOwner, store, target, producerOptions,
    producer: createZenonFundingObservationProducer(producerOptions),
  };
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
    confirmationDetail: {
      numConfirmations: 9999, momentumHeight: 21,
      momentumHash: hash('momentum.21'), momentumTimestamp: 21,
    },
    ...overrides,
  };
}

function bundle(context, { frontier = 24, targetHeight = 21, accountBlock } = {}) {
  const state = context.store.load().state;
  const block = accountBlock === undefined ? nativeBlock(context.target, {
    confirmationDetail: {
      numConfirmations: 9999, momentumHeight: targetHeight,
      momentumHash: hash(`momentum.${targetHeight}`), momentumTimestamp: targetHeight,
    },
  }) : accountBlock;
  const header = block === null ? null : { address: block.address, hash: block.hash, height: block.height };
  const through = Math.min(frontier, state.checkpoint.height + state.catchUp.maximumPageEntries);
  const list = [];
  for (let height = state.checkpoint.height + 1; height <= through; height += 1) {
    list.push(nativeMomentum(height, header !== null && height === targetHeight ? [header] : []));
  }
  return {
    checkpoint: nativeMomentum(state.checkpoint.height),
    frontier: nativeMomentum(frontier),
    momentums: { count: frontier, list },
    accountBlock: block,
    inclusionMomentum: block?.confirmationDetail === null || block === null
      ? null : nativeMomentum(targetHeight, [header]),
  };
}

function transcript(reply, { spanZero = false, behind = false } = {}) {
  if (behind) return [reply.frontier, reply.frontier];
  return [
    reply.frontier,
    reply.checkpoint,
    ...(spanZero ? [] : [reply.momentums]),
    reply.accountBlock,
    ...(reply.inclusionMomentum === null ? [] : [reply.inclusionMomentum]),
    reply.frontier,
  ];
}

function observeInput(context, revision = context.store.load().state.revision) {
  return Object.freeze({ expectedRevision: revision });
}

test('source owner is inert, deeply frozen, exact and default-off', t => {
  const transport = transportScenario();
  const context = createFixture(t, transport.owner);
  const before = context.store.load();
  assert.deepEqual(Object.keys(context.sourceOwner), ['observe', 'close']);
  assert.equal(Object.isFrozen(context.sourceOwner), true);
  assert.equal(Object.isFrozen(context.sourceOwner.observe), true);
  assert.equal(Object.isFrozen(context.sourceOwner.close), true);
  assert.equal(transport.calls.length, 0);
  assert.equal(transport.closeCalls, 0);
  assert.deepEqual(context.store.load(), before);
  assert.throws(
    () => createSourceOwner({ ...context.producerOptions, readTransportOwner: transport.owner }),
    codeIs('INVALID_CONFIGURATION'),
  );
  assert.throws(
    () => createSourceOwner(Object.freeze({ ...context.producerOptions, readTransportOwner: transport.owner, extra: true })),
    codeIs('INVALID_CONFIGURATION'),
  );
  const shallowBinding = structuredClone(BINDING);
  Object.freeze(shallowBinding);
  assert.throws(
    () => createSourceOwner(Object.freeze({
      ...context.producerOptions,
      sourceBinding: shallowBinding,
      readTransportOwner: transport.owner,
    })),
    codeIs('INVALID_CONFIGURATION'),
  );
});

test('source owner requires an exact matching transport policy before reads or mutation', t => {
  const transport = transportScenario();
  const context = createFixture(t, transport.owner);
  const before = context.store.load();
  const missing = Object.freeze({
    transport: transport.owner.transport,
    close: transport.owner.close,
  });
  const mismatch = Object.freeze({
    transport: transport.owner.transport,
    close: transport.owner.close,
    sourcePolicyCommitment: commitment('different-source-policy'),
  });
  for (const readTransportOwner of [missing, mismatch]) {
    assert.throws(
      () => createSourceOwner(Object.freeze({
        ...context.producerOptions,
        readTransportOwner,
      })),
      codeIs('INVALID_CONFIGURATION'),
    );
    assert.equal(transport.calls.length, 0);
    assert.equal(transport.closeCalls, 0);
    assert.deepEqual(context.store.load(), before);
  }
});

test('the read source explicitly requires a concrete nonzero Momentum checkpoint', t => {
  const holderTransport = transportScenario();
  const holder = createFixture(t, holderTransport.owner);
  const zeroAuthorityValue = JSON.parse(AUTHORITY_TEXT);
  zeroAuthorityValue.bootstrapCheckpoint = { height: 0, hash: hash('momentum.0') };
  const zeroAuthorityText = canonical(zeroAuthorityValue);
  const zeroAuthority = parseZenonFundingProviderAttestationAuthorityRecord(zeroAuthorityText);
  const zeroBinding = frozen({
    sourcePolicyCommitment: zeroAuthority.sourcePolicyCommitment,
    authorityGeneration: structuredClone(zeroAuthority.authorityGeneration),
    chainProfile: structuredClone(zeroAuthority.chainProfile),
    bootstrapCheckpoint: structuredClone(zeroAuthority.bootstrapCheckpoint),
  });
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'funding-source-owner-zero-')));
  chmodSync(directory, 0o700);
  const store = createZenonFundingObserverSqliteStore({
    databasePath: join(directory, 'observer.sqlite'), allowedRoot: directory,
    authorityRecord: zeroAuthorityText,
    initialState: createZenonFundingObserverState({
      observerPolicy: zeroAuthority.observerPolicy,
      authorityGeneration: zeroAuthority.authorityGeneration,
      chainProfile: zeroAuthority.chainProfile,
      confirmationPolicy: zeroAuthority.confirmationPolicy,
      target: holder.target,
      checkpoint: zeroAuthority.bootstrapCheckpoint,
      catchUp: { maximumPageEntries: 2, maximumBackfillSpan: 8, maximumMembersPerMomentum: 2 },
    }),
  });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const transport = transportScenario();
  assert.throws(() => createSourceOwner(Object.freeze({
    fundingObserverStore: store,
    authorityRecord: zeroAuthorityText,
    sourceBinding: zeroBinding,
    limits: frozen({ maximumReplyBytes: 65536, maximumContentHeaders: 4 }),
    readTransportOwner: transport.owner,
  })), codeIs('INVALID_CONFIGURATION'));
  assert.equal(transport.calls.length, 0);
  assert.equal(transport.closeCalls, 0);
});

test('one exact transcript closes transport before the producer can mutate the store', async t => {
  let closeSnapshot;
  const replies = [];
  let context;
  const bindingBefore = structuredClone(BINDING);
  const transport = transportScenario({ replies, onClose: () => { closeSnapshot = context.store.load(); } });
  context = createFixture(t, transport.owner);
  const before = context.store.load();
  replies.push(...transcript(bundle(context)));
  const result = await context.sourceOwner.observe(observeInput(context));
  assert.deepEqual(closeSnapshot, before);
  assert.equal(result.status, 'APPLIED');
  assert.notDeepEqual(context.store.load(), before);
  assert.deepEqual(transport.calls, [
    { method: 'ledger.getFrontierMomentum', params: [] },
    { method: 'ledger.getMomentumByHash', params: [hash('momentum.20')] },
    { method: 'ledger.getMomentumsByHeight', params: [21, 2] },
    { method: 'ledger.getAccountBlockByHash', params: [context.target.transactionId.slice(8)] },
    { method: 'ledger.getMomentumByHash', params: [hash('momentum.21')] },
    { method: 'ledger.getFrontierMomentum', params: [] },
  ]);
  assert.equal(transport.closeCalls, 1);
  assert.deepEqual(Object.keys(result), ['status', 'observerStatus', 'outboxStatus', 'revision']);
  assert.deepEqual(BINDING, bindingBefore);
  assert.throws(
    () => { BINDING.sourcePolicyCommitment = commitment('mutated-policy'); },
    TypeError,
  );
});

test('the source-owned page request is capped at the exact 64-entry slice maximum', async t => {
  const replies = [];
  const transport = transportScenario({ replies });
  const context = createFixture(t, transport.owner, {
    maximumPageEntries: 64,
    maximumBackfillSpan: 64,
    limits: frozen({ maximumReplyBytes: 1024 * 1024, maximumContentHeaders: 4 }),
  });
  replies.push(...transcript(bundle(context, { frontier: 84 })));
  const result = await context.sourceOwner.observe(observeInput(context));
  assert.equal(result.status, 'APPLIED');
  assert.deepEqual(transport.calls[2], {
    method: 'ledger.getMomentumsByHeight', params: [21, 64],
  });
  assert.equal(transport.calls.length, 6);
});

test('zero span is local and an unconfirmed block never causes an inclusion read', async t => {
  await t.test('zero span', async t => {
    const replies = [];
    const transport = transportScenario({ replies });
    const context = createFixture(t, transport.owner);
    const reply = bundle(context, { frontier: 20, accountBlock: null });
    replies.push(...transcript(reply, { spanZero: true }));
    const result = await context.sourceOwner.observe(observeInput(context));
    assert.ok(['APPLIED', 'UNCHANGED'].includes(result.status));
    assert.deepEqual(transport.calls.map(call => call.method), [
      'ledger.getFrontierMomentum',
      'ledger.getMomentumByHash',
      'ledger.getAccountBlockByHash',
      'ledger.getFrontierMomentum',
    ]);
  });

  await t.test('unconfirmed', async t => {
    const replies = [];
    const transport = transportScenario({ replies });
    const context = createFixture(t, transport.owner);
    const reply = bundle(context, {
      frontier: 22,
      targetHeight: 99,
      accountBlock: nativeBlock(context.target, { confirmationDetail: null }),
    });
    replies.push(...transcript(reply));
    await context.sourceOwner.observe(observeInput(context));
    assert.equal(transport.calls.some(call => call.method === 'ledger.getMomentumByHash'
      && call.params[0] === hash('momentum.21')), false);
  });
});

test('a stable behind source performs only two frontier reads and never queries the target', async t => {
  const replies = [];
  const transport = transportScenario({ replies });
  const context = createFixture(t, transport.owner);
  const reply = bundle(context, { frontier: 19, accountBlock: null });
  replies.push(...transcript(reply, { behind: true }));
  const before = context.store.load();
  const result = await context.sourceOwner.observe(observeInput(context));
  assert.equal(result.status, 'SOURCE_BEHIND');
  assert.deepEqual(context.store.load(), before);
  assert.deepEqual(transport.calls.map(call => call.method), [
    'ledger.getFrontierMomentum', 'ledger.getFrontierMomentum',
  ]);
  assert.equal(transport.closeCalls, 1);
});

test('malformed or contradictory transcripts close cleanly without store mutation', async t => {
  const cases = [
    ['checkpoint mismatch', reply => { reply.checkpoint.hash = hash('wrong-checkpoint'); }],
    ['short page', reply => { reply.momentums.list.pop(); }],
    ['bad confirmation', reply => { reply.accountBlock.confirmationDetail.momentumHash = 'bad'; }],
    ['negative confirmation count', reply => { reply.accountBlock.confirmationDetail.numConfirmations = -1; }],
    ['fractional confirmation timestamp', reply => { reply.accountBlock.confirmationDetail.momentumTimestamp = 1.5; }],
    ['wrong inclusion', reply => { reply.inclusionMomentum.hash = hash('wrong-inclusion'); }],
    ['frontier drift', reply => { reply.frontierAfter = nativeMomentum(25); }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async t => {
      const values = [];
      const transport = transportScenario({ replies: values });
      const context = createFixture(t, transport.owner);
      const reply = bundle(context);
      mutate(reply);
      values.push(...transcript(reply));
      if (reply.frontierAfter) values[values.length - 1] = reply.frontierAfter;
      const before = context.store.load();
      await assert.rejects(context.sourceOwner.observe(observeInput(context)), codeIs('SOURCE_UNAVAILABLE'));
      assert.deepEqual(context.store.load(), before);
      assert.equal(transport.closeCalls, 1);
      assert.doesNotMatch((await context.sourceOwner.observe(observeInput(context)).catch(error => error)).stack, /private/);
    });
  }
});

test('a replacement AccountBlock cannot select an inclusion query', async t => {
  const replies = [];
  const transport = transportScenario({ replies });
  const context = createFixture(t, transport.owner);
  const reply = bundle(context);
  reply.accountBlock.hash = hash('replacement-account-block');
  replies.push(...transcript(reply));
  const before = context.store.load();
  await assert.rejects(context.sourceOwner.observe(observeInput(context)), codeIs('SOURCE_UNAVAILABLE'));
  assert.deepEqual(context.store.load(), before);
  assert.deepEqual(transport.calls.map(call => call.method), [
    'ledger.getFrontierMomentum',
    'ledger.getMomentumByHash',
    'ledger.getMomentumsByHeight',
    'ledger.getAccountBlockByHash',
  ]);
  assert.equal(transport.calls.some(call => call.method === 'ledger.getMomentumByHash'
    && call.params[0] === reply.accountBlock.confirmationDetail.momentumHash), false);
  assert.equal(transport.closeCalls, 1);
});

test('bounded result bytes and a failed read never retry or leak a transport reason', async t => {
  await t.test('bounded bytes', async t => {
    const transport = transportScenario({ replies: [`"${'x'.repeat(300)}"`] });
    const context = createFixture(t, transport.owner, {
      limits: frozen({ maximumReplyBytes: 256, maximumContentHeaders: 4 }),
    });
    const before = context.store.load();
    await assert.rejects(context.sourceOwner.observe(observeInput(context)), codeIs('SOURCE_UNAVAILABLE'));
    assert.equal(transport.calls.length, 1);
    assert.equal(transport.closeCalls, 1);
    assert.deepEqual(context.store.load(), before);
  });

  await t.test('single failed read', async t => {
    const transport = transportScenario({ rejectAt: 0 });
    const context = createFixture(t, transport.owner);
    const error = await context.sourceOwner.observe(observeInput(context)).catch(value => value);
    assert.equal(error.code, `${PREFIX}SOURCE_UNAVAILABLE`);
    assert.equal(transport.calls.length, 1);
    assert.equal(transport.closeCalls, 1);
    assert.doesNotMatch(error.stack, /private transport failure/);
  });
});

test('stale admission and mid-transcript revision drift fail before source-owner mutation', async t => {
  await t.test('stale admission', async t => {
    const transport = transportScenario();
    const context = createFixture(t, transport.owner);
    const before = context.store.load();
    await assert.rejects(
      context.sourceOwner.observe(observeInput(context, before.state.revision + 1)),
      codeIs('STALE_REVISION'),
    );
    assert.equal(transport.calls.length, 0);
    assert.equal(transport.closeCalls, 1);
    assert.deepEqual(context.store.load(), before);
  });

  await t.test('revision drift', async t => {
    let externalRecord;
    let context;
    const replyHolder = [];
    const transport = transportScenario({
      replies: replyHolder,
      onRead: ({ index }) => {
        if (index !== 0) return;
        const externalReply = bundle(context);
        context.producer.apply(Object.freeze({
          expectedRevision: context.store.load().state.revision,
          sourceBinding: BINDING,
          reply: JSON.stringify(externalReply),
        }));
        externalRecord = context.store.load();
      },
    });
    context = createFixture(t, transport.owner);
    replyHolder.push(...transcript(bundle(context)));
    const revision = context.store.load().state.revision;
    await assert.rejects(context.sourceOwner.observe(observeInput(context, revision)), codeIs('STALE_REVISION'));
    assert.deepEqual(context.store.load(), externalRecord);
    assert.equal(transport.closeCalls, 1);
  });
});

test('clean close proof releases an active read while late settlement cannot apply', async t => {
  const transport = transportScenario({ delayAt: 0, closeMode: 'manual' });
  const context = createFixture(t, transport.owner);
  const before = context.store.load();
  const observing = context.sourceOwner.observe(observeInput(context));
  while (transport.outstanding.length === 0) await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(context.sourceOwner.observe(observeInput(context)), codeIs('BUSY'));
  const closing = context.sourceOwner.close();
  let closeSettled = false;
  closing.then(() => { closeSettled = true; }, () => { closeSettled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closeSettled, false);
  transport.closeCapability.resolve(undefined);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(observing, codeIs('CLOSED'));
  await closing;
  assert.equal(closeSettled, true);
  assert.deepEqual(context.store.load(), before);
  assert.equal(transport.calls.length, 1);
  assert.equal(transport.closeCalls, 1);
  transport.outstanding[0].resolve(JSON.stringify(nativeMomentum(24)));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(context.store.load(), before);
  assert.equal(transport.calls.length, 1);
});

test('invalid admission and close-before-observe perform no reads and preserve the borrowed store', async t => {
  await t.test('invalid admission', async t => {
    const transport = transportScenario();
    const context = createFixture(t, transport.owner);
    const before = context.store.load();
    await assert.rejects(context.sourceOwner.observe({ expectedRevision: 0, extra: true }), codeIs('INVALID_INPUT'));
    assert.equal(transport.calls.length, 0);
    assert.equal(transport.closeCalls, 1);
    assert.deepEqual(context.store.load(), before);
  });

  await t.test('close before observe', async t => {
    const transport = transportScenario();
    const context = createFixture(t, transport.owner);
    const before = context.store.load();
    const closing = context.sourceOwner.close();
    assert.equal(context.sourceOwner.close(), closing);
    await closing;
    await assert.rejects(context.sourceOwner.observe(observeInput(context)), codeIs('CLOSED'));
    assert.equal(transport.calls.length, 0);
    assert.equal(transport.closeCalls, 1);
    assert.deepEqual(context.store.load(), before);
    assert.equal(typeof context.store.load().state.revision, 'number');
  });
});

test('close uncertainty withholds a complete candidate and remains terminal', async t => {
  const replies = [];
  const transport = transportScenario({ replies, closeMode: 'reject' });
  const context = createFixture(t, transport.owner);
  replies.push(...transcript(bundle(context)));
  const before = context.store.load();
  await assert.rejects(context.sourceOwner.observe(observeInput(context)), codeIs('CLOSE_UNCERTAIN'));
  await assert.rejects(context.sourceOwner.close(), codeIs('CLOSE_UNCERTAIN'));
  assert.deepEqual(context.store.load(), before);
  assert.equal(transport.closeCalls, 1);
});

test('restart uses a fresh owner and never resumes a failed partial transcript', async t => {
  const firstReplies = [];
  const firstTransport = transportScenario({ replies: firstReplies, rejectAt: 1 });
  const first = createFixture(t, firstTransport.owner);
  firstReplies.push(...transcript(bundle(first)));
  const before = first.store.load();
  await assert.rejects(first.sourceOwner.observe(observeInput(first)), codeIs('SOURCE_UNAVAILABLE'));
  assert.deepEqual(first.store.load(), before);
  assert.deepEqual(firstTransport.calls.map(call => call.method), [
    'ledger.getFrontierMomentum', 'ledger.getMomentumByHash',
  ]);

  const reply = bundle(first);
  const secondTransport = transportScenario({ replies: transcript(reply) });
  const secondOwner = createSourceOwner(Object.freeze({
    ...first.producerOptions,
    readTransportOwner: secondTransport.owner,
  }));
  t.after(async () => { try { await secondOwner.close(); } catch {} });
  const result = await secondOwner.observe(observeInput(first));
  assert.equal(result.status, 'APPLIED');
  assert.equal(secondTransport.calls[0].method, 'ledger.getFrontierMomentum');
  assert.equal(secondTransport.closeCalls, 1);
  // The source owner borrows the store and never closes it.
  assert.equal(typeof first.store.load().state.revision, 'number');
});
